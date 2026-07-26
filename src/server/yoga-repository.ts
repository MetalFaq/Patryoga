import type { PoolClient } from "pg";
import { getPool } from "@/lib/db";
import type {
  AttendanceEntry,
  AttendanceStatus,
  ClassSession,
  Student,
  Weekday
} from "@/lib/types";

type SessionRow = {
  id: string;
  title: string;
  weekday: Weekday;
  time: string;
  duration_minutes: number;
  teacher: string;
  room: string;
  capacity: number;
  date: string;
  student_id: string | null;
  student_name: string | null;
  student_phone: string | null;
  student_notes: string | null;
  attendance_status: AttendanceStatus | null;
};

type StudentRow = {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  active: boolean;
};

export class ClassNotFoundError extends Error {}

export class StudentNotAssignedError extends Error {}

function rowsToSessions(rows: SessionRow[]): ClassSession[] {
  const sessions = new Map<string, ClassSession>();

  for (const row of rows) {
    let session = sessions.get(row.id);

    if (!session) {
      session = {
        id: row.id,
        title: row.title,
        weekday: row.weekday,
        time: row.time,
        durationMinutes: row.duration_minutes,
        teacher: row.teacher,
        room: row.room,
        capacity: row.capacity,
        studentIds: [],
        date: row.date,
        students: []
      };
      sessions.set(row.id, session);
    }

    if (
      row.student_id !== null &&
      row.student_name !== null &&
      row.student_phone !== null
    ) {
      session.studentIds.push(row.student_id);
      session.students.push({
        id: row.student_id,
        name: row.student_name,
        phone: row.student_phone,
        ...(row.student_notes !== null ? { notes: row.student_notes } : {}),
        status: row.attendance_status ?? "unmarked"
      });
    }
  }

  return [...sessions.values()];
}

const sessionColumns = `
  session.id,
  session.title,
  session.weekday,
  to_char(session.start_time, 'HH24:MI') AS time,
  session.duration_minutes,
  session.teacher,
  session.room,
  session.capacity,
  to_char(session.session_date, 'YYYY-MM-DD') AS date,
  student.id AS student_id,
  student.full_name AS student_name,
  student.phone AS student_phone,
  student.notes AS student_notes,
  attendance.status::text AS attendance_status
`;

export type StudentListStatus = "active" | "archived";

export async function listStudents(status: StudentListStatus = "active"): Promise<Student[]> {
  const result = await getPool().query<StudentRow>(`
    SELECT id, full_name AS name, phone, notes, active
    FROM students
    WHERE active = $1
    ORDER BY full_name, id
  `, [status === "active"]);

  return result.rows.map((student) => ({
    id: student.id,
    name: student.name,
    phone: student.phone,
    ...(student.notes !== null ? { notes: student.notes } : {})
  }));
}

export class StudentNotFoundError extends Error {}
export class ClassInactiveError extends Error {}
export class CapacityExceededError extends Error {}

export class ClassScheduleConflictError extends Error {
  constructor(
    readonly conflict: { id: string; title: string; weekday: Weekday; time: string }
  ) {
    super(
      `class schedule overlaps with "${conflict.title}" (${conflict.id}) on ${conflict.weekday} at ${conflict.time}`
    );
  }
}

export const DEFAULT_TEACHER = "Patricia";
export const DEFAULT_ROOM = "Sala unica";

export type StudentInput = { name: string; phone: string; notes?: string };
export type ClassInput = {
  title: string;
  weekday: Weekday;
  time: string;
  durationMinutes: number;
  capacity: number;
};

export async function createStudent(id: string, input: StudentInput): Promise<Student> {
  const result = await getPool().query<StudentRow>(`
    INSERT INTO students (id, full_name, phone, notes)
    VALUES ($1, $2, $3, $4)
    RETURNING id, full_name AS name, phone, notes, active
  `, [id, input.name, input.phone, input.notes ?? null]);
  const student = result.rows[0];
  return { id: student.id, name: student.name, phone: student.phone,
    ...(student.notes !== null ? { notes: student.notes } : {}) };
}

