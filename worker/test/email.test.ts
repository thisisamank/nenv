import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { Env } from "../src/index.ts";
import { addUser, call, startWorker, type TestWorker } from "./helpers.ts";

const ORIGIN = "https://noenv.test";

type Sent = { from: { email: string; name: string }; to: string; subject: string; html: string; text: string };

let worker: TestWorker;
let admin: string;
let sent: Sent[];
let failNext: boolean;
let withEmail: Env;

before(async () => {
  worker = await startWorker();
  admin = await addUser(worker.env, "usr_admin", true);
  const email = {
    async send(message: Sent) {
      if (failNext) {
        failNext = false;
        throw Object.assign(new Error("sender not verified"), { code: "E_SENDER_NOT_VERIFIED" });
      }
      sent.push(message);
      return { messageId: `msg_${sent.length}` };
    },
  };
  withEmail = { ...worker.env, EMAIL: email as unknown as SendEmail, EMAIL_FROM: "noenv@example.com" };
});

beforeEach(() => {
  sent = [];
  failNext = false;
});

after(() => worker.dispose());

test("an invite is emailed with the link when email is configured", async () => {
  const created = await call(withEmail, "POST", "/v1/users", { token: admin, body: { email: "Ana@example.com" } });
  assert.equal(created.status, 201);
  assert.equal(created.body.emailed, true);

  const [message] = sent;
  assert.equal(message!.to, "ana@example.com");
  assert.deepEqual(message!.from, { email: "noenv@example.com", name: "noenv" });
  assert.equal(message!.subject, "usr_admin@example.com invited you to noenv");
  assert.ok(message!.html.includes(`href="${created.body.inviteUrl}"`));
  assert.ok(message!.text.includes(created.body.inviteUrl));
});

test("without email configured, the invite link is still returned", async () => {
  const created = await call(worker.env, "POST", "/v1/users", { token: admin, body: { email: "ben@example.com" } });
  assert.equal(created.status, 201);
  assert.equal(created.body.emailed, false);
  assert.match(created.body.inviteUrl, /#\/join\/[0-9a-f]{64}$/);
});

test("a failed send keeps the invite and reports that it was not emailed", async () => {
  failNext = true;
  const created = await call(withEmail, "POST", "/v1/users", { token: admin, body: { email: "cy@example.com" } });
  assert.equal(created.status, 201);
  assert.equal(created.body.emailed, false);
  assert.ok(created.body.inviteUrl);
});

test("a new invite link is emailed again", async () => {
  const created = await call(withEmail, "POST", "/v1/users", { token: admin, body: { email: "dee@example.com" } });
  const renewed = await call(withEmail, "POST", `/v1/users/${created.body.id}/invite`, { token: admin });
  assert.equal(renewed.status, 200);
  assert.equal(renewed.body.emailed, true);
  assert.equal(sent.at(-1)!.to, "dee@example.com");
  assert.notEqual(renewed.body.inviteUrl, created.body.inviteUrl);
});

test("a fresh deployment emails the setup link to the admin email only", async () => {
  const fresh = await startWorker();
  try {
    const env = { ...withEmail, DB: fresh.env.DB, SECRETS: fresh.env.SECRETS, ADMIN_EMAIL: "Owner@example.com" };
    const headers = { Origin: ORIGIN };

    assert.deepEqual((await call(env, "GET", "/v1/setup")).body, { available: true, email: true });
    assert.equal((await call(env, "POST", "/v1/setup/options", { headers, body: { email: "owner@example.com" } })).status, 403);

    const first = await call(env, "POST", "/v1/setup/email", { headers });
    assert.equal(first.status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.to, "owner@example.com");
    assert.equal(sent[0]!.subject, "Finish setting up noenv");
    assert.equal(JSON.stringify(first.body).includes("owner@example.com"), false);

    assert.equal((await call(env, "POST", "/v1/setup/email", { headers })).status, 429);
    assert.equal((await call(env, "POST", "/v1/setup/email", { headers: { Origin: "https://evil.test" } })).status, 403);

    const token = sent[0]!.text.match(/#\/join\/([0-9a-f]{64})/)![1];
    const invite = await call(env, "GET", `/v1/invites/${token}`);
    assert.deepEqual(invite.body, { email: "owner@example.com" });

    const landing = await call(env, "GET", "/");
    assert.match(landing.body, /no admin yet/);
  } finally {
    await fresh.dispose();
  }
});

test("setup by email is unavailable without email configured", async () => {
  const response = await call({ ...worker.env, ADMIN_EMAIL: "owner@example.com" }, "POST", "/v1/setup/email", { headers: { Origin: ORIGIN } });
  assert.equal(response.status, 409);
});
