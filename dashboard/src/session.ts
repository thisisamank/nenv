type Session = {
  token: string;
  expiresAt: string;
};

const STORAGE_KEY = "nenv.session";
const REFRESH_MARGIN_MS = 60_000;

export async function sessionToken(refresh = false): Promise<string> {
  const cached = refresh ? null : readCached();
  if (cached) return cached.token;

  const response = await fetch(`${import.meta.env.BASE_URL}session`, { method: "POST" });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error ?? "could not start a dashboard session");
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(body));
  return (body as Session).token;
}

function readCached(): Session | null {
  try {
    const session = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Session | null;
    const expires = session ? Date.parse(`${session.expiresAt.replace(" ", "T")}Z`) : 0;
    return expires - REFRESH_MARGIN_MS > Date.now() ? session : null;
  } catch {
    return null;
  }
}
