import type { DotenvPolicy, Policies, PolicyName, PolicyScope, Role } from "./types.ts";

export class PolicyError extends Error {}

const ROLES: Role[] = ["reader", "editor", "admin"];
const DOTENV_MODES = ["warn", "block", "migrate", "delete"];
const VERSION = /^\d+\.\d+\.\d+$/;
const FILE_PATTERN = /^[A-Za-z0-9._*?-]{1,100}$/;
const MAX_PATTERNS = 20;

const SCOPES: Record<PolicyName, PolicyScope[]> = {
  dotenv: ["organization", "project", "environment"],
  minCliVersion: ["organization"],
  sessionTtlHours: ["organization"],
  environmentMinRole: ["organization", "project", "environment"],
};

export function isPolicyName(name: string): name is PolicyName {
  return Object.hasOwn(SCOPES, name);
}

export function validatePolicy<N extends PolicyName>(name: N, value: unknown, scope: PolicyScope): Policies[N] {
  if (!SCOPES[name].includes(scope)) {
    throw new PolicyError(`${name} can only be set at the ${SCOPES[name].join(" or ")} level`);
  }
  return VALIDATORS[name](value) as Policies[N];
}

const VALIDATORS: { [N in PolicyName]: (value: unknown) => Policies[N] } = {
  dotenv: validateDotenv,
  minCliVersion(value) {
    if (value !== null && (typeof value !== "string" || !VERSION.test(value))) {
      throw new PolicyError("minCliVersion must be a version such as 1.2.0, or null");
    }
    return value;
  },
  sessionTtlHours(value) {
    if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 24 * 90) {
      throw new PolicyError("sessionTtlHours must be a whole number from 1 to 2160");
    }
    return value as number;
  },
  environmentMinRole(value) {
    if (!ROLES.includes(value as Role)) {
      throw new PolicyError("environmentMinRole must be reader, editor, or admin");
    }
    return value as Role;
  },
};

function validateDotenv(value: unknown): DotenvPolicy {
  const { mode, include, exclude } = (value ?? {}) as Record<string, unknown>;
  if (!DOTENV_MODES.includes(mode as string)) {
    throw new PolicyError("dotenv.mode must be warn, block, migrate, or delete");
  }
  return { mode: mode as DotenvPolicy["mode"], include: patterns(include, "include"), exclude: patterns(exclude, "exclude") };
}

function patterns(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_PATTERNS || !value.every((p) => typeof p === "string" && FILE_PATTERN.test(p))) {
    throw new PolicyError(`dotenv.${field} must be a list of file name patterns without slashes`);
  }
  return value;
}
