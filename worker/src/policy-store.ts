import { isPolicyName, mergePolicies, type Policies } from "@noenv/policy";

export const ORGANIZATION = "";

type PolicyRow = {
  name: string;
  value: string;
};

export function effectivePolicyRows(db: D1Database, repo: string, environment: string): D1PreparedStatement {
  return db
    .prepare(
      `SELECT name, value FROM policies
       WHERE (project_id = '' AND environment = '')
          OR (project_id = (SELECT id FROM projects WHERE repo = ?1) AND environment IN ('', ?2))
       ORDER BY project_id != '', environment != ''`,
    )
    .bind(repo, environment);
}

export function policyRows(db: D1Database, projectId: string, environment: string): D1PreparedStatement {
  return db.prepare("SELECT name, value FROM policies WHERE project_id = ? AND environment = ?").bind(projectId, environment);
}

export function toPolicies(rows: unknown[]): Policies {
  return mergePolicies(rows.map((row) => toLayer([row])));
}

export function toLayer(rows: unknown[]): Partial<Policies> {
  const layer: Partial<Policies> = {};
  for (const { name, value } of rows as PolicyRow[]) {
    if (isPolicyName(name)) Object.assign(layer, { [name]: JSON.parse(value) });
  }
  return layer;
}

export async function organizationPolicies(db: D1Database): Promise<Policies> {
  const { results } = await policyRows(db, ORGANIZATION, "").all();
  return toPolicies(results);
}
