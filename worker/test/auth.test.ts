import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { TestAuthenticator } from "./authenticator.ts";
import { addUser, call, startWorker, type TestWorker } from "./helpers.ts";

const ORIGIN = "https://nenv.test";

let worker: TestWorker;
let admin: string;

before(async () => {
  worker = await startWorker();
  admin = await addUser(worker.env, "usr_admin", true);
});

after(() => worker.dispose());

function api(method: string, path: string, options: { body?: unknown; cookie?: string; token?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = {};
  if (options.cookie) headers.Cookie = `nenv_session=${options.cookie}`;
  if (options.origin !== null) headers.Origin = options.origin ?? ORIGIN;
  return call(worker.env, method, path, { body: options.body, token: options.token, headers });
}

function sessionFrom(response: { headers: Headers }): string {
  const cookie = response.headers.get("Set-Cookie") ?? "";
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  return cookie.match(/nenv_session=([0-9a-f]{64})/)![1]!;
}

async function invite(email: string): Promise<string> {
  const created = await api("POST", "/v1/users", { token: admin, body: { email } });
  assert.equal(created.status, 201);
  assert.match(created.body.inviteUrl, /^https:\/\/nenv\.test\/dashboard\/#\/join\/[0-9a-f]{64}$/);
  return created.body.inviteUrl.split("/join/")[1];
}

async function join(token: string, authenticator: TestAuthenticator): Promise<string> {
  const options = await api("POST", "/v1/auth/passkeys/register/options", { body: { token } });
  assert.equal(options.status, 200);
  const response = await authenticator.register(options.body, ORIGIN);
  const registered = await api("POST", "/v1/auth/passkeys/register", { body: { token, response } });
  assert.equal(registered.status, 200, JSON.stringify(registered.body));
  return sessionFrom(registered);
}

async function signIn(authenticator: TestAuthenticator) {
  const options = await api("POST", "/v1/auth/passkeys/login/options");
  const response = await authenticator.assert(options.body, ORIGIN);
  return { response, result: await api("POST", "/v1/auth/passkeys/login", { body: { response } }) };
}

test("the landing page shows shell lines for this deployment", async () => {
  const page = await call(worker.env, "GET", "/");
  assert.match(page.body, /export NENV_URL=&quot;https:\/\/nenv\.test&quot;/);
  assert.match(page.body, /nenv shell zsh/);
});

const ana = new TestAuthenticator();

test("an invite link registers a passkey and signs the person in", async () => {
  const token = await invite("Ana@Example.com");
  assert.deepEqual((await api("GET", `/v1/invites/${token}`)).body, { email: "ana@example.com" });

  const session = await join(token, ana);
  const me = await api("GET", "/v1/me", { cookie: session });
  assert.deepEqual([me.body.email, me.body.isAdmin], ["ana@example.com", false]);

  assert.equal((await api("GET", `/v1/invites/${token}`)).status, 404);
  assert.equal((await api("POST", "/v1/auth/passkeys/register/options", { body: { token } })).status, 404);
});

test("a registered passkey signs in, and an assertion cannot be replayed", async () => {
  const { response, result } = await signIn(ana);
  assert.equal(result.status, 200);
  const me = await api("GET", "/v1/me", { cookie: sessionFrom(result) });
  assert.equal(me.body.email, "ana@example.com");

  const replay = await api("POST", "/v1/auth/passkeys/login", { body: { response } });
  assert.equal(replay.status, 401);
});

test("an unknown passkey cannot sign in", async () => {
  const stranger = new TestAuthenticator();
  await stranger.register({ challenge: "x", rp: { id: "nenv.test" }, user: { id: "x" } }, ORIGIN);
  assert.equal((await signIn(stranger)).result.status, 401);
});

test("cookie sessions reject cross-origin writes, bearer tokens do not need an origin", async () => {
  const session = sessionFrom((await signIn(ana)).result);
  const publicKey = btoa(String.fromCharCode(...new Uint8Array(65).fill(4)));

  const crossOrigin = await api("PUT", "/v1/me/public-key", { cookie: session, origin: "https://evil.test", body: { publicKey } });
  assert.equal(crossOrigin.status, 403);
  assert.equal((await api("GET", "/v1/me", { cookie: session, origin: null })).status, 200);

  const viaBearer = await api("PUT", "/v1/me/public-key", { token: admin, origin: null, body: { publicKey } });
  assert.equal(viaBearer.status, 200);
  assert.equal((await api("PUT", "/v1/me/public-key", { token: admin, origin: null, body: { publicKey } })).status, 409);
});

test("a signed-in browser approves a CLI device code", async () => {
  const device = (await api("POST", "/v1/auth/device")).body;
  const redirect = await api("GET", `/activate?code=${device.userCode}`);
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get("Location"), `${ORIGIN}/dashboard/#/activate/${device.userCode}`);

  const poll = () => api("POST", "/v1/auth/token", { body: { deviceCode: device.deviceCode, deviceName: "ana-mbp" } });
  assert.deepEqual((await poll()).body, { error: "authorization_pending" });

  const session = sessionFrom((await signIn(ana)).result);
  assert.equal((await api("POST", "/v1/auth/activate", { body: { code: device.userCode } })).status, 401);
  assert.equal((await api("POST", "/v1/auth/activate", { cookie: session, body: { code: device.userCode.toLowerCase() } })).status, 200);

  const issued = await poll();
  const me = await api("GET", "/v1/me", { token: issued.body.token, origin: null });
  assert.equal(me.body.email, "ana@example.com");
  assert.deepEqual((await poll()).body, { error: "expired_token" });
});

test("only organization admins invite, and a new link replaces the old one", async () => {
  const session = sessionFrom((await signIn(ana)).result);
  assert.equal((await api("POST", "/v1/users", { cookie: session, body: { email: "x@example.com" } })).status, 403);

  const first = await invite("bo@example.com");
  const { users } = (await api("GET", "/v1/users", { token: admin })).body;
  const bo = users.find((user: any) => user.email === "bo@example.com");
  assert.equal(bo.hasPasskey, false);

  const renewed = await api("POST", `/v1/users/${bo.id}/invite`, { token: admin });
  assert.equal((await api("GET", `/v1/invites/${first}`)).status, 404);
  assert.equal((await api("GET", `/v1/invites/${renewed.body.inviteUrl.split("/join/")[1]}`)).status, 200);
});

test("signing out ends the browser session", async () => {
  const session = sessionFrom((await signIn(ana)).result);
  const out = await api("POST", "/v1/auth/logout", { cookie: session });
  assert.equal(out.status, 204);
  assert.match(out.headers.get("Set-Cookie") ?? "", /Max-Age=0/);
  assert.equal((await api("GET", "/v1/me", { cookie: session })).status, 401);
});
