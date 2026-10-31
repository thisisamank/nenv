# NENV — Minimal Technical Specification

**Version:** 0.1  
**Type:** Open-source, self-hosted secret manager  
**Infrastructure:** Cloudflare

## 1. Overview

NENV replaces `.env` files with an encrypted, centrally managed secret system.

It combines automatic environment variable injection with self-hosted secret management.

- Secrets are encrypted locally. Cloudflare KV serves the latest values; Cloudflare D1 keeps all versions.
- Each team deploys NENV to its own Cloudflare account.
- A shell hook loads project secrets when a developer enters a git repository that NENV knows.
- Secrets are removed from the shell when the developer leaves the project.
- Administrators manage users, permissions, policies, and secret versions.

## 2. Core Components

| Component | Responsibility |
|---|---|
| CLI | Authentication, encryption, decryption, secret operations |
| Shell Hook | Detect projects and load/unload environment variables |
| Cloudflare Worker | API, authentication, authorization, policy enforcement |
| Cloudflare KV | Snapshot of the latest encrypted secrets per environment, for fast reads |
| Cloudflare D1 | Users, projects, permissions, policies, and every encrypted secret version |
| Dashboard | Manage secrets, teams, policies, and history |

## 3. Project Identity and Configuration

The git `origin` URL identifies a project. It is the key for all of the project's secrets.

1. The client finds the git repository root of the current directory.
2. The client reads `remote.origin.url` and normalizes it to `host/path`.
3. If the server has a project for that key, the client downloads that project's secrets.

Normalization:

- `git@github.com:Acme/Backend.git`, `https://github.com/acme/backend`, and `ssh://git@github.com:22/acme/backend.git` all become `github.com/acme/backend`.
- Remove credentials, ports, a trailing `.git`, and trailing slashes. Use lowercase.
- Reject local paths and `file://` remotes.
- Never send credentials from a remote URL to the server.

D1 maps each normalized origin to an internal project ID. When a repository moves, an admin changes only the origin of the project. Encryption binds secrets to the internal project ID, so existing secrets stay valid.

A repository without an `origin` remote, or with an unknown origin, loads no secrets.

A project can contain an optional `.nenv` file at the repository root, committed to git:

```toml
version = 1
environment = "development"

[secrets]
required = ["DATABASE_URL", "API_KEY"]
```

- `environment` selects the environment. The default is `development`. The `NENV_ENVIRONMENT` variable overrides it for one shell.
- `secrets.required` lists the secrets the project needs.
- The file contains references only. It never contains secret values.

## 4. Developer Workflow

There is no `nenv login` or `nenv hook install` step. Setup is a shell configuration change.

1. The developer opens the landing page of the team's NENV deployment (for example `https://nenv.<team>.workers.dev`).
2. The landing page shows a one-time CLI install command and the shell lines for Zsh and Bash. The deployment URL is already filled in.
3. The developer adds the lines to `~/.zshrc` or `~/.bashrc`:

```bash
export NENV_URL="https://nenv.<team>.workers.dev"
eval "$(nenv shell zsh)"
```

4. Each new shell checks for a valid session with `NENV_URL`. If there is no valid session, the shell starts the authentication flow automatically.
5. After authentication, the shell loads and unloads project secrets by directory:

```bash
cd ~/projects/backend
# NENV loads backend secrets

npm run dev
# Application accesses secrets normally

cd ..
# NENV removes backend secrets
```

Each team can point `NENV_URL` at its own deployment. A developer can change the URL to switch deployments.

Authentication requirements:

- Use a device authorization flow: print a URL and a short code, then open the browser if possible.
- Do not block shell startup. The prompt stays usable while authentication is pending.
- Run only one authentication flow at a time when several terminals open together.
- Store the session per `NENV_URL`, so several deployments can coexist.
- Never fetch and evaluate remote shell code at shell startup. `nenv shell` prints a hook that ships with the installed CLI.

Identity:

- People sign in with passkeys. NENV needs no identity provider, SSO, or Cloudflare Access setup.
- The Deploy to Cloudflare button asks for `ADMIN_EMAIL`. The dashboard then lets only that email create the first admin passkey, and setup closes after the first passkey exists.
- `npm run setup -- --admin you@example.com` deploys from a local checkout and prints a one-time setup link for the first admin.
- Admins invite people from the dashboard. An invite creates a one-time link (valid 7 days) that the admin sends. Opening it creates the person's passkey.
- A lost passkey is recovered with a new invite link from an admin.
- The browser session is an HttpOnly, SameSite=Strict cookie. Cookie-authenticated writes must come from the same origin.
- The CLI approves its device code in the signed-in dashboard (`/activate` redirects there) and then uses a bearer session token.

Secret loading requirements:

- Detect the git repository and its `origin` from the current directory.
- Fetch only authorized project secrets.
- Decrypt secrets locally.
- Inject secrets into the current shell without printing values.
- Keep secrets active in project subdirectories.
- Remove or restore injected variables when leaving or switching projects.
- Support independent terminal sessions.
- Clear stale secrets when authentication, retrieval, or policy checks fail.

Initial shell support: Bash and Zsh.

## 5. Encryption and Access Control

- Encrypt secrets on the client before upload.
- Use authenticated encryption.
- Never send plaintext secret values to Cloudflare.
- Each project environment has an encryption key.
- Authorized users receive access to that key through public-key encryption.
- Decryption happens locally.

