import { api, environmentPath } from "../api.ts";
import { requireDeployment } from "../context.ts";
import { loadSession, openBrowser, readPendingSignIn, startSignIn, waitForSignIn } from "../session.ts";
import { findTarget } from "../target.ts";

type Me = { email: string; isAdmin: boolean };

export async function authCommand(args: string[]): Promise<void> {
  const deployment = requireDeployment();

  if (args.includes("--wait")) {
    const pending = await readPendingSignIn(deployment);
    if (pending) await waitForSignIn(deployment, pending);
    return;
  }

  const { pending, started } = await startSignIn(deployment);
  console.log(`Open ${pending.url} and confirm the code ${pending.userCode}`);
  if (started) openBrowser(pending.url);

  if (!(await waitForSignIn(deployment, pending))) {
    throw new Error("sign-in was not completed");
  }
  const me = await api<Me>(deployment, "GET", "/v1/me", { token: (await loadSession(deployment))! });
  console.log(`Signed in as ${me.email}`);
}

export async function statusCommand(): Promise<void> {
  const deployment = requireDeployment();
  console.log(`Deployment:  ${deployment.url}`);

  const token = await loadSession(deployment);
  if (!token) {
    console.log("Signed in:   no");
    return;
  }
  const me = await api<Me>(deployment, "GET", "/v1/me", { token });
  console.log(`Signed in:   ${me.email}${me.isAdmin ? " (organization admin)" : ""}`);

  const target = await findTarget(process.cwd(), process.env);
  if (!target) {
    console.log("Project:     none (not in a git repository with an origin)");
    return;
  }
  console.log(`Project:     ${target.repo}`);
  console.log(`Environment: ${target.environment}`);

  try {
    const path = `${environmentPath(target.repo, target.environment)}/secrets`;
    const { secrets } = await api<{ secrets: unknown[] }>(deployment, "GET", path, { token });
    console.log(`Secrets:     ${secrets.length}`);
  } catch {
    console.log("Secrets:     no access");
  }
}
