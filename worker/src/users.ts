import { newId } from "./auth.ts";
import type { UserContext } from "./context.ts";
import { HttpError, json, readJson } from "./http.ts";
import { isPublicKey } from "./sealed.ts";

const EMAIL = /^[^\s@]+@[^\s@]+$/;

export async function getMe({ env, userId }: UserContext): Promise<Response> {
  const user = await env.DB
    .prepare("SELECT id, email, is_admin, public_key FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: string; email: string; is_admin: number; public_key: string | null }>();

  return json({ id: user!.id, email: user!.email, isAdmin: user!.is_admin === 1, publicKey: user!.public_key });
}

export async function setPublicKey({ request, env, userId }: UserContext): Promise<Response> {
  const { publicKey } = await readJson(request);
  if (!isPublicKey(publicKey)) {
    throw new HttpError(400, "publicKey must be a base64 P-256 public key");
  }

  const result = await env.DB
    .prepare("UPDATE users SET public_key = ? WHERE id = ? AND public_key IS NULL")
    .bind(publicKey, userId)
    .run();

  if (result.meta.changes === 0) {
    throw new HttpError(409, "a public key is already registered for this user");
  }
  return json({ publicKey });
}

type UserRow = { id: string; email: string; isAdmin: number; hasPublicKey: number; createdAt: string };
type MembershipRow = { userId: string; repo: string; role: string; environments: string; keys: string | null };

export async function listUsers({ env }: UserContext): Promise<Response> {
  const [users, memberships] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id, email, is_admin = 1 AS isAdmin, public_key IS NOT NULL AS hasPublicKey, created_at AS createdAt
       FROM users ORDER BY email`,
    ),
    env.DB.prepare(
      `SELECT m.user_id AS userId, p.repo, m.role,
              (SELECT group_concat(e.name) FROM environments e WHERE e.project_id = p.id) AS environments,
              (SELECT group_concat(k.environment) FROM environment_keys k
               WHERE k.project_id = p.id AND k.user_id = m.user_id) AS keys
       FROM memberships m JOIN projects p ON p.id = m.project_id
       ORDER BY p.repo`,
    ),
  ]);

  const byUser = Map.groupBy(memberships.results as MembershipRow[], (membership) => membership.userId);
  return json({
    users: (users.results as UserRow[]).map((user) => ({
      ...user,
      isAdmin: user.isAdmin === 1,
      hasPublicKey: user.hasPublicKey === 1,
      projects: (byUser.get(user.id) ?? []).map(({ repo, role, environments, keys }) => {
        const held = keys ? keys.split(",") : [];
        return {
          repo,
          role,
          missingKeys: (environments ? environments.split(",") : []).filter((name) => !held.includes(name)),
        };
      }),
    })),
  });
}

export async function findUser({ request, env }: UserContext): Promise<Response> {
  const email = new URL(request.url).searchParams.get("email")?.toLowerCase() ?? "";
  const user = await env.DB
    .prepare("SELECT id, email, public_key FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string; email: string; public_key: string | null }>();

  if (!user) {
    throw new HttpError(404, "user not found");
  }
  return json({ id: user.id, email: user.email, publicKey: user.public_key });
}

export async function inviteUser({ request, env }: UserContext): Promise<Response> {
  const { email } = await readJson(request);
  if (typeof email !== "string" || email.length > 254 || !EMAIL.test(email)) {
    throw new HttpError(400, "email must be a valid email address");
  }

  const user = await env.DB
    .prepare("INSERT INTO users (id, email) VALUES (?, ?) ON CONFLICT (email) DO NOTHING RETURNING id, email")
    .bind(newId("usr"), email.toLowerCase())
    .first<{ id: string; email: string }>();

  if (!user) {
    throw new HttpError(409, "this user already exists");
  }
  return json(user, 201);
}
