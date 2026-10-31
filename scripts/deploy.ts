import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WORKER = `${ROOT}worker`;
const CONFIG = `${WORKER}/wrangler.jsonc`;
const DATABASE = "nenv";
const NAMESPACE = "nenv-secrets";
const EMAIL = /^[^\s@']+@[^\s@']+\.[^\s@']+$/;

const admin = adminEmail(process.argv.slice(2));

step("Preparing storage");
ensureDatabase();
ensureNamespace();

step("Applying database migrations");
wrangler(["d1", "migrations", "apply", "DB", "--remote"]);

step("Building the dashboard");
execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });

step("Deploying the Worker");
const url = wrangler(["deploy"]).match(/https:\/\/\S+\.workers\.dev/)?.[0];
if (!url) throw new Error("could not find the deployed URL in the wrangler output");
console.log(`  ${url}`);

if (admin) {
  step(`Preparing the admin account for ${admin}`);
  console.log(`\n${adminLink(url, admin)}\n`);
} else {
  console.log(`\nDone. Pass --admin you@example.com to get a setup link for the first admin.\n`);
}

function adminEmail(args: string[]): string | null {
  const index = args.indexOf("--admin");
  if (index === -1) return null;
  const email = args[index + 1]?.toLowerCase() ?? "";
  if (!EMAIL.test(email)) throw new Error("--admin needs a valid email address");
  return email;
}

function ensureDatabase(): void {
  const config = readFileSync(CONFIG, "utf8");
  if (/"database_id":\s*"[^"]+"/.test(config)) return;

  const existing = (JSON.parse(wrangler(["d1", "list", "--json"])) as { name: string; uuid: string }[]).find((db) => db.name === DATABASE);
  const id = existing?.uuid ?? wrangler(["d1", "create", DATABASE]).match(/"database_id":\s*"([0-9a-f-]+)"/)?.[1];
  if (!id) throw new Error("could not create the D1 database");

  writeFileSync(CONFIG, config.replace(`"database_name": "${DATABASE}",`, `"database_name": "${DATABASE}",\n      "database_id": "${id}",`));
}

function ensureNamespace(): void {
  const config = readFileSync(CONFIG, "utf8");
  if (/"binding": "SECRETS",\s*"id":/.test(config)) return;

  const existing = (JSON.parse(wrangler(["kv", "namespace", "list"])) as { title: string; id: string }[]).find((ns) => ns.title === NAMESPACE);
  const id = existing?.id ?? wrangler(["kv", "namespace", "create", NAMESPACE]).match(/"id":\s*"([0-9a-f]{32})"/)?.[1];
  if (!id) throw new Error("could not create the KV namespace");

  writeFileSync(CONFIG, config.replace(`"binding": "SECRETS"`, `"binding": "SECRETS",\n      "id": "${id}"`));
}

function adminLink(url: string, email: string): string {
  const [user] = query<{ id: string; passkeys: number }>(
    `SELECT id, (SELECT COUNT(*) FROM passkeys p WHERE p.user_id = users.id) AS passkeys FROM users WHERE email = '${email}'`,
  );
  const userId = user?.id ?? `usr_${randomUUID().replaceAll("-", "")}`;

  if (!user) {
    query(`INSERT INTO users (id, email, is_admin) VALUES ('${userId}', '${email}', 1)`);
  } else {
    query(`UPDATE users SET is_admin = 1 WHERE id = '${userId}'`);
  }
  if (user && user.passkeys > 0) {
    return `${email} is already set up. Sign in at ${url}/dashboard/`;
  }

  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  query(`DELETE FROM invites WHERE user_id = '${userId}'`);
  query(`INSERT INTO invites (token_hash, user_id, expires_at) VALUES ('${hash}', '${userId}', datetime('now', '+7 days'))`);
  return `Open this link to create your passkey and finish setup:\n  ${url}/dashboard/#/join/${token}`;
}

function query<T>(sql: string): T[] {
  const output = wrangler(["d1", "execute", "DB", "--remote", "--json", "--command", sql]);
  return (JSON.parse(output) as { results: T[] }[])[0]?.results ?? [];
}

function wrangler(args: string[], attempt = 1): string {
  try {
    return execFileSync("npx", ["wrangler", ...args], { cwd: WORKER, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    if (attempt < 2) return wrangler(args, attempt + 1);
    const { stdout = "", stderr = "" } = error as { stdout?: string; stderr?: string };
    console.error(`\nwrangler ${args.join(" ")} failed:\n${(stderr || stdout).trim()}`);
    process.exit(1);
  }
}

function step(message: string): void {
  console.log(`\n→ ${message}`);
}
