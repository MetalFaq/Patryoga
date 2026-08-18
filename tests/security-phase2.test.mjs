import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import {
  FixedWindowRateLimiter,
  getClientRateLimitKey,
  getPilotRateLimitConfig
} from "../src/lib/server/security/rate-limit.ts";

const execFileAsync = promisify(execFile);
const baseUrl = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const integrationEnabled = process.env.RUN_SECURITY_PHASE2_INTEGRATION === "1";
const composeProject = process.env.COMPOSE_PROJECT_NAME ?? "yoga-app";

function compose(args, options = {}) {
  return execFileAsync(
    "docker",
    ["compose", "-p", composeProject, ...args],
    { cwd: process.cwd(), maxBuffer: 4 * 1024 * 1024, ...options }
  );
}

async function request(path, ip) {
  return fetch(`${baseUrl}${path}`, {
    headers: { "x-forwarded-for": ip },
    redirect: "manual"
  });
}

test("fixed windows block, recover and keep overflow memory bounded", () => {
  let now = 1_000;
  const limiter = new FixedWindowRateLimiter({
    limit: 2,
    maxKeys: 1,
    now: () => now,
    windowMs: 1_000
  });

  assert.equal(limiter.consume("first").allowed, true);
  assert.equal(limiter.consume("first").allowed, true);
  const blocked = limiter.consume("first");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);

  assert.equal(limiter.consume("overflow-one").allowed, true);
  assert.equal(limiter.consume("overflow-two").allowed, true);
  assert.equal(limiter.consume("overflow-three").allowed, false);

  now = 2_001;
  assert.equal(limiter.consume("first").allowed, true);
  assert.equal(limiter.consume("overflow-three").allowed, true);
});

test("forwarded IP trust is normalized with a shared fail-closed fallback", () => {
  assert.equal(
    getClientRateLimitKey(new Headers({ "x-forwarded-for": "203.0.113.9, 127.0.0.1" })),
    "203.0.113.9"
  );
  assert.equal(
    getClientRateLimitKey(new Headers({ "x-forwarded-for": "invalid", "x-real-ip": "2001:db8::7" })),
    "2001:db8::7"
  );
  assert.equal(getClientRateLimitKey(new Headers()), "unidentified");
});

test("invalid rate limit environment values fall back to bounded defaults", () => {
  assert.deepEqual(getPilotRateLimitConfig({
    RATE_LIMIT_AUTH_MAX: "0",
    RATE_LIMIT_BUSINESS_MAX: "not-a-number",
    RATE_LIMIT_WINDOW_MS: "99999999"
  }), {
    authLimit: 60,
    businessLimit: 600,
    windowMs: 60_000
  });
});

test("pilot rate limits separate Auth.js, business API and health", {
  skip: integrationEnabled ? false : "set RUN_SECURITY_PHASE2_INTEGRATION=1 against an isolated Compose stack"
}, async () => {
  const config = getPilotRateLimitConfig();
  const authIp = "198.51.100.41";
  const businessIp = "198.51.100.42";

  for (let index = 0; index < config.authLimit; index += 1) {
    assert.equal((await request("/api/auth/providers", authIp)).status, 200);
  }
  const authBlocked = await request("/api/auth/providers", authIp);
  assert.equal(authBlocked.status, 429);
  assert.equal(authBlocked.headers.get("x-ratelimit-limit"), String(config.authLimit));
  assert.ok(Number(authBlocked.headers.get("retry-after")) >= 1);

  for (let index = 0; index < config.businessLimit; index += 1) {
    assert.equal((await request("/api/students", businessIp)).status, 401);
  }
  const businessBlocked = await request("/api/students", businessIp);
  assert.equal(businessBlocked.status, 429);
  assert.equal(businessBlocked.headers.get("x-ratelimit-limit"), String(config.businessLimit));

  for (let index = 0; index < config.businessLimit + 2; index += 1) {
    assert.equal((await request("/api/health", businessIp)).status, 200);
  }

  await new Promise((resolve) => setTimeout(resolve, config.windowMs + 100));
  assert.equal((await request("/api/auth/providers", authIp)).status, 200);
  assert.equal((await request("/api/students", businessIp)).status, 401);
});

