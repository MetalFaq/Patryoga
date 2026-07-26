import { NextResponse } from "next/server";
import { buildWeekSessions } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const weekStart = searchParams.get("weekStart") ?? undefined;

  if (weekStart && !isIsoDate(weekStart)) {
    return NextResponse.json({ error: "weekStart must use YYYY-MM-DD format" }, { status: 400 });
  }

  return NextResponse.json({
    dataSource: "runtime",
    sessions: buildWeekSessions(weekStart)
  });
}
