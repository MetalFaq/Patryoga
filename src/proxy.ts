import type { NextFetchEvent, NextMiddleware, NextRequest } from "next/server";
import { auth } from "@/auth";
import { enforcePilotRateLimit } from "@/lib/server/security/rate-limit";

const authMiddleware = auth as NextMiddleware;

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const rateLimitResponse = enforcePilotRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  return authMiddleware(request, event);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
