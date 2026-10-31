import { ENV_VAR_NAME } from "@noenv/config/names";
import { api, environmentPath } from "../api.ts";
import { inProject } from "../context.ts";
import { readSecretValue } from "../prompt.ts";
import { remoteSecretStore } from "../secret-store.ts";
import { markChanged } from "../watch.ts";

type SecretRow = { name: string; version: number; author: string; updatedAt: string };
type VersionRow = { version: number; author: string; restoredFrom: number | null; createdAt: string };

export async function secretCommand([action, ...args]: string[]): Promise<void> {
  const handlers: Record<string, (args: string[]) => Promise<void>> = {
    set: setSecret,
    list: listSecrets,
    history: secretHistory,
    rollback: rollbackSecret,
  };
  const handler = handlers[action ?? ""];
  if (!handler) {
    throw new Error("usage: noenv secret set|list|history|rollback");
  }
  await handler(args);
}

async function setSecret([name]: string[]): Promise<void> {
  requireName(name);
  const { deployment, token, identity, target } = await inProject();

  const value = await readSecretValue(`Value for ${name}: `);
  if (value === "") {
    throw new Error("the value is empty, nothing was saved");
  }

  const store = remoteSecretStore(deployment, token, identity, target.repo, target.environment);
  const version = await store.set(name, value);
  await markChanged(deployment, target.repo, target.environment);
  console.log(`Saved ${name} as version ${version} in ${target.repo} (${target.environment})`);
}

async function listSecrets(): Promise<void> {
  const { deployment, token, target } = await inProject();
  const { secrets } = await api<{ secrets: SecretRow[] }>(
    deployment,
    "GET",
    `${environmentPath(target.repo, target.environment)}/secrets`,
    { token },
  );

  for (const secret of secrets) {
    console.log(`${secret.name}\tv${secret.version}\t${secret.updatedAt}\t${secret.author}`);
  }
}

async function secretHistory([name]: string[]): Promise<void> {
  requireName(name);
  const { deployment, token, target } = await inProject();
  const { versions } = await api<{ versions: VersionRow[] }>(
    deployment,
    "GET",
    `${environmentPath(target.repo, target.environment)}/secrets/${name}/versions`,
    { token },
  );

  for (const version of versions) {
    const restored = version.restoredFrom ? `\trestored from v${version.restoredFrom}` : "";
    console.log(`v${version.version}\t${version.createdAt}\t${version.author}${restored}`);
  }
}

async function rollbackSecret([name, version]: string[]): Promise<void> {
  requireName(name);
  if (!/^\d+$/.test(version ?? "")) {
    throw new Error("usage: noenv secret rollback KEY VERSION");
  }

  const { deployment, token, target } = await inProject();
  const result = await api<{ version: number }>(
    deployment,
    "POST",
    `${environmentPath(target.repo, target.environment)}/secrets/${name}/rollback`,
    { token, body: { version: Number(version) } },
  );
  await markChanged(deployment, target.repo, target.environment);
  console.log(`Restored ${name} v${version} as v${result.version}`);
}

function requireName(name: string | undefined): asserts name is string {
  if (!name || !ENV_VAR_NAME.test(name)) {
    throw new Error("the secret name must be a valid environment variable name");
  }
}
