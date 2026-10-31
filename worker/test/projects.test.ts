import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  decryptSecret,
  encryptSecret,
  exportPublicKey,
  generateKeyPair,
  importPublicKey,
  unwrapPrivateKey,
  wrapPrivateKey,
} from "@nenv/crypto";
import { addUser, call, PROJECT_PATH, REPO, startWorker, type TestWorker } from "./helpers.ts";

const ENVIRONMENT_PATH = `${PROJECT_PATH}/environments/development`;

let worker: TestWorker;
let admin: string;
let member: string;
let outsider: string;

before(async () => {
  worker = await startWorker();
  admin = await addUser(worker.env, "usr_admin", true);
  member = await addUser(worker.env, "usr_member");
  outsider = await addUser(worker.env, "usr_outsider");
});

after(() => worker.dispose());

function api(token: string, method: string, path: string, body?: unknown) {
  return call(worker.env, method, path, { token, body });
}

test("only organization admins can create projects", async () => {
  assert.equal((await api(member, "POST", "/v1/projects", { name: "Backend", repo: REPO })).status, 403);
  assert.equal((await api(admin, "POST", "/v1/projects", { name: "Backend", repo: "not a repo" })).status, 400);

  const created = await api(admin, "POST", "/v1/projects", { name: "Backend", repo: REPO });
  assert.equal(created.status, 201);
  assert.equal(created.body.repo, REPO);

  assert.equal((await api(admin, "POST", "/v1/projects", { name: "Again", repo: REPO })).status, 409);
});

test("an environment key is shared end to end and secrets decrypt for members", async () => {
  const adminKeys = await generateKeyPair();
  const memberKeys = await generateKeyPair();
  await api(member, "PUT", "/v1/me/public-key", { publicKey: await exportPublicKey(memberKeys.publicKey) });

  const environmentKeys = await generateKeyPair();
  const created = await api(admin, "POST", `${PROJECT_PATH}/environments/development`, {
    publicKey: await exportPublicKey(environmentKeys.publicKey),
    wrappedKey: await wrapPrivateKey(environmentKeys.privateKey, adminKeys.publicKey),
  });
  assert.equal(created.status, 201);

  assert.equal((await api(admin, "PUT", `${PROJECT_PATH}/members/usr_member`, { role: "owner" })).status, 400);
  assert.equal((await api(admin, "PUT", `${PROJECT_PATH}/members/usr_missing`, { role: "reader" })).status, 404);
  assert.equal((await api(admin, "PUT", `${PROJECT_PATH}/members/usr_member`, { role: "editor" })).status, 200);

  const found = await api(admin, "GET", "/v1/users/lookup?email=USR_MEMBER@example.com");
  assert.equal(found.body.id, "usr_member");
  const memberPublicKey = found.body.publicKey;
  const wrappedForMember = await wrapPrivateKey(environmentKeys.privateKey, await importPublicKey(memberPublicKey));
  assert.equal(
    (await api(admin, "PUT", `${ENVIRONMENT_PATH}/keys/usr_outsider`, { wrappedKey: wrappedForMember })).status,
    404,
  );
  assert.equal((await api(admin, "PUT", `${ENVIRONMENT_PATH}/keys/usr_member`, { wrappedKey: wrappedForMember })).status, 200);

  const bundleBefore = await api(member, "GET", `${ENVIRONMENT_PATH}/bundle`);
  const context = { projectId: bundleBefore.body.projectId, environment: "development", name: "API_KEY" };
  const memberEnvironmentKey = await unwrapPrivateKey(bundleBefore.body.wrappedKey, memberKeys.privateKey);

  const sealed = await encryptSecret(await importPublicKey(bundleBefore.body.publicKey), "s3cret", context);
  assert.equal((await api(member, "PUT", `${ENVIRONMENT_PATH}/secrets/API_KEY`, sealed)).status, 201);

  const bundle = await api(member, "GET", `${ENVIRONMENT_PATH}/bundle`);
  assert.equal(await decryptSecret(memberEnvironmentKey, bundle.body.secrets[0].sealed, context), "s3cret");
});

