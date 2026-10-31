import type { EnvironmentContext, UserContext } from "./context.ts";
import { HttpError, json, readJson } from "./http.ts";

const FILE_STATUSES = ["found", "invalid", "conflict", "failed", "migrated", "changed", "deleted"];
const MAX_FILES = 100;

type FileReport = {
  path: string;
  status: string;
};

type DeviceRow = {
  id: string;
  email: string;
  name: string;
  cliVersion: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
};

type ReportRow = {
  deviceId: string;
  repo: string;
  environment: string;
  compliant: number;
  report: string;
  reportedAt: string;
};

export async function reportCompliance(context: EnvironmentContext): Promise<Response> {
  const { compliant, files } = await readJson(context.request);
  if (typeof compliant !== "boolean" || !isFileList(files)) {
    throw new HttpError(400, "body must be { compliant, files: [{ path, status }] }");
  }

  await context.env.DB
    .prepare(
      `INSERT INTO compliance_reports (token_hash, project_id, environment, compliant, report) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (token_hash, project_id, environment)
       DO UPDATE SET compliant = excluded.compliant, report = excluded.report, reported_at = datetime('now')`,
    )
    .bind(context.tokenHash, context.projectId, context.environment, compliant ? 1 : 0, JSON.stringify(files))
    .run();
  return new Response(null, { status: 204 });
}

export async function listDevices({ env }: UserContext): Promise<Response> {
  const [devices, reports] = await env.DB.batch([
    env.DB.prepare(
      `SELECT substr(s.token_hash, 1, 16) AS id, u.email, s.device_name AS name, s.cli_version AS cliVersion,
              s.created_at AS createdAt, s.last_seen_at AS lastSeenAt, s.expires_at AS expiresAt
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.expires_at > datetime('now')
       ORDER BY s.last_seen_at DESC`,
    ),
    env.DB.prepare(
      `SELECT substr(c.token_hash, 1, 16) AS deviceId, p.repo, c.environment, c.compliant, c.report, c.reported_at AS reportedAt
       FROM compliance_reports c JOIN projects p ON p.id = c.project_id`,
    ),
  ]);

  const byDevice = Map.groupBy(reports.results as ReportRow[], (report) => report.deviceId);
  return json({
    devices: (devices.results as DeviceRow[]).map((device) => ({
      ...device,
      compliance: (byDevice.get(device.id) ?? []).map(({ repo, environment, compliant, report, reportedAt }) => ({
        repo,
        environment,
        compliant: compliant === 1,
        files: JSON.parse(report),
        reportedAt,
      })),
    })),
  });
}

export async function signOutDevice({ env, params }: UserContext): Promise<Response> {
  const id = params.deviceId ?? "";
  if (!/^[0-9a-f]{16}$/.test(id)) {
    throw new HttpError(400, "invalid device id");
  }

  const result = await env.DB.prepare("DELETE FROM sessions WHERE substr(token_hash, 1, 16) = ?").bind(id).run();
  if (result.meta.changes === 0) {
    throw new HttpError(404, "device not found");
  }
  return new Response(null, { status: 204 });
}

function isFileList(value: unknown): value is FileReport[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_FILES &&
    value.every(
      (file) => typeof file?.path === "string" && file.path.length <= 500 && FILE_STATUSES.includes(file.status),
    )
  );
}
