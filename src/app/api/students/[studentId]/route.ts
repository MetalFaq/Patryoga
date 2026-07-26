import { NextResponse } from "next/server";
import { archiveStudent, StudentNotFoundError, updateStudent } from "@/server/yoga-repository";

type Context = { params: Promise<{ studentId: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function bodyOf(request: Request): Promise<Record<string, unknown> | NextResponse> {
  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "request body must be valid JSON" }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return NextResponse.json({ error: "request body must be an object" }, { status: 400 });
  return payload as Record<string, unknown>;
}

export async function PATCH(request: Request, context: Context) {
  const { studentId } = await context.params; const body = await bodyOf(request);
  if (body instanceof NextResponse) return body;
  const hasEditableField = ["name", "phone", "notes", "active"].some((field) => body[field] !== undefined);
  if (!hasEditableField || (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) || (body.phone !== undefined && (typeof body.phone !== "string" || !body.phone.trim())) || (body.notes !== undefined && typeof body.notes !== "string") || (body.active !== undefined && body.active !== true)) return NextResponse.json({ error: "invalid student fields" }, { status: 400 });
  try { return NextResponse.json({ dataSource: "runtime", student: await updateStudent(studentId, { ...(typeof body.name === "string" ? { name: body.name.trim() } : {}), ...(typeof body.phone === "string" ? { phone: body.phone.trim() } : {}), ...(typeof body.notes === "string" ? { notes: body.notes } : {}) }, body.active === true) }); }
  catch (error) { if (error instanceof StudentNotFoundError) return NextResponse.json({ error: "student not found" }, { status: 404 }); throw error; }
}

export async function DELETE(_request: Request, context: Context) {
  try { await archiveStudent((await context.params).studentId); return new NextResponse(null, { status: 204 }); }
  catch (error) { if (error instanceof StudentNotFoundError) return NextResponse.json({ error: "student not found" }, { status: 404 }); throw error; }
}
