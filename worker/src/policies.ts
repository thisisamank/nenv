import { isPolicyName, PolicyError, validatePolicy, type PolicyName, type PolicyScope } from "@noenv/policy";
import type { EnvironmentContext, ProjectContext, UserContext } from "./context.ts";
import { HttpError, json, readJson } from "./http.ts";
import { ORGANIZATION, policyRows, toLayer } from "./policy-store.ts";

type Location = {
  projectId: string;
  environment: string;
  scope: PolicyScope;
};

export const getOrganizationPolicies = (context: UserContext) => readLayer(context, organization());
export const putOrganizationPolicy = (context: UserContext) => writePolicy(context, organization());
export const deleteOrganizationPolicy = (context: UserContext) => deletePolicy(context, organization());

export const getProjectPolicies = (context: ProjectContext) => readLayer(context, project(context));
export const putProjectPolicy = (context: ProjectContext) => writePolicy(context, project(context));
export const deleteProjectPolicy = (context: ProjectContext) => deletePolicy(context, project(context));

export const putEnvironmentPolicy = (context: EnvironmentContext) => writePolicy(context, environment(context));
export const deleteEnvironmentPolicy = (context: EnvironmentContext) => deletePolicy(context, environment(context));

export async function getEnvironmentPolicies(context: EnvironmentContext): Promise<Response> {
  const { results } = await policyRows(context.env.DB, context.projectId, context.environment).all();
  return json({ policies: toLayer(results), effective: context.policies });
}

async function readLayer(context: UserContext, location: Location): Promise<Response> {
  const { results } = await policyRows(context.env.DB, location.projectId, location.environment).all();
  return json({ policies: toLayer(results) });
}

async function writePolicy(context: UserContext, location: Location): Promise<Response> {
  const name = policyName(context);
  const { value } = await readJson(context.request);

  let valid: unknown;
  try {
    valid = validatePolicy(name, value, location.scope);
  } catch (error) {
    if (error instanceof PolicyError) throw new HttpError(400, error.message);
    throw error;
  }

  await context.env.DB
    .prepare(
      `INSERT INTO policies (project_id, environment, name, value, updated_by) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (project_id, environment, name)
       DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime('now')`,
    )
    .bind(location.projectId, location.environment, name, JSON.stringify(valid), context.userId)
    .run();
  return json({ name, value: valid });
}

async function deletePolicy(context: UserContext, location: Location): Promise<Response> {
  await context.env.DB
    .prepare("DELETE FROM policies WHERE project_id = ? AND environment = ? AND name = ?")
    .bind(location.projectId, location.environment, policyName(context))
    .run();
  return new Response(null, { status: 204 });
}

function policyName(context: UserContext): PolicyName {
  const name = context.params.policy ?? "";
  if (!isPolicyName(name)) {
    throw new HttpError(404, "unknown policy");
  }
  return name;
}

function organization(): Location {
  return { projectId: ORGANIZATION, environment: "", scope: "organization" };
}

function project({ projectId }: ProjectContext): Location {
  return { projectId, environment: "", scope: "project" };
}

function environment({ projectId, environment }: EnvironmentContext): Location {
  return { projectId, environment, scope: "environment" };
}