Three roles:

| Role | Access |
|---|---|
| Reader | Use assigned secrets |
| Editor | Read, create, and update secrets |
| Admin | Manage secrets, users, permissions, and policies |

Authorization is checked before secret retrieval.

Revoking access prevents future authorized retrieval but cannot erase secrets already copied by a user.

## 6. Secret Versioning

- Each update creates an immutable encrypted version.
- Store every encrypted version, the active-version references, and history in D1.
- After each update, write a snapshot of the active encrypted secrets of the environment to KV. Secret retrieval reads this snapshot in one KV read.
- D1 keeps a revision number per environment. If the KV snapshot revision does not match D1, retrieval reads from D1. This handles KV eventual consistency.
- A rollback creates a new version that copies the older ciphertext. It does not move the pointer back.
- Support rollback to previous versions.
- Record author and timestamp.
- Never include plaintext secret values in history or logs.

## 7. Organization Policies

Admins can configure policies at organization, project, and environment levels.

Initial policy support:

| Policy | Purpose |
|---|---|
| `.env` detection | Detect existing environment files |
| `.env` enforcement | Warn, block activation, require migration, or delete automatically |
| CLI version | Require a minimum NENV version |
| Session expiry | Require periodic reauthentication |
| Environment access | Restrict access by user or role |
| Secret caching | Control local secret persistence |

Policies are stored centrally and evaluated by NENV clients.

Clients report compliance status to the dashboard.

Mandatory policy violations can block new secret retrieval.

### `.env` Migration

When prohibited `.env` files are detected:

1. Detect matching files within the git repository.
2. Block activation when required by policy.
3. Offer secure migration to NENV. In `delete` mode, migrate without a prompt.
4. Encrypt and upload secrets.
5. Verify successful migration.
6. Remove the files:
   - In `delete` mode, remove them automatically, without a prompt.
   - In all other modes, remove them only after explicit local confirmation.
7. Report compliance.

Automatic deletion (`delete` mode) has these limits:

- Delete a file only after every value in it is uploaded and verified by a decryption round trip.
- Never overwrite an existing NENV secret during migration. If a `.env` value differs from the NENV value, report a conflict, keep the file, and block secret loading.
- Do not delete a file that changed after migration.
- Do not enter nested git repositories (for example vendored dependencies) or `node_modules`.
- If migration or verification fails, keep the file and block secret loading.
- Delete only regular files that match the policy patterns in the directory tree of a git repository that NENV knows.
- Never follow symbolic links and never delete directories.
- Never scan outside that directory tree.
- Report each deleted path (never its contents) to the dashboard.

Admins cannot delete any other files from developer machines.

Client-reported compliance is not proof against a developer who controls their device.

## 8. Dashboard

The dashboard provides:

- **Projects:** Create projects and environments.
- **Secrets:** Add, update, and manage secret versions.
- **Team:** Invite users and assign permissions.
- **Policies:** Define and enforce organizational rules.
- **History:** View changes and roll back versions.
- **Devices:** View registered devices and compliance status.

The Worker serves the dashboard under `/dashboard/`. People sign in with their passkey.

- The dashboard never decrypts secrets. It writes new values by sealing them to the environment public key in the browser.
- Creating an environment in the browser wraps its private key for the creator's registered public key.
- Sharing an environment key with another member needs a private key in the browser. Until per-device keys exist, key sharing is a CLI action (`nenv grant`).


## 9. CLI Commands

```bash
nenv shell zsh|bash
nenv init
nenv status

nenv secret set KEY
nenv secret list
nenv secret rollback KEY VERSION

nenv migrate
```

`nenv shell` prints the shell hook for the given shell. The hook starts authentication when no valid session exists. Developers do not run separate login or hook install commands.

Secret entry must not expose values through terminal echo or command-line arguments.

## 10. Security Requirements

- No plaintext secret files created by NENV.
- No secret values in NENV logs or normal terminal output.
- No plaintext secret values stored in Cloudflare.
- No plaintext secret caching on disk.
- No execution of arbitrary shell code from `.nenv`.
- No automatic destructive filesystem operations, except the admin-enforced `.env` deletion in §7, within its limits.
- Restore previous shell variables on project exit.
- Enforce authorization and applicable policies before retrieval.
- Use D1 for authoritative permissions and version pointers; account for KV eventual consistency.
- Support recovery of encryption keys before production use.

**Threat model:** NENV prevents accidental secret exposure. It does not prevent an authorized developer or application from deliberately inspecting injected environment variables.

## 11. MVP Scope

The MVP must support:

1. One-click deployment to Cloudflare (Deploy to Cloudflare button), or one command from a checkout (`npm run setup -- --admin you@example.com`).
2. Landing page with CLI install and shell setup, and automatic authentication on shell start.
3. `.nenv` project configuration.
4. Automatic directory-based secret injection and removal.
5. Client-side encryption and decryption.
6. Multiple projects and environments.
7. Basic team permissions.
8. Secret version history and rollback.
9. Dashboard for secrets, users, and policies.
10. `.env` detection, migration, and policy enforcement.

**Out of scope:** Enterprise SSO, automatic credential rotation, CI/CD identities, per-secret permissions, and advanced compliance verification.

---

**Core principle:** NENV makes secrets available to authorized applications automatically, without requiring developers to create, copy, or manage plaintext `.env` files.
