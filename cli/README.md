# nenv-cli

The command-line client for [nenv](https://github.com/thisisamank/nenv): encrypted environment variables that load when you `cd` into a repo, and unload when you leave.

```console
$ cd ~/code/backend
nenv: loaded 12 secrets for github.com/acme/backend (development)
$ npm run dev        # your app sees DATABASE_URL, STRIPE_KEY, …
$ cd ..              # and they are gone again
```

You need a nenv server. It runs on your own Cloudflare account; see [deploy nenv](https://github.com/thisisamank/nenv#get-started).

## Install

```sh
npm install -g nenv-cli
```

Requires Node.js 22 or newer.

## Connect your shell

Add these lines to `~/.zshrc` or `~/.bashrc`, using your server's URL:

```sh
export NENV_URL="https://<your-worker>.workers.dev"
eval "$(nenv shell zsh)"   # or: nenv shell bash
```

Open a new terminal and `cd` into a git repo. The first time, your browser opens so you can approve the terminal with your passkey.

## Commands

| Command | What it does |
|---|---|
| `nenv status` | Show the server, your account, and the current project |
| `nenv init` | Create a project for this repo and its first environment |
| `nenv secret set KEY` | Save a secret (the value is read without echo) |
| `nenv secret list` | List the secrets in this environment |
| `nenv secret history KEY` | List the versions of a secret |
| `nenv secret rollback KEY VERSION` | Restore an older version |
| `nenv migrate` | Move this repo's `.env` files into nenv |
| `nenv grant EMAIL ROLE` | Give someone access and share the key |
| `nenv revoke EMAIL` | Remove someone from this project |
| `nenv auth` | Sign in again |

The repo's git `origin` decides the project. The environment is `development` unless a `.nenv` file in the repo sets `environment = "staging"`, or you set `NENV_ENVIRONMENT=staging` for one shell.

Changes made anywhere (this terminal, the dashboard, or a teammate) load at your next prompt.

## Security

Values are encrypted and decrypted on your machine. Your key lives in `~/.config/nenv`. The server stores only ciphertext.
