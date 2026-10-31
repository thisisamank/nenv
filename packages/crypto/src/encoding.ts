const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBytes(text: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(text);
}

export function fromBytes(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}
