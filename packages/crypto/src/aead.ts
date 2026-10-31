import { fromBase64, toBase64 } from "./encoding.ts";

export const AES_GCM = { name: "AES-GCM", length: 256 } as const;
const IV_BYTES = 12;

export type Encrypted = {
  iv: string;
  ciphertext: string;
};

export async function seal(
  key: CryptoKey,
  plaintext: Uint8Array<ArrayBuffer>,
  context: Uint8Array<ArrayBuffer>,
): Promise<Encrypted> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: context },
    key,
    plaintext,
  );
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

export async function open(
  key: CryptoKey,
  sealed: Encrypted,
  context: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(sealed.iv), additionalData: context },
    key,
    fromBase64(sealed.ciphertext),
  );
  return new Uint8Array(plaintext);
}
