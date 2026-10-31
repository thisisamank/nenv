import { findProject } from "@nenv/config";
import { IDENTIFIER } from "@nenv/config/names";

export type Target = {
  root: string;
  repo: string;
  environment: string;
  requiredSecrets: string[];
  hasConfig: boolean;
};

export async function findTarget(cwd: string, env: NodeJS.ProcessEnv): Promise<Target | null> {
  const project = await findProject(cwd);
  if (!project) return null;

  const environment = env.NENV_ENVIRONMENT || project.environment;
  if (!IDENTIFIER.test(environment)) {
    throw new Error('NENV_ENVIRONMENT must contain only letters, digits, "_" or "-"');
  }
  return { ...project, environment };
}

export async function requireTarget(cwd: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): Promise<Target> {
  const target = await findTarget(cwd, env);
  if (!target) {
    throw new Error("this directory is not inside a git repository with an origin remote");
  }
  return target;
}
