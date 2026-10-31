import { REPO } from "@nenv/config/names";
import { newId } from "./auth.ts";
import type { EnvironmentContext, ProjectContext, Role, UserContext } from "./context.ts";
import { identifierParam } from "./guards.ts";
import { HttpError, json, readJson } from "./http.ts";
import { isPublicKey, parseSealed } from "./sealed.ts";

const ROLES: Role[] = ["reader", "editor", "admin"];

type ProjectRow = { id: string; repo: string; name: string; role: Role; secretCount: number; updatedAt: string | null };
type ProjectMemberRow = { projectId: string; email: string };
type EnvironmentRow = { projectId: string; name: string; publicKey: string; hasKey: number };
type MemberRow = { id: string; email: string; role: Role; keys: string | null; hasPublicKey: number; hasPasskey: number };

export async function listProjects({ env, userId }: UserContext): Promise<Response> {
  const [projects, environments, members] = await env.DB.batch([
    env.DB
      .prepare(
        `SELECT p.id, p.repo, p.name, CASE WHEN u.is_admin = 1 THEN 'admin' ELSE m.role END AS role,
                (SELECT COUNT(*) FROM secrets s WHERE s.project_id = p.id) AS secretCount,
                (SELECT MAX(v.created_at) FROM secret_versions v WHERE v.project_id = p.id) AS updatedAt
         FROM projects p
         JOIN users u ON u.id = ?1
         LEFT JOIN memberships m ON m.project_id = p.id AND m.user_id = u.id
         WHERE u.is_admin = 1 OR m.role IS NOT NULL
         ORDER BY p.repo`,
      )
      .bind(userId),
    env.DB
      .prepare(
        `SELECT e.project_id AS projectId, e.name, e.public_key AS publicKey,
                EXISTS (SELECT 1 FROM environment_keys k
                        WHERE k.project_id = e.project_id AND k.environment = e.name AND k.user_id = ?1) AS hasKey
         FROM environments e
         ORDER BY e.name`,
      )
      .bind(userId),
    env.DB.prepare(
      `SELECT m.project_id AS projectId, u.email
       FROM memberships m JOIN users u ON u.id = m.user_id
       ORDER BY u.email`,
    ),
  ]);

  const byProject = Map.groupBy(environments.results as EnvironmentRow[], (environment) => environment.projectId);
  const membersByProject = Map.groupBy(members.results as ProjectMemberRow[], (member) => member.projectId);
  return json({
    projects: (projects.results as ProjectRow[]).map((project) => ({
      ...project,
      environments: (byProject.get(project.id) ?? []).map(({ name, publicKey, hasKey }) => ({
        name,
        publicKey,
        hasKey: hasKey === 1,
      })),
      members: (membersByProject.get(project.id) ?? []).map((member) => member.email),
    })),
  });
}

export async function listMembers({ env, projectId }: ProjectContext): Promise<Response> {
  const { results } = await env.DB
    .prepare(
      `SELECT u.id, u.email, m.role, u.public_key IS NOT NULL AS hasPublicKey,
              EXISTS (SELECT 1 FROM passkeys p WHERE p.user_id = u.id) AS hasPasskey,
              (SELECT group_concat(k.environment) FROM environment_keys k
               WHERE k.project_id = m.project_id AND k.user_id = u.id) AS keys
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.project_id = ?
       ORDER BY u.email`,
    )
    .bind(projectId)
    .all<MemberRow>();

  return json({
    members: results.map(({ keys, hasPublicKey, hasPasskey, ...member }) => ({
      ...member,
      hasPublicKey: hasPublicKey === 1,
      hasPasskey: hasPasskey === 1,
      environments: keys ? keys.split(",") : [],
    })),
  });
}

