export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function requireSameOrigin(request: Request): void {
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    throw new HttpError(403, "cross-origin requests are not allowed");
  }
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "request body must be a JSON object");
  }
  return body as Record<string, unknown>;
}
