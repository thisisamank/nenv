import { useState } from "react";
import { api } from "../api.ts";
import { AuthScreen } from "../components/AuthScreen.tsx";
import { ErrorLine } from "../components/Feedback.tsx";
import { href } from "../router.ts";
import { errorMessage } from "../use-resource.ts";

export function Activate({ code }: { code?: string }) {
  const [value, setValue] = useState(code ?? "");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string>();

  async function approve() {
    setState("busy");
    setError(undefined);
    try {
      await api("POST", "/v1/auth/activate", { code: value });
      setState("done");
    } catch (caught) {
      setError(errorMessage(caught));
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <AuthScreen title="Terminal connected">
        <p className="muted">Return to your terminal. Secrets load on the next prompt.</p>
        <a className="btn wide" href={href({ page: "overview" })}>
          Open dashboard
        </a>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title="Approve terminal sign-in">
      <p className="muted">Approve only if this code is shown in your own terminal.</p>
      <input
        className="mono code-input"
        aria-label="Device code"
        placeholder="XXXX-XXXX"
        maxLength={9}
        value={value}
        onChange={(event) => setValue(event.target.value.toUpperCase())}
      />
      <button className="btn primary wide" onClick={approve} disabled={state === "busy" || value.length !== 9}>
        Approve
      </button>
      <ErrorLine message={error} />
    </AuthScreen>
  );
}
