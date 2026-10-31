import { useToast } from "./Feedback.tsx";
import { Icon } from "./Icon.tsx";

export function ConnectTerminal() {
  const notify = useToast();
  const lines = `export NENV_URL="${location.origin}"\neval "$(nenv shell zsh)"`;

  return (
    <div className="card connect">
      <div className="card-head">Connect your terminal</div>
      <div className="connect-body">
        <span className="muted">Add to ~/.zshrc, then open a new terminal:</span>
        <pre className="mono">{lines}</pre>
        <button
          className="btn sm"
          onClick={() => navigator.clipboard.writeText(lines).then(() => notify("Copied"))}
        >
          <Icon name="copy" />
          Copy
        </button>
      </div>
    </div>
  );
}
