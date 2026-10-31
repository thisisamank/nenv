import { readdir, readFile } from "node:fs/promises";
import { getPlatformProxy } from "wrangler";
import worker, { type Env } from "../src/index.ts";
import { hashToken } from "../src/auth.ts";

export const REPO = "github.com/acme/backend";
export const PROJECT_PATH = `/v1/repos/${encodeURIComponent(REPO)}`;
export const PUBLIC_KEY = btoa(String.fromCharCode(...new Uint8Array(65).fill(4)));

export type TestWorker = {
  env: Env;
  dispose: () => Promise<void>;
};

export async function startWorker(): Promise<TestWorker> {
  const proxy = await getPlatformProxy<Env>({
    configPath: new URL("../../wrangler.jsonc", import.meta.url).pathname,
    persist: false,
  });
  const env = proxy.env;

  const migrations = new URL("../migrations/", import.meta.url);
  for (const file of (await readdir(migrations)).sort()) {
    const sql = await readFile(new URL(file, migrations), "utf8");
    const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
    await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
  }

  return { env, dispose: proxy.dispose };
}

export async function addUser(env: Env, id: string, isAdmin = false): Promise<string> {
  const token = `token_${id}`;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, email, is_admin) VALUES (?, ?, ?)").bind(id, `${id}@example.com`, isAdmin ? 1 : 0),
    env.DB
      .prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 day'))")
      .bind(await hashToken(token), id),
  ]);
  return token;
}

export function fetchWorker(env: Env): typeof fetch {
  return async (input, init) => {
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (promise: Promise<unknown>) => void pending.push(promise), passThroughOnException() {}, props: {} };
    const response = await worker.fetch(new Request(input, init), env, ctx as unknown as ExecutionContext);
    await Promise.all(pending);
    return response;
  };
}

export type CallOptions = {
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export async function call(env: Env, method: string, path: string, options: CallOptions = {}) {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const body = options.body instanceof URLSearchParams || options.body === undefined ? options.body : JSON.stringify(options.body);
  const response = await fetchWorker(env)(`https://nenv.test${path}`, { method, headers, body });
  const text = await response.text();
  const isJson = response.headers.get("Content-Type")?.includes("json");

  return { status: response.status, headers: response.headers, body: (isJson ? JSON.parse(text) : text) as any };
}
