import { opendir } from "node:fs/promises";
import { join, matchesGlob } from "node:path";
import type { DotenvPolicy } from "./policy.ts";

const SKIPPED_DIRECTORIES = new Set([".git", "node_modules"]);

export async function findDotenvFiles(root: string, policy: DotenvPolicy): Promise<string[]> {
  const found: string[] = [];
  await walk(root, policy, found);
  return found.sort();
}

async function walk(dir: string, policy: DotenvPolicy, found: string[]): Promise<void> {
  for await (const entry of await opendir(dir)) {
    const path = join(dir, entry.name);

    if (entry.isFile() && matchesPolicy(entry.name, policy)) {
      found.push(path);
    } else if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name) && !(await isGitRepository(path))) {
      await walk(path, policy, found);
    }
  }
}

function matchesPolicy(name: string, { include, exclude }: DotenvPolicy): boolean {
  return include.some((pattern) => matchesGlob(name, pattern)) && !exclude.some((pattern) => matchesGlob(name, pattern));
}

async function isGitRepository(dir: string): Promise<boolean> {
  for await (const entry of await opendir(dir)) {
    if (entry.name === ".git") return true;
  }
  return false;
}
