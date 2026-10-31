import { AES_GCM, open, seal } from "./aead.ts";
import { fromBase64 } from "./encoding.ts";
import { exportPublicKey, generateKeyPair, importPublicKey } from "./keys.ts";

export type Sealed = {
  ephemeralPublicKey: string;
  iv: string;
  ciphertext: string;
};

export async function sealTo(
  recipientPublicKey: CryptoKey,
  plaintext: Uint8Array<ArrayBuffer>,
  context: Uint8Array<ArrayBuffer>,
): Promise<Sealed> {
  const ephemeral = await generateKeyPair();
  const ephemeralPublicKey = await exportPublicKey(ephemeral.publicKey);
  const key = await deriveKey(ephemeral.privateKey, recipientPublicKey, ephemeralPublicKey, context);
  return { ...(await seal(key, plaintext, context)), ephemeralPublicKey };
}

export async function openWith(
  recipientPrivateKey: CryptoKey,
  sealed: Sealed,
  context: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const ephemeralKey = await importPublicKey(sealed.ephemeralPublicKey);
  const key = await deriveKey(recipientPrivateKey, ephemeralKey, sealed.ephemeralPublicKey, context);
  return open(key, sealed, context);
}

async function deriveKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  ephemeralPublicKey: string,
  context: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256);
  const hkdfKey = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: fromBase64(ephemeralPublicKey), info: context },
    hkdfKey,
    AES_GCM,
    false,
    ["encrypt", "decrypt"],
  );
}
