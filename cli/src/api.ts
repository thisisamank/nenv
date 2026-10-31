import type { Deployment } from "./deployment.ts";
import { CLI_VERSION } from "./version.ts";

const TIMEOUT_MS = 10_000;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type RequestOptions = {
  token?: string;
  body?: unknown;
};

export async function api<T>(deployment: Deployment, method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "X-Nenv-Version": CLI_VERSION };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await deployment.fetch(deployment.url + path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const data: any = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? `request failed with status ${response.status}`);
  }
  return data as T;
}

export function repoPath(repo: string): string {
  return `/v1/repos/${encodeURIComponent(repo)}`;
}

export function environmentPath(repo: string, environment: string): string {
  return `${repoPath(repo)}/environments/${environment}`;
}
