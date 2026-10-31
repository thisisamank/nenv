import type { Sealed } from "@nenv/crypto";
import type { EnvironmentContext } from "./context.ts";
import { secretNameParam } from "./guards.ts";
import { HttpError, json, readJson } from "./http.ts";
import { parseSealed } from "./sealed.ts";

type ActiveSecret = {
  name: string;
  version: number;
  sealed: Sealed;
};

type Snapshot = {
  revision: number;
  secrets: ActiveSecret[];
};

export async function listSecrets(context: EnvironmentContext): Promise<Response> {
  const { results } = await context.env.DB
    .prepare(
      `SELECT s.name, s.active_version AS version, u.email AS author, v.created_at AS updatedAt
       FROM secrets s
       JOIN secret_versions v USING (project_id, environment, name)
       JOIN users u ON u.id = v.author_id
       WHERE s.project_id = ? AND s.environment = ? AND v.version = s.active_version
       ORDER BY s.name`,
    )
    .bind(context.projectId, context.environment)
    .all();
  return json({ secrets: results });
}

export async function getBundle(context: EnvironmentContext): Promise<Response> {
  const state = await context.env.DB
    .prepare(
      `SELECT k.wrapped_key, e.revision, e.public_key
       FROM environment_keys k
       JOIN environments e ON e.project_id = k.project_id AND e.name = k.environment
       WHERE k.project_id = ? AND k.environment = ? AND k.user_id = ?`,
    )
    .bind(context.projectId, context.environment, context.userId)
    .first<{ wrapped_key: string; revision: number; public_key: string }>();

  if (!state) {
    throw new HttpError(403, "no environment key has been shared with this user");
  }

  const cached = await context.env.SECRETS.get<Snapshot>(snapshotKey(context), "json");
  const snapshot = cached?.revision === state.revision ? cached : await readSnapshot(context);

  return json({
    projectId: context.projectId,
    policies: context.policies,
    publicKey: state.public_key,
    wrappedKey: JSON.parse(state.wrapped_key),
    secrets: snapshot.secrets,
  });
}

export async function putSecret(context: EnvironmentContext): Promise<Response> {
  const name = secretNameParam(context);
  const sealed = parseSealed(await readJson(context.request), "body");
  const version = await addVersion(context, name, sealed, null);
  return json({ name, version }, 201);
}

export async function listVersions(context: EnvironmentContext): Promise<Response> {
  const name = secretNameParam(context);
  const { results } = await context.env.DB
    .prepare(
      `SELECT v.version, u.email AS author, v.restored_from AS restoredFrom, v.created_at AS createdAt
       FROM secret_versions v JOIN users u ON u.id = v.author_id
       WHERE v.project_id = ? AND v.environment = ? AND v.name = ?
       ORDER BY v.version DESC`,
    )
    .bind(context.projectId, context.environment, name)
    .all();

  if (results.length === 0) {
    throw new HttpError(404, "secret not found");
  }
  return json({ name, versions: results });
}

export async function rollbackSecret(context: EnvironmentContext): Promise<Response> {
  const name = secretNameParam(context);
  const { version } = await readJson(context.request);
  if (!Number.isInteger(version)) {
    throw new HttpError(400, "version must be an integer");
  }

  const target = await context.env.DB
    .prepare(
      `SELECT ephemeral_public_key AS ephemeralPublicKey, iv, ciphertext
       FROM secret_versions WHERE project_id = ? AND environment = ? AND name = ? AND version = ?`,
    )
    .bind(context.projectId, context.environment, name, version)
    .first<Sealed>();

  if (!target) {
    throw new HttpError(404, "version not found");
  }

  const newVersion = await addVersion(context, name, target, version as number);
  return json({ name, version: newVersion, restoredFrom: version });
}

async function addVersion(context: EnvironmentContext, name: string, sealed: Sealed, restoredFrom: number | null): Promise<number> {
  const { projectId, environment, userId } = context;
  const db = context.env.DB;

  const [inserted] = await db.batch<{ version: number }>([
    db
      .prepare(
        `INSERT INTO secret_versions
           (project_id, environment, name, version, ephemeral_public_key, iv, ciphertext, author_id, restored_from)
         SELECT ?1, ?2, ?3, COALESCE(MAX(version), 0) + 1, ?4, ?5, ?6, ?7, ?8
         FROM secret_versions WHERE project_id = ?1 AND environment = ?2 AND name = ?3
         RETURNING version`,
      )
      .bind(projectId, environment, name, sealed.ephemeralPublicKey, sealed.iv, sealed.ciphertext, userId, restoredFrom),
    db
      .prepare(
        `INSERT INTO secrets (project_id, environment, name, active_version)
         SELECT ?1, ?2, ?3, MAX(version)
         FROM secret_versions WHERE project_id = ?1 AND environment = ?2 AND name = ?3
         ON CONFLICT (project_id, environment, name) DO UPDATE SET active_version = excluded.active_version`,
      )
      .bind(projectId, environment, name),
    db
      .prepare("UPDATE environments SET revision = revision + 1 WHERE project_id = ? AND name = ?")
      .bind(projectId, environment),
  ]);

  await context.env.SECRETS.put(snapshotKey(context), JSON.stringify(await readSnapshot(context)));
  return inserted.results[0].version;
}

async function readSnapshot({ env, projectId, environment }: EnvironmentContext): Promise<Snapshot> {
  const db = env.DB;
  const [revision, secrets] = await db.batch([
    db.prepare("SELECT revision FROM environments WHERE project_id = ? AND name = ?").bind(projectId, environment),
    db
      .prepare(
        `SELECT s.name, s.active_version AS version, v.ephemeral_public_key AS ephemeralPublicKey, v.iv, v.ciphertext
         FROM secrets s
         JOIN secret_versions v USING (project_id, environment, name)
         WHERE s.project_id = ? AND s.environment = ? AND v.version = s.active_version
         ORDER BY s.name`,
      )
      .bind(projectId, environment),
  ]);

  const rows = secrets.results as (Sealed & { name: string; version: number })[];
  return {
    revision: (revision.results[0] as { revision: number }).revision,
    secrets: rows.map(({ name, version, ...sealed }) => ({ name, version, sealed })),
  };
}

function snapshotKey({ projectId, environment }: EnvironmentContext): string {
  return `snapshot/${projectId}/${environment}`;
}
