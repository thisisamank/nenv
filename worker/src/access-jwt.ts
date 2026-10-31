import type { Env } from "./context.ts";
import { HttpError } from "./http.ts";

type AccessKey = JsonWebKey & { kid?: string };

type AccessClaims = {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iss?: string;
};

const RS256 = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

export async function verifyAccessRequest(request: Request, env: Env): Promise<string> {
  if (env.DEV_ACCESS_EMAIL && LOCAL_HOSTS.includes(new URL(request.url).hostname)) {
    return env.DEV_ACCESS_EMAIL.toLowerCase();
  }

  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    throw new HttpError(500, "Cloudflare Access is not configured for this deployment");
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) {
    throw new HttpError(401, "this page must be served through Cloudflare Access");
  }

  return verifyAccessJwt(token, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
}

async function verifyAccessJwt(token: string, teamDomain: string, audience: string): Promise<string> {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) throw invalidToken();

  const { kid, alg } = decodeJson(header);
  if (alg !== "RS256") throw invalidToken();

  const jwk = (await fetchAccessKeys(teamDomain)).find((key) => key.kid === kid);
  if (!jwk) throw invalidToken();

  const key = await crypto.subtle.importKey("jwk", jwk, RS256, false, ["verify"]);
  const signed = new TextEncoder().encode(`${header}.${payload}`);
  if (!(await crypto.subtle.verify(RS256, key, base64UrlDecode(signature), signed))) throw invalidToken();

  const claims: AccessClaims = decodeJson(payload);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const expired = (claims.exp ?? 0) * 1000 <= Date.now();

  if (claims.iss !== `https://${teamDomain}` || !audiences.includes(audience) || expired || !claims.email) {
    throw invalidToken();
  }
  return claims.email.toLowerCase();
}

async function fetchAccessKeys(teamDomain: string): Promise<AccessKey[]> {
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) {
    throw new HttpError(502, "could not load Cloudflare Access signing keys");
  }
  return ((await response.json()) as { keys: AccessKey[] }).keys;
}

function decodeJson(segment: string): Record<string, any> {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(segment)));
  } catch {
    throw invalidToken();
  }
}

function base64UrlDecode(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
}

function invalidToken(): HttpError {
  return new HttpError(401, "invalid Cloudflare Access token");
}
