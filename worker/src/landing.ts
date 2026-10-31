import type { Context } from "./context.ts";
import { escapeHtml, htmlPage } from "./pages.ts";

const INSTALL_COMMAND = "npm install -g @nenv/cli";

export async function landingPage({ request }: Context): Promise<Response> {
  const origin = new URL(request.url).origin;

  return htmlPage(
    "NENV",
    `<h1>NENV</h1>
<p>Secrets for your projects load when you enter the repository and unload when you leave it.</p>
<h2>1. Install the CLI</h2>
<pre>${escapeHtml(INSTALL_COMMAND)}</pre>
<h2>2. Add NENV to your shell</h2>
<p>Zsh: add these lines to <code>~/.zshrc</code></p>
<pre>${escapeHtml(shellLines(origin, "zsh"))}</pre>
<p>Bash: add these lines to <code>~/.bashrc</code></p>
<pre>${escapeHtml(shellLines(origin, "bash"))}</pre>
<h2>3. Open a new terminal</h2>
<p>NENV asks you to sign in the first time, and again when your session expires.</p>
<p><a href="/dashboard/">Open the dashboard</a></p>`,
  );
}

function shellLines(origin: string, shell: "zsh" | "bash"): string {
  return `export NENV_URL="${origin}"\neval "$(nenv shell ${shell})"`;
}
