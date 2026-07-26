import { NextResponse } from "next/server";
import type { AttendanceStatus } from "@/lib/types";
import { isIsoDate } from "@/server/dates";
import {
  classExists,
  ClassNotFoundError,
  getClassSession,
  saveAttendanceEntries,
  StudentNotAssignedError
} from "@/server/yoga-repository";

type RouteContext = {
  params: Promise<{
    classId: string;
  }>;
};

const attendanceStatuses = new Set<AttendanceStatus>(["present", "absent", "unmarked"]);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext) {
  const { classId } = await context.params;
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  if (!date || !isIsoDate(date)) {
    return NextResponse.json({ error: "date must use YYYY-MM-DD format" }, { status: 400 });
  }

  const session = await getClassSession(classId, date);

  if (!session) {
    return NextResponse.json({ error: "class not found" }, { status: 404 });
  }

  return NextResponse.json({
    dataSource: "runtime",
    session
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { classId } = await context.params;

  if (!(await classExists(classId))) {
    return NextResponse.json({ error: "class not found" }, { status: 404 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "request body must be valid JSON" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "request body must be an object" }, { status: 400 });
  }

  const candidate = payload as {
    date?: unknown;
    attendance?: unknown;
  };

  if (typeof candidate.date !== "string" || !isIsoDate(candidate.date) || !Array.isArray(candidate.attendance)) {
    return NextResponse.json({ error: "date and attendance are required" }, { status: 400 });
  }

  const seenStudentIds = new Set<string>();
  const entries: Array<{ studentId: string; status: AttendanceStatus }> = [];

  for (const entry of candidate.attendance) {
    if (!entry || typeof entry !== "object") {
      return NextResponse.json({ error: "each attendance entry must be an object" }, { status: 400 });
    }

    const { studentId, status } = entry as { studentId?: unknown; status?: unknown };

    if (typeof studentId !== "string") {
      return NextResponse.json({ error: "attendance contains a student outside this class" }, { status: 400 });
    }

    if (typeof status !== "string" || !attendanceStatuses.has(status as AttendanceStatus)) {
      return NextResponse.json({ error: "attendance contains an invalid status" }, { status: 400 });
    }

    if (seenStudentIds.has(studentId)) {
      return NextResponse.json({ error: "attendance contains duplicate students" }, { status: 400 });
    }

    seenStudentIds.add(studentId);
    entries.push({ studentId, status: status as AttendanceStatus });
  }

  let saved;

  try {
    saved = await saveAttendanceEntries(classId, candidate.date, entries);
  } catch (error) {
    if (error instanceof ClassNotFoundError) {
      return NextResponse.json({ error: "class not found" }, { status: 404 });
    }

    if (error instanceof StudentNotAssignedError) {
      return NextResponse.json({ error: "attendance contains a student outside this class" }, { status: 400 });
    }

    throw error;
  }

  return NextResponse.json({
    dataSource: "runtime",
    message: "Attendance saved",
    saved
  });
}
