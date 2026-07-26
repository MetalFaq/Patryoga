import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handlers } from "@/auth";
import { getAuthEnvironment } from "@/auth-environment";

function unavailable() {
  return NextResponse.json(
    { error: "Authentication is not configured" },
    { status: 503 }
  );
}

export function GET(request: NextRequest) {
  if (!getAuthEnvironment().ready) return unavailable();
  return handlers.GET(request);
}

export function POST(request: NextRequest) {
  if (!getAuthEnvironment().ready) return unavailable();
  return handlers.POST(request);
}
