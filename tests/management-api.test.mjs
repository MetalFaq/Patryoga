import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const baseUrl = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ids = {
  student: `test-student-${suffix}`,
  secondStudent: `test-student-2-${suffix}`,
  thirdStudent: `test-student-3-${suffix}`,
  fourthStudent: `test-student-4-${suffix}`,
  class: `test-class-${suffix}`,
  capacityClass: `test-capacity-class-${suffix}`,
  seedStudent: `test-seed-student-${suffix}`,
  seedClass: `test-seed-class-${suffix}`
};
const date = "1998-01-05";

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : undefined };
}

function json(method, body) {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

async function createStudent(id, name = id) {
  const result = await request("/api/students", json("POST", { id, name, phone: "+54 11 5555-0199", notes: "test" }));
  assert.equal(result.response.status, 201);
  return result.body.student;
}

async function createClass(id, capacity = 4) {
  const result = await request("/api/classes", json("POST", {
    id, title: `Clase ${id}`, weekday: "monday", time: "09:15", durationMinutes: 60,
    teacher: "Docente de prueba", room: "Sala test", capacity
  }));
  assert.equal(result.response.status, 201);
  return result.body.class;
}

async function assign(studentId, classIds) {
  return request(`/api/students/${studentId}/classes`, json("POST", { classIds }));
}

async function unassign(studentId, classIds) {
  return request(`/api/students/${studentId}/classes`, json("DELETE", { classIds }));
}

async function attendance(classId, targetDate = date) {
  return request(`/api/classes/${classId}/attendance?date=${targetDate}`);
}

async function archiveStudent(id) {
  const result = await request(`/api/students/${id}`, { method: "DELETE" });
  assert.equal(result.response.status, 204);
}

async function archiveClass(id) {
  const result = await request(`/api/classes/${id}`, { method: "DELETE" });
  assert.equal(result.response.status, 204);
}

test("management API covers CRUD, assignments, capacity, history and seed safety", async (t) => {
  await t.test("creates and edits a student", async () => {
    const created = await createStudent(ids.student, "Alumna de alta");
    assert.deepEqual(created, { id: ids.student, name: "Alumna de alta", phone: "+54 11 5555-0199", notes: "test" });

    const updated = await request(`/api/students/${ids.student}`, json("PATCH", { name: "Alumna editada", notes: "nota nueva" }));
    assert.equal(updated.response.status, 200);
    assert.deepEqual(updated.body.student, { id: ids.student, name: "Alumna editada", phone: "+54 11 5555-0199", notes: "nota nueva" });
  });
  await t.test("creates and edits a weekly class", async () => {
    const created = await createClass(ids.class);
    assert.equal(created.id, ids.class);
    const updated = await request(`/api/classes/${ids.class}`, json("PATCH", { title: "Clase editada", capacity: 5 }));
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.message, "Class updated");
    const session = await attendance(ids.class, "2026-07-20");
    assert.equal(session.response.status, 200);
    assert.equal(session.body.session.title, "Clase editada");
    assert.equal(session.body.session.capacity, 5);
  });

  await t.test("assigns idempotently and rejects a full class", async () => {
    await createStudent(ids.secondStudent);
    await createStudent(ids.thirdStudent);
    await createStudent(ids.fourthStudent);
    await createClass(ids.capacityClass, 2);

    const first = await assign(ids.secondStudent, [ids.capacityClass]);
    assert.equal(first.response.status, 200);
    const repeated = await assign(ids.secondStudent, [ids.capacityClass]);
    assert.equal(repeated.response.status, 200);
    assert.equal((await assign(ids.thirdStudent, [ids.capacityClass])).response.status, 200);
    const full = await assign(ids.fourthStudent, [ids.capacityClass]);
    assert.equal(full.response.status, 409);
    const session = await attendance(ids.capacityClass, "2026-07-20");
    assert.deepEqual(session.body.session.studentIds, [ids.secondStudent, ids.thirdStudent]);
  });

  await t.test("closes an assignment without deleting historical attendance", async () => {
    assert.equal((await assign(ids.secondStudent, [ids.class])).response.status, 200);
    const saved = await request(`/api/classes/${ids.class}/attendance`, json("POST", {
      date, attendance: [{ studentId: ids.secondStudent, status: "present" }]
    }));
    assert.equal(saved.response.status, 200);
    const closed = await unassign(ids.secondStudent, [ids.class]);
    assert.equal(closed.response.status, 200);
    const futureSession = await attendance(ids.class, "2099-01-05");
    assert.equal(futureSession.body.session.studentIds.includes(ids.secondStudent), false);
    const historical = await attendance(ids.class, date);
    assert.equal(historical.body.session.students.find((item) => item.id === ids.secondStudent)?.status, "present");
    const repeatedClose = await unassign(ids.secondStudent, [ids.class]);
    assert.equal(repeatedClose.response.status, 200);
    const reactivation = await assign(ids.secondStudent, [ids.class]);
    assert.equal(reactivation.response.status, 409);
  });

  await t.test("archives students and classes idempotently and preserves history", async () => {
    await assign(ids.student, [ids.class]);
    const saved = await request(`/api/classes/${ids.class}/attendance`, json("POST", {
      date: "1998-01-12", attendance: [{ studentId: ids.student, status: "absent" }]
    }));
    assert.equal(saved.response.status, 200);
    await archiveStudent(ids.student);
    await archiveStudent(ids.student);
    const students = await request("/api/students");
    assert.equal(students.body.students.some((item) => item.id === ids.student), false);
    const historical = await attendance(ids.class, "1998-01-12");
    assert.equal(historical.body.session.students.find((item) => item.id === ids.student)?.status, "absent");

    await archiveClass(ids.class);
    await archiveClass(ids.class);
    const archivedSession = await attendance(ids.class, "2026-07-20");
    assert.equal(archivedSession.response.status, 200);
    const agenda = await request("/api/classes?weekStart=2026-07-20");
    assert.equal(agenda.body.sessions.some((item) => item.id === ids.class), false);
  });

  await t.test("rejects lowering capacity below active assignments transactionally", async () => {
    const result = await request(`/api/classes/${ids.capacityClass}`, json("PATCH", { capacity: 1 }));
    assert.equal(result.response.status, 409);
    const unchanged = await attendance(ids.capacityClass, "2026-07-20");
    assert.equal(unchanged.body.session.capacity, 2);
  });

  await t.test("rerunning the seed does not alter operational data", {
    skip: process.env.RUN_SEED_TEST !== "1"
      ? "set RUN_SEED_TEST=1 to execute db/init.sql through Docker Compose"
      : false
  }, async () => {
    await createStudent(ids.seedStudent, "Dato operativo");
    await createClass(ids.seedClass, 2);
    assert.equal((await assign(ids.seedStudent, [ids.seedClass])).response.status, 200);
    assert.equal((await request(`/api/classes/${ids.seedClass}/attendance`, json("POST", {
      date, attendance: [{ studentId: ids.seedStudent, status: "present" }]
    }))).response.status, 200);

    await execFileAsync("docker", ["compose", "exec", "-T", "db", "psql", "-U", "yoga", "-d", "yoga_salon", "-f", "/docker-entrypoint-initdb.d/001-init.sql"], { cwd: process.cwd() });
    const afterStudent = await request("/api/students");
    assert.deepEqual(afterStudent.body.students.find((item) => item.id === ids.seedStudent), {
      id: ids.seedStudent, name: "Dato operativo", phone: "+54 11 5555-0199", notes: "test"
    });
    const afterAttendance = await attendance(ids.seedClass, date);
    assert.equal(afterAttendance.body.session.students.find((item) => item.id === ids.seedStudent)?.status, "present");
  });

  await archiveClass(ids.capacityClass);
  await archiveStudent(ids.secondStudent);
  await archiveStudent(ids.thirdStudent);
  await archiveStudent(ids.fourthStudent);
  if (process.env.RUN_SEED_TEST === "1") {
    await archiveClass(ids.seedClass);
    await archiveStudent(ids.seedStudent);
  }
});
