import { approveDevice, redirectToActivation } from "./activation.ts";
import { listDevices, reportCompliance, signOutDevice } from "./compliance.ts";
import type { Context, Env, Handler } from "./context.ts";
import { issueSessionToken, startDeviceAuth } from "./device.ts";
import { withEnvironment, withOrgAdmin, withProject, withUser } from "./guards.ts";
import { HttpError, json } from "./http.ts";
import { readInvite, regenerateInvite } from "./invites.ts";
import { landingPage } from "./landing.ts";
import {
  loginOptions,
  loginVerify,
  logout,
  registrationOptions,
  registrationVerify,
  emailSetupLink,
  setupOptions,
  setupStatus,
  setupVerify,
} from "./passkeys.ts";
import {
  deleteEnvironmentPolicy,
  deleteOrganizationPolicy,
  deleteProjectPolicy,
  getEnvironmentPolicies,
  getOrganizationPolicies,
  getProjectPolicies,
  putEnvironmentPolicy,
  putOrganizationPolicy,
  putProjectPolicy,
} from "./policies.ts";
import {
  createEnvironment,
  createProject,
  listMembers,
  listProjects,
  putMember,
  removeMember,
  shareEnvironmentKey,
} from "./projects.ts";
import { readRevisions } from "./revisions.ts";
import { getBundle, listSecrets, listVersions, putSecret, rollbackSecret } from "./secrets.ts";
import { findUser, getMe, inviteUser, listUsers, setPublicKey } from "./users.ts";

export type { Env } from "./context.ts";

type Route = {
  method: string;
  pattern: URLPattern;
  handle: Handler;
};

const PROJECT = "/v1/repos/:repo";
const ENVIRONMENT = `${PROJECT}/environments/:environment`;

const routes: Route[] = [
  route("GET", "/", landingPage),
  route("GET", "/activate", redirectToActivation),

  route("POST", "/v1/auth/device", startDeviceAuth),
  route("POST", "/v1/auth/token", issueSessionToken),
  route("POST", "/v1/auth/activate", withUser(approveDevice)),
  route("POST", "/v1/auth/passkeys/register/options", registrationOptions),
  route("POST", "/v1/auth/passkeys/register", registrationVerify),
  route("POST", "/v1/auth/passkeys/login/options", loginOptions),
  route("POST", "/v1/auth/passkeys/login", loginVerify),
  route("POST", "/v1/auth/logout", logout),
  route("GET", "/v1/invites/:token", readInvite),
  route("GET", "/v1/setup", setupStatus),
  route("POST", "/v1/setup/options", setupOptions),
  route("POST", "/v1/setup", setupVerify),
  route("POST", "/v1/setup/email", emailSetupLink),

  route("GET", "/v1/me", withUser(getMe)),
  route("POST", "/v1/revisions", withUser(readRevisions)),
  route("PUT", "/v1/me/public-key", withUser(setPublicKey)),
  route("GET", "/v1/users", withOrgAdmin(listUsers)),
  route("GET", "/v1/users/lookup", withUser(findUser)),
  route("POST", "/v1/users", withOrgAdmin(inviteUser)),
  route("POST", "/v1/users/:userId/invite", withOrgAdmin(regenerateInvite)),

  route("GET", "/v1/devices", withOrgAdmin(listDevices)),
  route("DELETE", "/v1/devices/:deviceId", withOrgAdmin(signOutDevice)),

  route("GET", "/v1/policies", withUser(getOrganizationPolicies)),
  route("PUT", "/v1/policies/:policy", withOrgAdmin(putOrganizationPolicy)),
  route("DELETE", "/v1/policies/:policy", withOrgAdmin(deleteOrganizationPolicy)),

  route("GET", "/v1/projects", withUser(listProjects)),
  route("POST", "/v1/projects", withOrgAdmin(createProject)),
  route("GET", `${PROJECT}/members`, withProject("reader", listMembers)),
  route("PUT", `${PROJECT}/members/:userId`, withProject("admin", putMember)),
  route("DELETE", `${PROJECT}/members/:userId`, withProject("admin", removeMember)),
  route("POST", `${PROJECT}/environments/:environment`, withProject("admin", createEnvironment)),
  route("PUT", `${ENVIRONMENT}/keys/:userId`, withEnvironment("admin", shareEnvironmentKey)),

  route("GET", `${PROJECT}/policies`, withProject("reader", getProjectPolicies)),
  route("PUT", `${PROJECT}/policies/:policy`, withProject("admin", putProjectPolicy)),
  route("DELETE", `${PROJECT}/policies/:policy`, withProject("admin", deleteProjectPolicy)),
  route("GET", `${ENVIRONMENT}/policies`, withEnvironment("reader", getEnvironmentPolicies)),
  route("PUT", `${ENVIRONMENT}/policies/:policy`, withEnvironment("admin", putEnvironmentPolicy)),
  route("DELETE", `${ENVIRONMENT}/policies/:policy`, withEnvironment("admin", deleteEnvironmentPolicy)),
  route("POST", `${ENVIRONMENT}/compliance`, withEnvironment("reader", reportCompliance)),

  route("GET", `${ENVIRONMENT}/bundle`, withEnvironment("reader", getBundle)),
  route("GET", `${ENVIRONMENT}/secrets`, withEnvironment("reader", listSecrets)),
  route("PUT", `${ENVIRONMENT}/secrets/:name`, withEnvironment("editor", putSecret)),
  route("GET", `${ENVIRONMENT}/secrets/:name/versions`, withEnvironment("reader", listVersions)),
  route("POST", `${ENVIRONMENT}/secrets/:name/rollback`, withEnvironment("editor", rollbackSecret)),
];

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await dispatch(request, env, (promise) => ctx.waitUntil(promise));
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message }, error.status);
      }
      console.error("unhandled error", error instanceof Error ? error.message : "unknown");
      return json({ error: "internal error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function dispatch(request: Request, env: Env, waitUntil: Context["waitUntil"]): Promise<Response> {
  for (const { method, pattern, handle } of routes) {
    const match = request.method === method && pattern.exec(request.url);
    if (match) {
      return handle({ request, env, params: match.pathname.groups, waitUntil });
    }
  }
  throw new HttpError(404, "not found");
}

function route(method: string, path: string, handle: Handler): Route {
  return { method, pattern: new URLPattern({ pathname: path }), handle };
}
