import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { api } from "./api.ts";
import type { Deployment } from "./deployment.ts";
import { readJsonFile, removeFile, writeJsonFile } from "./files.ts";
import { loadSession } from "./session.ts";

const POLL_INTERVAL_MS = 5_000;
const IDLE_LIMIT_MS = 60 * 60 * 1000;
const CHANGED = "changed";

type WatchEntry = { repo: string; environment: string; seenAt: number };
type WatchList = Record<string, WatchEntry>;
type Revision = { repo: string; environment: string; revision: number };

export function markerPath(deployment: Deployment, repo: string, environment: string): string {
  const name = createHash("sha256").update(`${repo}\0${environment}`).digest("hex").slice(0, 32);
  return join(deployment.dir, "revisions", name);
}

export async function readMarker(path: string): Promise<string> {
  return readFile(path, "utf8").catch(() => "");
}

export async function writeMarker(path: string, value: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
  await writeFile(path, value, { mode: 0o600 });
}

export async function markChanged(deployment: Deployment, repo: string, environment: string): Promise<void> {
  await writeMarker(markerPath(deployment, repo, environment), CHANGED);
}

export async function watchEnvironment(deployment: Deployment, repo: string, environment: string): Promise<void> {
  const list = (await readJsonFile<WatchList>(watchListPath(deployment))) ?? {};
  list[`${repo}\0${environment}`] = { repo, environment, seenAt: Date.now() };
  await writeJsonFile(watchListPath(deployment), list);
}

export async function startWatcher(deployment: Deployment): Promise<void> {
  if (await isWatcherRunning(deployment)) return;
  spawn(process.execPath, [...process.execArgv, process.argv[1]!, "watch"], { detached: true, stdio: "ignore" }).unref();
}

export async function runWatcher(deployment: Deployment): Promise<void> {
  try {
    await writeJsonFile(pidPath(deployment), process.pid, "wx");
  } catch {
    if (await isWatcherRunning(deployment)) return;
    await writeJsonFile(pidPath(deployment), process.pid);
  }

  try {
    while (await checkForUpdates(deployment)) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  } finally {
    await removeFile(pidPath(deployment));
  }
}

export async function checkForUpdates(deployment: Deployment): Promise<boolean> {
  const token = await loadSession(deployment);
  const list = (await readJsonFile<WatchList>(watchListPath(deployment))) ?? {};
  const active = Object.values(list).filter((entry) => Date.now() - entry.seenAt < IDLE_LIMIT_MS);
  if (!token || active.length === 0) return false;

  await refreshMarkers(deployment, token, active).catch(() => {});
  return true;
}

async function refreshMarkers(deployment: Deployment, token: string, entries: WatchEntry[]): Promise<void> {
  const { revisions } = await api<{ revisions: Revision[] }>(deployment, "POST", "/v1/revisions", {
    token,
    body: { environments: entries.map(({ repo, environment }) => ({ repo, environment })) },
  });
  for (const { repo, environment, revision } of revisions) {
    const path = markerPath(deployment, repo, environment);
    if ((await readMarker(path)) !== String(revision)) await writeMarker(path, String(revision));
  }
}

async function isWatcherRunning(deployment: Deployment): Promise<boolean> {
  const pid = await readJsonFile<number>(pidPath(deployment));
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function watchListPath(deployment: Deployment): string {
  return join(deployment.dir, "watch.json");
}

function pidPath(deployment: Deployment): string {
  return join(deployment.dir, "watcher.pid");
}
