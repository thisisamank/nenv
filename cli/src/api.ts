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
  const headers: Record<string, string> = { "X-Noenv-Version": CLI_VERSION };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await deployment.fetch(deployment.url + path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (response.status >= 300 && response.status < 400) {
    throw new ApiError(response.status, `${deployment.url} redirected the request, check that Cloudflare Access does not protect /v1`);
  }

  const data: any = response.status === 204 ? null : await response.json().catch(() => undefined);
  if (data === undefined) {
    throw new ApiError(response.status, `${deployment.url} did not return a noenv API response (status ${response.status})`);
  }
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
