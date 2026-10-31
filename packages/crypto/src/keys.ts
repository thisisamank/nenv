import { fromBase64, toBase64 } from "./encoding.ts";

export const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ECDH, true, ["deriveBits"]);
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  return toBase64(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
}

export async function importPublicKey(text: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", fromBase64(text), ECDH, true, []);
}

export async function exportPrivateKey(key: CryptoKey): Promise<string> {
  return toBase64(new Uint8Array(await crypto.subtle.exportKey("pkcs8", key)));
}

export async function importPrivateKey(text: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", fromBase64(text), ECDH, true, ["deriveBits"]);
}
