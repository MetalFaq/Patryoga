import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { createAuthCookie } from "./auth-cookie.mjs";

const execFileAsync = promisify(execFile);
const baseUrl = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const authCookie = await createAuthCookie(baseUrl);
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ids = {
  student: `test-student-${suffix}`,
  secondStudent: `test-student-2-${suffix}`,
  thirdStudent: `test-student-3-${suffix}`,
  fourthStudent: `test-student-4-${suffix}`,
  reentryStudent: `test-reentry-student-${suffix}`,
  class: `test-class-${suffix}`,
  capacityClass: `test-capacity-class-${suffix}`,
  reentryClass: `test-reentry-class-${suffix}`,
  deleteClass: `test-delete-class-${suffix}`,
  retainedClass: `test-retained-class-${suffix}`,
  overlapAnchor: `test-overlap-anchor-${suffix}`,
  overlapAdjacent: `test-overlap-adjacent-${suffix}`,
  overlapEdit: `test-overlap-edit-${suffix}`,
  seedStudent: `test-seed-student-${suffix}`,
  seedClass: `test-seed-class-${suffix}`
};
const date = process.env.MANAGEMENT_TEST_DATE ?? new Date().toISOString().slice(0, 10);
const futureDate = "2099-01-05";
const weekdayClasses = ["monday", "tuesday", "wednesday", "thursday", "friday"]
  .map((weekday) => ({ id: `test-${weekday}-${suffix}`, weekday }));

