import { hashToken, randomToken } from "./auth.ts";
import type { Context, UserContext } from "./context.ts";
import { identifierParam } from "./guards.ts";
import { HttpError, json } from "./http.ts";

const INVITE_TTL = "+7 days";

export type Invite = {
  userId: string;
  email: string;
};

export async function createInviteLink(db: D1Database, request: Request, userId: string): Promise<string> {
  const token = randomToken();
  await db.batch([
    db.prepare("DELETE FROM invites WHERE user_id = ? OR expires_at <= datetime('now')").bind(userId),
    db.prepare("INSERT INTO invites (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', ?))").bind(await hashToken(token), userId, INVITE_TTL),
  ]);
  return `${new URL(request.url).origin}/dashboard/#/join/${token}`;
}

export async function findInvite(db: D1Database, token: unknown): Promise<Invite> {
  const invite =
    typeof token === "string" &&
    (await db
      .prepare(
        `SELECT u.id AS userId, u.email FROM invites i JOIN users u ON u.id = i.user_id
         WHERE i.token_hash = ? AND i.expires_at > datetime('now')`,
      )
      .bind(await hashToken(token))
      .first<Invite>());

  if (!invite) {
    throw new HttpError(404, "this invite link is invalid or has expired, ask an admin for a new one");
  }
  return invite;
}

export async function readInvite({ env, params }: Context): Promise<Response> {
  const { email } = await findInvite(env.DB, params.token);
  return json({ email });
}

export async function regenerateInvite(context: UserContext): Promise<Response> {
  const { request, env } = context;
  const userId = identifierParam(context, "userId");
  const user = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(userId).first();
  if (!user) {
    throw new HttpError(404, "user not found");
  }
  return json({ inviteUrl: await createInviteLink(env.DB, request, userId) });
}
