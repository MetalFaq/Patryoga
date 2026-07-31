"use client";

import { CalendarRange, Check, CircleDashed, LoaderCircle, Save, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { MembershipPlan, MonthlyPlanAssignment, PlanAssignmentMode, WeeklyClass } from "@/lib/types";

function currentMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { month: "2-digit", timeZone: "America/Argentina/Buenos_Aires", year: "numeric" }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}`;
}

function todayIso() {
  const parts = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires", year: "numeric" }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function lastDayOfMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, "0")}`;
}

function firstWeekdayOfMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1, 1, 12);
  if (date.getDay() === 6) date.setDate(3);
  if (date.getDay() === 0) date.setDate(2);
  return `${month}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`));
}

function sessionStatus(status: string, date: string) {
  if (status === "present") return "Presente";
  if (status === "absent") return "Ausente";
  return date > todayIso() ? "Programada" : "Sin registrar";
}

async function parsePayload(response: Response) {
  try {
    return await response.json() as { error?: string; plans?: MembershipPlan[]; assignments?: MonthlyPlanAssignment[]; assignment?: MonthlyPlanAssignment };
  } catch {
    return {};
  }
}

function friendlyAssignmentError(message: string | undefined) {
  if (message?.includes("attendance") || message?.includes("asist")) return "Este mes ya tiene asistencias registradas y no puede reemplazarse sin afectar el historial.";
  if (message?.includes("session") || message?.includes("horario")) return "No hay clases habituales disponibles para calcular este plan. Primero asigná al menos un horario.";
  if (message?.includes("inactive") || message?.includes("archived")) return "El plan o la alumna/o ya no está activo. Actualizá la información e intentá nuevamente.";
  return "No se pudo asignar el plan. Revisá el mes, la modalidad y los horarios habituales.";
}

