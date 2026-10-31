import type { Env } from "./context.ts";
import { HttpError } from "./http.ts";
import { organizationPolicies } from "./policy-store.ts";

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

export function randomToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export type Session = {
  userId: string;
  tokenHash: string;
};

export type IssuedSession = {
  token: string;
  expiresAt: string;
};

export async function createSession(env: Env, userId: string, deviceName: string): Promise<IssuedSession> {
  const token = randomToken();
  const { sessionTtlHours } = await organizationPolicies(env.DB);
  const session = await env.DB
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, device_name, expires_at)
       VALUES (?, ?, ?, datetime('now', ?))
       RETURNING expires_at`,
    )
    .bind(await hashToken(token), userId, deviceName, `+${sessionTtlHours} hours`)
    .first<{ expires_at: string }>();
  return { token, expiresAt: session!.expires_at };
}

export async function authenticate(request: Request, env: Env): Promise<Session> {
  const token = request.headers.get("Authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) {
    throw new HttpError(401, "missing bearer token");
  }

  const tokenHash = await hashToken(token);
  const session = await env.DB
    .prepare("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > datetime('now')")
    .bind(tokenHash)
    .first<{ user_id: string }>();

  if (!session) {
    throw new HttpError(401, "invalid or expired session");
  }
  return { userId: session.user_id, tokenHash };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
