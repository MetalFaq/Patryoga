import assert from "node:assert/strict";
import test from "node:test";
import {
  createAuthCookie,
  getConfiguredAllowedEmails
} from "./auth-cookie.mjs";

const baseUrl = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const allowedEmails = getConfiguredAllowedEmails();
const allowedCookies = await Promise.all(
  allowedEmails.map((email) => createAuthCookie(baseUrl, email.toUpperCase()))
);
const deniedCookie = await createAuthCookie(baseUrl, "unauthorized@example.com");
const unverifiedCookie = await createAuthCookie(baseUrl, allowedEmails[0], false);

async function getStudents(cookie) {
  return fetch(`${baseUrl}/api/students`, {
    headers: cookie ? { cookie } : undefined,
    redirect: "manual"
  });
}

async function getProtectedPage(cookie) {
  return fetch(`${baseUrl}/`, {
    headers: { cookie },
    redirect: "manual"
  });
}

test("API authentication rejects anonymous, non-allowed and unverified accounts", async () => {
  assert.equal((await getStudents()).status, 401);
  assert.equal((await getStudents(deniedCookie)).status, 401);
  assert.equal((await getStudents(unverifiedCookie)).status, 401);
});

test("authentication accepts every configured account case-insensitively", async () => {
  for (const allowedCookie of allowedCookies) {
    assert.equal((await getProtectedPage(allowedCookie)).status, 200);
  }
});