export async function updateStudent(
  studentId: string,
  input: Partial<StudentInput>,
  reactivate = false
): Promise<Student> {
  const result = await getPool().query<StudentRow>(`
    UPDATE students
    SET full_name = COALESCE($2, full_name),
        phone = COALESCE($3, phone),
        notes = CASE WHEN $4::boolean THEN $5 ELSE notes END,
        active = CASE WHEN $6::boolean THEN true ELSE active END
    WHERE id = $1
    RETURNING id, full_name AS name, phone, notes, active
  `, [studentId, input.name ?? null, input.phone ?? null, Object.hasOwn(input, "notes"), input.notes ?? null, reactivate]);
  if (!result.rows[0]) throw new StudentNotFoundError();
  const student = result.rows[0];
  return { id: student.id, name: student.name, phone: student.phone,
    ...(student.notes !== null ? { notes: student.notes } : {}) };
}

export async function archiveStudent(studentId: string): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("UPDATE students SET active = false WHERE id = $1", [studentId]);
    if (result.rowCount === 0) throw new StudentNotFoundError();
    await client.query(`
      DELETE FROM class_enrollments
      WHERE student_id = $1
        AND active_until IS NULL
        AND active_from > CURRENT_DATE
    `, [studentId]);
    await client.query(`
      UPDATE class_enrollments
      SET active_until = CURRENT_DATE
      WHERE student_id = $1
        AND active_until IS NULL
        AND active_from <= CURRENT_DATE
    `, [studentId]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

async function lockSchedule(client: PoolClient): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock($1, $2)", [781247, 1]);
}

async function assertNoScheduleConflict(
  client: PoolClient,
  input: Pick<ClassInput, "weekday" | "time" | "durationMinutes">,
  excludedClassId?: string
): Promise<void> {
  const [hours, minutes] = input.time.split(":").map(Number);
  const startMinutes = hours * 60 + minutes;
  const endMinutes = startMinutes + input.durationMinutes;
  const result = await client.query<{
    id: string;
    title: string;
    weekday: Weekday;
    time: string;
  }>(`
    SELECT id, title, weekday, to_char(start_time, 'HH24:MI') AS time
    FROM weekly_classes
    WHERE active
      AND weekday = $1
      AND ($2::text IS NULL OR id <> $2)
      AND (
        EXTRACT(HOUR FROM start_time)::integer * 60
        + EXTRACT(MINUTE FROM start_time)::integer
      ) < $4
      AND $3 < (
        EXTRACT(HOUR FROM start_time)::integer * 60
        + EXTRACT(MINUTE FROM start_time)::integer
        + duration_minutes
      )
    ORDER BY start_time, id
    LIMIT 1
  `, [input.weekday, excludedClassId ?? null, startMinutes, endMinutes]);

  if (result.rows[0]) {
    throw new ClassScheduleConflictError(result.rows[0]);
  }
}

