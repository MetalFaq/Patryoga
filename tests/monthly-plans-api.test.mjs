import assert from "node:assert/strict";
import test from "node:test";
import { createAuthCookie } from "./auth-cookie.mjs";

const baseUrl = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const authCookie = await createAuthCookie(baseUrl);
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const futureMonth = "2099-08";
const today = new Date().toISOString().slice(0, 10);
const currentMonth = today.slice(0, 7);
const weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const todayWeekday = weekdayNames[new Date(`${today}T00:00:00Z`).getUTCDay()];
const todaySupportsClasses = !["saturday", "sunday"].includes(todayWeekday);

const ids = {
  fullStudent: `test-plan-full-student-${suffix}`,
  proratedStudent: `test-plan-prorated-student-${suffix}`,
  replacementStudent: `test-plan-replacement-student-${suffix}`,
  snapshotStudent: `test-plan-snapshot-student-${suffix}`,
  emptyStudent: `test-plan-empty-student-${suffix}`,
  archivedStudent: `test-plan-archived-student-${suffix}`,
  usageStudent: `test-plan-usage-student-${suffix}`,
  earlyClass: `test-plan-early-class-${suffix}`,
  lateClass: `test-plan-late-class-${suffix}`,
  snapshotClass: `test-plan-snapshot-class-${suffix}`,
  usagePresentClass: `test-plan-usage-present-${suffix}`,
  usageAbsentClass: `test-plan-usage-absent-${suffix}`,
  usageUnmarkedClass: `test-plan-usage-unmarked-${suffix}`,
  customPlan: `test-custom-plan-${suffix}`,
  conflictingPlan: `test-conflicting-plan-${suffix}`
};

const createdStudents = new Set();
const createdClasses = new Set();
const createdPlans = new Set();

