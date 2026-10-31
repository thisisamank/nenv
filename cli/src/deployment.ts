import { homedir } from "node:os";
import { join } from "node:path";

export type Deployment = {
  url: string;
  dir: string;
  fetch: typeof fetch;
};

export function currentDeployment(env: NodeJS.ProcessEnv = process.env): Deployment | null {
  if (!env.NENV_URL) return null;

  const url = URL.parse(env.NENV_URL);
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
    throw new Error("NENV_URL must be an http or https URL");
  }

  const base = env.NENV_CONFIG_DIR ?? join(env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "nenv");
  return { url: url.origin, dir: join(base, url.host.replace(":", "_")), fetch: globalThis.fetch };
}
