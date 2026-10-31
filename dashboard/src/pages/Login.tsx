import { useState, type FormEvent } from "react";
import { api } from "../api.ts";
import { AuthScreen } from "../components/AuthScreen.tsx";
import { ErrorLine, Loading } from "../components/Feedback.tsx";
import { setUpAdmin, signInWithPasskey } from "../passkeys.ts";
import { errorMessage, useResource } from "../use-resource.ts";

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const setup = useResource(() => api<{ available: boolean; email: boolean }>("GET", "/v1/setup"), []);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);

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
      <AuthScreen title="noenv">
        <Loading />
      </AuthScreen>
    );
  }

  if (setup.data?.available && setup.data.email) {
    const send = async () => {
      setBusy(true);
      setError(undefined);
      try {
        await api("POST", "/v1/setup/email");
        setSent(true);
      } catch (caught) {
        setError(errorMessage(caught));
      } finally {
        setBusy(false);
      }
    };
    return (
      <AuthScreen title="Set up noenv">
        <p className="muted">
          {sent
            ? "Check your inbox. Open the link in the email to create your admin passkey."
            : "We'll email a setup link to the admin email you entered when you deployed."}
        </p>
        <button className="btn primary wide" onClick={send} disabled={busy}>
          {sent ? "Send it again" : "Email me the setup link"}
        </button>
        <ErrorLine message={error} />
      </AuthScreen>
    );
  }

  if (setup.data?.available) {
    const submit = (event: FormEvent) => (event.preventDefault(), run(() => setUpAdmin(email)));
    return (
      <AuthScreen title="Set up noenv">
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
    <AuthScreen title="Sign in to noenv">
      <button className="btn primary wide" onClick={() => run(signInWithPasskey)} disabled={busy}>
        Sign in with passkey
      </button>
      <ErrorLine message={error} />
      <p className="muted small">New here? Open the invite link an admin sent you.</p>
    </AuthScreen>
  );
}
