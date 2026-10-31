import { openWith, sealTo, type Sealed } from "./box.ts";
import { fromBytes, toBytes } from "./encoding.ts";

export type SecretContext = {
  projectId: string;
  environment: string;
  name: string;
};

export async function encryptSecret(
  environmentPublicKey: CryptoKey,
  value: string,
  context: SecretContext,
): Promise<Sealed> {
  return sealTo(environmentPublicKey, toBytes(value), contextBytes(context));
}

export async function decryptSecret(
  environmentPrivateKey: CryptoKey,
  sealed: Sealed,
  context: SecretContext,
): Promise<string> {
  return fromBytes(await openWith(environmentPrivateKey, sealed, contextBytes(context)));
}

function contextBytes({ projectId, environment, name }: SecretContext): Uint8Array<ArrayBuffer> {
  return toBytes(`nenv-secret-v1\0${projectId}\0${environment}\0${name}`);
}