test("creating an existing environment does not replace its key", async () => {
  const otherKeys = await generateKeyPair();
  const other = await wrapPrivateKey(otherKeys.privateKey, (await generateKeyPair()).publicKey);
  const again = await api(admin, "POST", `${PROJECT_PATH}/environments/development`, {
    publicKey: await exportPublicKey(otherKeys.publicKey),
    wrappedKey: other,
  });
  assert.equal(again.status, 409);

  const stored = await worker.env.DB.prepare("SELECT wrapped_key FROM environment_keys WHERE user_id = 'usr_admin'").first<{
    wrapped_key: string;
  }>();
  assert.notEqual(JSON.parse(stored!.wrapped_key).ciphertext, other.ciphertext);
});

test("non-admin members cannot manage the project", async () => {
  assert.equal((await api(member, "PUT", `${PROJECT_PATH}/members/usr_outsider`, { role: "admin" })).status, 403);
  assert.equal((await api(outsider, "DELETE", `${PROJECT_PATH}/members/usr_member`)).status, 403);
});

test("removing a member revokes their access to the bundle", async () => {
  assert.equal((await api(admin, "DELETE", `${PROJECT_PATH}/members/usr_member`)).status, 204);
  assert.equal((await api(member, "GET", `${ENVIRONMENT_PATH}/bundle`)).status, 403);

  const keys = await worker.env.DB.prepare("SELECT COUNT(*) AS n FROM environment_keys WHERE user_id = 'usr_member'").first<{
    n: number;
  }>();
  assert.equal(keys!.n, 0);
});

test("lists projects with roles and key status for each environment", async () => {
  await worker.env.DB.prepare("INSERT INTO memberships VALUES ((SELECT id FROM projects), 'usr_member', 'reader')").run();

  const forAdmin = (await api(admin, "GET", "/v1/projects")).body.projects;
  assert.equal(forAdmin.length, 1);
  assert.equal(forAdmin[0].role, "admin");
  assert.deepEqual(
    forAdmin[0].environments.map((e: any) => [e.name, e.hasKey]),
    [["development", true]],
  );

  const forMember = (await api(member, "GET", "/v1/projects")).body.projects;
  assert.deepEqual([forMember[0].role, forMember[0].environments[0].hasKey], ["reader", false]);

  assert.deepEqual((await api(outsider, "GET", "/v1/projects")).body.projects, []);
});

test("lists project members with the environments they hold keys for", async () => {
  const { members } = (await api(admin, "GET", `${PROJECT_PATH}/members`)).body;
  assert.deepEqual(
    members.map((m: any) => [m.email, m.role, m.environments, m.hasPublicKey]),
    [
      ["usr_admin@example.com", "admin", ["development"], false],
      ["usr_member@example.com", "reader", [], true],
    ],
  );
  assert.equal((await api(outsider, "GET", `${PROJECT_PATH}/members`)).status, 403);
});

test("only organization admins can list users", async () => {
  assert.equal((await api(member, "GET", "/v1/users")).status, 403);
  const { users } = (await api(admin, "GET", "/v1/users")).body;
  assert.deepEqual(
    users.map((u: any) => [u.email, u.isAdmin]),
    [
      ["usr_admin@example.com", true],
      ["usr_member@example.com", false],
      ["usr_outsider@example.com", false],
    ],
  );
});

test("project and user listings carry members, secret counts, and missing keys", async () => {
  const [project] = (await api(admin, "GET", "/v1/projects")).body.projects;
  assert.deepEqual(project.members, ["usr_admin@example.com", "usr_member@example.com"]);
  assert.equal(project.secretCount, 1);
  assert.ok(project.updatedAt);

  const { users } = (await api(admin, "GET", "/v1/users")).body;
  const memberUser = users.find((u: any) => u.email === "usr_member@example.com");
  assert.deepEqual(memberUser.projects, [{ repo: REPO, role: "reader", missingKeys: ["development"] }]);
});

test("organization admins can sign out a device", async () => {
  const { devices } = (await api(admin, "GET", "/v1/devices")).body;
  const outsiderDevice = devices.find((d: any) => d.email === "usr_outsider@example.com");

  assert.equal((await api(member, "DELETE", `/v1/devices/${outsiderDevice.id}`)).status, 403);
  assert.equal((await api(admin, "DELETE", `/v1/devices/${outsiderDevice.id}`)).status, 204);
  assert.equal((await api(outsider, "GET", "/v1/me")).status, 401);
  assert.equal((await api(admin, "DELETE", `/v1/devices/${outsiderDevice.id}`)).status, 404);
});
