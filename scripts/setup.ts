import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EMAIL = /^[^\s@']+@[^\s@']+\.[^\s@']+$/;

const admin = adminEmail(process.argv.slice(2));

step("Building the dashboard");
execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });

step("Deploying the Worker (creates D1 and KV on the first run)");
const url = wrangler(["deploy"]).match(/https:\/\/\S+\.workers\.dev/)?.[0];
if (!url) throw new Error("could not find the deployed URL in the wrangler output");
console.log(`  ${url}`);

step("Applying database migrations");
wrangler(["d1", "migrations", "apply", "DB", "--remote"]);

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
    return execFileSync("npx", ["wrangler", ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
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
