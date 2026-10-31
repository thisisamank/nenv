import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decryptSecret,
  encryptSecret,
  exportPrivateKey,
  exportPublicKey,
  generateKeyPair,
  importPrivateKey,
  importPublicKey,
  unwrapPrivateKey,
  wrapPrivateKey,
} from "@nenv/crypto";

const context = { projectId: "prj_123", environment: "development", name: "API_KEY" };

test("anyone with the environment public key can encrypt, only the private key decrypts", async () => {
  const environment = await generateKeyPair();
  const publicOnly = await importPublicKey(await exportPublicKey(environment.publicKey));

  const sealed = await encryptSecret(publicOnly, "s3cret", context);
  assert.ok(!sealed.ciphertext.includes("s3cret"));
  assert.equal(await decryptSecret(environment.privateKey, sealed, context), "s3cret");

  const stranger = await generateKeyPair();
  await assert.rejects(decryptSecret(stranger.privateKey, sealed, context));
});

test("rejects a ciphertext moved to another secret name", async () => {
  const environment = await generateKeyPair();
  const sealed = await encryptSecret(environment.publicKey, "s3cret", context);

  await assert.rejects(decryptSecret(environment.privateKey, sealed, { ...context, name: "OTHER" }));
});

test("rejects a tampered ciphertext", async () => {
  const environment = await generateKeyPair();
  const sealed = await encryptSecret(environment.publicKey, "s3cret", context);
  const tampered = { ...sealed, ciphertext: sealed.ciphertext.replace(/^./, (c) => (c === "A" ? "B" : "A")) };

  await assert.rejects(decryptSecret(environment.privateKey, tampered, context));
});

test("shares an environment private key with a user through their public key", async () => {
  const user = await generateKeyPair();
  const userPublicKey = await importPublicKey(await exportPublicKey(user.publicKey));
  const userPrivateKey = await importPrivateKey(await exportPrivateKey(user.privateKey));

  const environment = await generateKeyPair();
  const sealed = await encryptSecret(environment.publicKey, "s3cret", context);
  const wrapped = await wrapPrivateKey(environment.privateKey, userPublicKey);

  const unwrapped = await unwrapPrivateKey(wrapped, userPrivateKey);
  assert.equal(await decryptSecret(unwrapped, sealed, context), "s3cret");
});

test("another user cannot unwrap the key", async () => {
  const owner = await generateKeyPair();
  const stranger = await generateKeyPair();
  const wrapped = await wrapPrivateKey((await generateKeyPair()).privateKey, owner.publicKey);

  await assert.rejects(unwrapPrivateKey(wrapped, stranger.privateKey));
});

test("a wrapped key cannot be used as a secret ciphertext", async () => {
  const user = await generateKeyPair();
  const wrapped = await wrapPrivateKey((await generateKeyPair()).privateKey, user.publicKey);

  await assert.rejects(decryptSecret(user.privateKey, wrapped, context));
});
