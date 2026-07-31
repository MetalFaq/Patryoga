import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/db";
import type {
  AttendanceStatus,
  MembershipPlan,
  MonthlyPlanAssignment,
  PlanAssignmentMode,
  Weekday
} from "@/lib/types";

export type PlanListStatus = "active" | "inactive" | "all";

export type PlanInput = {
  name: string;
  classLimit: number;
  description?: string;
};

type PlanRow = {
  id: string;
  name: string;
  class_limit: number;
  description: string | null;
  active: boolean;
};

type AssignmentRow = {
  id: string;
  student_id: string;
  month: string;
  plan_id: string;
  plan_name: string;
  plan_description: string | null;
  mode: PlanAssignmentMode;
  effective_from: string;
  period_start: string;
  period_end: string;
  class_limit: number;
};

type AssignmentSessionRow = {
  assignment_id: string;
  class_id: string;
  date: string;
  position: number;
  included: boolean;
  status: AttendanceStatus | null;
  occurred: boolean;
};

type SessionCandidateRow = {
  class_id: string;
  class_title: string;
  weekday: Weekday;
  time: string;
  date: string;
};

export class PlanNotFoundError extends Error {}
export class PlanInactiveError extends Error {}
export class PlanAssignmentStudentNotFoundError extends Error {}
export class PlanAssignmentStudentInactiveError extends Error {}
export class NoEligiblePlanSessionsError extends Error {}
export class PlanAssignmentHasAttendanceError extends Error {}

function mapPlan(row: PlanRow): MembershipPlan {
  return {
    id: row.id,
    name: row.name,
    classLimit: row.class_limit,
    ...(row.description !== null ? { description: row.description } : {}),
    active: row.active
  };
}

