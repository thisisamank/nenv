import { spawn } from "node:child_process";
import { hostname } from "node:os";
import { join } from "node:path";
import { api, ApiError } from "./api.ts";
import type { Deployment } from "./deployment.ts";
import { readJsonFile, removeFile, writeJsonFile } from "./files.ts";
import { ensureIdentity } from "./identity.ts";

type Session = {
  token: string;
  expiresAt: string;
};

export type PendingSignIn = {
  deviceCode: string;
  userCode: string;
  url: string;
  interval: number;
  expiresAt: number;
};

type DeviceResponse = {
  deviceCode: string;
  userCode: string;
  verificationUriComplete: string;
  interval: number;
  expiresIn: number;
};

export async function loadSession(deployment: Deployment): Promise<string | null> {
  const session = await readJsonFile<Session>(sessionPath(deployment));
  if (!session) return null;
  return Date.parse(`${session.expiresAt.replace(" ", "T")}Z`) > Date.now() ? session.token : null;
}

export async function clearSession(deployment: Deployment): Promise<void> {
  await removeFile(sessionPath(deployment));
}

export async function requireSession(deployment: Deployment): Promise<string> {
  const token = await loadSession(deployment);
  if (!token) {
    throw new Error("you are not signed in, open a new shell or run `noenv auth`");
  }
  return token;
}

export async function startSignIn(deployment: Deployment): Promise<{ pending: PendingSignIn; started: boolean }> {
  const existing = await readJsonFile<PendingSignIn>(pendingPath(deployment));
  if (existing && existing.expiresAt > Date.now()) {
    return { pending: existing, started: false };
  }
  await removeFile(pendingPath(deployment));

  const device = await api<DeviceResponse>(deployment, "POST", "/v1/auth/device");
  if (!device.verificationUriComplete.startsWith(`${deployment.url}/activate`)) {
    throw new Error("the server returned an unexpected sign-in URL");
  }

  const pending: PendingSignIn = {
    deviceCode: device.deviceCode,
    userCode: device.userCode,
    url: device.verificationUriComplete,
    interval: device.interval,
    expiresAt: Date.now() + device.expiresIn * 1000,
  };

  try {
    await writeJsonFile(pendingPath(deployment), pending, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return startSignIn(deployment);
  }
  return { pending, started: true };
}

export async function waitForSignIn(deployment: Deployment, pending: PendingSignIn): Promise<boolean> {
  while (pending.expiresAt > Date.now()) {
    await sleep(pending.interval * 1000);
    try {
      const session = await api<Session>(deployment, "POST", "/v1/auth/token", {
        body: { deviceCode: pending.deviceCode, deviceName: hostname().slice(0, 100) },
      });
      await writeJsonFile(sessionPath(deployment), session);
      await removeFile(pendingPath(deployment));
      await ensureIdentity(deployment, session.token);
      return true;
    } catch (error) {
      if (!(error instanceof ApiError) || error.message !== "authorization_pending") break;
    }
  }
  await removeFile(pendingPath(deployment));
  return (await loadSession(deployment)) !== null;
}

export async function readPendingSignIn(deployment: Deployment): Promise<PendingSignIn | null> {
  return readJsonFile<PendingSignIn>(pendingPath(deployment));
}

export function openBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(command, [url], { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
}

export function startBackgroundPoller(): void {
  spawn(process.execPath, [...process.execArgv, process.argv[1], "auth", "--wait"], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

function sessionPath(deployment: Deployment): string {
  return join(deployment.dir, "session.json");
}

function pendingPath(deployment: Deployment): string {
  return join(deployment.dir, "pending-sign-in.json");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
