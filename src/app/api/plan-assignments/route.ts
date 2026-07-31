import { NextResponse } from "next/server";
import {
  isIsoMonth,
  listPlanAssignments,
  PlanAssignmentStudentNotFoundError
} from "@/server/plans-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const months = params.getAll("month");
  const studentIds = params.getAll("studentId");
  if (
    [...params.keys()].some((key) => key !== "month" && key !== "studentId") ||
    months.length !== 1 || !isIsoMonth(months[0]) ||
    studentIds.length > 1 ||
    (studentIds[0] !== undefined && !studentIds[0].trim())
  ) {
    return NextResponse.json({ error: "month and parameters are invalid" }, { status: 400 });
  }
  try {
    const assignments = await listPlanAssignments(months[0], studentIds[0]);
    return NextResponse.json({ dataSource: "runtime", assignments });
  } catch (error) {
    if (error instanceof PlanAssignmentStudentNotFoundError) {
      return NextResponse.json({ error: "student not found" }, { status: 404 });
    }
    throw error;
  }
}
