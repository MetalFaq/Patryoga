import { NextResponse } from "next/server";
import { getClassSession, saveAttendanceEntries, weeklyClasses } from "@/lib/mock-data";
import type { AttendanceStatus } from "@/lib/types";

type RouteContext = {
  params: Promise<{
    classId: string;
  }>;
};

const attendanceStatuses = new Set<AttendanceStatus>(["present", "absent", "unmarked"]);

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function getWeeklyClass(classId: string) {
  return weeklyClasses.find((item) => item.id === classId);
}

export async function GET(request: Request, context: RouteContext) {
  const { classId } = await context.params;
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  if (!date || !isIsoDate(date)) {
    return NextResponse.json({ error: "date must use YYYY-MM-DD format" }, { status: 400 });
  }

  const session = getClassSession(classId, date);

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
  const weeklyClass = getWeeklyClass(classId);

  if (!weeklyClass) {
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

  const validStudentIds = new Set(weeklyClass.studentIds);
  const seenStudentIds = new Set<string>();
  const entries: Array<{ studentId: string; status: AttendanceStatus }> = [];

  for (const entry of candidate.attendance) {
    if (!entry || typeof entry !== "object") {
      return NextResponse.json({ error: "each attendance entry must be an object" }, { status: 400 });
    }

    const { studentId, status } = entry as { studentId?: unknown; status?: unknown };

    if (typeof studentId !== "string" || !validStudentIds.has(studentId)) {
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

  const saved = saveAttendanceEntries(classId, candidate.date, entries);

  return NextResponse.json({
    dataSource: "runtime",
    message: "Attendance saved",
    saved
  });
}
