const SESSION_COOKIE = "nenv_session";

export function sessionCookie(token: string, expiresAt: string): string {
  const expires = new Date(`${expiresAt.replace(" ", "T")}Z`).toUTCString();
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=${expires}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function readSessionCookie(request: Request): string | null {
  const cookies = request.headers.get("Cookie") ?? "";
  return cookies.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([0-9a-f]{64})`))?.[1] ?? null;
}
