import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { api } from "./api.ts";

export async function signInWithPasskey(): Promise<void> {
  const optionsJSON = await api<Parameters<typeof startAuthentication>[0]["optionsJSON"]>("POST", "/v1/auth/passkeys/login/options");
  const response = await startAuthentication({ optionsJSON });
  await api("POST", "/v1/auth/passkeys/login", { response });
}

export async function createPasskey(token: string): Promise<void> {
  const optionsJSON = await api<Parameters<typeof startRegistration>[0]["optionsJSON"]>("POST", "/v1/auth/passkeys/register/options", { token });
  const response = await startRegistration({ optionsJSON });
  await api("POST", "/v1/auth/passkeys/register", { token, response });
}

export async function signOut(): Promise<void> {
  await api("POST", "/v1/auth/logout");
}
