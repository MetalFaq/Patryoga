import { NextResponse } from "next/server";
import {
  CapacityExceededError,
  ClassAlreadyArchivedError,
  ClassNotFoundError,
  EnrollmentReactivationUnsupportedError,
  setStudentClasses,
  StudentNotFoundError
} from "@/server/yoga-repository";

type Context = { params: Promise<{ studentId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function classIdsFrom(request: Request): Promise<string[] | NextResponse> {
  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "request body must be valid JSON" }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return NextResponse.json({ error: "request body must be an object" }, { status: 400 });
  const ids = (payload as { classIds?: unknown }).classIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length) return NextResponse.json({ error: "classIds must be a non-empty array of unique strings" }, { status: 400 });
  return ids as string[];
}

async function respond(request: Request, context: Context, assign: boolean) {
  const classIds = await classIdsFrom(request); if (classIds instanceof NextResponse) return classIds;
  try { await setStudentClasses((await context.params).studentId, classIds, assign); return NextResponse.json({ dataSource: "runtime", message: assign ? "Classes assigned" : "Classes unassigned", classIds }); }
  catch (error) {
    if (error instanceof StudentNotFoundError) return NextResponse.json({ error: "student not found or archived" }, { status: 404 });
    if (error instanceof ClassNotFoundError) return NextResponse.json({ error: "class not found" }, { status: 404 });
    if (error instanceof ClassAlreadyArchivedError) return NextResponse.json({ error: "cannot assign an archived class" }, { status: 409 });
    if (error instanceof CapacityExceededError) return NextResponse.json({ error: "class capacity exceeded" }, { status: 409 });
    if (error instanceof EnrollmentReactivationUnsupportedError) return NextResponse.json({ error: "assignment reactivation requires a new validity period" }, { status: 409 });
    throw error;
  }
}

export async function POST(request: Request, context: Context) { return respond(request, context, true); }
export async function DELETE(request: Request, context: Context) { return respond(request, context, false); }
