import assert from "node:assert/strict";
import test from "node:test";
import { createAuthCookie } from "./auth-cookie.mjs";

const baseUrl = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const allowedCookie = await createAuthCookie(baseUrl);
const deniedCookie = await createAuthCookie(baseUrl, "unauthorized@example.com");

async function getStudents(cookie) {
  return fetch(`${baseUrl}/api/students`, {
    headers: cookie ? { cookie } : undefined,
    redirect: "manual"
  });
}

test("API authentication rejects anonymous and non-allowed accounts", async () => {
  assert.equal((await getStudents()).status, 401);
  assert.equal((await getStudents(deniedCookie)).status, 401);
  assert.equal((await getStudents(allowedCookie)).status, 200);
});
