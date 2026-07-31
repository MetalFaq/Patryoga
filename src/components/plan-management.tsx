"use client";

import { Archive, Edit3, Layers3, LoaderCircle, Plus, Save, X } from "lucide-react";
import { clsx } from "clsx";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { MembershipPlan } from "@/lib/types";

type PlanEditor = MembershipPlan | "new" | null;

async function responsePayload(response: Response) {
  try {
    return await response.json() as { error?: string; plan?: MembershipPlan; plans?: MembershipPlan[] };
  } catch {
    return {};
  }
}

function friendlyPlanError(message: string | undefined, fallback: string) {
  if (message?.includes("duplicate") || message?.includes("already exists")) {
    return "Ya existe un plan activo con ese nombre. Elegí otro nombre o editá el existente.";
  }
  return fallback;
}

export function PlanManagement() {
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [view, setView] = useState<"active" | "inactive">("active");
  const [editor, setEditor] = useState<PlanEditor>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/plans?status=all", { cache: "no-store" });
      const payload = await responsePayload(response);
      if (!response.ok || !Array.isArray(payload.plans)) throw new Error("No se pudo cargar el catálogo de planes.");
      setPlans(payload.plans);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el catálogo de planes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || saving) return;
    const data = new FormData(event.currentTarget);
    const existing = editor === "new" ? null : editor;
    const body = {
      name: String(data.get("name") ?? "").trim(),
      classLimit: Number(data.get("classLimit")),
      description: String(data.get("description") ?? "").trim(),
      ...(existing ? { active: data.get("active") === "on" } : {})
    };
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(existing ? `/api/plans/${existing.id}` : "/api/plans", {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await responsePayload(response);
      if (!response.ok || !payload.plan) {
        throw new Error(friendlyPlanError(payload.error, "No se pudo guardar el plan. Revisá los datos e intentá nuevamente."));
      }
      await loadPlans();
      setEditor(null);
      setNotice(existing ? "Plan actualizado. Las asignaciones anteriores conservan sus condiciones." : "Plan creado y listo para asignar.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el plan.");
    } finally {
      setSaving(false);
    }
  }

  const visiblePlans = plans.filter((plan) => plan.active === (view === "active"));
  const activeCount = plans.filter((plan) => plan.active).length;
  const inactiveCount = plans.length - activeCount;

  return <section>
    <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="eyebrow text-moss">Cupos mensuales</p>
        <h2 className="mt-1 text-3xl font-semibold text-ink">Planes</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-ink/65">Administrá las opciones de clases por mes. Los cambios no alteran el historial ya asignado.</p>
      </div>
      <button className="action-button action-button-dark w-full sm:w-auto" onClick={() => { setEditor("new"); setError(null); }} type="button"><Plus size={18} />Nuevo plan</button>
    </div>

    <div className="directory-switch" aria-label="Estado de planes">
      <button className={clsx(view === "active" && "active")} onClick={() => setView("active")} type="button">Activos <span>{activeCount}</span></button>
      <button className={clsx(view === "inactive" && "active")} onClick={() => setView("inactive")} type="button">Inactivos <span>{inactiveCount}</span></button>
    </div>

    {notice ? <div className="notice" role="status"><Layers3 className="shrink-0" size={18} />{notice}<button className="ml-auto" aria-label="Cerrar aviso" onClick={() => setNotice(null)} type="button"><X size={17} /></button></div> : null}
    {error && !editor ? <div className="notice notice-error" role="alert"><Archive className="shrink-0" size={18} />{error}<button className="ml-auto font-semibold underline" onClick={() => void loadPlans()} type="button">Reintentar</button></div> : null}

    <div className={clsx("grid gap-3 sm:grid-cols-2", loading && "opacity-60")} aria-busy={loading}>
      {visiblePlans.map((plan) => <button className="directory-card plan-card" key={plan.id} onClick={() => { setEditor(plan); setError(null); }} type="button">
        <div className="plan-limit" aria-hidden="true"><strong>{plan.classLimit}</strong><span>clases</span></div>
        <div className="min-w-0 flex-1 text-left">
          <h3 className="font-semibold text-ink">{plan.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-ink/60">{plan.description || "Sin descripción"}</p>
          <p className="mt-3 text-xs font-semibold text-moss">{plan.active ? "Disponible para nuevas asignaciones" : "Solo visible en el historial"}</p>
        </div>
        <Edit3 className="shrink-0 text-ink/35" size={18} />
      </button>)}
    </div>
    {!loading && visiblePlans.length === 0 ? <div className="empty-state"><Layers3 size={25} className="text-moss" /><p>{view === "active" ? "No hay planes activos." : "No hay planes inactivos."}</p></div> : null}

    {editor ? <div className="panel-backdrop" role="presentation">
      <section className="panel" role="dialog" aria-modal="true" aria-label={editor === "new" ? "Nuevo plan" : `Editar ${editor.name}`}>
        <div className="flex items-start justify-between gap-4 border-b border-mist pb-4">
          <div><p className="eyebrow text-moss">Catálogo mensual</p><h2 className="mt-1 text-2xl font-semibold text-ink">{editor === "new" ? "Nuevo plan" : editor.name}</h2><p className="mt-1 text-sm text-ink/60">Definí cuántas clases incluye durante un mes.</p></div>
          <button className="icon-button shrink-0" aria-label="Cerrar" onClick={() => setEditor(null)} type="button"><X size={20} /></button>
        </div>
        <form className="panel-content" onSubmit={savePlan}>
          <label className="field"><span>Nombre</span><input name="name" defaultValue={editor === "new" ? "" : editor.name} required /></label>
          <label className="field"><span>Cantidad de clases</span><input name="classLimit" defaultValue={editor === "new" ? 4 : editor.classLimit} min={1} step={1} type="number" required /></label>
          <label className="field"><span>Descripción (opcional)</span><textarea name="description" defaultValue={editor === "new" ? "" : editor.description} rows={3} /></label>
          {editor !== "new" ? <label className="check-row"><input name="active" type="checkbox" defaultChecked={editor.active} /><span><strong>Plan activo</strong><small>Al desactivarlo deja de ofrecerse, pero conserva el historial.</small></span></label> : null}
          {error ? <div className="notice notice-error" role="alert">{error}</div> : null}
          <div className="panel-actions"><button className="action-button action-button-light" onClick={() => setEditor(null)} type="button">Cancelar</button><button className="action-button action-button-dark" disabled={saving} type="submit">{saving ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />}{saving ? "Guardando" : "Guardar plan"}</button></div>
        </form>
      </section>
    </div> : null}
  </section>;
}
