import { findDotenvFiles, migrateDotenvFile, readDotenvFile, removeIfUnchanged, type FileOutcome } from "@noenv/dotenv";
import { relative } from "node:path";
import { fetchBundle } from "../bundle.ts";
import { reportCompliance } from "../compliance.ts";
import { inProject } from "../context.ts";
import { confirm } from "../prompt.ts";
import { remoteSecretStore } from "../secret-store.ts";
import { markChanged } from "../watch.ts";

export async function migrateCommand(): Promise<void> {
  const { deployment, token, identity, target } = await inProject();
  const bundle = await fetchBundle(deployment, token, identity.privateKey, target.repo, target.environment);
  const store = remoteSecretStore(deployment, token, identity, target.repo, target.environment, bundle);
  const paths = await findDotenvFiles(target.root, bundle.policies.dotenv);
  const outcomes: FileOutcome[] = [];

  if (paths.length === 0) {
    console.log("No .env files found");
    return;
  }

  for (const path of paths) {
    const name = relative(target.root, path);
    const file = await readDotenvFile(path);

    if (file.invalidNames.length > 0) {
      console.log(`${name}: skipped, invalid names: ${file.invalidNames.join(", ")}`);
      outcomes.push({ path, status: "invalid", names: file.invalidNames });
      continue;
    }

    const result = await migrateDotenvFile(file, store);
    if (result.conflicts.length > 0) {
      console.log(`${name}: kept, values differ from NOENV for ${result.conflicts.join(", ")}`);
      outcomes.push({ path, status: "conflict", names: result.conflicts });
      continue;
    }
    if (!result.verified) {
      console.log(`${name}: kept, could not verify the upload`);
      outcomes.push({ path, status: "failed", names: [] });
      continue;
    }

    console.log(`${name}: ${Object.keys(file.values).length} values are stored in NOENV`);
    if (!(await confirm(`Delete ${name}?`))) {
      outcomes.push({ path, status: "migrated", names: [] });
      continue;
    }

    const deleted = await removeIfUnchanged(file);
    console.log(deleted ? `${name}: deleted` : `${name}: kept, the file changed`);
    outcomes.push({ path, status: deleted ? "deleted" : "changed", names: [] });
  }

  await markChanged(deployment, target.repo, target.environment);
  await reportCompliance(deployment, token, target, {
    blocked: outcomes.some((outcome) => outcome.status !== "deleted"),
    files: outcomes,
  });
}