export async function createProject({ request, env, userId }: UserContext): Promise<Response> {
  const { name, repo } = await readJson(request);
  if (typeof name !== "string" || name.length === 0 || name.length > 100) {
    throw new HttpError(400, "name must be 1 to 100 characters");
  }
  if (typeof repo !== "string" || !REPO.test(repo)) {
    throw new HttpError(400, "repo must be a normalized git origin such as github.com/acme/backend");
  }

  const id = newId("prj");
  const [created] = await env.DB.batch<{ id: string }>([
    env.DB
      .prepare("INSERT INTO projects (id, repo, name) VALUES (?, ?, ?) ON CONFLICT (repo) DO NOTHING RETURNING id")
      .bind(id, repo, name),
    env.DB
      .prepare("INSERT INTO memberships (project_id, user_id, role) SELECT id, ?, 'admin' FROM projects WHERE id = ?")
      .bind(userId, id),
  ]);

  if (created.results.length === 0) {
    throw new HttpError(409, "a project already exists for this repo");
  }
  return json({ id, repo, name }, 201);
}

export async function createEnvironment(context: ProjectContext): Promise<Response> {
  const { env, projectId, userId } = context;
  const environment = identifierParam(context, "environment");
  const body = await readJson(context.request);
  const wrappedKey = parseSealed(body.wrappedKey, "wrappedKey");
  if (!isPublicKey(body.publicKey)) {
    throw new HttpError(400, "publicKey must be the base64 public key of the environment");
  }

  const [created] = await env.DB.batch<{ name: string }>([
    env.DB
      .prepare(
        "INSERT INTO environments (project_id, name, public_key) VALUES (?, ?, ?) ON CONFLICT DO NOTHING RETURNING name",
      )
      .bind(projectId, environment, body.publicKey),
    env.DB
      .prepare(
        `INSERT INTO environment_keys (project_id, environment, user_id, wrapped_key)
         SELECT ?1, ?2, ?3, ?4 WHERE changes() = 1`,
      )
      .bind(projectId, environment, userId, JSON.stringify(wrappedKey)),
  ]);

  if (created.results.length === 0) {
    throw new HttpError(409, "this environment already exists");
  }
  return json({ environment }, 201);
}

export async function putMember(context: ProjectContext): Promise<Response> {
  const memberId = identifierParam(context, "userId");
  const { role } = await readJson(context.request);
  if (!ROLES.includes(role as Role)) {
    throw new HttpError(400, "role must be reader, editor, or admin");
  }

  const result = await context.env.DB
    .prepare(
      `INSERT INTO memberships (project_id, user_id, role)
       SELECT ?1, id, ?3 FROM users WHERE id = ?2
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = excluded.role`,
    )
    .bind(context.projectId, memberId, role)
    .run();

  if (result.meta.changes === 0) {
    throw new HttpError(404, "user not found");
  }
  return json({ userId: memberId, role });
}

export async function removeMember(context: ProjectContext): Promise<Response> {
  const memberId = identifierParam(context, "userId");
  const { env, projectId } = context;

  await env.DB.batch([
    env.DB.prepare("DELETE FROM environment_keys WHERE project_id = ? AND user_id = ?").bind(projectId, memberId),
    env.DB.prepare("DELETE FROM memberships WHERE project_id = ? AND user_id = ?").bind(projectId, memberId),
  ]);
  return new Response(null, { status: 204 });
}

export async function shareEnvironmentKey(context: EnvironmentContext): Promise<Response> {
  const memberId = identifierParam(context, "userId");
  const wrappedKey = parseSealed((await readJson(context.request)).wrappedKey, "wrappedKey");

  const result = await context.env.DB
    .prepare(
      `INSERT INTO environment_keys (project_id, environment, user_id, wrapped_key)
       SELECT ?1, ?2, user_id, ?4 FROM memberships WHERE project_id = ?1 AND user_id = ?3
       ON CONFLICT (project_id, environment, user_id) DO UPDATE SET wrapped_key = excluded.wrapped_key`,
    )
    .bind(context.projectId, context.environment, memberId, JSON.stringify(wrappedKey))
    .run();

  if (result.meta.changes === 0) {
    throw new HttpError(404, "this user is not a member of the project");
  }
  return json({ userId: memberId });
}
