import { NextResponse } from "next/server";
import { isIsoDate } from "@/server/dates";
import { listWeekSessions } from "@/server/yoga-repository";

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
