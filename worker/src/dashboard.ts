import { verifyAccessRequest } from "./access-jwt.ts";
import { requireSameOrigin, resolveUser } from "./activation.ts";
import { createSession } from "./auth.ts";
import type { Context } from "./context.ts";
import { json } from "./http.ts";

export async function startDashboardSession({ request, env }: Context): Promise<Response> {
  requireSameOrigin(request);
  const email = await verifyAccessRequest(request, env);
  const userId = await resolveUser(env.DB, email);
  return json(await createSession(env, userId, "Dashboard"));
}
