import type { Context, UserContext } from "./context.ts";
import { approveUserCode, USER_CODE } from "./device.ts";
import { HttpError, json, readJson } from "./http.ts";

export async function redirectToActivation({ request }: Context): Promise<Response> {
  const code = new URL(request.url).searchParams.get("code")?.toUpperCase() ?? "";
  const target = new URL(`/dashboard/#/activate${USER_CODE.test(code) ? `/${code}` : ""}`, request.url);
  return Response.redirect(target.toString(), 302);
}

export async function approveDevice({ request, env, userId }: UserContext): Promise<Response> {
  const { code } = await readJson(request);
  const userCode = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!USER_CODE.test(userCode)) {
    throw new HttpError(400, "the code must look like XXXX-XXXX");
  }
  if (!(await approveUserCode(env.DB, userCode, userId))) {
    throw new HttpError(400, "this code is invalid, expired, or already used");
  }
  return json({ approved: true });
}
