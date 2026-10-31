import { api, ApiError, repoPath } from "./api.ts";
import type { Role } from "./types.ts";

type FoundUser = { id: string; inviteUrl?: string };

export async function addToProject(repo: string, email: string, role: Role, canInviteNewUsers: boolean): Promise<string | undefined> {
  const user = await findOrInvite(email.trim().toLowerCase(), canInviteNewUsers);
  await api("PUT", `${repoPath(repo)}/members/${user.id}`, { role });
  return user.inviteUrl;
}

export async function inviteLink(userId: string): Promise<string> {
  return (await api<{ inviteUrl: string }>("POST", `/v1/users/${userId}/invite`)).inviteUrl;
}

export async function announceInvite(email: string, inviteUrl: string | undefined, notify: (message: string) => void): Promise<void> {
  if (!inviteUrl) {
    notify(`Added ${email}`);
    return;
  }
  await navigator.clipboard.writeText(inviteUrl).catch(() => {});
  notify(`Invite link for ${email} copied. Send it to them.`);
}

async function findOrInvite(email: string, canInviteNewUsers: boolean): Promise<FoundUser> {
  try {
    return await api<FoundUser>("GET", `/v1/users/lookup?email=${encodeURIComponent(email)}`);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;
    if (!canInviteNewUsers) throw new Error(`${email} has not joined yet. Ask an organization admin to invite them.`);
    return api<FoundUser>("POST", "/v1/users", { email });
  }
}
