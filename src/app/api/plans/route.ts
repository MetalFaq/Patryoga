import { NextResponse } from "next/server";
import {
  createPlan,
  listPlans,
  type PlanListStatus
} from "@/server/plans-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const statuses = params.getAll("status");
  if (
    [...params.keys()].some((key) => key !== "status") ||
    statuses.length > 1 ||
    (statuses[0] !== undefined && !["active", "inactive", "all"].includes(statuses[0]))
  ) {
    return NextResponse.json(
      { error: "status must be active, inactive or all" },
      { status: 400 }
    );
  }
  const status = (statuses[0] ?? "active") as PlanListStatus;
  return NextResponse.json({ dataSource: "runtime", plans: await listPlans(status) });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "request body must be valid JSON" }, { status: 400 });
  }
  if (!isObject(payload)) {
    return NextResponse.json({ error: "request body must be an object" }, { status: 400 });
  }
  const { id, name, classLimit, description } = payload;
  if (
    typeof name !== "string" || !name.trim() ||
    typeof classLimit !== "number" || !Number.isInteger(classLimit) || classLimit <= 0 ||
    (description !== undefined && typeof description !== "string") ||
    (id !== undefined && (typeof id !== "string" || !id.trim()))
  ) {
    return NextResponse.json({ error: "invalid plan fields" }, { status: 400 });
  }

  const planId = typeof id === "string" ? id.trim() : `plan-${crypto.randomUUID()}`;
  try {
    const plan = await createPlan(planId, {
      name: name.trim(),
      classLimit,
      ...(typeof description === "string" ? { description } : {})
    });
    return NextResponse.json({ dataSource: "runtime", plan }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "plan id or active name already exists" },
        { status: 409 }
      );
    }
    throw error;
  }
}
