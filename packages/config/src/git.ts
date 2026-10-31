import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export type GitOrigin = {
  root: string;
  url: string;
};

export async function readGitOrigin(dir: string): Promise<GitOrigin | null> {
  try {
    const root = await git(dir, "rev-parse", "--show-toplevel");
    const url = await git(dir, "config", "--get", "remote.origin.url");
    return { root, url };
  } catch {
    return null;
  }
}

async function git(dir: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", ["-C", dir, ...args]);
  return stdout.trim();
}
