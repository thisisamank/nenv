import { parse } from "smol-toml";
import { ConfigError } from "./errors.ts";
import { ENV_VAR_NAME, IDENTIFIER } from "./names.ts";

export type ProjectConfig = {
  environment: string;
  requiredSecrets: string[];
};

export const DEFAULT_CONFIG: ProjectConfig = {
  environment: "development",
  requiredSecrets: [],
};

export function parseConfig(text: string): ProjectConfig {
  const raw = parse(text);

  if (raw.version !== 1) {
    throw new ConfigError("version must be 1");
  }

  const environment = raw.environment ?? DEFAULT_CONFIG.environment;
  if (typeof environment !== "string" || !IDENTIFIER.test(environment)) {
    throw new ConfigError('environment must contain only letters, digits, "_" or "-"');
  }

  const secrets = (raw.secrets ?? {}) as Record<string, unknown>;
  const required = secrets.required ?? [];
  if (!Array.isArray(required) || !required.every(isEnvVarName)) {
    throw new ConfigError("secrets.required must be a list of valid variable names");
  }

  return { environment, requiredSecrets: required };
}

function isEnvVarName(value: unknown): value is string {
  return typeof value === "string" && ENV_VAR_NAME.test(value);
}
