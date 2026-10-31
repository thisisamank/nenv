import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { ACCESS, call, fetchWorker, startWorker, type TestWorker } from "./helpers.ts";

const ORIGIN = "https://nenv.test";
const CERTS_URL = `https://${ACCESS.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`;
const realFetch = globalThis.fetch;

let worker: TestWorker;
let signingKey: CryptoKey;

before(async () => {
  worker = await startWorker();

  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  signingKey = pair.privateKey;
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "test-key" };

  globalThis.fetch = async (input, init) =>
    String(input) === CERTS_URL ? Response.json({ keys: [jwk] }) : realFetch(input, init);
});

after(async () => {
  globalThis.fetch = realFetch;
  await worker.dispose();
});

function base64Url(data: string | ArrayBuffer): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function accessJwt(email: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: "RS256", kid: "test-key" }));
  const payload = base64Url(
    JSON.stringify({
      iss: `https://${ACCESS.ACCESS_TEAM_DOMAIN}`,
      aud: [ACCESS.ACCESS_AUD],
      email,
      exp: Math.floor(Date.now() / 1000) + 300,
      ...overrides,
    }),
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signingKey, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64Url(signature)}`;
}

async function activate(email: string, userCode: string, headers: Record<string, string> = {}) {
  return call(worker.env, "POST", "/activate", {
    body: new URLSearchParams({ code: userCode.toLowerCase() }),
    headers: { Origin: ORIGIN, "Cf-Access-Jwt-Assertion": await accessJwt(email), ...headers },
  });
}

async function startDevice() {
  return (await call(worker.env, "POST", "/v1/auth/device")).body;
}

async function poll(deviceCode: string) {
  return call(worker.env, "POST", "/v1/auth/token", { body: { deviceCode } });
}

test("the landing page shows shell lines for this deployment", async () => {
  const page = await call(worker.env, "GET", "/");
  assert.equal(page.status, 200);
  assert.match(page.body, /export NENV_URL=&quot;https:\/\/nenv\.test&quot;/);
  assert.match(page.body, /nenv shell zsh/);
  assert.match(page.body, /nenv shell bash/);
});

test("the first activated user becomes the organization admin", async () => {
  const device = await startDevice();
  assert.match(device.userCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(device.verificationUriComplete, `${ORIGIN}/activate?code=${device.userCode}`);
  assert.deepEqual((await poll(device.deviceCode)).body, { error: "authorization_pending" });

  const page = await call(worker.env, "GET", `/activate?code=${device.userCode}`, {
    headers: { "Cf-Access-Jwt-Assertion": await accessJwt("Founder@Example.com") },
  });
  assert.match(page.body, /founder@example\.com/);
  assert.match(page.body, new RegExp(`value="${device.userCode}"`));

  assert.equal((await activate("founder@example.com", device.userCode)).status, 200);

  const session = await poll(device.deviceCode);
  assert.equal(session.status, 200);
  assert.match(session.body.token, /^[0-9a-f]{64}$/);

  const me = await call(worker.env, "GET", "/v1/me", { token: session.body.token });
  assert.deepEqual({ email: me.body.email, isAdmin: me.body.isAdmin }, { email: "founder@example.com", isAdmin: true });

  assert.deepEqual((await poll(device.deviceCode)).body, { error: "expired_token" });
});

test("users must be invited before they can activate a device", async () => {
  const device = await startDevice();
  const rejected = await activate("newcomer@example.com", device.userCode);
  assert.equal(rejected.status, 403);
  assert.match(rejected.body, /not been invited/);

  const founder = await sessionFor("founder@example.com");
  const invite = await call(worker.env, "POST", "/v1/users", { token: founder, body: { email: "Newcomer@Example.com" } });
  assert.equal(invite.status, 201);

  assert.equal((await activate("newcomer@example.com", device.userCode)).status, 200);
  const me = await call(worker.env, "GET", "/v1/me", { token: (await poll(device.deviceCode)).body.token });
  assert.equal(me.body.isAdmin, false);
});

test("only organization admins can invite users", async () => {
  const newcomer = await sessionFor("newcomer@example.com");
  const invite = await call(worker.env, "POST", "/v1/users", { token: newcomer, body: { email: "x@example.com" } });
  assert.equal(invite.status, 403);
});

test("activation rejects cross-origin posts and invalid Access tokens", async () => {
  const device = await startDevice();

  assert.equal((await activate("founder@example.com", device.userCode, { Origin: "https://evil.test" })).status, 403);

  const invalidTokens = [
    await accessJwt("founder@example.com", { aud: ["other-app"] }),
    await accessJwt("founder@example.com", { exp: Math.floor(Date.now() / 1000) - 10 }),
    await accessJwt("founder@example.com", { iss: "https://evil.cloudflareaccess.com" }),
    tamperSignature(await accessJwt("founder@example.com")),
    "not-a-jwt",
  ];
  for (const token of invalidTokens) {
    const result = await activate("founder@example.com", device.userCode, { "Cf-Access-Jwt-Assertion": token });
    assert.equal(result.status, 401);
  }

  assert.deepEqual((await poll(device.deviceCode)).body, { error: "authorization_pending" });
});

test("a public key can be registered once", async () => {
  const token = await sessionFor("founder@example.com");
  const publicKey = btoa(String.fromCharCode(...new Uint8Array(65).fill(4)));

  assert.equal((await call(worker.env, "PUT", "/v1/me/public-key", { token, body: { publicKey } })).status, 200);
  assert.equal((await call(worker.env, "PUT", "/v1/me/public-key", { token, body: { publicKey } })).status, 409);

  const found = await call(worker.env, "GET", "/v1/users/lookup?email=founder@example.com", { token });
  assert.equal(found.body.publicKey, publicKey);
});

test("the dashboard gets a session from the Access identity", async () => {
  const headers = { Origin: ORIGIN, "Cf-Access-Jwt-Assertion": await accessJwt("founder@example.com") };

  const session = await call(worker.env, "POST", "/dashboard/session", { headers });
  assert.equal(session.status, 200);
  const me = await call(worker.env, "GET", "/v1/me", { token: session.body.token });
  assert.equal(me.body.email, "founder@example.com");

  const crossOrigin = await call(worker.env, "POST", "/dashboard/session", { headers: { ...headers, Origin: "https://evil.test" } });
  assert.equal(crossOrigin.status, 403);

  const noAccess = await call(worker.env, "POST", "/dashboard/session", { headers: { Origin: ORIGIN } });
  assert.equal(noAccess.status, 401);
});

test("the development identity works only on localhost", async () => {
  const env = { ...worker.env, DEV_ACCESS_EMAIL: "founder@example.com" };
  const local = await fetchWorker(env)("http://localhost:8787/dashboard/session", {
    method: "POST",
    headers: { Origin: "http://localhost:8787" },
  });
  assert.equal(local.status, 200);

  const remote = await fetchWorker(env)(`${ORIGIN}/dashboard/session`, { method: "POST", headers: { Origin: ORIGIN } });
  assert.equal(remote.status, 401);
});

function tamperSignature(token: string): string {
  const [header, payload, signature] = token.split(".");
  const flipped = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
  return `${header}.${payload}.${flipped}`;
}

async function sessionFor(email: string): Promise<string> {
  const device = await startDevice();
  await activate(email, device.userCode);
  return (await poll(device.deviceCode)).body.token;
}
