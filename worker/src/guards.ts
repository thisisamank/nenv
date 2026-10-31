import { ENV_VAR_NAME, IDENTIFIER, REPO } from "@noenv/config/names";
import { compareVersions, type Policies } from "@noenv/policy";
import { authenticate } from "./auth.ts";
import type { Context, EnvironmentContext, Handler, ProjectContext, Role, UserContext } from "./context.ts";
import { HttpError } from "./http.ts";
import { effectivePolicyRows, toPolicies } from "./policy-store.ts";

const RANK: Record<Role, number> = { reader: 1, editor: 2, admin: 3 };

const ROLE_SQL = "CASE WHEN u.is_admin = 1 THEN 'admin' ELSE m.role END AS role";

export const CLI_VERSION_HEADER = "X-Noenv-Version";

export function withUser(handle: Handler<UserContext>): Handler {
  return async (context) => {
    const session = await authenticate(context.request, context.env);
    context.waitUntil(recordLastSeen(context, session.tokenHash));
    return handle({ ...context, ...session });
  };
}

export function withOrgAdmin(handle: Handler<UserContext>): Handler {
  return withUser(async (context) => {
    const user = await context.env.DB
      .prepare("SELECT is_admin FROM users WHERE id = ?")
      .bind(context.userId)
      .first<{ is_admin: number }>();

    if (user?.is_admin !== 1) {
      throw new HttpError(403, "forbidden");
    }
    return handle(context);
  });
}

export function withProject(minimum: Role, handle: Handler<ProjectContext>): Handler {
  return withUser(async (context) => {
    const repo = repoParam(context);
    const access = await context.env.DB
      .prepare(
        `SELECT p.id AS project_id, ${ROLE_SQL}
         FROM projects p
         JOIN users u ON u.id = ?2
         LEFT JOIN memberships m ON m.project_id = p.id AND m.user_id = u.id
         WHERE p.repo = ?1`,
      )
      .bind(repo, context.userId)
      .first<{ project_id: string; role: Role | null }>();

    requireRank(access?.role, minimum);
    return handle({ ...context, projectId: access!.project_id });
  });
}

export function withEnvironment(minimum: Role, handle: Handler<EnvironmentContext>): Handler {
  return withUser(async (context) => {
    const repo = repoParam(context);
    const environment = identifierParam(context, "environment");
    const db = context.env.DB;

    const [access, policyRows] = await db.batch([
      db
        .prepare(
          `SELECT p.id AS project_id, ${ROLE_SQL}
           FROM projects p
           JOIN environments e ON e.project_id = p.id AND e.name = ?2
           JOIN users u ON u.id = ?3
           LEFT JOIN memberships m ON m.project_id = p.id AND m.user_id = u.id
           WHERE p.repo = ?1`,
        )
        .bind(repo, environment, context.userId),
      effectivePolicyRows(db, repo, environment),
    ]);

    const row = access.results[0] as { project_id: string; role: Role | null } | undefined;
    const policies = toPolicies(policyRows.results);

    requireRank(row?.role, minimum);
    requireRank(row?.role, policies.environmentMinRole);
    requireCliVersion(context.request, policies);

    return handle({ ...context, projectId: row!.project_id, environment, policies });
  });
}

export function identifierParam(context: Context, name: string): string {
  const value = context.params[name] ?? "";
  if (!IDENTIFIER.test(value)) {
    throw new HttpError(400, `invalid ${name}`);
  }
  return value;
}

export function secretNameParam(context: Context): string {
  const value = context.params.name ?? "";
  if (!ENV_VAR_NAME.test(value)) {
    throw new HttpError(400, "invalid secret name");
  }
  return value;
}

function repoParam(context: Context): string {
  const value = safeDecode(context.params.repo ?? "");
  if (!REPO.test(value)) {
    throw new HttpError(400, "invalid repo");
  }
  return value;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function requireCliVersion(request: Request, policies: Policies): void {
  const version = request.headers.get(CLI_VERSION_HEADER);
  if (policies.minCliVersion && version !== null && compareVersions(version, policies.minCliVersion) < 0) {
    throw new HttpError(426, `noenv CLI ${policies.minCliVersion} or newer is required, you have ${version}`);
  }
}

async function recordLastSeen({ request, env }: Context, tokenHash: string): Promise<void> {
  await env.DB
    .prepare("UPDATE sessions SET last_seen_at = datetime('now'), cli_version = COALESCE(?, cli_version) WHERE token_hash = ?")
    .bind(request.headers.get(CLI_VERSION_HEADER), tokenHash)
    .run();
}

function requireRank(role: Role | null | undefined, minimum: Role): void {
  if (!role || RANK[role] < RANK[minimum]) {
    throw new HttpError(403, "forbidden");
  }
}
