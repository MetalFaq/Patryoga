import { NextResponse } from "next/server";
import { PlanNotFoundError, updatePlan } from "@/server/plans-repository";

type Context = { params: Promise<{ planId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request, context: Context) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "request body must be valid JSON" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "request body must be an object" }, { status: 400 });
  }
  const body = payload as Record<string, unknown>;
  const editable = ["name", "classLimit", "description", "active"];
  if (
    !editable.some((field) => Object.hasOwn(body, field)) ||
    (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) ||
    (body.classLimit !== undefined && (
      typeof body.classLimit !== "number" ||
      !Number.isInteger(body.classLimit) || body.classLimit <= 0
    )) ||
    (body.description !== undefined && typeof body.description !== "string") ||
    (body.active !== undefined && typeof body.active !== "boolean")
  ) {
    return NextResponse.json({ error: "invalid plan fields" }, { status: 400 });
  }

  try {
    const plan = await updatePlan((await context.params).planId, {
      ...(typeof body.name === "string" ? { name: body.name.trim() } : {}),
      ...(typeof body.classLimit === "number" ? { classLimit: body.classLimit } : {}),
      ...(typeof body.description === "string" ? { description: body.description } : {}),
      ...(typeof body.active === "boolean" ? { active: body.active } : {})
    });
    return NextResponse.json({ dataSource: "runtime", plan });
  } catch (error) {
    if (error instanceof PlanNotFoundError) {
      return NextResponse.json({ error: "plan not found" }, { status: 404 });
    }
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "active plan name already exists" }, { status: 409 });
    }
    throw error;
  }
}
