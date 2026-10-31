export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

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
