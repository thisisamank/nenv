import { basename } from "node:path";
import { exportPublicKey, generateKeyPair, importPublicKey, wrapPrivateKey } from "@noenv/crypto";
import { api, ApiError, environmentPath, repoPath } from "../api.ts";
import { fetchBundle } from "../bundle.ts";
import { inProject, signedIn } from "../context.ts";

type User = { id: string; email: string; publicKey: string | null };

const ROLES = ["reader", "editor", "admin"];

export async function initCommand(): Promise<void> {
  const { deployment, token, identity, target } = await inProject();

  try {
    await api(deployment, "POST", "/v1/projects", { token, body: { name: basename(target.root), repo: target.repo } });
    console.log(`Created project ${target.repo}`);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 409)) throw error;
  }

  const environmentKeys = await generateKeyPair();
  const wrappedKey = await wrapPrivateKey(environmentKeys.privateKey, await importPublicKey(identity.publicKey));
  try {
    await api(deployment, "POST", `${repoPath(target.repo)}/environments/${target.environment}`, {
      token,
      body: { publicKey: await exportPublicKey(environmentKeys.publicKey), wrappedKey },
    });
    console.log(`Created environment ${target.environment}`);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 409)) throw error;
    console.log(`Environment ${target.environment} already exists`);
  }
}

export async function inviteCommand([email]: string[]): Promise<void> {
  if (!email) throw new Error("usage: noenv invite EMAIL");
  const { deployment, token } = await signedIn();

  await api(deployment, "POST", "/v1/users", { token, body: { email } });
  console.log(`Invited ${email}. They can sign in from the NOENV landing page: ${deployment.url}`);
}

export async function grantCommand([email, role]: string[]): Promise<void> {
  if (!email || !ROLES.includes(role ?? "")) {
    throw new Error("usage: noenv grant EMAIL reader|editor|admin");
  }
  const { deployment, token, identity, target } = await inProject();
  const user = await findUser(deployment, token, email);

  await api(deployment, "PUT", `${repoPath(target.repo)}/members/${user.id}`, { token, body: { role } });
  console.log(`${email} is now ${role} of ${target.repo}`);

  if (!user.publicKey) {
    console.log(`${email} has not signed in yet. Run this command again after they sign in to share the key.`);
    return;
  }

  const bundle = await fetchBundle(deployment, token, identity.privateKey, target.repo, target.environment);
  const wrappedKey = await wrapPrivateKey(bundle.environmentPrivateKey, await importPublicKey(user.publicKey));
  await api(deployment, "PUT", `${environmentPath(target.repo, target.environment)}/keys/${user.id}`, {
    token,
    body: { wrappedKey },
  });
  console.log(`Shared the ${target.environment} key with ${email}`);
}

export async function revokeCommand([email]: string[]): Promise<void> {
  if (!email) throw new Error("usage: noenv revoke EMAIL");
  const { deployment, token, target } = await inProject();
  const user = await findUser(deployment, token, email);

  await api(deployment, "DELETE", `${repoPath(target.repo)}/members/${user.id}`, { token });
  console.log(`Removed ${email} from ${target.repo}. Rotate secrets they could read.`);
}

async function findUser(deployment: Parameters<typeof api>[0], token: string, email: string): Promise<User> {
  return api<User>(deployment, "GET", `/v1/users/lookup?email=${encodeURIComponent(email)}`, { token });
}
