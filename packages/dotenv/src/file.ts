import { lstat, readFile, unlink } from "node:fs/promises";
import { parseEnv } from "node:util";
import { ENV_VAR_NAME } from "@noenv/config/names";

export type DotenvFile = {
  path: string;
  content: string;
  values: Record<string, string>;
  invalidNames: string[];
};

export async function readDotenvFile(path: string): Promise<DotenvFile> {
  await requireRegularFile(path);
  const content = await readFile(path, "utf8");
  const values = parseEnv(content) as Record<string, string>;
  const invalidNames = Object.keys(values).filter((name) => !ENV_VAR_NAME.test(name));
  return { path, content, values, invalidNames };
}

export async function removeIfUnchanged(file: DotenvFile): Promise<boolean> {
  await requireRegularFile(file.path);
  if ((await readFile(file.path, "utf8")) !== file.content) return false;

  await unlink(file.path);
  return true;
}

async function requireRegularFile(path: string): Promise<void> {
  if (!(await lstat(path)).isFile()) {
    throw new Error("not a regular file");
  }
}
