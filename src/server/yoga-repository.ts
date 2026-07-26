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

export async function listStudents(): Promise<Student[]> {
  const result = await getPool().query<StudentRow>(`
    SELECT id, full_name AS name, phone, notes
    FROM students
    ORDER BY full_name, id
  `);

  return result.rows.map((student) => ({
    id: student.id,
    name: student.name,
    phone: student.phone,
    ...(student.notes !== null ? { notes: student.notes } : {})
  }));
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
            WHEN 'saturday' THEN 5
          END
        )::date AS session_date
      FROM weekly_classes AS weekly_class
      WHERE weekly_class.active
    )
    SELECT ${sessionColumns}
    FROM session
    LEFT JOIN class_enrollments AS enrollment
      ON enrollment.class_id = session.id
      AND enrollment.active_from <= session.session_date
      AND (enrollment.active_until IS NULL OR enrollment.active_until >= session.session_date)
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
    LEFT JOIN class_enrollments AS enrollment
      ON enrollment.class_id = session.id
      AND enrollment.active_from <= session.session_date
      AND (enrollment.active_until IS NULL OR enrollment.active_until >= session.session_date)
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
