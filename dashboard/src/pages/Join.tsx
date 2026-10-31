import { useState } from "react";
import { api } from "../api.ts";
import { AuthScreen } from "../components/AuthScreen.tsx";
import { ErrorLine, Loading } from "../components/Feedback.tsx";
import { createPasskey } from "../passkeys.ts";
import { navigate } from "../router.ts";
import { errorMessage, useResource } from "../use-resource.ts";

export function Join({ token, onJoined }: { token: string; onJoined: () => void }) {
  const invite = useResource(() => api<{ email: string }>("GET", `/v1/invites/${token}`), [token]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function join() {
    setBusy(true);
    setError(undefined);
    try {
      await createPasskey(token);
      navigate({ page: "overview" });
      onJoined();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (invite.loading) return <AuthScreen title="Join nenv"><Loading /></AuthScreen>;
  if (!invite.data) return <AuthScreen title="Invite not valid"><ErrorLine message={invite.error} /></AuthScreen>;

  return (
    <AuthScreen title="Join nenv">
      <p className="muted">
        Signing up as <b className="text">{invite.data.email}</b>
      </p>
      <button className="btn primary wide" onClick={join} disabled={busy}>
        Create passkey
      </button>
      <ErrorLine message={error} />
      <p className="muted small">Your passkey signs you in here and approves your terminal.</p>
    </AuthScreen>
  );
}
