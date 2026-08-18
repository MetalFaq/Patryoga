import type { NextFetchEvent, NextMiddleware, NextRequest } from "next/server";
import { auth } from "@/auth";

const authMiddleware = auth as NextMiddleware;

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  return authMiddleware(request, event);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
