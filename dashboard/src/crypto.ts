import { encryptSecret, exportPublicKey, generateKeyPair, importPublicKey, wrapPrivateKey, type Sealed } from "@nenv/crypto";
import type { Project } from "./types.ts";

export async function sealSecret(project: Project, environment: string, name: string, value: string): Promise<Sealed> {
  const publicKey = project.environments.find((candidate) => candidate.name === environment)?.publicKey;
  if (!publicKey) {
    throw new Error(`environment ${environment} was not found`);
  }
  return encryptSecret(await importPublicKey(publicKey), value, { projectId: project.id, environment, name });
}

export async function createEnvironmentKeys(ownerPublicKey: string): Promise<{ publicKey: string; wrappedKey: Sealed }> {
  const keys = await generateKeyPair();
  return {
    publicKey: await exportPublicKey(keys.publicKey),
    wrappedKey: await wrapPrivateKey(keys.privateKey, await importPublicKey(ownerPublicKey)),
  };
}
