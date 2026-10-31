import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { addUser, call, PROJECT_PATH, PUBLIC_KEY, REPO, startWorker, type TestWorker } from "./helpers.ts";

const ENVIRONMENT_PATH = `${PROJECT_PATH}/environments/production`;
const DELETE_DOTENV = { mode: "delete", include: [".env"], exclude: [] };

let worker: TestWorker;
let admin: string;
let reader: string;

before(async () => {
  worker = await startWorker();
  const { env } = worker;
  admin = await addUser(env, "usr_admin", true);
  reader = await addUser(env, "usr_reader");

  await env.DB.batch([
    env.DB.prepare("INSERT INTO projects (id, repo, name) VALUES ('prj_1', ?, 'Backend')").bind(REPO),
    env.DB.prepare("INSERT INTO environments (project_id, name, public_key) VALUES ('prj_1', 'production', ?)").bind(PUBLIC_KEY),
    env.DB.prepare("INSERT INTO memberships VALUES ('prj_1', 'usr_reader', 'reader')"),
    env.DB.prepare("INSERT INTO environment_keys VALUES ('prj_1', 'production', 'usr_reader', '{}')"),
  ]);
});

after(() => worker.dispose());

function api(token: string, method: string, path: string, body?: unknown, headers?: Record<string, string>) {
  return call(worker.env, method, path, { token, body, headers });
}

test("the bundle carries the merged policies, most specific level last", async () => {
  await api(admin, "PUT", "/v1/policies/dotenv", { value: { mode: "warn", include: [".env*"], exclude: [] } });
  await api(admin, "PUT", `${ENVIRONMENT_PATH}/policies/dotenv`, { value: DELETE_DOTENV });

  const bundle = await api(reader, "GET", `${ENVIRONMENT_PATH}/bundle`);
  assert.equal(bundle.status, 200);
  assert.deepEqual(bundle.body.policies.dotenv, DELETE_DOTENV);

  const layers = await api(reader, "GET", `${ENVIRONMENT_PATH}/policies`);
  assert.deepEqual(layers.body.policies, { dotenv: DELETE_DOTENV });
  assert.equal(layers.body.effective.sessionTtlHours, 168);
});

test("policies are validated and only admins can change them", async () => {
  assert.equal((await api(reader, "PUT", `${ENVIRONMENT_PATH}/policies/dotenv`, { value: DELETE_DOTENV })).status, 403);
  assert.equal((await api(admin, "PUT", "/v1/policies/dotenv", { value: { mode: "nuke" } })).status, 400);
  assert.equal((await api(admin, "PUT", `${PROJECT_PATH}/policies/sessionTtlHours`, { value: 1 })).status, 400);
  assert.equal((await api(admin, "PUT", "/v1/policies/unknown", { value: 1 })).status, 404);
});

test("an outdated CLI cannot retrieve secrets", async () => {
  await api(admin, "PUT", "/v1/policies/minCliVersion", { value: "1.2.0" });

  const old = await api(reader, "GET", `${ENVIRONMENT_PATH}/bundle`, undefined, { "X-Noenv-Version": "1.1.9" });
  assert.equal(old.status, 426);
  assert.match(old.body.error, /1\.2\.0 or newer/);

  const current = await api(reader, "GET", `${ENVIRONMENT_PATH}/bundle`, undefined, { "X-Noenv-Version": "1.2.0" });
  assert.equal(current.status, 200);

  await api(admin, "DELETE", "/v1/policies/minCliVersion");
});

test("environment access can require a higher role", async () => {
  await api(admin, "PUT", `${ENVIRONMENT_PATH}/policies/environmentMinRole`, { value: "editor" });
  assert.equal((await api(reader, "GET", `${ENVIRONMENT_PATH}/bundle`)).status, 403);

  await api(admin, "DELETE", `${ENVIRONMENT_PATH}/policies/environmentMinRole`);
  assert.equal((await api(reader, "GET", `${ENVIRONMENT_PATH}/bundle`)).status, 200);
});

test("new sessions use the session expiry policy", async () => {
  await api(admin, "PUT", "/v1/policies/sessionTtlHours", { value: 2 });
  const device = (await call(worker.env, "POST", "/v1/auth/device")).body;
  await worker.env.DB.prepare("UPDATE device_codes SET user_id = 'usr_reader'").run();

  const session = await call(worker.env, "POST", "/v1/auth/token", {
    body: { deviceCode: device.deviceCode, deviceName: "laptop" },
  });
  const hours = (Date.parse(`${session.body.expiresAt.replace(" ", "T")}Z`) - Date.now()) / 3_600_000;
  assert.ok(hours > 1.9 && hours <= 2, `expected about 2 hours, got ${hours}`);
});

test("clients report compliance and admins see it per device", async () => {
  const files = [{ path: ".env", status: "deleted" }];
  assert.equal(
    (await api(reader, "POST", `${ENVIRONMENT_PATH}/compliance`, { compliant: true, files }, { "X-Noenv-Version": "0.1.0" })).status,
    204,
  );
  assert.equal((await api(reader, "POST", `${ENVIRONMENT_PATH}/compliance`, { compliant: "yes", files })).status, 400);
  assert.equal((await api(reader, "GET", "/v1/devices")).status, 403);

  const { devices } = (await api(admin, "GET", "/v1/devices")).body;
  const device = devices.find((d: any) => d.email === "usr_reader@example.com" && d.compliance.length > 0);
  assert.equal(device.cliVersion, "0.1.0");
  assert.ok(device.lastSeenAt);
  assert.deepEqual(device.compliance[0], {
    repo: REPO,
    environment: "production",
    compliant: true,
    files,
    reportedAt: device.compliance[0].reportedAt,
  });
});
