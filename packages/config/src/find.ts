import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readGitOrigin } from "./git.ts";
import { DEFAULT_CONFIG, parseConfig, type ProjectConfig } from "./parse.ts";
import { normalizeRemoteUrl } from "./repo.ts";

export const CONFIG_FILE = ".nenv";

export type Project = ProjectConfig & {
  root: string;
  repo: string;
  hasConfig: boolean;
};

export async function findProject(startDir: string): Promise<Project | null> {
  const origin = await readGitOrigin(startDir);
  if (!origin) return null;

  const text = await readConfigFile(join(origin.root, CONFIG_FILE));
  const config = text === null ? DEFAULT_CONFIG : parseConfig(text);
  return { root: origin.root, repo: normalizeRemoteUrl(origin.url), hasConfig: text !== null, ...config };
}

async function readConfigFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "EISDIR") return null;
    throw error;
  }
}
