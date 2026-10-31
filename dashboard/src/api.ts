import { sessionToken } from "./session.ts";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let response = await send(method, path, body, await sessionToken());
  if (response.status === 401) {
    response = await send(method, path, body, await sessionToken(true));
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);
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

function send(method: string, path: string, body: unknown, token: string): Promise<Response> {
  return fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
