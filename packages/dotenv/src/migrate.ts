import type { DotenvFile } from "./file.ts";

export type SecretStore = {
  get(name: string): Promise<string | undefined>;
  set(name: string, value: string): Promise<unknown>;
};

export type MigrationResult = {
  verified: boolean;
  conflicts: string[];
};

export async function migrateDotenvFile(file: DotenvFile, store: SecretStore): Promise<MigrationResult> {
  const conflicts: string[] = [];

  for (const [name, value] of Object.entries(file.values)) {
    const stored = await store.get(name);
    if (stored === undefined) {
      await store.set(name, value);
    } else if (stored !== value) {
      conflicts.push(name);
    }
  }

  if (conflicts.length > 0) return { verified: false, conflicts };
  return { verified: await isFullyStored(file, store), conflicts };
}

async function isFullyStored(file: DotenvFile, store: SecretStore): Promise<boolean> {
  for (const [name, value] of Object.entries(file.values)) {
    if ((await store.get(name)) !== value) return false;
  }
  return true;
}