export async function createClass(id: string, input: ClassInput): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await lockSchedule(client);
    await assertNoScheduleConflict(client, input);
    await client.query(`
      INSERT INTO weekly_classes (
        id, title, weekday, start_time, duration_minutes, teacher, room, capacity
      ) VALUES ($1, $2, $3, $4::time, $5, $6, $7, $8)
    `, [
      id,
      input.title,
      input.weekday,
      input.time,
      input.durationMinutes,
      DEFAULT_TEACHER,
      DEFAULT_ROOM,
      input.capacity
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateClass(classId: string, input: Partial<ClassInput>): Promise<void> {
  const fields: Array<[string, unknown]> = [
    ["title", input.title], ["weekday", input.weekday], ["start_time", input.time],
    ["duration_minutes", input.durationMinutes], ["capacity", input.capacity]
  ];
  const set: string[] = []; const values: unknown[] = [classId];
  for (const [field, value] of fields) if (value !== undefined) { values.push(value); set.push(`${field} = $${values.length}${field === "start_time" ? "::time" : ""}`); }
  if (set.length === 0) throw new Error("no fields");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await lockSchedule(client);
    const current = await client.query<{
      title: string;
      weekday: Weekday;
      time: string;
      duration_minutes: number;
      capacity: number;
      active: boolean;
    }>(`
      SELECT title, weekday, to_char(start_time, 'HH24:MI') AS time,
             duration_minutes, capacity, active
      FROM weekly_classes
      WHERE id = $1
      FOR UPDATE
    `, [classId]);
    if (!current.rows[0]) throw new ClassNotFoundError();
    const existing = current.rows[0];
    if (existing.active) {
      await assertNoScheduleConflict(client, {
        weekday: input.weekday ?? existing.weekday,
        time: input.time ?? existing.time,
        durationMinutes: input.durationMinutes ?? existing.duration_minutes
      }, classId);
    }
    if (input.capacity !== undefined) {
      const assigned = await client.query<{ count: string }>("SELECT count(*) FROM class_enrollments WHERE class_id = $1 AND active_until IS NULL", [classId]);
      if (Number(assigned.rows[0].count) > input.capacity) throw new CapacityExceededError();
    }
    await client.query(`UPDATE weekly_classes SET ${set.join(", ")} WHERE id = $1`, values);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function deleteClass(classId: string): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await lockSchedule(client);
    const classResult = await client.query<{ id: string }>(
      "SELECT id FROM weekly_classes WHERE id = $1 FOR UPDATE",
      [classId]
    );
    if (!classResult.rows[0]) throw new ClassNotFoundError();

    const history = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM attendance_records WHERE class_id = $1
      ) AS exists
    `, [classId]);

    if (history.rows[0]?.exists) {
      await client.query("UPDATE weekly_classes SET active = false WHERE id = $1", [classId]);
      await client.query(`
        DELETE FROM class_enrollments
        WHERE class_id = $1
          AND active_until IS NULL
          AND active_from > CURRENT_DATE
      `, [classId]);
      await client.query(`
        UPDATE class_enrollments
        SET active_until = CURRENT_DATE
        WHERE class_id = $1
          AND active_until IS NULL
          AND active_from <= CURRENT_DATE
      `, [classId]);
    } else {
      await client.query("DELETE FROM class_enrollments WHERE class_id = $1", [classId]);
      await client.query("DELETE FROM weekly_classes WHERE id = $1", [classId]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setStudentClasses(studentId: string, classIds: string[], assign: boolean): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const student = await client.query<{ active: boolean }>("SELECT active FROM students WHERE id = $1 FOR SHARE", [studentId]);
    if (!student.rows[0]) throw new StudentNotFoundError();
    if (assign && !student.rows[0].active) throw new StudentNotFoundError();
    for (const classId of classIds) {
      const classResult = await client.query<{ capacity: number; active: boolean }>("SELECT capacity, active FROM weekly_classes WHERE id = $1 FOR UPDATE", [classId]);
      if (!classResult.rows[0]) throw new ClassNotFoundError();
      if (assign && !classResult.rows[0].active) throw new ClassInactiveError();
      if (assign) {
        const existing = await client.query<{ active_from: string }>(
          `SELECT active_from
           FROM class_enrollments
           WHERE class_id = $1 AND student_id = $2 AND active_until IS NULL
           FOR UPDATE`,
          [classId, studentId]
        );
        if (existing.rowCount) continue;
        else {
          const count = await client.query<{ count: string }>("SELECT count(*) FROM class_enrollments WHERE class_id = $1 AND active_until IS NULL", [classId]);
          if (Number(count.rows[0].count) >= classResult.rows[0].capacity) throw new CapacityExceededError();
          const position = await client.query<{ position: number }>("SELECT COALESCE(MAX(position), 0) + 1 AS position FROM class_enrollments WHERE class_id = $1", [classId]);
          const validity = await client.query<{ active_from: string }>(`
            SELECT CASE
              WHEN EXISTS (
                SELECT 1
                FROM class_enrollments
                WHERE class_id = $1
                  AND student_id = $2
                  AND active_from = CURRENT_DATE
              ) THEN CURRENT_DATE + 1
              ELSE CURRENT_DATE
            END AS active_from
          `, [classId, studentId]);
          await client.query(`
            INSERT INTO class_enrollments (
              class_id, student_id, active_from, position
            ) VALUES ($1, $2, $3, $4)
          `, [classId, studentId, validity.rows[0].active_from, position.rows[0].position]);
        }
      } else {
        await client.query(`
          DELETE FROM class_enrollments
          WHERE class_id = $1
            AND student_id = $2
            AND active_until IS NULL
            AND active_from > CURRENT_DATE
        `, [classId, studentId]);
        await client.query(`
          UPDATE class_enrollments
          SET active_until = CURRENT_DATE
          WHERE class_id = $1
            AND student_id = $2
            AND active_until IS NULL
            AND active_from <= CURRENT_DATE
        `, [classId, studentId]);
      }
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function listWeekSessions(weekStart = "2026-07-20"): Promise<ClassSession[]> {
  const result = await getPool().query<SessionRow>(`
    WITH session AS (
      SELECT
        weekly_class.*,
        (
          $1::date + CASE weekly_class.weekday
            WHEN 'monday' THEN 0
            WHEN 'tuesday' THEN 1
            WHEN 'wednesday' THEN 2
            WHEN 'thursday' THEN 3
            WHEN 'friday' THEN 4
          END
        )::date AS session_date
      FROM weekly_classes AS weekly_class
      WHERE weekly_class.active
    )
    SELECT ${sessionColumns}
    FROM session
    LEFT JOIN LATERAL (
      SELECT DISTINCT ON (candidate.student_id) candidate.*
      FROM class_enrollments AS candidate
      WHERE candidate.class_id = session.id
        AND candidate.active_from <= session.session_date
        AND (candidate.active_until IS NULL OR candidate.active_until >= session.session_date)
      ORDER BY candidate.student_id, candidate.active_from DESC
    ) AS enrollment ON true
    LEFT JOIN students AS student ON student.id = enrollment.student_id
    LEFT JOIN attendance_records AS attendance
      ON attendance.class_id = session.id
      AND attendance.student_id = enrollment.student_id
      AND attendance.session_date = session.session_date
    ORDER BY session.session_date, session.start_time, session.id, enrollment.position
  `, [weekStart]);

  return rowsToSessions(result.rows);
}

export async function getClassSession(
  classId: string,
  date: string
): Promise<ClassSession | undefined> {
  const result = await getPool().query<SessionRow>(`
    WITH session AS (
      SELECT weekly_class.*, $2::date AS session_date
      FROM weekly_classes AS weekly_class
      WHERE weekly_class.id = $1
    )
    SELECT ${sessionColumns}
    FROM session
    LEFT JOIN LATERAL (
      SELECT DISTINCT ON (candidate.student_id) candidate.*
      FROM class_enrollments AS candidate
      WHERE candidate.class_id = session.id
        AND candidate.active_from <= session.session_date
        AND (candidate.active_until IS NULL OR candidate.active_until >= session.session_date)
      ORDER BY candidate.student_id, candidate.active_from DESC
    ) AS enrollment ON true
    LEFT JOIN students AS student ON student.id = enrollment.student_id
    LEFT JOIN attendance_records AS attendance
      ON attendance.class_id = session.id
      AND attendance.student_id = enrollment.student_id
      AND attendance.session_date = session.session_date
    ORDER BY enrollment.position
  `, [classId, date]);

  return rowsToSessions(result.rows)[0];
}

export async function classExists(classId: string): Promise<boolean> {
  const result = await getPool().query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM weekly_classes WHERE id = $1
    ) AS exists
  `, [classId]);

  return result.rows[0]?.exists ?? false;
}

