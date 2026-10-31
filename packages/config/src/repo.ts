import { ConfigError } from "./errors.ts";
import { REPO } from "./names.ts";

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const SCP_LIKE = /^(?:[^@/]+@)?([^:/]+):(.+)$/;
const SUPPORTED_PROTOCOLS = ["https:", "http:", "ssh:", "git:"];

export function normalizeRemoteUrl(remote: string): string {
  const [host, path] = splitRemote(remote.trim());
  const cleanPath = path.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "");
  const repo = `${host}/${cleanPath}`.toLowerCase();

  if (!REPO.test(repo)) {
    throw new ConfigError("git origin is not a supported remote URL");
  }
  return repo;
}

function splitRemote(remote: string): [string, string] {
  if (URL_SCHEME.test(remote)) {
    const url = URL.parse(remote);
    if (!url || !SUPPORTED_PROTOCOLS.includes(url.protocol)) {
      throw new ConfigError("git origin is not a supported remote URL");
    }
    return [url.hostname, decodeURIComponent(url.pathname)];
  }

  const scp = remote.match(SCP_LIKE);
  if (!scp) {
    throw new ConfigError("git origin is not a supported remote URL");
  }
  return [scp[1], scp[2]];
}
