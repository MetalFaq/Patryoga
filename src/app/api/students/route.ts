import { NextResponse } from "next/server";
import { students } from "@/lib/mock-data";

export async function GET() {
  return NextResponse.json({
    dataSource: "mock",
    students
  });
}