async function lockClass(client: PoolClient, classId: string): Promise<void> {
  const result = await client.query<{ id: string }>(`
    SELECT id
    FROM weekly_classes
    WHERE id = $1
    FOR SHARE
  `, [classId]);

  if (result.rowCount === 0) {
    throw new ClassNotFoundError();
  }
}

export async function saveAttendanceEntries(
  classId: string,
  date: string,
  entries: Array<{ studentId: string; status: AttendanceStatus }>
): Promise<AttendanceEntry[]> {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await lockClass(client, classId);

    if (entries.length > 0) {
      const studentIds = entries.map((entry) => entry.studentId);
      const enrollmentResult = await client.query<{ student_id: string }>(`
        SELECT student_id
        FROM class_enrollments
        WHERE class_id = $1
          AND student_id = ANY($2::text[])
          AND active_from <= $3::date
          AND (active_until IS NULL OR active_until >= $3::date)
        FOR SHARE
      `, [classId, studentIds, date]);

      const assignedStudentIds = new Set(enrollmentResult.rows.map((row) => row.student_id));

      if (studentIds.some((studentId) => !assignedStudentIds.has(studentId))) {
        throw new StudentNotAssignedError();
      }

      await client.query(`
        INSERT INTO attendance_records (class_id, student_id, session_date, status)
        SELECT $1, input.student_id, $2::date, input.status::attendance_status
        FROM unnest($3::text[], $4::text[]) AS input(student_id, status)
        ON CONFLICT (class_id, student_id, session_date) DO UPDATE SET
          status = EXCLUDED.status,
          marked_at = now()
      `, [
        classId,
        date,
        studentIds,
        entries.map((entry) => entry.status)
      ]);
    }

    await client.query("COMMIT");

    return entries.map((entry) => ({
      classId,
      studentId: entry.studentId,
      date,
      status: entry.status
    }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
