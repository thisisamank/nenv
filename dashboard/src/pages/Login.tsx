import { useState } from "react";
import { AuthScreen } from "../components/AuthScreen.tsx";
import { ErrorLine } from "../components/Feedback.tsx";
import { signInWithPasskey } from "../passkeys.ts";
import { errorMessage } from "../use-resource.ts";

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function signIn() {
    setBusy(true);
    setError(undefined);
    try {
      await signInWithPasskey();
      onSignedIn();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen title="Sign in to nenv">
      <button className="btn primary wide" onClick={signIn} disabled={busy}>
        Sign in with passkey
      </button>
      <ErrorLine message={error} />
      <p className="muted small">New here? Open the invite link an admin sent you.</p>
    </AuthScreen>
  );
}