async function request(path, options) {
  const headers = new Headers(options?.headers);
  headers.set("cookie", authCookie);
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
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

async function createClass(id, options = {}) {
  const {
    capacity = 4,
    weekday = "wednesday",
    time = "15:00",
    durationMinutes = 60,
    title = `Clase ${id}`
  } = options;
  const result = await request("/api/classes", json("POST", {
    id, title, weekday, time, durationMinutes, capacity
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

async function removeClass(id) {
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
  await t.test("accepts monday through friday, rejects saturday and applies fixed teacher and room", async () => {
    for (const weeklyClass of weekdayClasses) {
      const created = await createClass(weeklyClass.id, {
        weekday: weeklyClass.weekday,
        time: "21:00",
        durationMinutes: 30
      });
      assert.equal(created.weekday, weeklyClass.weekday);
      assert.equal(created.teacher, "Patricia");
      assert.equal(created.room, "Sala unica");
    }

    const saturday = await request("/api/classes", json("POST", {
      id: `test-saturday-${suffix}`,
      title: "Clase sabado invalida",
      weekday: "saturday",
      time: "21:00",
      durationMinutes: 30,
      capacity: 4
    }));
    assert.equal(saturday.response.status, 400);

    const saturdayEdit = await request(`/api/classes/${weekdayClasses[0].id}`, json("PATCH", {
      weekday: "saturday"
    }));
    assert.equal(saturdayEdit.response.status, 400);
    const unchanged = await attendance(weekdayClasses[0].id, futureDate);
    assert.equal(unchanged.body.session.weekday, "monday");
  });

  await t.test("creates and edits a weekly class without teacher or room inputs", async () => {
    const created = await createClass(ids.class, { weekday: "wednesday", time: "15:00" });
    assert.equal(created.id, ids.class);
    assert.equal(created.teacher, "Patricia");
    assert.equal(created.room, "Sala unica");
    const updated = await request(`/api/classes/${ids.class}`, json("PATCH", { title: "Clase editada", capacity: 5 }));
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.message, "Class updated");
    const session = await attendance(ids.class, futureDate);
    assert.equal(session.response.status, 200);
    assert.equal(session.body.session.title, "Clase editada");
    assert.equal(session.body.session.capacity, 5);
  });

  await t.test("rejects overlapping creates and edits while allowing adjacent intervals", async () => {
    await createClass(ids.overlapAnchor, {
      weekday: "wednesday",
      time: "11:00",
      durationMinutes: 60,
      title: "Ancla de solapamiento"
    });

    const overlap = await request("/api/classes", json("POST", {
      id: `test-overlap-rejected-${suffix}`,
      title: "Clase solapada",
      weekday: "wednesday",
      time: "11:45",
      durationMinutes: 30,
      capacity: 4
    }));
    assert.equal(overlap.response.status, 409);
    assert.match(overlap.body.error, new RegExp(ids.overlapAnchor));

    const adjacent = await createClass(ids.overlapAdjacent, {
      weekday: "wednesday",
      time: "12:00",
      durationMinutes: 60
    });
    assert.equal(adjacent.time, "12:00");

    await createClass(ids.overlapEdit, {
      weekday: "wednesday",
      time: "13:30",
      durationMinutes: 30
    });
    const conflictingEdit = await request(`/api/classes/${ids.overlapEdit}`, json("PATCH", {
      time: "11:30"
    }));
    assert.equal(conflictingEdit.response.status, 409);
    assert.match(conflictingEdit.body.error, new RegExp(ids.overlapAnchor));
    const unchanged = await attendance(ids.overlapEdit, futureDate);
    assert.equal(unchanged.body.session.time, "13:30");
    assert.equal(unchanged.body.session.durationMinutes, 30);
  });

  await t.test("assigns idempotently and rejects a full class", async () => {
    await createStudent(ids.secondStudent);
    await createStudent(ids.thirdStudent);
    await createStudent(ids.fourthStudent);
    await createClass(ids.capacityClass, { capacity: 2, weekday: "thursday", time: "15:00" });

    const first = await assign(ids.secondStudent, [ids.capacityClass]);
    assert.equal(first.response.status, 200);
    const repeated = await assign(ids.secondStudent, [ids.capacityClass]);
    assert.equal(repeated.response.status, 200);
    assert.equal((await assign(ids.thirdStudent, [ids.capacityClass])).response.status, 200);
    const full = await assign(ids.fourthStudent, [ids.capacityClass]);
    assert.equal(full.response.status, 409);
    const session = await attendance(ids.capacityClass, futureDate);
    assert.deepEqual(session.body.session.studentIds, [ids.secondStudent, ids.thirdStudent]);
  });

  await t.test("reassigns a closed relationship as a new valid period and preserves history", async () => {
    assert.equal((await assign(ids.secondStudent, [ids.class])).response.status, 200);
    const saved = await request(`/api/classes/${ids.class}/attendance`, json("POST", {
      date, attendance: [{ studentId: ids.secondStudent, status: "present" }]
    }));
    assert.equal(saved.response.status, 200);
    const closed = await unassign(ids.secondStudent, [ids.class]);
    assert.equal(closed.response.status, 200);
    const futureSession = await attendance(ids.class, futureDate);
    assert.equal(futureSession.body.session.studentIds.includes(ids.secondStudent), false);
    const historical = await attendance(ids.class, date);
    assert.equal(historical.body.session.students.find((item) => item.id === ids.secondStudent)?.status, "present");
    const repeatedClose = await unassign(ids.secondStudent, [ids.class]);
    assert.equal(repeatedClose.response.status, 200);
    const reassigned = await assign(ids.secondStudent, [ids.class]);
    assert.equal(reassigned.response.status, 200);
    const newPeriod = await attendance(ids.class, futureDate);
    assert.equal(newPeriod.body.session.studentIds.includes(ids.secondStudent), true);
    const unchangedHistory = await attendance(ids.class, date);
    assert.equal(unchangedHistory.body.session.students.find((item) => item.id === ids.secondStudent)?.status, "present");
  });

  await t.test("reactivates an archived student without restoring previous classes", async () => {
    await createStudent(ids.reentryStudent);
    await createClass(ids.reentryClass, { weekday: "tuesday", time: "15:00" });
    assert.equal((await assign(ids.reentryStudent, [ids.reentryClass])).response.status, 200);
    await archiveStudent(ids.reentryStudent);

    const reentered = await request(`/api/students/${ids.reentryStudent}`, json("PATCH", { active: true }));
    assert.equal(reentered.response.status, 200);
    const students = await request("/api/students");
    assert.equal(students.body.students.some((item) => item.id === ids.reentryStudent), true);
    const futureSession = await attendance(ids.reentryClass, futureDate);
    assert.equal(futureSession.body.session.studentIds.includes(ids.reentryStudent), false);
  });

  await t.test("deletes a class without attendance and its assignments permanently", async () => {
    await createClass(ids.deleteClass, { weekday: "monday", time: "15:00" });
    assert.equal((await assign(ids.fourthStudent, [ids.deleteClass])).response.status, 200);
    await removeClass(ids.deleteClass);
    assert.equal((await attendance(ids.deleteClass, futureDate)).response.status, 404);
    assert.equal((await request(`/api/classes/${ids.deleteClass}`, { method: "DELETE" })).response.status, 404);
  });

  await t.test("retires a class from future agendas while preserving attendance history", async () => {
    await createClass(ids.retainedClass, { weekday: "friday", time: "15:00" });
    assert.equal((await assign(ids.student, [ids.retainedClass])).response.status, 200);
    const saved = await request(`/api/classes/${ids.retainedClass}/attendance`, json("POST", {
      date, attendance: [{ studentId: ids.student, status: "absent" }]
    }));
    assert.equal(saved.response.status, 200);

    await removeClass(ids.retainedClass);
    const agenda = await request(`/api/classes?weekStart=${futureDate}`);
    assert.equal(agenda.body.sessions.some((item) => item.id === ids.retainedClass), false);
    const historical = await attendance(ids.retainedClass, date);
    assert.equal(historical.response.status, 200);
    assert.equal(historical.body.session.students.find((item) => item.id === ids.student)?.status, "absent");
  });

  await t.test("rejects lowering capacity below active assignments transactionally", async () => {
    const result = await request(`/api/classes/${ids.capacityClass}`, json("PATCH", { capacity: 1 }));
    assert.equal(result.response.status, 409);
    const unchanged = await attendance(ids.capacityClass, futureDate);
    assert.equal(unchanged.body.session.capacity, 2);
  });

  await t.test("rerunning the seed does not alter operational data", {
    skip: process.env.RUN_SEED_TEST !== "1"
      ? "set RUN_SEED_TEST=1 to execute db/init.sql through Docker Compose"
      : false
  }, async () => {
    await createStudent(ids.seedStudent, "Dato operativo");
    await createClass(ids.seedClass, {
      capacity: 2,
      weekday: "tuesday",
      time: "22:00",
      durationMinutes: 30
    });
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

  await removeClass(ids.class);
  await removeClass(ids.capacityClass);
  await removeClass(ids.reentryClass);
  await removeClass(ids.overlapAnchor);
  await removeClass(ids.overlapAdjacent);
  await removeClass(ids.overlapEdit);
  for (const weeklyClass of weekdayClasses) await removeClass(weeklyClass.id);
  await archiveStudent(ids.student);
  await archiveStudent(ids.secondStudent);
  await archiveStudent(ids.thirdStudent);
  await archiveStudent(ids.fourthStudent);
  await archiveStudent(ids.reentryStudent);
  if (process.env.RUN_SEED_TEST === "1") {
    await removeClass(ids.seedClass);
    await archiveStudent(ids.seedStudent);
  }
});
