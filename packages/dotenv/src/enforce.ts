import { readDotenvFile, removeIfUnchanged } from "./file.ts";
import { findDotenvFiles } from "./find.ts";
import { migrateDotenvFile, type SecretStore } from "./migrate.ts";
import type { DotenvPolicy } from "./policy.ts";

export type FileStatus = "found" | "invalid" | "conflict" | "failed" | "migrated" | "changed" | "deleted";

export type FileOutcome = {
  path: string;
  status: FileStatus;
  names: string[];
};

export type EnforcementResult = {
  blocked: boolean;
  files: FileOutcome[];
};

export async function enforceDotenvPolicy(
  root: string,
  policy: DotenvPolicy,
  store: SecretStore,
): Promise<EnforcementResult> {
  const paths = await findDotenvFiles(root, policy);

  if (policy.mode !== "delete") {
    const files = paths.map((path) => ({ path, status: "found" as const, names: [] }));
    return { blocked: policy.mode !== "warn" && files.length > 0, files };
  }

  const files: FileOutcome[] = [];
  for (const path of paths) {
    files.push(await deleteAfterMigration(path, store));
  }
  return { blocked: files.some((file) => file.status !== "deleted"), files };
}

async function deleteAfterMigration(path: string, store: SecretStore): Promise<FileOutcome> {
  try {
    const file = await readDotenvFile(path);
    if (file.invalidNames.length > 0) {
      return { path, status: "invalid", names: file.invalidNames };
    }

    const migration = await migrateDotenvFile(file, store);
    if (migration.conflicts.length > 0) {
      return { path, status: "conflict", names: migration.conflicts };
    }
    if (!migration.verified) {
      return { path, status: "failed", names: [] };
    }

    return { path, status: (await removeIfUnchanged(file)) ? "deleted" : "changed", names: [] };
  } catch {
    return { path, status: "failed", names: [] };
  }
}
