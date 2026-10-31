import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_DOTENV_POLICY,
  enforceDotenvPolicy,
  findDotenvFiles,
  readDotenvFile,
  removeIfUnchanged,
  type DotenvPolicy,
  type SecretStore,
} from "@noenv/dotenv";

const DELETE: DotenvPolicy = { ...DEFAULT_DOTENV_POLICY, mode: "delete" };

async function project(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "noenv-dotenv-"));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}

function memoryStore(initial: Record<string, string> = {}): SecretStore & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get: async (name) => values.get(name),
    set: async (name, value) => void values.set(name, value),
  };
}

test("finds only matching regular files inside the project tree", async () => {
  const outside = await project({ ".env.target": "SECRET=outside" });
  const root = await project({
    ".env": "A=1",
    ".env.example": "A=",
    "api/.env.local": "B=2",
    "node_modules/pkg/.env": "C=3",
    "vendor/other-repo/.git/HEAD": "ref",
    "vendor/other-repo/.env": "D=4",
  });
  await mkdir(join(root, ".env.d"));
  await symlink(join(outside, ".env.target"), join(root, ".env.link"));

  assert.deepEqual(await findDotenvFiles(root, DELETE), [join(root, ".env"), join(root, "api/.env.local")]);
});

test("delete mode migrates values, verifies them, and deletes the files", async () => {
  const root = await project({ ".env": "export API_KEY=abc\n# comment\nDB_URL=\"postgres://x\"\n", "api/.env.local": "PORT=3000" });
  const store = memoryStore({ PORT: "3000" });

  const result = await enforceDotenvPolicy(root, DELETE, store);

  assert.equal(result.blocked, false);
  assert.deepEqual(result.files.map((f) => f.status), ["deleted", "deleted"]);
  assert.deepEqual(Object.fromEntries(store.values), { PORT: "3000", API_KEY: "abc", DB_URL: "postgres://x" });
  assert.equal(existsSync(join(root, ".env")), false);
});

test("a value that differs from NOENV is a conflict and the file is kept", async () => {
  const root = await project({ ".env": "DATABASE_URL=localhost\nNEW_KEY=1" });
  const store = memoryStore({ DATABASE_URL: "postgres://shared" });

  const result = await enforceDotenvPolicy(root, DELETE, store);

  assert.equal(result.blocked, true);
  assert.deepEqual(result.files[0], { path: join(root, ".env"), status: "conflict", names: ["DATABASE_URL"] });
  assert.equal(store.values.get("DATABASE_URL"), "postgres://shared");
  assert.equal(await readFile(join(root, ".env"), "utf8"), "DATABASE_URL=localhost\nNEW_KEY=1");
});

test("a failed upload or verification keeps the file and blocks", async () => {
  const root = await project({ ".env": "A=1" });

  const failing: SecretStore = { get: async () => undefined, set: async () => Promise.reject(new Error("offline")) };
  assert.deepEqual((await enforceDotenvPolicy(root, DELETE, failing)).files[0].status, "failed");

  const lossy: SecretStore = { get: async () => undefined, set: async () => {} };
  const result = await enforceDotenvPolicy(root, DELETE, lossy);
  assert.equal(result.files[0].status, "failed");
  assert.equal(result.blocked, true);
  assert.equal(existsSync(join(root, ".env")), true);
});

test("invalid variable names keep the file", async () => {
  const root = await project({ ".env": "bad-name=1" });
  const result = await enforceDotenvPolicy(root, DELETE, memoryStore());
  assert.deepEqual(result.files[0].status, "invalid");
  assert.equal(existsSync(join(root, ".env")), true);
});

test("a file edited after migration is not deleted", async () => {
  const root = await project({ ".env": "A=1" });
  const file = await readDotenvFile(join(root, ".env"));
  await writeFile(file.path, "A=1\nB=2");

  assert.equal(await removeIfUnchanged(file), false);
  assert.equal(existsSync(file.path), true);
});

test("other modes never upload or delete files", async () => {
  const root = await project({ ".env": "A=1" });

  const warn = await enforceDotenvPolicy(root, { ...DELETE, mode: "warn" }, memoryStore());
  assert.deepEqual([warn.blocked, warn.files[0].status], [false, "found"]);

  const block = await enforceDotenvPolicy(root, { ...DELETE, mode: "block" }, memoryStore());
  assert.deepEqual([block.blocked, block.files[0].status], [true, "found"]);

  const untouched = memoryStore();
  const migrate = await enforceDotenvPolicy(root, { ...DELETE, mode: "migrate" }, untouched);
  assert.equal(untouched.values.size, 0);
  assert.deepEqual([migrate.blocked, migrate.files[0].status], [true, "found"]);

  assert.equal(existsSync(join(root, ".env")), true);
});
