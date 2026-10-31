#!/usr/bin/env node
import { authCommand, statusCommand } from "./commands/auth.ts";
import { migrateCommand } from "./commands/migrate.ts";
import { grantCommand, initCommand, inviteCommand, revokeCommand } from "./commands/project.ts";
import { secretCommand } from "./commands/secret.ts";
import { hookEnvCommand, shellCommand, watchCommand } from "./commands/shell.ts";

const USAGE = `usage: nenv <command>

  shell zsh|bash             print the shell hook for your shell profile
  auth                       sign in to the deployment in NENV_URL
  status                     show the deployment, user, and project
  init                       create the project and environment for this repository
  secret set KEY             save a secret (the value is read without echo)
  secret list                list secrets in this environment
  secret history KEY         list the versions of a secret
  secret rollback KEY VER    restore an older version of a secret
  migrate                    move .env files of this repository into NENV
  invite EMAIL               invite a user to this deployment
  grant EMAIL ROLE           give a user access to this project and environment
  revoke EMAIL               remove a user from this project
`;

const commands: Record<string, (args: string[]) => Promise<void>> = {
  shell: shellCommand,
  "hook-env": hookEnvCommand,
  watch: watchCommand,
  auth: authCommand,
  status: statusCommand,
  init: initCommand,
  secret: secretCommand,
  migrate: migrateCommand,
  invite: inviteCommand,
  grant: grantCommand,
  revoke: revokeCommand,
};

const [name, ...args] = process.argv.slice(2);
const command = commands[name ?? ""];

if (!command) {
  process.stdout.write(USAGE);
  process.exit(name ? 1 : 0);
}

try {
  await command(args);
} catch (error) {
  process.stderr.write(`nenv: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exit(1);
}
