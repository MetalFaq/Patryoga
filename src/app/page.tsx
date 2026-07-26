"use client";

import {
  Archive,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  History,
  LoaderCircle,
  Menu,
  Plus,
  RotateCcw,
  Save,
  UserCheck,
  Users,
  X
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { buildWeekSessions, weekdayLabels } from "@/lib/mock-data";
import type { AttendanceStatus, ClassSession, Student, Weekday, WeeklyClass } from "@/lib/types";

const weekStarts = ["2026-07-13", "2026-07-20", "2026-07-27"];
const weekdays: Weekday[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const statusCopy: Record<AttendanceStatus, string> = { present: "Presente", absent: "Ausente", unmarked: "Pendiente" };
type SaveState = "idle" | "saving" | "saved" | "error";
type Tab = "agenda" | "students" | "classes";

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" }).format(new Date(`${date}T12:00:00`));
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("agenda");
  const [menuOpen, setMenuOpen] = useState(false);
  const [weekIndex, setWeekIndex] = useState(1);
  const [selectedId, setSelectedId] = useState("class-sab-0930");
  const [sessions, setSessions] = useState<ClassSession[]>(() => buildWeekSessions(weekStarts[1]));
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceByKey, setAttendanceByKey] = useState<Record<string, AttendanceStatus>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [studentEditor, setStudentEditor] = useState<Student | "new" | null>(null);
  const [classEditor, setClassEditor] = useState<WeeklyClass | "new" | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const classes = useMemo(() => {
    const map = new Map<string, WeeklyClass>();
    sessions.forEach((session) => map.set(session.id, {
      id: session.id, title: session.title, weekday: session.weekday, time: session.time,
      durationMinutes: session.durationMinutes, teacher: session.teacher, room: session.room,
      capacity: session.capacity, studentIds: session.studentIds
    }));
    return [...map.values()].sort((a, b) => `${a.weekday}${a.time}`.localeCompare(`${b.weekday}${b.time}`));
  }, [sessions]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setIsLoading(true); setLoadError(null);
      try {
        const [classResponse, studentResponse] = await Promise.all([
          fetch(`/api/classes?weekStart=${weekStarts[weekIndex]}`, { cache: "no-store", signal: controller.signal }),
          fetch("/api/students", { cache: "no-store", signal: controller.signal })
        ]);
        const classPayload = (await classResponse.json()) as { sessions?: ClassSession[]; error?: string };
        const studentPayload = (await studentResponse.json()) as { students?: Student[]; error?: string };
        if (!classResponse.ok || !Array.isArray(classPayload.sessions)) throw new Error(classPayload.error ?? "No se pudo cargar la agenda.");
        if (!studentResponse.ok || !Array.isArray(studentPayload.students)) throw new Error(studentPayload.error ?? "No se pudo cargar el padrón.");
        setSessions(classPayload.sessions); setStudents(studentPayload.students);
        setSelectedId((current) => classPayload.sessions?.some((item) => item.id === current) ? current : classPayload.sessions?.[0]?.id ?? current);
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") setLoadError(error.message);
      } finally { if (!controller.signal.aborted) setIsLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [weekIndex]);

  const selectedSession = sessions.find((session) => session.id === selectedId) ?? sessions[0];
  const visibleSession = selectedSession ? { ...selectedSession, students: selectedSession.students.map((student) => ({ ...student, status: attendanceByKey[`${selectedSession.id}:${selectedSession.date}:${student.id}`] ?? student.status })) } : undefined;
  const presentCount = visibleSession?.students.filter((student) => student.status === "present").length ?? 0;
  const absentCount = visibleSession?.students.filter((student) => student.status === "absent").length ?? 0;
  const dirtyCount = visibleSession?.students.filter((student) => attendanceByKey[`${visibleSession.id}:${visibleSession.date}:${student.id}`] !== undefined).length ?? 0;
  const hasChanges = dirtyCount > 0;

  function setStudentStatus(studentId: string, status: AttendanceStatus) {
    if (!visibleSession) return;
    const key = `${visibleSession.id}:${visibleSession.date}:${studentId}`;
    const savedStatus = selectedSession.students.find((student) => student.id === studentId)?.status;
    setAttendanceByKey((current) => { const next = { ...current }; if (status === savedStatus) delete next[key]; else next[key] = status; return next; });
    setSaveState("idle");
  }

  function setAllStatuses(status: AttendanceStatus) {
    if (!selectedSession) return;
    setAttendanceByKey((current) => { const next = { ...current }; for (const student of selectedSession.students) { const key = `${selectedSession.id}:${selectedSession.date}:${student.id}`; if (student.status === status) delete next[key]; else next[key] = status; } return next; });
    setSaveState("idle");
  }

  function discardChanges() {
    if (!selectedSession) return;
    setAttendanceByKey((current) => { const next = { ...current }; selectedSession.students.forEach((student) => delete next[`${selectedSession.id}:${selectedSession.date}:${student.id}`]); return next; });
    setSaveState("idle");
  }

  async function saveAttendance() {
    if (!hasChanges || !visibleSession || saveState === "saving") return;
    setSaveState("saving");
    try {
      const response = await fetch(`/api/classes/${visibleSession.id}/attendance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: visibleSession.date, attendance: visibleSession.students.map(({ id, status }) => ({ studentId: id, status })) }) });
      const payload = (await response.json()) as { error?: string }; if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar la asistencia.");
      setSessions((current) => current.map((session) => session.id === visibleSession.id && session.date === visibleSession.date ? { ...session, students: visibleSession.students } : session));
      discardChanges(); setSaveState("saved");
    } catch { setSaveState("error"); }
  }

  function moveWeek(direction: -1 | 1) {
    const next = Math.min(Math.max(weekIndex + direction, 0), weekStarts.length - 1); if (next === weekIndex) return;
    setWeekIndex(next); setSaveState("idle");
  }

  function openStudentEditor(student: Student | "new") { setEditorError(null); setStudentEditor(student); setMenuOpen(false); }
  function openClassEditor(item: WeeklyClass | "new") { setEditorError(null); setClassEditor(item); setMenuOpen(false); }

  async function reloadData() {
    const response = await fetch(`/api/classes?weekStart=${weekStarts[weekIndex]}`, { cache: "no-store" });
    const payload = (await response.json()) as { sessions?: ClassSession[]; error?: string }; if (!response.ok || !payload.sessions) throw new Error(payload.error ?? "No se pudo actualizar.");
    setSessions(payload.sessions);
    const studentsResponse = await fetch("/api/students", { cache: "no-store" }); const studentsPayload = (await studentsResponse.json()) as { students?: Student[]; error?: string }; if (!studentsResponse.ok || !studentsPayload.students) throw new Error(studentsPayload.error ?? "No se pudo actualizar el padrón.");
    setStudents(studentsPayload.students);
  }

  async function saveStudent(event: FormEvent<HTMLFormElement>, classIds: string[]) {
    event.preventDefault(); setIsMutating(true); setEditorError(null); const data = new FormData(event.currentTarget);
    try { const id = studentEditor !== "new" && studentEditor ? studentEditor.id : undefined; const response = await fetch(id ? `/api/students/${id}` : "/api/students", { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(id ? {} : { id: String(data.get("id") ?? "").trim() || undefined }), name: String(data.get("name") ?? "").trim(), phone: String(data.get("phone") ?? "").trim(), notes: String(data.get("notes") ?? "") }) }); const payload = (await response.json()) as { error?: string; student?: Student }; if (!response.ok || !payload.student) throw new Error(payload.error ?? "No se pudo guardar la alumna."); const previous = id ? classes.filter((item) => item.studentIds.includes(id)).map((item) => item.id) : []; if (!id) setStudentEditor(payload.student); await applyAssignments(payload.student, classIds, previous); await reloadData(); setStudentEditor(null); } catch (error) { setEditorError(errorMessage(error, "No se pudo guardar la alumna.")); } finally { setIsMutating(false); }
  }

  async function archiveStudent(student: Student) { if (!window.confirm(`¿Archivar a ${student.name}? Ya no aparecerá en el padrón activo, pero se conservará su historial.`)) return; setIsMutating(true); setEditorError(null); try { const response = await fetch(`/api/students/${student.id}`, { method: "DELETE" }); if (!response.ok) { const payload = (await response.json()) as { error?: string }; throw new Error(payload.error ?? "No se pudo archivar la alumna."); } await reloadData(); setStudentEditor(null); } catch (error) { setEditorError(errorMessage(error, "No se pudo archivar la alumna.")); } finally { setIsMutating(false); } }

  async function saveClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsMutating(true); setEditorError(null); const data = new FormData(event.currentTarget); const id = classEditor !== "new" && classEditor ? classEditor.id : undefined; const body = { title: String(data.get("title") ?? "").trim(), weekday: data.get("weekday"), time: data.get("time"), durationMinutes: Number(data.get("durationMinutes")), teacher: String(data.get("teacher") ?? "").trim(), room: String(data.get("room") ?? "").trim(), capacity: Number(data.get("capacity")) };
    try { const response = await fetch(id ? `/api/classes/${id}` : "/api/classes", { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? body : { id: `class-${Date.now()}`, ...body }) }); const payload = (await response.json()) as { error?: string }; if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar la clase."); await reloadData(); setClassEditor(null); } catch (error) { setEditorError(errorMessage(error, "No se pudo guardar la clase.")); } finally { setIsMutating(false); }
  }

  async function archiveClass(item: WeeklyClass) { if (!window.confirm(`¿Archivar “${item.title}”? No aparecerá en agendas nuevas y se conservará el historial.`)) return; setIsMutating(true); setEditorError(null); try { const response = await fetch(`/api/classes/${item.id}`, { method: "DELETE" }); if (!response.ok) { const payload = (await response.json()) as { error?: string }; throw new Error(payload.error ?? "No se pudo archivar la clase."); } await reloadData(); setClassEditor(null); } catch (error) { setEditorError(errorMessage(error, "No se pudo archivar la clase.")); } finally { setIsMutating(false); } }

  async function applyAssignments(student: Student, classIds: string[], previous: string[]) {
    const added = classIds.filter((id) => !previous.includes(id)); const removed = previous.filter((id) => !classIds.includes(id)); for (const ids of added.length ? [added] : []) { const response = await fetch(`/api/students/${student.id}/classes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classIds: ids }) }); if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? "No se pudo asignar el horario."); } for (const ids of removed.length ? [removed] : []) { const response = await fetch(`/api/students/${student.id}/classes`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classIds: ids }) }); if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? "No se pudo quitar el horario."); }
  }

  async function updateAssignments(student: Student, classIds: string[], previous: string[]) {
    setIsMutating(true); setEditorError(null); try { await applyAssignments(student, classIds, previous); await reloadData(); setStudentEditor(null); } catch (error) { setEditorError(errorMessage(error, "No se pudieron guardar los horarios.")); } finally { setIsMutating(false); }
  }

  return <main className="mx-auto min-h-screen w-full max-w-6xl px-4 pb-10 pt-5 sm:px-6 lg:px-8">
    <header className="mb-5 flex items-center justify-between gap-4"><div><p className="eyebrow">Patryoga · Administración</p><h1 className="text-3xl font-semibold text-ink">Tu salón, en orden</h1></div><button className="icon-button lg:hidden" aria-label="Abrir menú" onClick={() => setMenuOpen((value) => !value)}><Menu size={22} /></button></header>
    <nav className={clsx("mb-6 flex gap-2 rounded-2xl bg-white p-1.5 shadow-soft", menuOpen ? "flex-col lg:flex-row" : "hidden lg:flex")} aria-label="Secciones">
      <NavButton active={tab === "agenda"} icon={<CalendarDays size={18} />} label="Agenda y asistencia" onClick={() => { setTab("agenda"); setMenuOpen(false); }} />
      <NavButton active={tab === "students"} icon={<Users size={18} />} label="Alumnas" onClick={() => { setTab("students"); setMenuOpen(false); }} />
      <NavButton active={tab === "classes"} icon={<Clock size={18} />} label="Clases semanales" onClick={() => { setTab("classes"); setMenuOpen(false); }} />
    </nav>
    {loadError ? <Notice tone="error">No se pudo actualizar la información: {loadError}<button className="ml-auto font-semibold underline" onClick={() => window.location.reload()}>Reintentar</button></Notice> : null}
    {tab === "agenda" && visibleSession ? <AgendaView {...{ sessions, visibleSession, weekIndex, isLoading, saveState, hasChanges, dirtyCount, presentCount, absentCount, attendanceByKey, selectedId, setSelectedId, moveWeek, setAllStatuses, discardChanges, saveAttendance, setStudentStatus }} /> : null}
    {tab === "students" ? <StudentsView students={students} classes={classes} onNew={() => openStudentEditor("new")} onEdit={openStudentEditor} /> : null}
    {tab === "classes" ? <ClassesView classes={classes} onNew={() => openClassEditor("new")} onEdit={openClassEditor} /> : null}
    {studentEditor ? <StudentPanel student={studentEditor} classes={classes} allStudents={students} isMutating={isMutating} error={editorError} onClose={() => setStudentEditor(null)} onSave={saveStudent} onArchive={archiveStudent} onAssignments={updateAssignments} /> : null}
    {classEditor ? <ClassPanel item={classEditor} isMutating={isMutating} error={editorError} onClose={() => setClassEditor(null)} onSave={saveClass} onArchive={archiveClass} /> : null}
  </main>;
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) { return <button className={clsx("nav-button", active && "nav-button-active")} onClick={onClick} type="button">{icon}{label}</button>; }
function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" }) { return <div className={clsx("notice", tone === "error" && "notice-error")} role="status"><History size={18} />{children}</div>; }

