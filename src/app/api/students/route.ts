import { NextResponse } from "next/server";
import { createStudent, listStudents } from "@/server/yoga-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    dataSource: "runtime",
    students: await listStudents()
  });
}

export async function POST(request: Request) {
  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "request body must be valid JSON" }, { status: 400 }); }
  if (!payload || typeof payload !== "object") return NextResponse.json({ error: "request body must be an object" }, { status: 400 });
  const body = payload as Record<string, unknown>;
  if (typeof body.name !== "string" || !body.name.trim() || typeof body.phone !== "string" || !body.phone.trim() || (body.notes !== undefined && typeof body.notes !== "string")) {
    return NextResponse.json({ error: "name and phone are required" }, { status: 400 });
  }
  const id = typeof body.id === "string" && body.id.trim() ? body.id.trim() : `stu-${crypto.randomUUID()}`;
  try {
    const student = await createStudent(id, { name: body.name.trim(), phone: body.phone.trim(), ...(typeof body.notes === "string" ? { notes: body.notes } : {}) });
    return NextResponse.json({ dataSource: "runtime", student }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "student id already exists" }, { status: 409 });
    throw error;
  }
}
