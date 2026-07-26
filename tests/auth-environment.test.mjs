import assert from "node:assert/strict";
import test from "node:test";
import {
  getAuthEnvironment,
  parseAllowedAdminEmails
} from "../src/auth-environment.ts";

test("allowed administrator emails are trimmed, normalized and deduplicated", () => {
  assert.deepEqual(
    parseAllowedAdminEmails(" FIRST.ADMIN@EXAMPLE.COM,second.admin@example.com , first.admin@example.com "),
    ["first.admin@example.com", "second.admin@example.com"]
  );
});

test("an empty administrator email list is invalid", () => {
  assert.equal(parseAllowedAdminEmails(undefined), null);
  assert.equal(parseAllowedAdminEmails("  "), null);
});

test("one invalid entry rejects the complete administrator email list", () => {
  assert.equal(
    parseAllowedAdminEmails("first.admin@example.com,not-an-email"),
    null
  );
  assert.equal(
    parseAllowedAdminEmails("first.admin@example.com, ,second.admin@example.com"),
    null
  );
});

test("authentication configuration fails closed for an invalid email list", () => {
  const variableNames = [
    "AUTH_SECRET",
    "AUTH_GOOGLE_ID",
    "AUTH_GOOGLE_SECRET",
    "AUTH_ALLOWED_EMAIL",
    "AUTH_TRUST_HOST",
    "AUTH_URL"
  ];
  const previousValues = Object.fromEntries(
    variableNames.map((name) => [name, process.env[name]])
  );

  try {
    Object.assign(process.env, {
      AUTH_SECRET: "test-secret-with-at-least-32-characters",
      AUTH_GOOGLE_ID: "test-google-client-id",
      AUTH_GOOGLE_SECRET: "test-google-client-secret",
      AUTH_ALLOWED_EMAIL: "first.admin@example.com, SECOND.ADMIN@example.com",
      AUTH_TRUST_HOST: "true",
      AUTH_URL: "http://localhost:3000"
    });

    assert.deepEqual(getAuthEnvironment().allowedEmails, [
      "first.admin@example.com",
      "second.admin@example.com"
    ]);
    assert.equal(getAuthEnvironment().ready, true);

    process.env.AUTH_ALLOWED_EMAIL = "first.admin@example.com,invalid";
    assert.equal(getAuthEnvironment().ready, false);
    assert.deepEqual(getAuthEnvironment().allowedEmails, []);
    assert.ok(getAuthEnvironment().issues.includes("AUTH_ALLOWED_EMAIL"));
  } finally {
    for (const [name, value] of Object.entries(previousValues)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
