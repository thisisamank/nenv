import type { Policies, Role } from "@noenv/policy";

export type { Role } from "@noenv/policy";

export type Env = {
  DB: D1Database;
  SECRETS: KVNamespace;
  ADMIN_EMAIL?: string;
};

export type Context = {
  request: Request;
  env: Env;
  params: Record<string, string | undefined>;
  waitUntil: (promise: Promise<unknown>) => void;
};

export type UserContext = Context & {
  userId: string;
  tokenHash: string;
};

export type ProjectContext = UserContext & {
  projectId: string;
};

export type EnvironmentContext = ProjectContext & {
  environment: string;
  policies: Policies;
};

export type Handler<C extends Context = Context> = (context: C) => Promise<Response>;
