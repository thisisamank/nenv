import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { addUser, call, PROJECT_PATH, PUBLIC_KEY, REPO, startWorker, type TestWorker } from "./helpers.ts";

const BASE = `${PROJECT_PATH}/environments/development`;
const SEALED = { ephemeralPublicKey: PUBLIC_KEY, iv: "aXY=", ciphertext: "Y2lwaGVy" };

let worker: TestWorker;
const tokens: Record<string, string> = {};

before(async () => {
  worker = await startWorker();
  const { env } = worker;

  for (const id of ["usr_reader", "usr_editor", "usr_outsider"]) {
    tokens[id] = await addUser(env, id);
  }

  await env.DB.batch([
    env.DB.prepare("INSERT INTO projects (id, repo, name) VALUES ('prj_1', ?, 'Backend')").bind(REPO),
    env.DB.prepare("INSERT INTO environments (project_id, name, public_key) VALUES ('prj_1', 'development', ?)").bind(PUBLIC_KEY),
    env.DB.prepare("INSERT INTO memberships VALUES ('prj_1', 'usr_reader', 'reader'), ('prj_1', 'usr_editor', 'editor')"),
    env.DB.prepare(
      `INSERT INTO environment_keys VALUES
       ('prj_1', 'development', 'usr_reader', '{"wrapped":"usr_reader"}'),
       ('prj_1', 'development', 'usr_editor', '{"wrapped":"usr_editor"}')`,
    ),
  ]);
});

after(() => worker.dispose());

function as(user: string, method: string, path: string, body?: unknown) {
  return call(worker.env, method, BASE + path, { token: tokens[user], body });
}

test("rejects requests without a valid session", async () => {
  assert.equal((await call(worker.env, "GET", `${BASE}/secrets`)).status, 401);
  assert.equal((await call(worker.env, "GET", `${BASE}/secrets`, { token: "nope" })).status, 401);
});

test("rejects users who are not project members", async () => {
  assert.equal((await as("usr_outsider", "GET", "/bundle")).status, 403);
});

test("rejects unknown repos and environments without revealing which one", async () => {
  const unknownRepo = `/v1/repos/${encodeURIComponent("github.com/acme/other")}/environments/development/bundle`;
  assert.equal((await call(worker.env, "GET", unknownRepo, { token: tokens.usr_reader })).status, 403);

  const unknownEnvironment = `${PROJECT_PATH}/environments/production/bundle`;
  assert.equal((await call(worker.env, "GET", unknownEnvironment, { token: tokens.usr_reader })).status, 403);
});

test("rejects writes from readers", async () => {
  assert.equal((await as("usr_reader", "PUT", "/secrets/API_KEY", SEALED)).status, 403);
});

test("rejects invalid secret names, repos, and ciphertexts", async () => {
  assert.equal((await as("usr_editor", "PUT", "/secrets/bad-name", SEALED)).status, 400);
  assert.equal((await as("usr_editor", "PUT", "/secrets/API_KEY", { iv: "aXY=", ciphertext: "eA==" })).status, 400);

  const badRepo = "/v1/repos/%E0%A4%A/environments/development/bundle";
  assert.equal((await call(worker.env, "GET", badRepo, { token: tokens.usr_reader })).status, 400);
});

test("creates versions, rolls back, and serves the active version in the bundle", async () => {
  const first = await as("usr_editor", "PUT", "/secrets/DATABASE_URL", SEALED);
  assert.deepEqual([first.status, first.body], [201, { name: "DATABASE_URL", version: 1 }]);

  const updated = { ephemeralPublicKey: PUBLIC_KEY, iv: "aXYy", ciphertext: "bmV3" };
  assert.equal((await as("usr_editor", "PUT", "/secrets/DATABASE_URL", updated)).body.version, 2);

  const rollback = await as("usr_editor", "POST", "/secrets/DATABASE_URL/rollback", { version: 1 });
  assert.deepEqual(rollback.body, { name: "DATABASE_URL", version: 3, restoredFrom: 1 });

  const bundle = await as("usr_reader", "GET", "/bundle");
  assert.deepEqual(bundle.body.wrappedKey, { wrapped: "usr_reader" });
  assert.deepEqual(bundle.body.secrets, [{ name: "DATABASE_URL", version: 3, sealed: SEALED }]);

  const history = await as("usr_reader", "GET", "/secrets/DATABASE_URL/versions");
  assert.deepEqual(
    history.body.versions.map((v: any) => [v.version, v.author, v.restoredFrom]),
    [
      [3, "usr_editor@example.com", 1],
      [2, "usr_editor@example.com", null],
      [1, "usr_editor@example.com", null],
    ],
  );
});

test("publishes the active secrets to a KV snapshot", async () => {
  const snapshot = await worker.env.SECRETS.get<any>("snapshot/prj_1/development", "json");
  assert.equal(snapshot.revision, 3);
  assert.deepEqual(snapshot.secrets, [{ name: "DATABASE_URL", version: 3, sealed: SEALED }]);
});

test("serves the bundle from KV when the snapshot revision is current", async () => {
  const fromKv = { revision: 3, secrets: [{ name: "FROM_KV", version: 1, sealed: SEALED }] };
  await worker.env.SECRETS.put("snapshot/prj_1/development", JSON.stringify(fromKv));

  assert.deepEqual((await as("usr_reader", "GET", "/bundle")).body.secrets, fromKv.secrets);
});

test("falls back to D1 when the KV snapshot is stale", async () => {
  const stale = { revision: 1, secrets: [{ name: "STALE", version: 1, sealed: SEALED }] };
  await worker.env.SECRETS.put("snapshot/prj_1/development", JSON.stringify(stale));

  const bundle = await as("usr_reader", "GET", "/bundle");
  assert.deepEqual(bundle.body.secrets, [{ name: "DATABASE_URL", version: 3, sealed: SEALED }]);
});

test("returns 404 when rolling back to a missing version", async () => {
  assert.equal((await as("usr_editor", "POST", "/secrets/DATABASE_URL/rollback", { version: 99 })).status, 404);
});

test("the bundle carries its revision and the revisions endpoint reports changes for members only", async () => {
  const before = (await as("usr_reader", "GET", "/bundle")).body.revision;
  const environments = [
    { repo: REPO, environment: "development" },
    { repo: "github.com/acme/other", environment: "development" },
  ];

  const first = await call(worker.env, "POST", "/v1/revisions", { token: tokens.usr_reader, body: { environments } });
  assert.deepEqual(first.body.revisions, [{ repo: REPO, environment: "development", revision: before }]);

  await as("usr_editor", "PUT", "/secrets/NEW_ONE", SEALED);
  const second = await call(worker.env, "POST", "/v1/revisions", { token: tokens.usr_reader, body: { environments } });
  assert.equal(second.body.revisions[0].revision, before + 1);

  const outsider = await call(worker.env, "POST", "/v1/revisions", { token: tokens.usr_outsider, body: { environments } });
  assert.deepEqual(outsider.body.revisions, []);
});
