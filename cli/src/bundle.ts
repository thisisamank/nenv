import { decryptSecret, importPublicKey, unwrapPrivateKey, type Sealed } from "@noenv/crypto";
import type { Policies } from "@noenv/policy";
import { api, environmentPath } from "./api.ts";
import type { Deployment } from "./deployment.ts";

export type Bundle = {
  projectId: string;
  revision: number;
  policies: Policies;
  environmentPublicKey: CryptoKey;
  environmentPrivateKey: CryptoKey;
  secrets: Record<string, string>;
};

type RawBundle = {
  projectId: string;
  revision: number;
  policies: Policies;
  publicKey: string;
  wrappedKey: Sealed;
  secrets: { name: string; version: number; sealed: Sealed }[];
};

export async function fetchBundle(
  deployment: Deployment,
  token: string,
  privateKey: CryptoKey,
  repo: string,
  environment: string,
): Promise<Bundle> {
  const raw = await api<RawBundle>(deployment, "GET", `${environmentPath(repo, environment)}/bundle`, { token });
  const environmentPrivateKey = await unwrapPrivateKey(raw.wrappedKey, privateKey);

  const secrets: Record<string, string> = {};
  for (const { name, sealed } of raw.secrets) {
    secrets[name] = await decryptSecret(environmentPrivateKey, sealed, { projectId: raw.projectId, environment, name });
  }
  return {
    projectId: raw.projectId,
    revision: raw.revision,
    policies: raw.policies,
    environmentPublicKey: await importPublicKey(raw.publicKey),
    environmentPrivateKey,
    secrets,
  };
}
