import { text } from "node:stream/consumers";
import { currentDeployment } from "../deployment.ts";
import { hookEnv } from "../hook-env.ts";
import { openBrowser, startBackgroundPoller } from "../session.ts";
import { hookScript, parseShell } from "../shell.ts";

export async function shellCommand([shell]: string[]): Promise<void> {
  process.stdout.write(hookScript(parseShell(shell)));
}

export async function hookEnvCommand([shell]: string[]): Promise<void> {
  parseShell(shell);
  const state = process.stdin.isTTY ? "" : await text(process.stdin);

  const { lines, messages } = await hookEnv({
    cwd: process.cwd(),
    env: process.env,
    state,
    deployment: currentDeployment(),
    startPoller: startBackgroundPoller,
    openBrowser,
  });

  for (const message of messages) process.stderr.write(`nenv: ${message}\n`);
  process.stdout.write(lines.join("\n"));
}
