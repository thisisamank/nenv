import { api, ApiError, repoPath } from "./api.ts";
import type { Role } from "./types.ts";

export type Invite = { inviteUrl: string; emailed: boolean };

type FoundUser = { id: string } & Partial<Invite>;

export async function addToProject(repo: string, email: string, role: Role, canInviteNewUsers: boolean): Promise<Invite | undefined> {
  const user = await findOrInvite(email.trim().toLowerCase(), canInviteNewUsers);
  await api("PUT", `${repoPath(repo)}/members/${user.id}`, { role });
  return user.inviteUrl ? { inviteUrl: user.inviteUrl, emailed: user.emailed ?? false } : undefined;
}

export async function renewInvite(userId: string): Promise<Invite> {
  return api<Invite>("POST", `/v1/users/${userId}/invite`);
}

export async function announceInvite(email: string, invite: Invite | undefined, notify: (message: string) => void): Promise<void> {
  if (!invite) {
    notify(`Added ${email}`);
    return;
  }
  await navigator.clipboard.writeText(invite.inviteUrl).catch(() => {});
  notify(invite.emailed ? `Invite emailed to ${email}. The link is copied too.` : `Invite link for ${email} copied. Send it to them.`);
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
