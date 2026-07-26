"use client";

import {
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  LoaderCircle,
  RotateCcw,
  Save,
  UserCheck,
  Users,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { buildWeekSessions, weekdayLabels } from "@/lib/mock-data";
import type { AttendanceStatus, ClassSession } from "@/lib/types";

const weekStarts = ["2026-07-13", "2026-07-20", "2026-07-27"];

const statusCopy: Record<AttendanceStatus, string> = {
  present: "Presente",
  absent: "Ausente",
  unmarked: "Sin marcar"
};

type SaveState = "idle" | "saving" | "saved" | "error";

function formatShortDate(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" }).format(value);
}

function nextStatus(status: AttendanceStatus): AttendanceStatus {
  if (status === "unmarked") {
    return "present";
  }

  if (status === "present") {
    return "absent";
  }

  return "unmarked";
}

export default function Home() {
  const [weekIndex, setWeekIndex] = useState(1);
  const [selectedId, setSelectedId] = useState("class-sab-0930");
  const [sessions, setSessions] = useState<ClassSession[]>(() => buildWeekSessions(weekStarts[1]));
  const [attendanceByKey, setAttendanceByKey] = useState<Record<string, AttendanceStatus>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    const controller = new AbortController();

    async function loadSessions() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await fetch(`/api/classes?weekStart=${weekStarts[weekIndex]}`, {
          cache: "no-store",
          signal: controller.signal
        });
        const payload = (await response.json()) as { sessions?: ClassSession[]; error?: string };

        if (!response.ok || !Array.isArray(payload.sessions)) {
          throw new Error(payload.error ?? "No se pudo cargar la agenda.");
        }

        setSessions(payload.sessions);
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          setLoadError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadSessions();
    return () => controller.abort();
  }, [weekIndex]);

  const selectedSession = sessions.find((session) => session.id === selectedId) ?? sessions[0];

  const visibleSession: ClassSession = {
    ...selectedSession,
    students: selectedSession.students.map((student) => ({
      ...student,
      status: attendanceByKey[`${selectedSession.id}:${selectedSession.date}:${student.id}`] ?? student.status
    }))
  };

  const presentCount = visibleSession.students.filter((student) => student.status === "present").length;
  const absentCount = visibleSession.students.filter((student) => student.status === "absent").length;
  const unmarkedCount = visibleSession.students.length - presentCount - absentCount;
  const dirtyCount = visibleSession.students.filter(
    (student) => attendanceByKey[`${visibleSession.id}:${visibleSession.date}:${student.id}`] !== undefined
  ).length;
  const hasChanges = dirtyCount > 0;

  function setStudentStatus(studentId: string, status: AttendanceStatus) {
    const key = `${visibleSession.id}:${visibleSession.date}:${studentId}`;
    const savedStatus = selectedSession.students.find((student) => student.id === studentId)?.status;

    setAttendanceByKey((current) => {
      const next = { ...current };

      if (status === savedStatus) {
        delete next[key];
      } else {
        next[key] = status;
      }

      return next;
    });
    setSaveState("idle");
  }

  function setAllStatuses(status: AttendanceStatus) {
    setAttendanceByKey((current) => {
      const next = { ...current };

      for (const student of selectedSession.students) {
        const key = `${selectedSession.id}:${selectedSession.date}:${student.id}`;

        if (student.status === status) {
          delete next[key];
        } else {
          next[key] = status;
        }
      }

      return next;
    });
    setSaveState("idle");
  }

  function discardChanges() {
    setAttendanceByKey((current) => {
      const next = { ...current };

      for (const student of selectedSession.students) {
        delete next[`${selectedSession.id}:${selectedSession.date}:${student.id}`];
      }

      return next;
    });
    setSaveState("idle");
  }

  async function saveAttendance() {
    if (!hasChanges || saveState === "saving") {
      return;
    }

    const sessionToSave = visibleSession;
    setSaveState("saving");

    try {
      const response = await fetch(`/api/classes/${sessionToSave.id}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: sessionToSave.date,
          attendance: sessionToSave.students.map((student) => ({
            studentId: student.id,
            status: student.status
          }))
        })
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo guardar la asistencia.");
      }

      setSessions((current) =>
        current.map((session) =>
          session.id === sessionToSave.id && session.date === sessionToSave.date
            ? { ...session, students: sessionToSave.students }
            : session
        )
      );
      setAttendanceByKey((current) => {
        const next = { ...current };

        for (const student of sessionToSave.students) {
          delete next[`${sessionToSave.id}:${sessionToSave.date}:${student.id}`];
        }

        return next;
      });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  function moveWeek(direction: -1 | 1) {
    const next = Math.min(Math.max(weekIndex + direction, 0), weekStarts.length - 1);

    if (next === weekIndex) {
      return;
    }

    const nextSessions = buildWeekSessions(weekStarts[next]);
    setSelectedId(nextSessions[0]?.id ?? selectedId);
    setSessions(nextSessions);
    setWeekIndex(next);
    setSaveState("idle");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-5 sm:px-6 lg:px-8">
      <section className="grid gap-4 lg:grid-cols-[380px_1fr] lg:gap-6">
        <div className="space-y-4">
          <header className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-moss">Salon de yoga</p>
                <h1 className="text-3xl font-semibold text-ink">Agenda semanal</h1>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-moss shadow-soft">
                <CalendarDays aria-hidden="true" size={24} />
              </div>
            </div>
            <p className="max-w-md text-sm leading-6 text-ink/70">
              Clases fijas, alumnos habituales y asistencia editable para fechas actuales o pasadas.
            </p>
          </header>

          <div className="rounded-lg bg-white p-3 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <button
                aria-label="Semana anterior"
                className="flex h-10 w-10 items-center justify-center rounded-md border border-mist text-ink disabled:opacity-35"
                disabled={weekIndex === 0 || saveState === "saving"}
                onClick={() => moveWeek(-1)}
                type="button"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="text-center">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink/50">Semana</p>
                <p className="text-sm font-semibold text-ink">
                  desde {formatShortDate(weekStarts[weekIndex])}
                </p>
              </div>
              <button
                aria-label="Semana siguiente"
                className="flex h-10 w-10 items-center justify-center rounded-md border border-mist text-ink disabled:opacity-35"
                disabled={weekIndex === weekStarts.length - 1 || saveState === "saving"}
                onClick={() => moveWeek(1)}
                type="button"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          <div aria-busy={isLoading} className={clsx("grid gap-3 transition-opacity", isLoading && "opacity-65")}>
            {sessions.map((session) => {
              const isSelected = session.id === visibleSession.id;
              const count = session.students.filter((student) => {
                const key = `${session.id}:${session.date}:${student.id}`;
                return (attendanceByKey[key] ?? student.status) === "present";
              }).length;

              return (
                <button
                  className={clsx(
                    "rounded-lg border bg-white p-4 text-left shadow-soft transition",
                    isSelected ? "border-clay ring-2 ring-clay/20" : "border-transparent"
                  )}
                  key={`${session.id}-${session.date}`}
                  onClick={() => setSelectedId(session.id)}
                  disabled={saveState === "saving"}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-moss">
                        {weekdayLabels[session.weekday]} {formatShortDate(session.date)}
                      </p>
                      <h2 className="mt-1 text-lg font-semibold text-ink">{session.title}</h2>
                    </div>
                    <span className="rounded-md bg-mist px-2 py-1 text-xs font-semibold text-ink">
                      {count}/{session.students.length}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-ink/70">
                    <span className="inline-flex items-center gap-1">
                      <Clock size={16} /> {session.time}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users size={16} /> {session.room}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <section className="rounded-lg bg-white p-4 shadow-soft lg:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-moss">
                {weekdayLabels[visibleSession.weekday]} {formatShortDate(visibleSession.date)} · {visibleSession.time}
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-ink">{visibleSession.title}</h2>
              <p className="mt-1 text-sm text-ink/65">
                {visibleSession.teacher} - {visibleSession.durationMinutes} min - cupo {visibleSession.capacity}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center sm:min-w-64">
              <Metric label="Presentes" value={presentCount} tone="moss" />
              <Metric label="Ausentes" value={absentCount} tone="clay" />
              <Metric label="Pendientes" value={unmarkedCount} tone="ink" />
            </div>
          </div>

          <div
            aria-live="polite"
            className={clsx(
              "mt-5 flex items-center gap-2 rounded-lg p-3 text-sm",
              loadError || saveState === "error" ? "bg-clay/10 text-clay" : "bg-linen text-ink/70"
            )}
            role="status"
          >
            {isLoading || saveState === "saving" ? (
              <LoaderCircle className="shrink-0 animate-spin text-moss" size={18} />
            ) : (
              <History className="shrink-0 text-moss" size={18} />
            )}
            <span>
              {loadError
                ? `No se pudo actualizar la agenda: ${loadError}`
                : saveState === "saving"
                  ? "Guardando asistencia..."
                  : saveState === "saved"
                    ? "Asistencia guardada correctamente."
                    : saveState === "error"
                      ? "No se pudo guardar. Revisá la conexión e intentá nuevamente."
                      : hasChanges
                        ? `${dirtyCount} ${dirtyCount === 1 ? "cambio pendiente" : "cambios pendientes"} de guardar.`
                        : "La asistencia está al día."}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
            <button
              className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-moss/30 bg-moss/5 px-4 text-sm font-semibold text-moss disabled:opacity-45"
              disabled={saveState === "saving"}
              onClick={() => setAllStatuses("present")}
              type="button"
            >
              <CheckCheck size={18} />
              Marcar todos presentes
            </button>
            <button
              className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-mist px-4 text-sm font-semibold text-ink disabled:opacity-40"
              disabled={!hasChanges || saveState === "saving"}
              onClick={discardChanges}
              type="button"
            >
              <RotateCcw size={17} />
              Deshacer
            </button>
            <button
              className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!hasChanges || saveState === "saving"}
              onClick={() => void saveAttendance()}
              type="button"
            >
              {saveState === "saving" ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />}
              {saveState === "saving" ? "Guardando" : "Guardar cambios"}
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {visibleSession.students.map((student) => (
              <article className="rounded-lg border border-mist p-3" key={student.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-ink">{student.name}</h3>
                    <p className="mt-1 text-sm text-ink/60">{student.phone}</p>
                    {student.notes ? <p className="mt-2 text-sm text-clay">{student.notes}</p> : null}
                  </div>
                  <button
                    className={clsx(
                      "shrink-0 rounded-md px-3 py-2 text-sm font-semibold",
                      student.status === "present" && "bg-moss text-white",
                      student.status === "absent" && "bg-clay text-white",
                      student.status === "unmarked" && "bg-mist text-ink"
                    )}
                    aria-label={`Cambiar estado de ${student.name}. Estado actual: ${statusCopy[student.status]}`}
                    disabled={saveState === "saving"}
                    onClick={() => setStudentStatus(student.id, nextStatus(student.status))}
                    type="button"
                  >
                    {statusCopy[student.status]}
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <StatusButton
                    active={student.status === "present"}
                    icon={<Check size={17} />}
                    label="Presente"
                    disabled={saveState === "saving"}
                    onClick={() => setStudentStatus(student.id, "present")}
                    tone="present"
                  />
                  <StatusButton
                    active={student.status === "absent"}
                    icon={<X size={17} />}
                    label="Ausente"
                    disabled={saveState === "saving"}
                    onClick={() => setStudentStatus(student.id, "absent")}
                    tone="absent"
                  />
                  <StatusButton
                    active={student.status === "unmarked"}
                    icon={<UserCheck size={17} />}
                    label="Pendiente"
                    disabled={saveState === "saving"}
                    onClick={() => setStudentStatus(student.id, "unmarked")}
                    tone="unmarked"
                  />
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "moss" | "clay" | "ink" }) {
  return (
    <div className="rounded-lg bg-linen px-2 py-3">
      <p className={clsx("text-xl font-semibold", tone === "moss" && "text-moss", tone === "clay" && "text-clay", tone === "ink" && "text-ink")}>
        {value}
      </p>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.06em] text-ink/55">{label}</p>
    </div>
  );
}

function StatusButton({
  active,
  disabled,
  icon,
  label,
  onClick,
  tone
}: {
  active: boolean;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone: AttendanceStatus;
}) {
  return (
    <button
      aria-pressed={active}
      className={clsx(
        "flex min-h-10 items-center justify-center gap-1 rounded-md border px-2 text-sm font-medium disabled:opacity-50",
        !active && "border-mist bg-white text-ink",
        active && tone === "present" && "border-moss bg-moss text-white",
        active && tone === "absent" && "border-clay bg-clay text-white",
        active && tone === "unmarked" && "border-ink/30 bg-mist text-ink"
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
