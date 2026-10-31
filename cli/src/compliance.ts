import { relative } from "node:path";
import type { EnforcementResult, FileOutcome } from "@nenv/dotenv";
import { api, environmentPath } from "./api.ts";
import type { Deployment } from "./deployment.ts";
import type { Target } from "./target.ts";

const DESCRIPTIONS: Record<FileOutcome["status"], string> = {
  found: "found",
  invalid: "kept, it has invalid variable names",
  conflict: "kept, its values differ from NENV",
  failed: "kept, it could not be migrated",
  migrated: "migrated to NENV",
  changed: "kept, it changed during migration",
  deleted: "migrated to NENV and deleted",
};

export function describeOutcome(target: Target, outcome: FileOutcome): string {
  const names = outcome.names.length > 0 ? ` (${outcome.names.join(", ")})` : "";
  return `${relative(target.root, outcome.path)}: ${DESCRIPTIONS[outcome.status]}${names}`;
}

export async function reportCompliance(
  deployment: Deployment,
  token: string,
  target: Target,
  result: EnforcementResult,
): Promise<void> {
  await api(deployment, "POST", `${environmentPath(target.repo, target.environment)}/compliance`, {
    token,
    body: {
      compliant: result.files.every((file) => file.status === "deleted"),
      files: result.files.map((file) => ({ path: relative(target.root, file.path), status: file.status })),
    },
  });
}
