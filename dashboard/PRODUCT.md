# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: admins and team leads.** They set up projects for git repositories, invite people, assign roles, share environment access, set organization policies, and check that developer devices comply. They open the dashboard when a team member joins or leaves, when a project starts, when a policy changes, or when something looks wrong.
- **Secondary: developers.** They open it now and then to add or rotate a secret, check who changed a value and when, or roll back. Day to day they get secrets automatically through the shell hook and never visit the dashboard.

## Product Purpose

NENV replaces `.env` files with encrypted secrets that load into a developer's shell when they enter a git repository and unload when they leave. Each team self-hosts it on its own Cloudflare account. The dashboard is where the team manages that system. Success: an admin can onboard a person, a project, or a policy in minutes, and can always answer "who can read what, and is every device clean?"

## Positioning

- Secrets are encrypted on the client. The server, the dashboard host, and Cloudflare never see plaintext values. The dashboard can write a secret without ever being able to read one.
- Projects are keyed by git origin URL (for example `github.com/acme/backend`), not by a project ID that people have to copy around.
- Self-hosted on the team's own Cloudflare account. There is no vendor in the middle.
- Admins can enforce `.env` policy on developer machines, up to verified migration and automatic deletion.

## Operating Context

- Identity comes from Cloudflare Access in front of `/dashboard` and `/activate`. There is no NENV login screen.
- Developers set up once by adding two lines to `~/.zshrc` or `~/.bashrc` from the landing page (`export NENV_URL=…` and `eval "$(nenv shell zsh)"`).
- Terms used everywhere: organization, project (= git repository), environment (development, staging, production, and so on), secret, version, member, role (reader, editor, admin), device (= a signed-in CLI or browser session), policy, compliance.
- Secret history is append-only. A rollback creates a new version that copies an older ciphertext.

## Capabilities and Constraints

- **Projects:** list projects the user can see; create a project from any git remote form (normalized to `host/path`); create environments.
- **Secrets:** list names, versions, authors, and update times per environment; add or update a value (sealed in the browser to the environment public key); view version history; roll back.
- **Team:** list organization users and invite by email (organization admins); list project members with role and which environments they hold keys for; change roles; remove members.
- **Policies** at organization, project, and environment levels:
  - `.env` mode: warn, block, migrate, or delete, with include and exclude file patterns.
  - Minimum CLI version (organization only).
  - Session expiry in hours (organization only).
  - Minimum role for environment access.
- **Devices:** active sessions with user, device name, CLI version, last seen, and `.env` compliance per repository and environment.
- **Full replacement for the CLI:** every management action must be possible in the browser.
  - **Open technical gap:** sharing an environment key with a member requires a private key in the browser. Today the only private keys live in the CLI config directory. This needs per-device keys (a browser key pair registered as a device). Until that exists, key sharing stays CLI-only (`nenv grant`), and the dashboard must say so honestly.
- The dashboard never displays secret values. It cannot decrypt them.
- The dashboard is built with React and Vite, uses no third-party design system or component library, and is served by the Worker under `/dashboard/`.

## Brand Commitments

- The name is NENV. No logo, colors, or other brand assets exist; the identity is open.

## Evidence on Hand

- There are no customers, testimonials, metrics, or screenshots. Do not invent any.
- `spec.md` at the repository root is the product specification.

## Product Principles

1. **Never imply visibility we do not have.** The dashboard writes and manages secrets but cannot read them. Every surface must make that true and obvious.
2. **Access is the main question.** For any project or environment, "who can read this?" must be answerable in one glance.
3. **Destructive and far-reaching actions show their reach first.** Policies that delete files on developer machines, role changes, and rollbacks state exactly what will happen before they happen.
4. **The CLI and the dashboard speak the same language.** They use the same terms and names, and the dashboard shows the matching `nenv` command where it helps.
5. **Calm by default.** Most visits are short, infrequent admin tasks. Optimize for orientation and correctness, not for engagement.
