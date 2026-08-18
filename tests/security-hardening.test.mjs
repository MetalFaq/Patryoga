import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function get(path) {
  return fetch(`${baseUrl}${path}`, { redirect: "manual" });
}

function assertSecurityHeaders(response) {
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(
    response.headers.get("referrer-policy"),
    "strict-origin-when-cross-origin"
  );
  assert.equal(
    response.headers.get("permissions-policy"),
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
  );
  assert.equal(
    response.headers.get("strict-transport-security"),
    "max-age=31536000"
  );

  const reportOnly = response.headers.get("content-security-policy-report-only");
  assert.ok(reportOnly?.includes("default-src 'self'"));
  assert.ok(reportOnly?.includes("frame-ancestors 'none'"));
  assert.equal(response.headers.get("content-security-policy"), null);
}

test("public health is cheap liveness with defensive headers", async () => {
  const response = await get("/api/health");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(await response.json(), { status: "ok" });
  assertSecurityHeaders(response);
});

test("business API remains protected", async () => {
  const response = await get("/api/students");
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required" });
  assertSecurityHeaders(response);
});

test("Auth.js metadata and login stay reachable", async () => {
  const providersResponse = await get("/api/auth/providers");
  assert.equal(providersResponse.status, 200);
  assertSecurityHeaders(providersResponse);

  const providers = await providersResponse.json();
  const callback = new URL(providers.google.callbackUrl);
  assert.equal(callback.pathname, "/api/auth/callback/google");

  const loginResponse = await get("/login");
  assert.equal(loginResponse.status, 200);
  assertSecurityHeaders(loginResponse);
});
