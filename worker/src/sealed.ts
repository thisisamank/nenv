import type { Sealed } from "@noenv/crypto";
import { HttpError } from "./http.ts";

const MAX_CIPHERTEXT_LENGTH = 100_000;
const PUBLIC_KEY = /^[A-Za-z0-9+/]{80,120}={0,2}$/;

export function parseSealed(value: unknown, field: string): Sealed {
  const { ephemeralPublicKey, iv, ciphertext } = (value ?? {}) as Record<string, unknown>;
  if (
    !isPublicKey(ephemeralPublicKey) ||
    typeof iv !== "string" ||
    typeof ciphertext !== "string" ||
    ciphertext.length > MAX_CIPHERTEXT_LENGTH
  ) {
    throw new HttpError(400, `${field} must be { ephemeralPublicKey, iv, ciphertext } with base64 strings`);
  }
  return { ephemeralPublicKey, iv, ciphertext };
}

export function isPublicKey(value: unknown): value is string {
  return typeof value === "string" && PUBLIC_KEY.test(value);
}
