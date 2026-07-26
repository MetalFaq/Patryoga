import { NextResponse } from "next/server";
import {
  CapacityExceededError,
  ClassNotFoundError,
  ClassScheduleConflictError,
  deleteClass,
  updateClass
} from "@/server/yoga-repository";

type Context = { params: Promise<{ classId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request, context: Context) {
  let payload: unknown; try { payload = await request.json(); } catch { return NextResponse.json({ error: "request body must be valid JSON" }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return NextResponse.json({ error: "request body must be an object" }, { status: 400 });
  const body = payload as Record<string, unknown>; const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const editableFields = ["title", "weekday", "time", "durationMinutes", "capacity"];
  if (!editableFields.some((field) => body[field] !== undefined) || (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim())) || (body.weekday !== undefined && (typeof body.weekday !== "string" || !weekdays.includes(body.weekday))) || (body.time !== undefined && (typeof body.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time))) || (body.durationMinutes !== undefined && (!Number.isInteger(body.durationMinutes) || (body.durationMinutes as number) <= 0)) || (body.capacity !== undefined && (!Number.isInteger(body.capacity) || (body.capacity as number) <= 0))) return NextResponse.json({ error: "invalid class fields" }, { status: 400 });
  try { await updateClass((await context.params).classId, body as never); return NextResponse.json({ dataSource: "runtime", message: "Class updated" }); }
  catch (error) { if (error instanceof ClassNotFoundError) return NextResponse.json({ error: "class not found" }, { status: 404 }); if (error instanceof CapacityExceededError) return NextResponse.json({ error: "capacity is below active enrollment" }, { status: 409 }); if (error instanceof ClassScheduleConflictError) return NextResponse.json({ error: error.message }, { status: 409 }); throw error; }
}

export async function DELETE(_request: Request, context: Context) {
  try { await deleteClass((await context.params).classId); return new NextResponse(null, { status: 204 }); }
  catch (error) { if (error instanceof ClassNotFoundError) return NextResponse.json({ error: "class not found" }, { status: 404 }); throw error; }
}
