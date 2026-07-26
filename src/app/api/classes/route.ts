import { NextResponse } from "next/server";
import { isIsoDate } from "@/server/dates";
import { createClass, listWeekSessions } from "@/server/yoga-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const weekStart = searchParams.get("weekStart") ?? undefined;

  if (weekStart && !isIsoDate(weekStart)) {
    return NextResponse.json({ error: "weekStart must use YYYY-MM-DD format" }, { status: 400 });
  }

  return NextResponse.json({
    dataSource: "runtime",
    sessions: await listWeekSessions(weekStart)
  });
}

export async function POST(request: Request) {
  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "request body must be valid JSON" }, { status: 400 }); }
  if (!payload || typeof payload !== "object") return NextResponse.json({ error: "request body must be an object" }, { status: 400 });
  const body = payload as Record<string, unknown>;
  const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  if (typeof body.title !== "string" || !body.title.trim() || typeof body.weekday !== "string" || !weekdays.includes(body.weekday) || typeof body.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time) || typeof body.durationMinutes !== "number" || !Number.isInteger(body.durationMinutes) || body.durationMinutes <= 0 || typeof body.teacher !== "string" || !body.teacher.trim() || typeof body.room !== "string" || !body.room.trim() || typeof body.capacity !== "number" || !Number.isInteger(body.capacity) || body.capacity <= 0) return NextResponse.json({ error: "invalid class fields" }, { status: 400 });
  const id = typeof body.id === "string" && body.id.trim() ? body.id.trim() : `class-${crypto.randomUUID()}`;
  try { await createClass(id, { title: body.title.trim(), weekday: body.weekday as never, time: body.time, durationMinutes: body.durationMinutes, teacher: body.teacher.trim(), room: body.room.trim(), capacity: body.capacity }); return NextResponse.json({ dataSource: "runtime", class: { id, ...body } }, { status: 201 }); }
  catch (error) { if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "class id already exists" }, { status: 409 }); throw error; }
}
