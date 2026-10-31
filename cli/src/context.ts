import { currentDeployment, type Deployment } from "./deployment.ts";
import { ensureIdentity, type Identity } from "./identity.ts";
import { requireSession } from "./session.ts";
import { requireTarget, type Target } from "./target.ts";

export type CommandContext = {
  deployment: Deployment;
  token: string;
  identity: Identity;
  target: Target;
};

export function requireDeployment(): Deployment {
  const deployment = currentDeployment();
  if (!deployment) {
    throw new Error("NENV_URL is not set, add the lines from your NENV landing page to your shell profile");
  }
  return deployment;
}

export async function signedIn(): Promise<Omit<CommandContext, "target">> {
  const deployment = requireDeployment();
  const token = await requireSession(deployment);
  return { deployment, token, identity: await ensureIdentity(deployment, token) };
}

export async function inProject(): Promise<CommandContext> {
  return { ...(await signedIn()), target: await requireTarget() };
}
