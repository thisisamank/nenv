export type Role = "reader" | "editor" | "admin";

export type DotenvMode = "warn" | "block" | "migrate" | "delete";

export type DotenvPolicy = {
  mode: DotenvMode;
  include: string[];
  exclude: string[];
};

export type Policies = {
  dotenv: DotenvPolicy;
  minCliVersion: string | null;
  sessionTtlHours: number;
  environmentMinRole: Role;
};

export type PolicyName = keyof Policies;

export type PolicyScope = "organization" | "project" | "environment";
