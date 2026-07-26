import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const baseUrl = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const classId = "class-lun-0830";
const studentId = "stu-ana";
const secondStudentId = "stu-elena";
const date = process.env.ATTENDANCE_TEST_DATE ?? "1999-01-04";

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  return { response, body };
}

async function save(attendance, targetClassId = classId) {
  return request(`/api/classes/${targetClassId}/attendance`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date, attendance })
  });
}

async function getSession(targetClassId = classId) {
  return request(`/api/classes/${targetClassId}/attendance?date=${date}`);
}

async function waitForApi() {
  const deadline = Date.now() + Number(process.env.RESTART_TIMEOUT_MS ?? 30_000);
  while (Date.now() < deadline) {
    try {
      const { response } = await request(`/api/classes/${classId}/attendance?date=${date}`);
      if (response.ok) return;
    } catch {
      // The service may be unavailable while it is restarting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`API did not become ready at ${baseUrl}`);
}

test("attendance API enforces historical, atomic, idempotent and persistent behavior", async (t) => {
  await t.test("accepts a past date and exposes the saved state", async () => {
    const saved = await save([{ studentId, status: "present" }]);
    assert.equal(saved.response.status, 200);
    assert.deepEqual(saved.body.saved, [{ classId, studentId, date, status: "present" }]);

    const session = await getSession();
    assert.equal(session.response.status, 200);
    assert.equal(session.body.session.students.find((student) => student.id === studentId).status, "present");
  });

  await t.test("upserts by class, student and date without creating duplicates", async () => {
    const repeated = await save([{ studentId, status: "present" }]);
    assert.equal(repeated.response.status, 200);
    assert.equal(repeated.body.saved.length, 1);

    const replaced = await save([{ studentId, status: "absent" }]);
    assert.equal(replaced.response.status, 200);

    const session = await getSession();
    const student = session.body.session.students.find((candidate) => candidate.id === studentId);
    assert.equal(student.status, "absent");
    assert.equal(session.body.session.students.filter((candidate) => candidate.id === studentId).length, 1);
  });

  await t.test("rejects an invalid student atomically", async () => {
    const before = await getSession();
    const invalid = await save([
      { studentId: secondStudentId, status: "present" },
      { studentId: "stu-not-enrolled", status: "absent" }
    ]);
    assert.equal(invalid.response.status, 400);

    const after = await getSession();
    assert.deepEqual(
      after.body.session.students.map(({ id, status }) => ({ id, status })),
      before.body.session.students.map(({ id, status }) => ({ id, status }))
    );
  });

  await t.test("returns 404 for an unknown class without mutating a known class", async () => {
    const before = await getSession();
    const missing = await save([{ studentId, status: "present" }], "class-does-not-exist");
    assert.equal(missing.response.status, 404);

    const after = await getSession();
    assert.deepEqual(after.body.session, before.body.session);
  });

  await t.test("keeps the attendance after restarting the app service", {
    skip: process.env.RESTART_SERVICES !== "1"
      ? "set RESTART_SERVICES=1 to restart Docker app and verify PostgreSQL persistence"
      : false
  }, async () => {
    const markerStatus = "present";
    const saved = await save([{ studentId, status: markerStatus }]);
    assert.equal(saved.response.status, 200);
    await execFileAsync("docker", ["compose", "restart", "app"], { cwd: process.cwd() });
    await waitForApi();
    const session = await getSession();
    assert.equal(session.body.session.students.find((student) => student.id === studentId).status, markerStatus);
  });
});