export function isIsoMonth(value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  const parsed = new Date(`${value}-01T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 7) === value;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getBusinessMonthBounds(month: string): {
  periodStart: string;
  periodEnd: string;
} {
  if (!isIsoMonth(month)) throw new Error("invalid month");
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  while (start.getUTCDay() === 0 || start.getUTCDay() === 6) {
    start.setUTCDate(start.getUTCDate() + 1);
  }
  const end = new Date(Date.UTC(year, monthNumber, 0));
  while (end.getUTCDay() === 0 || end.getUTCDay() === 6) {
    end.setUTCDate(end.getUTCDate() - 1);
  }
  return { periodStart: isoDate(start), periodEnd: isoDate(end) };
}

export async function listPlans(status: PlanListStatus): Promise<MembershipPlan[]> {
  const conditions = status === "all" ? "" : "WHERE active = $1";
  const values = status === "all" ? [] : [status === "active"];
  const result = await getPool().query<PlanRow>(`
    SELECT id, name, class_limit, description, active
    FROM membership_plans
    ${conditions}
    ORDER BY active DESC, class_limit, lower(name), id
  `, values);
  return result.rows.map(mapPlan);
}

export async function createPlan(id: string, input: PlanInput): Promise<MembershipPlan> {
  const result = await getPool().query<PlanRow>(`
    INSERT INTO membership_plans (id, name, class_limit, description)
    VALUES ($1, $2, $3, $4)
    RETURNING id, name, class_limit, description, active
  `, [id, input.name, input.classLimit, input.description ?? null]);
  return mapPlan(result.rows[0]);
}

export async function updatePlan(
  planId: string,
  input: Partial<PlanInput> & { active?: boolean }
): Promise<MembershipPlan> {
  const fields: Array<[string, unknown]> = [
    ["name", input.name],
    ["class_limit", input.classLimit],
    ["description", input.description],
    ["active", input.active]
  ];
  const values: unknown[] = [planId];
  const set: string[] = [];
  for (const [field, value] of fields) {
    if (value !== undefined) {
      values.push(value);
      set.push(`${field} = $${values.length}`);
    }
  }
  const result = await getPool().query<PlanRow>(`
    UPDATE membership_plans
    SET ${set.join(", ")}, updated_at = now()
    WHERE id = $1
    RETURNING id, name, class_limit, description, active
  `, values);
  if (!result.rows[0]) throw new PlanNotFoundError();
  return mapPlan(result.rows[0]);
}

export async function listPlanAssignments(
  month: string,
  studentId?: string
): Promise<MonthlyPlanAssignment[]> {
  if (studentId !== undefined) {
    const student = await getPool().query("SELECT 1 FROM students WHERE id = $1", [studentId]);
    if (student.rowCount === 0) throw new PlanAssignmentStudentNotFoundError();
  }

  const assignmentResult = await getPool().query<AssignmentRow>(`
    SELECT id, student_id, to_char(month, 'YYYY-MM') AS month, plan_id,
           plan_name, plan_description, mode,
           to_char(effective_from, 'YYYY-MM-DD') AS effective_from,
           to_char(period_start, 'YYYY-MM-DD') AS period_start,
           to_char(period_end, 'YYYY-MM-DD') AS period_end,
           class_limit
    FROM monthly_plan_assignments
    WHERE month = $1::date
      AND ($2::text IS NULL OR student_id = $2)
    ORDER BY student_id, id
  `, [`${month}-01`, studentId ?? null]);

  if (assignmentResult.rows.length === 0) return [];
  const ids = assignmentResult.rows.map((assignment) => assignment.id);
  const sessionResult = await getPool().query<AssignmentSessionRow>(`
    SELECT session.assignment_id, session.class_id,
           to_char(session.session_date, 'YYYY-MM-DD') AS date,
           session.position, session.included,
           attendance.status::text AS status,
           session.session_date <= CURRENT_DATE AS occurred
    FROM monthly_plan_sessions AS session
    JOIN monthly_plan_assignments AS assignment ON assignment.id = session.assignment_id
    LEFT JOIN attendance_records AS attendance
      ON attendance.class_id = session.class_id
      AND attendance.student_id = assignment.student_id
      AND attendance.session_date = session.session_date
    WHERE session.assignment_id = ANY($1::text[])
    ORDER BY session.assignment_id, session.position
  `, [ids]);

  const sessionsByAssignment = new Map<string, AssignmentSessionRow[]>();
  for (const session of sessionResult.rows) {
    const sessions = sessionsByAssignment.get(session.assignment_id) ?? [];
    sessions.push(session);
    sessionsByAssignment.set(session.assignment_id, sessions);
  }

  return assignmentResult.rows.map((assignment) => {
    const sessionRows = sessionsByAssignment.get(assignment.id) ?? [];
    const counted = sessionRows.filter(
      (session) => session.included && session.occurred &&
        (session.status === "present" || session.status === "absent")
    );
    const presentCount = counted.filter((session) => session.status === "present").length;
    const absentCount = counted.filter((session) => session.status === "absent").length;
    const usedCount = presentCount + absentCount;
    return {
      id: assignment.id,
      studentId: assignment.student_id,
      month: assignment.month,
      planId: assignment.plan_id,
      planName: assignment.plan_name,
      ...(assignment.plan_description !== null
        ? { planDescription: assignment.plan_description }
        : {}),
      mode: assignment.mode,
      effectiveFrom: assignment.effective_from,
      periodStart: assignment.period_start,
      periodEnd: assignment.period_end,
      classLimit: assignment.class_limit,
      scheduledCount: sessionRows.length,
      usedCount,
      presentCount,
      absentCount,
      remainingCount: Math.max(assignment.class_limit - usedCount, 0),
      sessions: sessionRows.map((session) => ({
        classId: session.class_id,
        date: session.date,
        position: session.position,
        included: session.included,
        status: session.status ?? "unmarked"
      }))
    };
  });
}

export async function putPlanAssignment(
  studentId: string,
  month: string,
  input: { planId: string; mode: PlanAssignmentMode; effectiveFrom?: string }
): Promise<MonthlyPlanAssignment> {
  const { periodStart, periodEnd } = getBusinessMonthBounds(month);
  const effectiveFrom = input.mode === "full" ? periodStart : input.effectiveFrom!;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const student = await client.query<{ active: boolean }>(
      "SELECT active FROM students WHERE id = $1 FOR UPDATE",
      [studentId]
    );
    if (!student.rows[0]) throw new PlanAssignmentStudentNotFoundError();
    if (!student.rows[0].active) throw new PlanAssignmentStudentInactiveError();

    const planResult = await client.query<PlanRow>(`
      SELECT id, name, class_limit, description, active
      FROM membership_plans
      WHERE id = $1
      FOR SHARE
    `, [input.planId]);
    const plan = planResult.rows[0];
    if (!plan) throw new PlanNotFoundError();
    if (!plan.active) throw new PlanInactiveError();

    const existingResult = await client.query<{ id: string }>(`
      SELECT id
      FROM monthly_plan_assignments
      WHERE student_id = $1 AND month = $2::date
      FOR UPDATE
    `, [studentId, `${month}-01`]);
    const existing = existingResult.rows[0];
    if (existing) {
      const attendance = await client.query<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT 1
          FROM monthly_plan_sessions AS session
          JOIN attendance_records AS attendance
            ON attendance.class_id = session.class_id
            AND attendance.student_id = $2
            AND attendance.session_date = session.session_date
          WHERE session.assignment_id = $1
        ) AS exists
      `, [existing.id, studentId]);
      if (attendance.rows[0]?.exists) throw new PlanAssignmentHasAttendanceError();
    }

    const candidates = await client.query<SessionCandidateRow>(`
      SELECT weekly_class.id AS class_id, weekly_class.title AS class_title,
             weekly_class.weekday,
             to_char(weekly_class.start_time, 'HH24:MI') AS time,
             to_char(day.session_date, 'YYYY-MM-DD') AS date
      FROM generate_series($2::date, $3::date, interval '1 day') AS day(session_date)
      JOIN weekly_classes AS weekly_class
        ON weekly_class.weekday = CASE EXTRACT(ISODOW FROM day.session_date)
          WHEN 1 THEN 'monday'
          WHEN 2 THEN 'tuesday'
          WHEN 3 THEN 'wednesday'
          WHEN 4 THEN 'thursday'
          WHEN 5 THEN 'friday'
        END
      WHERE EXISTS (
        SELECT 1
        FROM class_enrollments AS enrollment
        WHERE enrollment.class_id = weekly_class.id
          AND enrollment.student_id = $1
          AND enrollment.active_from <= day.session_date
          AND (enrollment.active_until IS NULL OR enrollment.active_until >= day.session_date)
      )
      ORDER BY day.session_date, weekly_class.start_time, weekly_class.id
    `, [studentId, effectiveFrom, periodEnd]);
    if (candidates.rows.length === 0) throw new NoEligiblePlanSessionsError();

    const classLimit = input.mode === "full"
      ? plan.class_limit
      : Math.min(plan.class_limit, candidates.rows.length);
    const assignmentId = existing?.id ?? `plan-assignment-${randomUUID()}`;
    if (existing) {
      await client.query("DELETE FROM monthly_plan_sessions WHERE assignment_id = $1", [assignmentId]);
      await client.query(`
        UPDATE monthly_plan_assignments
        SET plan_id = $2, plan_name = $3, plan_description = $4,
            mode = $5, effective_from = $6::date,
            period_start = $7::date, period_end = $8::date,
            class_limit = $9, updated_at = now()
        WHERE id = $1
      `, [
        assignmentId,
        plan.id,
        plan.name,
        plan.description,
        input.mode,
        effectiveFrom,
        periodStart,
        periodEnd,
        classLimit
      ]);
    } else {
      await client.query(`
        INSERT INTO monthly_plan_assignments (
          id, student_id, month, plan_id, plan_name, plan_description,
          mode, effective_from, period_start, period_end, class_limit
        ) VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8::date, $9::date, $10::date, $11)
      `, [
        assignmentId,
        studentId,
        `${month}-01`,
        plan.id,
        plan.name,
        plan.description,
        input.mode,
        effectiveFrom,
        periodStart,
        periodEnd,
        classLimit
      ]);
    }

    await client.query(`
      INSERT INTO monthly_plan_sessions (
        assignment_id, class_id, class_title, weekday, start_time,
        session_date, position, included
      )
      SELECT $1, input.class_id, input.class_title, input.weekday,
             input.start_time::time, input.session_date::date,
             input.position, input.included
      FROM unnest(
        $2::text[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::integer[], $8::boolean[]
      ) AS input(
        class_id, class_title, weekday, start_time,
        session_date, position, included
      )
    `, [
      assignmentId,
      candidates.rows.map((session) => session.class_id),
      candidates.rows.map((session) => session.class_title),
      candidates.rows.map((session) => session.weekday),
      candidates.rows.map((session) => session.time),
      candidates.rows.map((session) => session.date),
      candidates.rows.map((_session, index) => index + 1),
      candidates.rows.map((_session, index) => index < classLimit)
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const assignments = await listPlanAssignments(month, studentId);
  const assignment = assignments[0];
  if (!assignment) throw new Error("plan assignment was not persisted");
  return assignment;
}
