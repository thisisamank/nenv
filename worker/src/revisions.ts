import { IDENTIFIER, REPO } from "@nenv/config/names";
import type { UserContext } from "./context.ts";
import { HttpError, json, readJson } from "./http.ts";

const MAX_ENVIRONMENTS = 20;

type Target = { repo: string; environment: string };

export async function readRevisions({ request, env, userId }: UserContext): Promise<Response> {
  const { environments } = await readJson(request);
  if (!Array.isArray(environments) || environments.length > MAX_ENVIRONMENTS || !environments.every(isTarget)) {
    throw new HttpError(400, `environments must be up to ${MAX_ENVIRONMENTS} { repo, environment } pairs`);
  }
  if (environments.length === 0) {
    return json({ revisions: [] });
  }

  const results = await env.DB.batch<{ revision: number }>(
    environments.map(({ repo, environment }) =>
      env.DB
        .prepare(
          `SELECT e.revision FROM projects p
           JOIN environments e ON e.project_id = p.id AND e.name = ?2
           JOIN users u ON u.id = ?3
           LEFT JOIN memberships m ON m.project_id = p.id AND m.user_id = u.id
           WHERE p.repo = ?1 AND (u.is_admin = 1 OR m.role IS NOT NULL)`,
        )
        .bind(repo, environment, userId),
    ),
  );

  return json({
    revisions: environments.flatMap((target, index) => {
      const row = results[index]!.results[0];
      return row ? [{ ...target, revision: row.revision }] : [];
    }),
  });
}

function isTarget(value: unknown): value is Target {
  const { repo, environment } = (value ?? {}) as Record<string, unknown>;
  return typeof repo === "string" && REPO.test(repo) && typeof environment === "string" && IDENTIFIER.test(environment);
}
