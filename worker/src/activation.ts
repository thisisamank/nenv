import { verifyAccessRequest } from "./access-jwt.ts";
import { newId } from "./auth.ts";
import type { Context, Handler } from "./context.ts";
import { approveUserCode, USER_CODE } from "./device.ts";
import { HttpError } from "./http.ts";
import { escapeHtml, htmlPage } from "./pages.ts";

export const showActivation = renderErrors(async ({ request, env }) => {
  const email = await verifyAccessRequest(request, env);
  const code = new URL(request.url).searchParams.get("code")?.toUpperCase() ?? "";

  return htmlPage(
    "Activate device",
    `<h1>Activate a device</h1>
<p>Signed in as <strong>${escapeHtml(email)}</strong>.</p>
<p>Approve only a code that your own terminal shows. Anyone who gets you to approve their code gets access to your secrets.</p>
<form method="post" action="/activate">
  <input name="code" value="${USER_CODE.test(code) ? code : ""}" placeholder="XXXX-XXXX" maxlength="9" required autocomplete="off" aria-label="Device code">
  <button type="submit">Approve</button>
</form>`,
  );
});

export const approveActivation = renderErrors(async ({ request, env }) => {
  requireSameOrigin(request);
  const email = await verifyAccessRequest(request, env);
  const code = String((await request.formData()).get("code") ?? "").trim().toUpperCase();
  if (!USER_CODE.test(code)) {
    throw new HttpError(400, "the code must look like XXXX-XXXX");
  }

  const userId = await resolveUser(env.DB, email);
  if (!(await approveUserCode(env.DB, code, userId))) {
    throw new HttpError(400, "this code is invalid, expired, or already used");
  }

  return htmlPage("Device activated", "<h1>Device activated</h1><p>You can close this tab and return to your terminal.</p>");
});

export async function resolveUser(db: D1Database, email: string): Promise<string> {
  const existing = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>();
  if (existing) return existing.id;

  const firstAdmin = await db
    .prepare("INSERT INTO users (id, email, is_admin) SELECT ?, ?, 1 WHERE NOT EXISTS (SELECT 1 FROM users) RETURNING id")
    .bind(newId("usr"), email)
    .first<{ id: string }>();

  if (!firstAdmin) {
    throw new HttpError(403, "you have not been invited to this NENV deployment, ask an admin to invite you");
  }
  return firstAdmin.id;
}

export function requireSameOrigin(request: Request): void {
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    throw new HttpError(403, "cross-origin requests are not allowed");
  }
}

function renderErrors(handle: Handler): Handler {
  return async (context: Context) => {
    try {
      return await handle(context);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      return htmlPage("Activation failed", `<h1>Activation failed</h1><p>${escapeHtml(error.message)}</p>`, error.status);
    }
  };
}
