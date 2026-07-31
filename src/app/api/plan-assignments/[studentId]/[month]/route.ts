import { NextResponse } from "next/server";
import type { PlanAssignmentMode } from "@/lib/types";
import { isIsoDate } from "@/server/dates";
import {
  getBusinessMonthBounds,
  isIsoMonth,
  NoEligiblePlanSessionsError,
  PlanAssignmentHasAttendanceError,
  PlanAssignmentStudentInactiveError,
  PlanAssignmentStudentNotFoundError,
  PlanInactiveError,
  PlanNotFoundError,
  putPlanAssignment
} from "@/server/plans-repository";

type Context = { params: Promise<{ studentId: string; month: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(request: Request, context: Context) {
  const { studentId, month } = await context.params;
  if (!studentId.trim() || !isIsoMonth(month)) {
    return NextResponse.json({ error: "student and month are invalid" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "request body must be valid JSON" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "request body must be an object" }, { status: 400 });
  }
  const body = payload as Record<string, unknown>;
  const mode = body.mode as PlanAssignmentMode;
  if (
    typeof body.planId !== "string" || !body.planId.trim() ||
    (mode !== "full" && mode !== "prorated") ||
    (mode === "full" && body.effectiveFrom !== undefined) ||
    (mode === "prorated" && (
      typeof body.effectiveFrom !== "string" || !isIsoDate(body.effectiveFrom)
    ))
  ) {
    return NextResponse.json({ error: "invalid plan assignment fields" }, { status: 400 });
  }

  if (mode === "prorated") {
    const { periodStart, periodEnd } = getBusinessMonthBounds(month);
    const effectiveFrom = body.effectiveFrom as string;
    if (
      !effectiveFrom.startsWith(`${month}-`) ||
      effectiveFrom < periodStart || effectiveFrom > periodEnd
    ) {
      return NextResponse.json(
        { error: "effectiveFrom must belong to the plan business period" },
        { status: 400 }
      );
    }
  }

  try {
    const assignment = await putPlanAssignment(studentId, month, {
      planId: body.planId.trim(),
      mode,
      ...(mode === "prorated" ? { effectiveFrom: body.effectiveFrom as string } : {})
    });
    return NextResponse.json({ dataSource: "runtime", assignment });
  } catch (error) {
    if (error instanceof PlanAssignmentStudentNotFoundError) {
      return NextResponse.json({ error: "student not found" }, { status: 404 });
    }
    if (error instanceof PlanNotFoundError) {
      return NextResponse.json({ error: "plan not found" }, { status: 404 });
    }
    if (error instanceof PlanAssignmentStudentInactiveError) {
      return NextResponse.json({ error: "student is archived" }, { status: 409 });
    }
    if (error instanceof PlanInactiveError) {
      return NextResponse.json({ error: "plan is inactive" }, { status: 409 });
    }
    if (error instanceof NoEligiblePlanSessionsError) {
      return NextResponse.json({ error: "student has no eligible usual sessions" }, { status: 409 });
    }
    if (error instanceof PlanAssignmentHasAttendanceError) {
      return NextResponse.json(
        { error: "plan assignment with attendance cannot be replaced" },
        { status: 409 }
      );
    }
    throw error;
  }
}