async function request(path, options) {
  const headers = new Headers(options?.headers);
  headers.set("cookie", authCookie);
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const text = await response.text();
  let body;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${options?.method ?? "GET"} ${path} returned non-JSON: ${text}`);
    }
  }
  return { response, body };
}

function json(method, body) {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

async function createStudent(id, name = id) {
  const result = await request("/api/students", json("POST", {
    id,
    name,
    phone: "+54 11 5555-0188",
    notes: "prueba aislada de planes mensuales"
  }));
  assert.equal(result.response.status, 201, result.body?.error);
  createdStudents.add(id);
  return result.body.student;
}

async function createClass(id, { weekday, time, title = id }) {
  const result = await request("/api/classes", json("POST", {
    id,
    title,
    weekday,
    time,
    durationMinutes: 20,
    capacity: 20
  }));
  assert.equal(result.response.status, 201, result.body?.error);
  createdClasses.add(id);
  return result.body.class;
}

async function createPlan(id, name, classLimit, description = "Plan de prueba") {
  const result = await request("/api/plans", json("POST", {
    id,
    name,
    classLimit,
    description
  }));
  assert.equal(result.response.status, 201, result.body?.error);
  createdPlans.add(id);
  return result.body.plan;
}

async function assignClasses(studentId, classIds) {
  const result = await request(`/api/students/${studentId}/classes`, json("POST", { classIds }));
  assert.equal(result.response.status, 200, result.body?.error);
  return result;
}

async function putPlan(studentId, month, body) {
  return request(`/api/plan-assignments/${studentId}/${month}`, json("PUT", body));
}

async function getAssignments(month, studentId) {
  const query = new URLSearchParams({ month });
  if (studentId) query.set("studentId", studentId);
  return request(`/api/plan-assignments?${query}`);
}

function expectSessionOrder(sessions) {
  const keys = sessions.map((session) => `${session.date}|${session.classId}`);
  const sorted = [...sessions]
    .sort((left, right) =>
      left.date.localeCompare(right.date) ||
      left.position - right.position ||
      left.classId.localeCompare(right.classId)
    )
    .map((session) => `${session.date}|${session.classId}`);
  assert.deepEqual(keys, sorted);
  assert.deepEqual(sessions.map((session) => session.position), sessions.map((_, index) => index + 1));
}

async function cleanup() {
  for (const planId of createdPlans) {
    try {
      await request(`/api/plans/${planId}`, json("PATCH", { active: false }));
    } catch {
      // Cleanup is best effort and only targets unique test identifiers.
    }
  }
  for (const classId of createdClasses) {
    try {
      await request(`/api/classes/${classId}`, { method: "DELETE" });
    } catch {
      // Classes with attendance are retired while their history is retained.
    }
  }
  for (const studentId of createdStudents) {
    try {
      await request(`/api/students/${studentId}`, { method: "DELETE" });
    } catch {
      // Students are archived, never physically deleted by the public API.
    }
  }
}

test("monthly plans API preserves catalog, pool and historical rules", async (t) => {
  t.after(cleanup);

  let plan4;
  let plan8;
  let customPlan;

  await t.test("seeds the 4- and 8-class plans and validates catalog filters", async () => {
    const active = await request("/api/plans");
    assert.equal(active.response.status, 200);
    plan4 = active.body.plans.find((plan) => plan.name === "Plan 4 clases" && plan.classLimit === 4);
    plan8 = active.body.plans.find((plan) => plan.name === "Plan 8 clases" && plan.classLimit === 8);
    assert.ok(plan4, "Plan 4 clases must be seeded and active");
    assert.ok(plan8, "Plan 8 clases must be seeded and active");
    assert.equal(plan4.active, true);
    assert.equal(plan8.active, true);

    for (const status of ["active", "inactive", "all"]) {
      const filtered = await request(`/api/plans?status=${status}`);
      assert.equal(filtered.response.status, 200);
      if (status === "active") assert.equal(filtered.body.plans.every((plan) => plan.active), true);
      if (status === "inactive") assert.equal(filtered.body.plans.every((plan) => !plan.active), true);
    }

    assert.equal((await request("/api/plans?status=unknown")).response.status, 400);
    assert.equal((await request("/api/plans?status=active&status=active")).response.status, 400);
  });

  await t.test("creates, edits, deactivates and reactivates a custom plan", async () => {
    customPlan = await createPlan(ids.customPlan, `Plan personalizado ${suffix}`, 3, "Snapshot original");
    assert.deepEqual(customPlan, {
      id: ids.customPlan,
      name: `Plan personalizado ${suffix}`,
      classLimit: 3,
      description: "Snapshot original",
      active: true
    });

    assert.equal((await request("/api/plans", json("POST", {
      name: " ", classLimit: 0
    }))).response.status, 400);
    assert.equal((await request("/api/plans", json("POST", {
      id: ids.customPlan, name: `Otro nombre ${suffix}`, classLimit: 2
    }))).response.status, 409);
    assert.equal((await request("/api/plans", json("POST", {
      name: customPlan.name, classLimit: 9
    }))).response.status, 409);

    const conflicting = await createPlan(ids.conflictingPlan, `Plan conflicto ${suffix}`, 2);
    assert.equal(conflicting.active, true);
    assert.equal((await request(`/api/plans/${ids.conflictingPlan}`, json("PATCH", {
      name: customPlan.name
    }))).response.status, 409);
    assert.equal((await request(`/api/plans/${ids.customPlan}`, json("PATCH", {}))).response.status, 400);
    assert.equal((await request(`/api/plans/does-not-exist-${suffix}`, json("PATCH", {
      active: false
    }))).response.status, 404);

    const deactivated = await request(`/api/plans/${ids.conflictingPlan}`, json("PATCH", { active: false }));
    assert.equal(deactivated.response.status, 200);
    assert.equal(deactivated.body.plan.active, false);
    const inactive = await request("/api/plans?status=inactive");
    assert.equal(inactive.body.plans.some((plan) => plan.id === ids.conflictingPlan), true);
    const reactivated = await request(`/api/plans/${ids.conflictingPlan}`, json("PATCH", { active: true }));
    assert.equal(reactivated.response.status, 200);
    assert.equal(reactivated.body.plan.active, true);
  });

  await t.test("prepares isolated students and weekly schedules", async () => {
    for (const studentId of [
      ids.fullStudent,
      ids.proratedStudent,
      ids.replacementStudent,
      ids.snapshotStudent,
      ids.emptyStudent,
      ids.archivedStudent
    ]) {
      await createStudent(studentId);
    }

    await createClass(ids.earlyClass, { weekday: "monday", time: "02:00", title: "Orden temprano" });
    await createClass(ids.lateClass, { weekday: "monday", time: "03:00", title: "Orden tardio" });

    for (const studentId of [ids.fullStudent, ids.proratedStudent, ids.replacementStudent]) {
      await assignClasses(studentId, [ids.earlyClass, ids.lateClass]);
    }
    assert.equal((await request(`/api/students/${ids.archivedStudent}`, { method: "DELETE" })).response.status, 204);
  });

  await t.test("validates assignment parameters and domain conflicts", async () => {
    assert.equal((await request("/api/plan-assignments")).response.status, 400);
    assert.equal((await request(`/api/plan-assignments?month=${futureMonth}&month=${futureMonth}`)).response.status, 400);
    assert.equal((await request("/api/plan-assignments?month=2099-13")).response.status, 400);
    assert.equal((await getAssignments(futureMonth, `missing-student-${suffix}`)).response.status, 404);

    assert.equal((await putPlan(ids.fullStudent, "bad-month", { planId: plan4.id, mode: "full" })).response.status, 400);
    assert.equal((await putPlan(ids.fullStudent, futureMonth, { planId: plan4.id, mode: "unknown" })).response.status, 400);
    assert.equal((await putPlan(ids.fullStudent, futureMonth, { planId: plan4.id, mode: "prorated" })).response.status, 400);
    assert.equal((await putPlan(ids.fullStudent, futureMonth, {
      planId: plan4.id, mode: "prorated", effectiveFrom: "2099-07-31"
    })).response.status, 400);
    assert.equal((await putPlan(`missing-student-${suffix}`, futureMonth, {
      planId: plan4.id, mode: "full"
    })).response.status, 404);
    assert.equal((await putPlan(ids.fullStudent, futureMonth, {
      planId: `missing-plan-${suffix}`, mode: "full"
    })).response.status, 404);

    const inactive = await request(`/api/plans/${ids.conflictingPlan}`, json("PATCH", { active: false }));
    assert.equal(inactive.response.status, 200);
    assert.equal((await putPlan(ids.fullStudent, futureMonth, {
      planId: ids.conflictingPlan, mode: "full"
    })).response.status, 409);
    assert.equal((await putPlan(ids.archivedStudent, futureMonth, {
      planId: plan4.id, mode: "full"
    })).response.status, 409);
    assert.equal((await putPlan(ids.emptyStudent, futureMonth, {
      planId: plan4.id, mode: "full"
    })).response.status, 409);
  });

  await t.test("builds a full pool between the first and last business day with extras excluded", async () => {
    const result = await putPlan(ids.fullStudent, futureMonth, { planId: plan4.id, mode: "full" });
    assert.equal(result.response.status, 200, result.body?.error);
    const assignment = result.body.assignment;

    assert.equal(assignment.studentId, ids.fullStudent);
    assert.equal(assignment.month, futureMonth);
    assert.equal(assignment.planId, plan4.id);
    assert.equal(assignment.mode, "full");
    assert.equal(assignment.periodStart, "2099-08-03");
    assert.equal(assignment.periodEnd, "2099-08-31");
    assert.equal(assignment.effectiveFrom, "2099-08-03");
    assert.equal(assignment.classLimit, 4);
    assert.equal(assignment.scheduledCount, 10);
    assert.equal(assignment.sessions.length, 10);
    assert.equal(assignment.sessions.filter((session) => session.included).length, 4);
    assert.equal(assignment.sessions.filter((session) => !session.included).length, 6);
    assert.equal(assignment.usedCount, 0);
    assert.equal(assignment.presentCount, 0);
    assert.equal(assignment.absentCount, 0);
    assert.equal(assignment.remainingCount, 4);
    assert.equal(assignment.sessions[0].date, "2099-08-03");
    assert.equal(assignment.sessions.at(-1).date, "2099-08-31");
    assert.deepEqual(assignment.sessions.slice(0, 2).map((session) => session.classId), [
      ids.earlyClass,
      ids.lateClass
    ]);
    expectSessionOrder(assignment.sessions);
  });

  await t.test("keeps a future attendance mark programmed until its date arrives", async () => {
    const marked = await request(`/api/classes/${ids.earlyClass}/attendance`, json("POST", {
      date: "2099-08-03",
      attendance: [{ studentId: ids.fullStudent, status: "present" }]
    }));
    assert.equal(marked.response.status, 200, marked.body?.error);

    const progress = await getAssignments(futureMonth, ids.fullStudent);
    assert.equal(progress.response.status, 200);
    const assignment = progress.body.assignments[0];
    assert.equal(assignment.sessions.find((session) =>
      session.classId === ids.earlyClass && session.date === "2099-08-03"
    )?.status, "present");
    assert.equal(assignment.usedCount, 0);
    assert.equal(assignment.presentCount, 0);
    assert.equal(assignment.remainingCount, 4);
  });

  await t.test("retires a class referenced by a monthly snapshot without deleting that history", async () => {
    await createClass(ids.snapshotClass, {
      weekday: "tuesday",
      time: "04:00",
      title: "Clase preservada por snapshot"
    });
    await assignClasses(ids.snapshotStudent, [ids.snapshotClass]);
    const assigned = await putPlan(ids.snapshotStudent, futureMonth, {
      planId: plan4.id,
      mode: "full"
    });
    assert.equal(assigned.response.status, 200, assigned.body?.error);
    assert.equal(assigned.body.assignment.sessions.some((session) =>
      session.classId === ids.snapshotClass
    ), true);

    const removed = await request(`/api/classes/${ids.snapshotClass}`, { method: "DELETE" });
    assert.equal(removed.response.status, 204, removed.body?.error);

    const historical = await getAssignments(futureMonth, ids.snapshotStudent);
    assert.equal(historical.response.status, 200);
    assert.equal(historical.body.assignments[0].sessions.some((session) =>
      session.classId === ids.snapshotClass
    ), true);

    const agenda = await request("/api/classes?weekStart=2099-08-03");
    assert.equal(agenda.response.status, 200);
    assert.equal(agenda.body.sessions.some((session) => session.id === ids.snapshotClass), false);
  });

  await t.test("calculates a proportional pool from real remaining sessions", async () => {
    const result = await putPlan(ids.proratedStudent, futureMonth, {
      planId: plan8.id,
      mode: "prorated",
      effectiveFrom: "2099-08-17"
    });
    assert.equal(result.response.status, 200, result.body?.error);
    const assignment = result.body.assignment;
    assert.equal(assignment.effectiveFrom, "2099-08-17");
    assert.equal(assignment.classLimit, 6);
    assert.equal(assignment.scheduledCount, 6);
    assert.equal(assignment.sessions.length, 6);
    assert.equal(assignment.sessions.every((session) => session.included), true);
    assert.equal(assignment.sessions[0].date, "2099-08-17");
    assert.equal(assignment.sessions.at(-1).date, "2099-08-31");
    expectSessionOrder(assignment.sessions);
  });

  await t.test("keeps one assignment per student and month and supports GET filters", async () => {
    const first = await putPlan(ids.replacementStudent, futureMonth, { planId: plan4.id, mode: "full" });
    assert.equal(first.response.status, 200);
    const replaced = await putPlan(ids.replacementStudent, futureMonth, { planId: plan8.id, mode: "full" });
    assert.equal(replaced.response.status, 200);
    assert.equal(replaced.body.assignment.planId, plan8.id);

    const filtered = await getAssignments(futureMonth, ids.replacementStudent);
    assert.equal(filtered.response.status, 200);
    assert.equal(filtered.body.assignments.length, 1);
    assert.equal(filtered.body.assignments[0].studentId, ids.replacementStudent);
    assert.equal(filtered.body.assignments[0].planId, plan8.id);

    const month = await getAssignments(futureMonth);
    assert.equal(month.response.status, 200);
    assert.equal(month.body.assignments.filter((item) => item.studentId === ids.replacementStudent).length, 1);
    assert.equal(month.body.assignments.some((item) => item.studentId === ids.fullStudent), true);
    assert.equal(month.body.assignments.some((item) => item.studentId === ids.proratedStudent), true);
  });

  await t.test("preserves assignment snapshots when the catalog changes", async () => {
    const assigned = await putPlan(ids.replacementStudent, futureMonth, {
      planId: ids.customPlan,
      mode: "full"
    });
    assert.equal(assigned.response.status, 200);
    assert.equal(assigned.body.assignment.planName, `Plan personalizado ${suffix}`);
    assert.equal(assigned.body.assignment.planDescription, "Snapshot original");
    assert.equal(assigned.body.assignment.classLimit, 3);

    const changed = await request(`/api/plans/${ids.customPlan}`, json("PATCH", {
      name: `Plan modificado ${suffix}`,
      description: "Catalogo modificado",
      classLimit: 7
    }));
    assert.equal(changed.response.status, 200);

    const historical = await getAssignments(futureMonth, ids.replacementStudent);
    assert.equal(historical.response.status, 200);
    assert.equal(historical.body.assignments[0].planName, `Plan personalizado ${suffix}`);
    assert.equal(historical.body.assignments[0].planDescription, "Snapshot original");
    assert.equal(historical.body.assignments[0].classLimit, 3);
  });

  await t.test("counts present and absent but not unmarked, and protects attended history", {
    skip: !todaySupportsClasses ? "the current calendar day is a weekend and weekly classes only support Monday-Friday" : false
  }, async () => {
    await createStudent(ids.usageStudent);
    await createClass(ids.usagePresentClass, { weekday: todayWeekday, time: "00:00", title: "Uso presente" });
    await createClass(ids.usageAbsentClass, { weekday: todayWeekday, time: "00:30", title: "Uso ausente" });
    await createClass(ids.usageUnmarkedClass, { weekday: todayWeekday, time: "01:00", title: "Uso sin marcar" });
    await assignClasses(ids.usageStudent, [
      ids.usagePresentClass,
      ids.usageAbsentClass,
      ids.usageUnmarkedClass
    ]);

    const assigned = await putPlan(ids.usageStudent, currentMonth, { planId: plan4.id, mode: "full" });
    assert.equal(assigned.response.status, 200, assigned.body?.error);
    assert.equal(assigned.body.assignment.sessions.some((session) =>
      session.date === today && session.classId === ids.usagePresentClass && session.included
    ), true);

    const present = await request(`/api/classes/${ids.usagePresentClass}/attendance`, json("POST", {
      date: today,
      attendance: [{ studentId: ids.usageStudent, status: "present" }]
    }));
    assert.equal(present.response.status, 200, present.body?.error);
    const absent = await request(`/api/classes/${ids.usageAbsentClass}/attendance`, json("POST", {
      date: today,
      attendance: [{ studentId: ids.usageStudent, status: "absent" }]
    }));
    assert.equal(absent.response.status, 200, absent.body?.error);
    const unmarkedRejected = await request(`/api/classes/${ids.usageUnmarkedClass}/attendance`, json("POST", {
      date: today,
      attendance: [{ studentId: ids.usageStudent, status: "unmarked" }]
    }));
    assert.equal(unmarkedRejected.response.status, 400);

    const progress = await getAssignments(currentMonth, ids.usageStudent);
    assert.equal(progress.response.status, 200);
    const assignment = progress.body.assignments[0];
    assert.equal(assignment.usedCount, 2);
    assert.equal(assignment.presentCount, 1);
    assert.equal(assignment.absentCount, 1);
    assert.equal(assignment.remainingCount, 2);
    assert.equal(assignment.sessions.find((session) => session.classId === ids.usageUnmarkedClass)?.status, "unmarked");

    const replacement = await putPlan(ids.usageStudent, currentMonth, { planId: plan8.id, mode: "full" });
    assert.equal(replacement.response.status, 409);
    const unchanged = await getAssignments(currentMonth, ids.usageStudent);
    assert.equal(unchanged.body.assignments[0].planId, plan4.id);
    assert.equal(unchanged.body.assignments[0].usedCount, 2);
  });
});
