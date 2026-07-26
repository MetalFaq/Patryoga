import { NextResponse } from "next/server";
import { listStudents } from "@/server/yoga-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    dataSource: "mock",
    students: await listStudents()
  });
}
