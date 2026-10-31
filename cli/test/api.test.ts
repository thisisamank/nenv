import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../src/api.ts";

test("the API client reports a redirect instead of following it", async () => {
  const deployment = {
    url: "https://nenv.test",
    dir: "/nonexistent",
    fetch: async () => new Response(null, { status: 302, headers: { Location: "https://team.cloudflareaccess.com/login" } }),
  };
  await assert.rejects(api(deployment, "POST", "/v1/auth/device"), /Cloudflare Access does not protect \/v1/);

  const html = { ...deployment, fetch: async () => new Response("<html>login</html>", { status: 200 }) };
  await assert.rejects(api(html, "POST", "/v1/auth/device"), /did not return a NENV API response/);
});