export function StudentPlanSection({ studentId, classes }: { studentId: string; classes: WeeklyClass[] }) {
  const [month, setMonth] = useState(currentMonth);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [assignment, setAssignment] = useState<MonthlyPlanAssignment | null>(null);
  const [planId, setPlanId] = useState("");
  const [mode, setMode] = useState<PlanAssignmentMode>("full");
  const [effectiveFrom, setEffectiveFrom] = useState(firstWeekdayOfMonth(currentMonth()));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      setNotice(null);
      try {
        const [plansResponse, assignmentResponse] = await Promise.all([
          fetch("/api/plans?status=all", { cache: "no-store", signal: controller.signal }),
          fetch(`/api/plan-assignments?month=${month}&studentId=${encodeURIComponent(studentId)}`, { cache: "no-store", signal: controller.signal })
        ]);
        const plansPayload = await parsePayload(plansResponse);
        const assignmentPayload = await parsePayload(assignmentResponse);
        if (!plansResponse.ok || !Array.isArray(plansPayload.plans)) throw new Error("No se pudieron cargar los planes disponibles.");
        if (!assignmentResponse.ok || !Array.isArray(assignmentPayload.assignments)) throw new Error("No se pudo cargar el plan de este mes.");
        const current = assignmentPayload.assignments[0] ?? null;
        setPlans(plansPayload.plans);
        setAssignment(current);
        setPlanId(current?.planId ?? plansPayload.plans.find((plan) => plan.active)?.id ?? "");
        setMode(current?.mode ?? "full");
        setEffectiveFrom(current?.effectiveFrom ?? firstWeekdayOfMonth(month));
      } catch (loadError) {
        if (!(loadError instanceof Error && loadError.name === "AbortError")) {
          setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el plan mensual.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [month, studentId]);

  const selectedPlan = plans.find((plan) => plan.id === planId);
  const classNames = useMemo(() => new Map(classes.map((item) => [item.id, item.title])), [classes]);

  async function saveAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planId || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/plan-assignments/${encodeURIComponent(studentId)}/${month}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, mode, ...(mode === "prorated" ? { effectiveFrom } : {}) })
      });
      const payload = await parsePayload(response);
      if (!response.ok || !payload.assignment) throw new Error(friendlyAssignmentError(payload.error));
      setAssignment(payload.assignment);
      setNotice("Plan mensual guardado. El pool quedó registrado como fotografía histórica.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el plan mensual.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="monthly-plan-section">
    <div className="flex items-start gap-3">
      <div className="class-icon"><CalendarRange size={20} /></div>
      <div className="min-w-0"><p className="field-label">Plan mensual</p><p className="field-help">Elegí el cupo de clases para el mes. Presente y ausente consumen una clase.</p></div>
    </div>
    <label className="field"><span>Mes</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>

    {loading ? <div className="plan-loading"><LoaderCircle className="animate-spin" size={20} />Cargando plan del mes…</div> : <form className="plan-assignment-form" onSubmit={saveAssignment}>
      <label className="field"><span>Plan</span><select value={planId} onChange={(event) => setPlanId(event.target.value)} required><option value="">Elegir un plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id} disabled={!plan.active && plan.id !== assignment?.planId}>{plan.name} · {plan.classLimit} clases{plan.active ? "" : " (inactivo)"}</option>)}</select></label>
      <fieldset className="mode-selector"><legend>Modalidad</legend><label><input type="radio" name="mode" value="full" checked={mode === "full"} onChange={() => setMode("full")} /><span><strong>Plan completo</strong><small>{selectedPlan ? `${selectedPlan.classLimit} clases durante el mes` : "Cupo completo del plan"}</small></span></label><label><input type="radio" name="mode" value="prorated" checked={mode === "prorated"} onChange={() => setMode("prorated")} /><span><strong>Proporcional</strong><small>Calcula las clases disponibles desde el ingreso</small></span></label></fieldset>
      {mode === "prorated" ? <label className="field"><span>Fecha de ingreso</span><input type="date" min={`${month}-01`} max={lastDayOfMonth(month)} value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} required /></label> : null}
      {error ? <div className="notice notice-error" role="alert"><X className="shrink-0" size={18} />{error}</div> : null}
      {notice ? <div className="notice" role="status"><Check className="shrink-0" size={18} />{notice}</div> : null}
      <button className="action-button action-button-dark w-full" disabled={saving || !planId} type="submit">{saving ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />}{assignment ? "Actualizar plan del mes" : "Asignar plan del mes"}</button>
    </form>}

    {assignment ? <div className="plan-progress-card">
      <div className="flex items-start justify-between gap-3"><div><p className="eyebrow text-moss">{assignment.mode === "prorated" ? "Plan proporcional" : "Plan completo"}</p><h3 className="mt-1 font-semibold text-ink">{assignment.planName}</h3><p className="mt-1 text-xs text-ink/55">{formatDate(assignment.effectiveFrom)} al {formatDate(assignment.periodEnd)}</p></div><strong className="plan-progress-total">{assignment.usedCount}/{assignment.classLimit}</strong></div>
      <div className="progress-track" aria-label={`${assignment.usedCount} de ${assignment.classLimit} clases utilizadas`} role="progressbar" aria-valuemin={0} aria-valuemax={assignment.classLimit} aria-valuenow={assignment.usedCount}><span style={{ width: `${assignment.classLimit ? Math.min(100, assignment.usedCount / assignment.classLimit * 100) : 0}%` }} /></div>
      <div className="plan-metrics"><span><strong>{assignment.presentCount}</strong>Presentes</span><span><strong>{assignment.absentCount}</strong>Ausentes</span><span><strong>{assignment.remainingCount}</strong>Restantes</span></div>
      <div className="plan-session-list"><p className="field-label">Clases del mes</p>{assignment.sessions.map((session) => <div className={session.included ? "plan-session" : "plan-session plan-session-outside"} key={`${session.classId}:${session.date}`}><span className="session-position">{session.included ? session.position : <CircleDashed size={15} />}</span><span className="min-w-0 flex-1"><strong>{formatDate(session.date)} · {classNames.get(session.classId) ?? "Clase semanal"}</strong><small>{session.included ? sessionStatus(session.status, session.date) : "Fuera del plan"}</small></span></div>)}</div>
    </div> : !loading && !error ? <p className="plan-empty-copy">Todavía no hay un plan asignado para este mes.</p> : null}
  </section>;
}