test("runtime database role is idempotent, limited and operational", {
  skip: integrationEnabled ? false : "set RUN_SECURITY_PHASE2_INTEGRATION=1 against an isolated Compose stack"
}, async () => {
  const sequenceName = "phase2_security_sequence";
  const ownerPsql = (sql) => compose([
    "exec", "-T", "db", "sh", "-c",
    `psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '${sql}'`
  ]);

  await ownerPsql(`DROP SEQUENCE IF EXISTS public.${sequenceName}; CREATE SEQUENCE public.${sequenceName}`);

  try {
    await compose(["run", "--rm", "migrate"]);
    await compose(["run", "--rm", "migrate"]);

    const runtimeProbe = String.raw`
      const pg = require("pg");
      const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
      (async () => {
        await client.connect();
        const flags = (await client.query(
          "SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = current_user"
        )).rows[0];

        let dmlAllowed = false;
        await client.query("BEGIN");
        try {
          await client.query("INSERT INTO students (id, full_name, phone, notes, active) VALUES ($1, $2, $3, $4, true)", ["phase2-security-dml-check", "Phase 2", "test", "rollback"]);
          await client.query("UPDATE students SET notes = $2 WHERE id = $1", ["phase2-security-dml-check", "updated"]);
          await client.query("DELETE FROM students WHERE id = $1", ["phase2-security-dml-check"]);
          dmlAllowed = true;
        } finally {
          await client.query("ROLLBACK");
        }

        async function denied(sql, cleanup) {
          try {
            await client.query(sql);
            if (cleanup) await client.query(cleanup);
            return false;
          } catch (error) {
            return error.code === "42501";
          }
        }

        const ddlDenied = await denied(
          "CREATE TABLE public.phase2_security_forbidden (id integer)",
          "DROP TABLE public.phase2_security_forbidden"
        );
        const roleDenied = await denied(
          "CREATE ROLE phase2_security_forbidden_role",
          "DROP ROLE phase2_security_forbidden_role"
        );
        const migrationsDenied = await denied("SELECT * FROM schema_migrations LIMIT 1");
        const sequenceAllowed = Number((await client.query("SELECT nextval('public.phase2_security_sequence') AS value")).rows[0].value) >= 1;

        console.log(JSON.stringify({ flags, dmlAllowed, ddlDenied, roleDenied, migrationsDenied, sequenceAllowed }));
        await client.end();
      })().catch((error) => {
        console.error(error.message);
        process.exit(1);
      });
    `;

    const { stdout } = await compose(["exec", "-T", "app", "node", "-e", runtimeProbe]);
    const result = JSON.parse(stdout.trim().split(/\r?\n/).at(-1));

    assert.equal(result.flags.rolname, process.env.APP_DB_USER);
    assert.deepEqual({
      rolsuper: result.flags.rolsuper,
      rolcreatedb: result.flags.rolcreatedb,
      rolcreaterole: result.flags.rolcreaterole,
      rolinherit: result.flags.rolinherit,
      rolreplication: result.flags.rolreplication,
      rolbypassrls: result.flags.rolbypassrls
    }, {
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolinherit: false,
      rolreplication: false,
      rolbypassrls: false
    });
    assert.equal(result.dmlAllowed, true);
    assert.equal(result.ddlDenied, true);
    assert.equal(result.roleDenied, true);
    assert.equal(result.migrationsDenied, true);
    assert.equal(result.sequenceAllowed, true);
  } finally {
    await ownerPsql(`DROP SEQUENCE IF EXISTS public.${sequenceName}`);
  }
});
