import { encryptSecret } from "@nenv/crypto";
import type { SecretStore } from "@nenv/dotenv";
import { api, environmentPath } from "./api.ts";
import { fetchBundle, type Bundle } from "./bundle.ts";
import type { Deployment } from "./deployment.ts";
import type { Identity } from "./identity.ts";

export type RemoteSecretStore = SecretStore & {
  set(name: string, value: string): Promise<number>;
};

export function remoteSecretStore(
  deployment: Deployment,
  token: string,
  identity: Identity,
  repo: string,
  environment: string,
  initial: Bundle | null = null,
): RemoteSecretStore {
  let cached = initial;
  const bundle = async () => (cached ??= await fetchBundle(deployment, token, identity.privateKey, repo, environment));

  return {
    async get(name) {
      return (await bundle()).secrets[name];
    },
    async set(name, value) {
      const { environmentPublicKey, projectId } = await bundle();
      const sealed = await encryptSecret(environmentPublicKey, value, { projectId, environment, name });
      const path = `${environmentPath(repo, environment)}/secrets/${name}`;
      const { version } = await api<{ version: number }>(deployment, "PUT", path, { token, body: sealed });
      cached = null;
      return version;
    },
  };
}
