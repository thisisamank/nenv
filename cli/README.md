# noenv-cli

The command-line client for [noenv](https://github.com/thisisamank/noenv): encrypted environment variables that load when you `cd` into a repo, and unload when you leave.

```console
$ cd ~/code/backend
noenv: loaded 12 secrets for github.com/acme/backend (development)
$ npm run dev        # your app sees DATABASE_URL, STRIPE_KEY, …
$ cd ..              # and they are gone again
```

You need a noenv server. It runs on your own Cloudflare account; see [deploy noenv](https://github.com/thisisamank/noenv#get-started).

## Install

```sh
npm install -g noenv-cli
```

Requires Node.js 22 or newer.

## Connect your shell

Add these lines to `~/.zshrc` or `~/.bashrc`, using your server's URL:

```sh
export NOENV_URL="https://<your-worker>.workers.dev"
eval "$(noenv shell zsh)"   # or: noenv shell bash
```

Open a new terminal and `cd` into a git repo. The first time, your browser opens so you can approve the terminal with your passkey.

## Commands

| Command | What it does |
|---|---|
| `noenv status` | Show the server, your account, and the current project |
| `noenv init` | Create a project for this repo and its first environment |
| `noenv secret set KEY` | Save a secret (the value is read without echo) |
| `noenv secret list` | List the secrets in this environment |
| `noenv secret history KEY` | List the versions of a secret |
| `noenv secret rollback KEY VERSION` | Restore an older version |
| `noenv migrate` | Move this repo's `.env` files into noenv |
| `noenv grant EMAIL ROLE` | Give someone access and share the key |
| `noenv revoke EMAIL` | Remove someone from this project |
| `noenv auth` | Sign in again |

The repo's git `origin` decides the project. The environment is `development` unless a `.noenv` file in the repo sets `environment = "staging"`, or you set `NOENV_ENVIRONMENT=staging` for one shell.

Changes made anywhere (this terminal, the dashboard, or a teammate) load at your next prompt.

## Security

Values are encrypted and decrypted on your machine. Your key lives in `~/.config/noenv`. The server stores only ciphertext.
