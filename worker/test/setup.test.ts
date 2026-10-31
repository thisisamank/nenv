import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { TestAuthenticator } from "./authenticator.ts";
import { call, startWorker, type TestWorker } from "./helpers.ts";

const ORIGIN = "https://nenv.test";

let worker: TestWorker;

before(async () => {
  worker = await startWorker();
});

after(() => worker.dispose());

function api(env: TestWorker["env"], method: string, path: string, body?: unknown, cookie?: string) {
  const headers: Record<string, string> = { Origin: ORIGIN };
  if (cookie) headers.Cookie = `nenv_session=${cookie}`;
  return call(env, method, path, { body, headers });
}

test("setup is off when no admin email was set at deploy time", async () => {
  assert.deepEqual((await api(worker.env, "GET", "/v1/setup")).body, { available: false });
  assert.equal((await api(worker.env, "POST", "/v1/setup/options", { email: "a@example.com" })).status, 403);
});

test("only the deploy-time admin email can create the first passkey, once", async () => {
  const env = { ...worker.env, ADMIN_EMAIL: "Owner@Example.com" };
  assert.deepEqual((await api(env, "GET", "/v1/setup")).body, { available: true });
  assert.equal((await api(env, "POST", "/v1/setup/options", { email: "intruder@example.com" })).status, 403);

  const options = await api(env, "POST", "/v1/setup/options", { email: "owner@example.com" });
  const response = await new TestAuthenticator().register(options.body, ORIGIN);
  const created = await api(env, "POST", "/v1/setup", { email: "owner@example.com", response });
  assert.equal(created.status, 200);

  const session = created.headers.get("Set-Cookie")!.match(/nenv_session=([0-9a-f]{64})/)![1];
  const me = await api(env, "GET", "/v1/me", undefined, session);
  assert.deepEqual([me.body.email, me.body.isAdmin], ["owner@example.com", true]);

  assert.deepEqual((await api(env, "GET", "/v1/setup")).body, { available: false });
  assert.equal((await api(env, "POST", "/v1/setup/options", { email: "owner@example.com" })).status, 403);
});
