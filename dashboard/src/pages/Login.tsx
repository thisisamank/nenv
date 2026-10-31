import { useState, type FormEvent } from "react";
import { api } from "../api.ts";
import { AuthScreen } from "../components/AuthScreen.tsx";
import { ErrorLine, Loading } from "../components/Feedback.tsx";
import { setUpAdmin, signInWithPasskey } from "../passkeys.ts";
import { errorMessage, useResource } from "../use-resource.ts";

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const setup = useResource(() => api<{ available: boolean }>("GET", "/v1/setup"), []);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      onSignedIn();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (setup.loading) {
    return (
      <AuthScreen title="nenv">
        <Loading />
      </AuthScreen>
    );
  }

  if (setup.data?.available) {
    const submit = (event: FormEvent) => (event.preventDefault(), run(() => setUpAdmin(email)));
    return (
      <AuthScreen title="Set up nenv">
        <p className="muted">Use the admin email you entered when you deployed.</p>
        <form onSubmit={submit} style={{ display: "grid", gap: 12, width: "100%" }}>
          <input type="email" placeholder="you@company.com" aria-label="Admin email" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
          <button className="btn primary wide" disabled={busy}>
            Create admin passkey
          </button>
        </form>
        <ErrorLine message={error} />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title="Sign in to nenv">
      <button className="btn primary wide" onClick={() => run(signInWithPasskey)} disabled={busy}>
        Sign in with passkey
      </button>
      <ErrorLine message={error} />
      <p className="muted small">New here? Open the invite link an admin sent you.</p>
    </AuthScreen>
  );
}
