import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions, DEFAULT_POLICIES, isPolicyName, mergePolicies, PolicyError, validatePolicy } from "@noenv/policy";

test("more specific layers override less specific ones", () => {
  const merged = mergePolicies([{ environmentMinRole: "editor" }, {}, { environmentMinRole: "admin" }]);
  assert.equal(merged.environmentMinRole, "admin");
  assert.deepEqual(merged.dotenv, DEFAULT_POLICIES.dotenv);
});

test("validates policy values", () => {
  const dotenv = { mode: "delete", include: [".env"], exclude: [] };
  assert.deepEqual(validatePolicy("dotenv", dotenv, "environment"), dotenv);
  assert.throws(() => validatePolicy("dotenv", { ...dotenv, mode: "nuke" }, "project"), PolicyError);
  assert.throws(() => validatePolicy("dotenv", { ...dotenv, include: ["../../.ssh/id_rsa"] }, "project"), PolicyError);
  assert.throws(() => validatePolicy("minCliVersion", "latest", "organization"), PolicyError);
  assert.throws(() => validatePolicy("sessionTtlHours", 0, "organization"), PolicyError);
});

test("rejects policies at a level where they do not apply", () => {
  assert.throws(() => validatePolicy("sessionTtlHours", 24, "project"), /only be set at the organization level/);
  assert.throws(() => validatePolicy("minCliVersion", "1.0.0", "environment"), PolicyError);
});

test("knows the policy names", () => {
  assert.equal(isPolicyName("dotenv"), true);
  assert.equal(isPolicyName("toString"), false);
});

test("compares versions numerically", () => {
  assert.equal(compareVersions("0.10.0", "0.9.9"), 1);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.equal(compareVersions("0.1.0", "1.0.0"), -1);
});
