import { openWith, sealTo, type Sealed } from "./box.ts";
import { toBytes } from "./encoding.ts";
import { ECDH } from "./keys.ts";

const WRAP_CONTEXT = toBytes("noenv-key-wrap-v1");

export async function wrapPrivateKey(privateKey: CryptoKey, recipientPublicKey: CryptoKey): Promise<Sealed> {
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));
  return sealTo(recipientPublicKey, pkcs8, WRAP_CONTEXT);
}

export async function unwrapPrivateKey(wrapped: Sealed, recipientPrivateKey: CryptoKey): Promise<CryptoKey> {
  const pkcs8 = await openWith(recipientPrivateKey, wrapped, WRAP_CONTEXT);
  return crypto.subtle.importKey("pkcs8", pkcs8, ECDH, true, ["deriveBits"]);
}