function AgendaView({ sessions, visibleSession, weekIndex, isLoading, saveState, hasChanges, dirtyCount, presentCount, absentCount, attendanceByKey, selectedId, setSelectedId, moveWeek, setAllStatuses, discardChanges, saveAttendance, setStudentStatus }: { sessions: ClassSession[]; visibleSession: ClassSession; weekIndex: number; isLoading: boolean; saveState: SaveState; hasChanges: boolean; dirtyCount: number; presentCount: number; absentCount: number; attendanceByKey: Record<string, AttendanceStatus>; selectedId: string; setSelectedId: (id: string) => void; moveWeek: (direction: -1 | 1) => void; setAllStatuses: (status: AttendanceStatus) => void; discardChanges: () => void; saveAttendance: () => void; setStudentStatus: (id: string, status: AttendanceStatus) => void }) { return <section className="grid gap-5 lg:grid-cols-[minmax(260px,340px)_1fr]">
  <div className="space-y-4"><div className="rounded-2xl bg-white p-3 shadow-soft"><div className="flex items-center justify-between"><button className="icon-button" aria-label="Semana anterior" disabled={weekIndex === 0} onClick={() => moveWeek(-1)}><ChevronLeft size={20} /></button><div className="text-center"><p className="eyebrow">Semana</p><p className="font-semibold text-ink">Desde {formatShortDate(weekStarts[weekIndex])}</p></div><button className="icon-button" aria-label="Semana siguiente" disabled={weekIndex === weekStarts.length - 1} onClick={() => moveWeek(1)}><ChevronRight size={20} /></button></div></div><div className={clsx("space-y-3", isLoading && "opacity-60")} aria-busy={isLoading}>{sessions.map((session) => <button key={`${session.id}-${session.date}`} className={clsx("class-card", selectedId === session.id && "class-card-active")} onClick={() => setSelectedId(session.id)} type="button"><div className="flex items-start justify-between gap-3"><div><p className="eyebrow text-moss">{weekdayLabels[session.weekday]} · {formatShortDate(session.date)}</p><h2 className="mt-1 text-lg font-semibold text-ink">{session.title}</h2></div><span className="count-pill">{session.students.filter((s) => (attendanceByKey[`${session.id}:${session.date}:${s.id}`] ?? s.status) === "present").length}/{session.students.length}</span></div><p className="mt-3 flex items-center gap-2 text-sm text-ink/65"><Clock size={16} />{session.time} <span>·</span> {session.room}</p></button>)}</div></div>
  <section className="rounded-2xl bg-white p-4 shadow-soft sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="eyebrow text-moss">{weekdayLabels[visibleSession.weekday]} · {formatShortDate(visibleSession.date)} · {visibleSession.time}</p><h2 className="mt-1 text-2xl font-semibold text-ink">{visibleSession.title}</h2><p className="mt-1 text-sm text-ink/65">{visibleSession.teacher} · {visibleSession.durationMinutes} min · {visibleSession.room} · cupo {visibleSession.capacity}</p></div><div className="grid grid-cols-3 gap-2 sm:min-w-64"><Metric label="Presentes" value={presentCount} tone="moss" /><Metric label="Ausentes" value={absentCount} tone="clay" /><Metric label="Pendientes" value={visibleSession.students.length - presentCount - absentCount} tone="ink" /></div></div><Notice tone={saveState === "error" ? "error" : "info"}>{saveState === "saving" ? "Guardando asistencia…" : saveState === "saved" ? "Asistencia guardada correctamente." : saveState === "error" ? "No se pudo guardar. Revisá la conexión e intentá nuevamente." : hasChanges ? `${dirtyCount} ${dirtyCount === 1 ? "cambio pendiente" : "cambios pendientes"} de guardar.` : "La asistencia está al día."}</Notice><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]"><button className="action-button action-button-soft" disabled={saveState === "saving"} onClick={() => setAllStatuses("present")}><CheckCheck size={18} />Marcar todos presentes</button><button className="action-button action-button-light" disabled={!hasChanges || saveState === "saving"} onClick={discardChanges}><RotateCcw size={17} />Deshacer</button><button className="action-button action-button-dark" disabled={!hasChanges || saveState === "saving"} onClick={saveAttendance}>{saveState === "saving" ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />}{saveState === "saving" ? "Guardando" : "Guardar cambios"}</button></div><div className="mt-5 space-y-3">{visibleSession.students.map((student) => <article className="student-attendance" key={student.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-semibold text-ink">{student.name}</h3><p className="mt-1 text-sm text-ink/60">{student.phone}</p>{student.notes ? <p className="mt-2 text-sm text-clay">{student.notes}</p> : null}</div><span className={clsx("status-chip", `status-${student.status}`)}>{statusCopy[student.status]}</span></div><div className="mt-3 grid grid-cols-3 gap-2"><StatusButton active={student.status === "present"} icon={<Check size={17} />} label="Presente" onClick={() => setStudentStatus(student.id, "present")} tone="present" /><StatusButton active={student.status === "absent"} icon={<X size={17} />} label="Ausente" onClick={() => setStudentStatus(student.id, "absent")} tone="absent" /><StatusButton active={student.status === "unmarked"} icon={<UserCheck size={17} />} label="Pendiente" onClick={() => setStudentStatus(student.id, "unmarked")} tone="unmarked" /></div></article>)}</div></section></section>; }

function Metric({ label, value, tone }: { label: string; value: number; tone: "moss" | "clay" | "ink" }) { return <div className="rounded-xl bg-linen px-2 py-3 text-center"><p className={clsx("text-xl font-semibold", `text-${tone}`)}>{value}</p><p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-ink/55">{label}</p></div>; }
function StatusButton({ active, icon, label, onClick, tone }: { active: boolean; icon: ReactNode; label: string; onClick: () => void; tone: AttendanceStatus }) { return <button aria-pressed={active} className={clsx("status-button", active && `status-button-${tone}`)} onClick={onClick} type="button">{icon}{label}</button>; }

function StudentsView({ students, classes, onNew, onEdit }: { students: Student[]; classes: WeeklyClass[]; onNew: () => void; onEdit: (student: Student) => void }) { return <section><SectionHeader eyebrow="Padrón activo" title="Alumnas" description={`${students.length} ${students.length === 1 ? "alumna activa" : "alumnas activas"}. Datos administrativos y horarios habituales.`} action="Nueva alumna" onAction={onNew} /><div className="grid gap-3 sm:grid-cols-2">{students.map((student) => { const assignmentCount = classes.filter((item) => item.studentIds.includes(student.id)).length; return <button className="directory-card" key={student.id} onClick={() => onEdit(student)} type="button"><div className="avatar">{student.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div className="min-w-0 flex-1 text-left"><h2 className="truncate font-semibold text-ink">{student.name}</h2><p className="mt-1 text-sm text-ink/60">{student.phone}</p><p className="mt-3 text-xs font-medium text-moss">{assignmentCount} {assignmentCount === 1 ? "horario habitual" : "horarios habituales"}</p></div><Edit3 className="shrink-0 text-ink/35" size={18} /></button>; })}</div>{students.length === 0 ? <EmptyState label="Todavía no hay alumnas activas." /> : null}</section>; }
function ClassesView({ classes, onNew, onEdit }: { classes: WeeklyClass[]; onNew: () => void; onEdit: (item: WeeklyClass) => void }) { return <section><SectionHeader eyebrow="Plantillas recurrentes" title="Clases semanales" description={`${classes.length} ${classes.length === 1 ? "horario activo" : "horarios activos"}. Editá cupos, sala y datos del encuentro.`} action="Nueva clase" onAction={onNew} /><div className="grid gap-3 sm:grid-cols-2">{classes.map((item) => <button className="directory-card" key={item.id} onClick={() => onEdit(item)} type="button"><div className="class-icon"><Clock size={21} /></div><div className="min-w-0 flex-1 text-left"><p className="eyebrow text-moss">{weekdayLabels[item.weekday]} · {item.time}</p><h2 className="mt-1 font-semibold text-ink">{item.title}</h2><p className="mt-1 text-sm text-ink/60">{item.teacher} · {item.room} · {item.capacity} lugares</p><p className="mt-3 text-xs font-medium text-moss">{item.studentIds.length} alumnas asignadas</p></div><Edit3 className="shrink-0 text-ink/35" size={18} /></button>)}</div>{classes.length === 0 ? <EmptyState label="Todavía no hay clases activas." /> : null}</section>; }
function SectionHeader({ eyebrow, title, description, action, onAction }: { eyebrow: string; title: string; description: string; action: string; onAction: () => void }) { return <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow text-moss">{eyebrow}</p><h2 className="mt-1 text-3xl font-semibold text-ink">{title}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-ink/65">{description}</p></div><button className="action-button action-button-dark w-full sm:w-auto" onClick={onAction}><Plus size={18} />{action}</button></div>; }
function EmptyState({ label }: { label: string }) { return <div className="empty-state"><Users size={24} className="text-moss" /><p>{label}</p></div>; }

function Panel({ title, description, children, onClose }: { title: string; description: string; children: ReactNode; onClose: () => void }) { return <div className="panel-backdrop" role="presentation"><section className="panel" role="dialog" aria-modal="true" aria-label={title}><div className="flex items-start justify-between gap-4 border-b border-mist pb-4"><div><p className="eyebrow text-moss">Editar información</p><h2 className="mt-1 text-2xl font-semibold text-ink">{title}</h2><p className="mt-1 text-sm leading-5 text-ink/60">{description}</p></div><button className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={20} /></button></div>{children}</section></div>; }
function Field({ label, name, defaultValue, type = "text", required = true }: { label: string; name: string; defaultValue?: string | number; type?: string; required?: boolean }) { return <label className="field"><span>{label}</span><input name={name} defaultValue={defaultValue} type={type} required={required} /></label>; }
function StudentPanel({ student, classes, allStudents, isMutating, error, onClose, onSave, onArchive, onAssignments }: { student: Student | "new"; classes: WeeklyClass[]; allStudents: Student[]; isMutating: boolean; error: string | null; onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>, classIds: string[]) => void; onArchive: (student: Student) => void; onAssignments: (student: Student, classIds: string[], previous: string[]) => void }) { const existing = student !== "new" ? student : null; const previous = existing ? classes.filter((item) => item.studentIds.includes(existing.id)).map((item) => item.id) : []; const [selected, setSelected] = useState(previous); return <Panel title={existing ? existing.name : "Nueva alumna"} description="El teléfono y las notas son solo para uso administrativo." onClose={onClose}><form className="panel-content" onSubmit={(event) => onSave(event, selected)}><Field label="Nombre y apellido" name="name" defaultValue={existing?.name} /><Field label="Teléfono" name="phone" defaultValue={existing?.phone} type="tel" /><Field label="Notas" name="notes" defaultValue={existing?.notes} required={false} /><Field label="Identificador (opcional)" name="id" defaultValue={existing?.id} required={false} /><div><p className="field-label">Horarios habituales</p><div className="check-list">{classes.map((item) => <label className="check-row" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span><strong>{weekdayLabels[item.weekday]} · {item.time}</strong><small>{item.title} · {item.studentIds.length}/{item.capacity} lugares</small></span></label>)}</div>{classes.length === 0 ? <p className="text-sm text-ink/55">Creá una clase semanal para poder asignar horarios.</p> : null}</div>{error ? <Notice tone="error">{error}</Notice> : null}<div className="panel-actions"><button className="action-button action-button-light" type="button" onClick={onClose}>Cancelar</button><button className="action-button action-button-dark" disabled={isMutating} type="submit">{isMutating ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />}Guardar alumna</button></div></form>{existing ? <div className="panel-footer"><button className="danger-button" disabled={isMutating} onClick={() => onArchive(existing)} type="button"><Archive size={17} />Archivar alumna</button><button className="text-button" disabled={isMutating || allStudents.length === 0} onClick={() => onAssignments(existing, selected, previous)} type="button">Guardar horarios</button></div> : null}</Panel>; }
function ClassPanel({ item, isMutating, error, onClose, onSave, onArchive }: { item: WeeklyClass | "new"; isMutating: boolean; error: string | null; onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void; onArchive: (item: WeeklyClass) => void }) { const existing = item !== "new" ? item : null; return <Panel title={existing ? existing.title : "Nueva clase"} description="El horario se repite cada semana y alimenta la agenda." onClose={onClose}><form className="panel-content" onSubmit={onSave}><Field label="Nombre de la clase" name="title" defaultValue={existing?.title} /><div className="grid grid-cols-2 gap-3"><label className="field"><span>Día</span><select name="weekday" defaultValue={existing?.weekday ?? "monday"}>{weekdays.map((day) => <option key={day} value={day}>{weekdayLabels[day]}</option>)}</select></label><Field label="Hora" name="time" defaultValue={existing?.time ?? "09:00"} type="time" /></div><div className="grid grid-cols-2 gap-3"><Field label="Duración (min)" name="durationMinutes" defaultValue={existing?.durationMinutes ?? 60} type="number" /><Field label="Cupo" name="capacity" defaultValue={existing?.capacity ?? 8} type="number" /></div><Field label="Docente" name="teacher" defaultValue={existing?.teacher} /><Field label="Sala" name="room" defaultValue={existing?.room} />{error ? <Notice tone="error">{error}</Notice> : null}<div className="panel-actions"><button className="action-button action-button-light" type="button" onClick={onClose}>Cancelar</button><button className="action-button action-button-dark" disabled={isMutating} type="submit">{isMutating ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />}Guardar clase</button></div></form>{existing ? <div className="panel-footer"><button className="danger-button" disabled={isMutating} onClick={() => onArchive(existing)} type="button"><Archive size={17} />Archivar clase</button></div> : null}</Panel>; }
