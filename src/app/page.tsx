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
  Layers3,
  LoaderCircle,
  Menu,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  UserRoundCheck,
  Users,
  X
} from "lucide-react";
import { clsx } from "clsx";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { PlanManagement } from "@/components/plan-management";
import { StudentPlanSection } from "@/components/student-plan-section";
import { weekdayLabels } from "@/lib/mock-data";
import type { AttendanceStatus, ClassSession, MonthlyPlanAssignment, Student, Weekday, WeeklyClass } from "@/lib/types";

const weekdays: Array<Exclude<Weekday, "saturday">> = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const weekdayOrder: Record<Weekday, number> = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5 };
type SaveState = "idle" | "saving" | "saved" | "error";
type Tab = "agenda" | "students" | "classes" | "plans";
type AgendaMode = "day" | "week" | "range";

function isoDateInBuenosAires() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric"
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateFromIso(value: string) {
  return new Date(`${value}T12:00:00`);
}

function isoFromDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = dateFromIso(value);
  return !Number.isNaN(date.getTime()) && isoFromDate(date) === value;
}

function addDays(value: string, days: number) {
  const date = dateFromIso(value);
  date.setDate(date.getDate() + days);
  return isoFromDate(date);
}

function daysBetween(start: string, end: string) {
  return Math.round((dateFromIso(end).getTime() - dateFromIso(start).getTime()) / 86_400_000);
}

function mondayOf(value: string) {
  const date = dateFromIso(value);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return isoFromDate(date);
}

function weekStartsBetween(start: string, end: string) {
  const result: string[] = [];
  for (let week = mondayOf(start); week <= end; week = addDays(week, 7)) result.push(week);
  return result;
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" }).format(dateFromIso(date));
}

function attendanceLabel(status: AttendanceStatus, date: string) {
  if (status === "present") return "Presente";
  if (status === "absent") return "Ausente";
  return date > today ? "Programada" : "Sin registrar";
}

function sessionKey(session: Pick<ClassSession, "id" | "date">) {
  return `${session.id}:${session.date}`;
}

function uniqueSessions(sessions: ClassSession[]) {
  return [...new Map(sessions.map((session) => [sessionKey(session), session])).values()];
}

function friendlyApiError(message: string | undefined, fallback: string) {
  if (!message) return fallback;
  const overlap = message.match(/^class schedule overlaps with "(.+)" \([^)]+\) on (\w+) at ([0-9:]+)$/);
  if (overlap) {
    const day = weekdayLabels[overlap[2] as Weekday] ?? "ese día";
    return `Ese horario se superpone con “${overlap[1]}”, el ${day.toLowerCase()} a las ${overlap[3]}. Elegí otra hora o ajustá la duración.`;
  }
  if (message === "capacity is below active enrollment") return "El cupo no puede ser menor que la cantidad de alumnas/os con horario asignado.";
  if (message === "class capacity exceeded") return "Ese horario ya alcanzó su cupo. Elegí otro o ampliá la capacidad de la clase.";
  if (message === "cannot assign a class that is no longer active") return "Ese horario ya no está activo. Actualizá la agenda y elegí otro.";
  return fallback;
}

const today = isoDateInBuenosAires();
const currentWeek = mondayOf(today);
const catalogWeek = addDays(currentWeek, 7);

export default function Home() {
  const [tab, setTab] = useState<Tab>("agenda");
  const [menuOpen, setMenuOpen] = useState(false);
  const [agendaMode, setAgendaMode] = useState<AgendaMode>("week");
  const [dayDate, setDayDate] = useState(today);
  const [weekStart, setWeekStart] = useState(currentWeek);
  const [rangeStart, setRangeStart] = useState(currentWeek);
  const [rangeEnd, setRangeEnd] = useState(addDays(currentWeek, 4));
  const [selectedKey, setSelectedKey] = useState("");
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [catalogSessions, setCatalogSessions] = useState<ClassSession[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [archivedStudents, setArchivedStudents] = useState<Student[]>([]);
  const [attendanceByKey, setAttendanceByKey] = useState<Record<string, AttendanceStatus>>({});
  const [planAssignments, setPlanAssignments] = useState<MonthlyPlanAssignment[]>([]);
  const [planRefreshKey, setPlanRefreshKey] = useState(0);
  const [planContextError, setPlanContextError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [studentEditor, setStudentEditor] = useState<Student | "new" | null>(null);
  const [classEditor, setClassEditor] = useState<WeeklyClass | "new" | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [studentEditorNotice, setStudentEditorNotice] = useState<string | null>(null);
  const [operationNotice, setOperationNotice] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const agendaValidationError = useMemo(() => {
    if (agendaMode === "day" && !isIsoDate(dayDate)) return "Elegí una fecha válida para ver el día.";
    if (agendaMode === "week" && !isIsoDate(weekStart)) return "Elegí una fecha válida para ver la semana.";
    if (agendaMode === "range") {
      if (!isIsoDate(rangeStart) || !isIsoDate(rangeEnd)) return "Completá una fecha inicial y una fecha final válidas.";
      if (rangeEnd < rangeStart) return "La fecha final debe ser igual o posterior a la fecha inicial.";
      if (daysBetween(rangeStart, rangeEnd) > 90) return "El rango puede abarcar hasta 90 días. Acortá las fechas para continuar.";
    }
    return null;
  }, [agendaMode, dayDate, rangeEnd, rangeStart, weekStart]);

  const queryWeekStarts = useMemo(() => {
    if (agendaValidationError) return [];
    if (agendaMode === "day") return [mondayOf(dayDate)];
    if (agendaMode === "week") return [mondayOf(weekStart)];
    return weekStartsBetween(rangeStart, rangeEnd);
  }, [agendaMode, agendaValidationError, dayDate, rangeEnd, rangeStart, weekStart]);

  const visibleSessions = useMemo(() => sessions.filter((session) => {
    if (agendaMode === "day") return session.date === dayDate;
    if (agendaMode === "range") return session.date >= rangeStart && session.date <= rangeEnd;
    return true;
  }), [agendaMode, dayDate, rangeEnd, rangeStart, sessions]);

  const visibleMonthKey = useMemo(() => [...new Set(visibleSessions.map((session) => session.date.slice(0, 7)))].sort().join(","), [visibleSessions]);

  const classes = useMemo(() => {
    const map = new Map<string, WeeklyClass>();
    catalogSessions.forEach((session) => map.set(session.id, {
      id: session.id,
      title: session.title,
      weekday: session.weekday,
      time: session.time,
      durationMinutes: session.durationMinutes,
      teacher: session.teacher,
      room: session.room,
      capacity: session.capacity,
      studentIds: session.studentIds
    }));
    return [...map.values()].sort((a, b) => `${weekdayOrder[a.weekday]}${a.time}`.localeCompare(`${weekdayOrder[b.weekday]}${b.time}`));
  }, [catalogSessions]);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const requestedWeeks = [...new Set([...(agendaValidationError ? [] : queryWeekStarts), catalogWeek])];
      const [studentResponse, archivedStudentResponse, ...classResponses] = await Promise.all([
        fetch("/api/students?status=active", { cache: "no-store", signal }),
        fetch("/api/students?status=archived", { cache: "no-store", signal }),
        ...requestedWeeks.map((start) => fetch(`/api/classes?weekStart=${start}`, { cache: "no-store", signal }))
      ]);
      const studentPayload = (await studentResponse.json()) as { students?: Student[]; error?: string };
      const archivedStudentPayload = (await archivedStudentResponse.json()) as { students?: Student[]; error?: string };
      if (!studentResponse.ok || !Array.isArray(studentPayload.students)) throw new Error("No se pudo cargar el listado de alumnas/os.");
      if (!archivedStudentResponse.ok || !Array.isArray(archivedStudentPayload.students)) throw new Error("No se pudo cargar el archivo de alumnas/os.");
      const sessionsByWeek = new Map<string, ClassSession[]>();
      for (let index = 0; index < classResponses.length; index += 1) {
        const response = classResponses[index];
        const payload = (await response.json()) as { sessions?: ClassSession[]; error?: string };
        if (!response.ok || !Array.isArray(payload.sessions)) throw new Error("No se pudo cargar la agenda.");
        sessionsByWeek.set(requestedWeeks[index], payload.sessions);
      }
      setStudents(studentPayload.students);
      setArchivedStudents(archivedStudentPayload.students);
      setSessions(agendaValidationError ? [] : uniqueSessions(queryWeekStarts.flatMap((start) => sessionsByWeek.get(start) ?? [])));
      setCatalogSessions(sessionsByWeek.get(catalogWeek) ?? []);
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) setLoadError(error instanceof Error ? error.message : "No se pudo cargar la información.");
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [agendaValidationError, queryWeekStarts]);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  useEffect(() => {
    const controller = new AbortController();
    const months = visibleMonthKey ? visibleMonthKey.split(",") : [];
    if (!months.length) {
      setPlanAssignments([]);
      setPlanContextError(null);
      return () => controller.abort();
    }
    async function loadPlanAssignments() {
      setPlanContextError(null);
      try {
        const responses = await Promise.all(months.map((month) => fetch(`/api/plan-assignments?month=${month}`, { cache: "no-store", signal: controller.signal })));
        const assignments: MonthlyPlanAssignment[] = [];
        for (const response of responses) {
          const payload = await response.json() as { assignments?: MonthlyPlanAssignment[] };
          if (!response.ok || !Array.isArray(payload.assignments)) throw new Error("No se pudo cargar el contexto de planes de la agenda.");
          assignments.push(...payload.assignments);
        }
        setPlanAssignments(assignments);
      } catch (error) {
        if (!(error instanceof Error && error.name === "AbortError")) {
          setPlanAssignments([]);
          setPlanContextError(error instanceof Error ? error.message : "No se pudieron cargar los planes mensuales.");
        }
      }
    }
    void loadPlanAssignments();
    return () => controller.abort();
  }, [planRefreshKey, tab, visibleMonthKey]);

  useEffect(() => {
    setSelectedKey((current) => visibleSessions.some((session) => sessionKey(session) === current) ? current : visibleSessions[0] ? sessionKey(visibleSessions[0]) : "");
  }, [visibleSessions]);

  useEffect(() => {
    setSaveState("idle");
    setSaveError(null);
  }, [selectedKey]);

  const selectedSession = visibleSessions.find((session) => sessionKey(session) === selectedKey) ?? visibleSessions[0];
  const visibleSession = selectedSession ? {
    ...selectedSession,
    students: selectedSession.students.map((student) => ({
      ...student,
      status: attendanceByKey[`${selectedSession.id}:${selectedSession.date}:${student.id}`] ?? student.status
    }))
  } : undefined;
  const presentCount = visibleSession?.students.filter((student) => student.status === "present").length ?? 0;
  const absentCount = visibleSession?.students.filter((student) => student.status === "absent").length ?? 0;
  const dirtyCount = visibleSession?.students.filter((student) => attendanceByKey[`${visibleSession.id}:${visibleSession.date}:${student.id}`] !== undefined).length ?? 0;
  const hasChanges = dirtyCount > 0;

  function setStudentStatus(studentId: string, status: Exclude<AttendanceStatus, "unmarked">) {
    if (!visibleSession || !selectedSession) return;
    const key = `${visibleSession.id}:${visibleSession.date}:${studentId}`;
    const savedStatus = selectedSession.students.find((student) => student.id === studentId)?.status;
    setAttendanceByKey((current) => {
      const next = { ...current };
      if (status === savedStatus) delete next[key]; else next[key] = status;
      return next;
    });
    setSaveState("idle");
    setSaveError(null);
  }

  function setAllStatuses(status: Exclude<AttendanceStatus, "unmarked">) {
    if (!selectedSession) return;
    setAttendanceByKey((current) => {
      const next = { ...current };
      for (const student of selectedSession.students) {
        const key = `${selectedSession.id}:${selectedSession.date}:${student.id}`;
        if (student.status === status) delete next[key]; else next[key] = status;
      }
      return next;
    });
    setSaveState("idle");
    setSaveError(null);
  }

  function discardChanges() {
    if (!selectedSession) return;
    setAttendanceByKey((current) => {
      const next = { ...current };
      selectedSession.students.forEach((student) => delete next[`${selectedSession.id}:${selectedSession.date}:${student.id}`]);
      return next;
    });
    setSaveState("idle");
    setSaveError(null);
  }

  async function saveAttendance() {
    if (!hasChanges || !visibleSession || saveState === "saving") return;
    setSaveState("saving");
    setSaveError(null);
    const changedStudents = visibleSession.students.filter((student) => attendanceByKey[`${visibleSession.id}:${visibleSession.date}:${student.id}`] !== undefined);
    try {
      const response = await fetch(`/api/classes/${visibleSession.id}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: visibleSession.date, attendance: changedStudents.map(({ id, status }) => ({ studentId: id, status })) })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(friendlyApiError(payload.error, "No se pudo guardar la asistencia."));
      setSessions((current) => current.map((session) => sessionKey(session) === sessionKey(visibleSession) ? { ...session, students: visibleSession.students } : session));
      setAttendanceByKey((current) => {
        const next = { ...current };
        changedStudents.forEach((student) => delete next[`${visibleSession.id}:${visibleSession.date}:${student.id}`]);
        return next;
      });
      setPlanRefreshKey((current) => current + 1);
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar. Revisá la conexión e intentá nuevamente.");
    }
  }

  function moveWeek(direction: -1 | 1) {
    setWeekStart((current) => addDays(current, direction * 7));
  }

  function openStudentEditor(student: Student | "new") {
    setEditorError(null);
    setStudentEditorNotice(null);
    setStudentEditor(student);
    setMenuOpen(false);
  }

  function openClassEditor(item: WeeklyClass | "new") {
    setEditorError(null);
    setClassEditor(item);
    setMenuOpen(false);
  }

  async function applyAssignments(student: Student, classIds: string[], previous: string[]) {
    const added = classIds.filter((id) => !previous.includes(id));
    const removed = previous.filter((id) => !classIds.includes(id));
    if (removed.length) {
      const response = await fetch(`/api/students/${student.id}/classes`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classIds: removed })
      });
      const payload = response.ok ? {} : await response.json() as { error?: string };
      if (!response.ok) throw new Error(friendlyApiError(payload.error, "No se pudo quitar uno de los horarios."));
    }
    if (added.length) {
      const response = await fetch(`/api/students/${student.id}/classes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classIds: added })
      });
      const payload = response.ok ? {} : await response.json() as { error?: string };
      if (!response.ok) throw new Error(friendlyApiError(payload.error, "No se pudo asignar uno de los horarios."));
    }
  }

  async function saveStudent(event: FormEvent<HTMLFormElement>, classIds: string[]) {
    event.preventDefault();
    setIsMutating(true);
    setEditorError(null);
    setOperationNotice(null);
    setOperationError(null);
    const data = new FormData(event.currentTarget);
    try {
      const id = studentEditor !== "new" && studentEditor ? studentEditor.id : undefined;
      const response = await fetch(id ? `/api/students/${id}` : "/api/students", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(data.get("name") ?? "").trim(),
          phone: String(data.get("phone") ?? "").trim(),
          notes: String(data.get("notes") ?? "")
        })
      });
      const payload = (await response.json()) as { error?: string; student?: Student };
      if (!response.ok || !payload.student) throw new Error(friendlyApiError(payload.error, "No se pudieron guardar los datos de la alumna/o."));
      const previous = id ? classes.filter((item) => item.studentIds.includes(id)).map((item) => item.id) : [];
      if (!id) setStudentEditor(payload.student);
      await applyAssignments(payload.student, classIds, previous);
      await loadData();
      setStudentEditor(null);
      setStudentEditorNotice(null);
      setOperationNotice("Datos y horarios de la alumna/o guardados correctamente.");
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "No se pudieron guardar los datos de la alumna/o.");
    } finally {
      setIsMutating(false);
    }
  }

  async function archiveStudent(student: Student) {
    if (!window.confirm(`¿Archivar a ${student.name}? Se cerrarán sus horarios actuales, pero sus asistencias y su historial se conservarán.`)) return;
    setIsMutating(true);
    setEditorError(null);
    setOperationNotice(null);
    setOperationError(null);
    try {
      const response = await fetch(`/api/students/${student.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(friendlyApiError(payload.error, "No se pudo archivar a la alumna/o."));
      }
      await loadData();
      setStudentEditor(null);
      setOperationNotice(`${student.name} pasó al archivo. Su historial permanece disponible y podés reingresarla/o desde allí.`);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "No se pudo archivar a la alumna/o.");
    } finally {
      setIsMutating(false);
    }
  }

  async function reenterStudent(student: Student) {
    if (!window.confirm(`¿Reingresar a ${student.name}? Después tendrás que asignarle un horario actual.`)) return;
    setIsMutating(true);
    setEditorError(null);
    setOperationNotice(null);
    setOperationError(null);
    try {
      const response = await fetch(`/api/students/${student.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true })
      });
      const payload = (await response.json()) as { error?: string; student?: Student };
      if (!response.ok || !payload.student) throw new Error(friendlyApiError(payload.error, "No se pudo completar el reingreso."));
      await loadData();
      setStudentEditor(payload.student);
      setStudentEditorNotice("Reingreso confirmado. Quedó sin horarios porque los anteriores no se reactivan; podés asignarle uno ahora o más adelante.");
    } catch (error) {
      setOperationNotice(null);
      setOperationError(error instanceof Error ? error.message : "No se pudo completar el reingreso.");
    } finally {
      setIsMutating(false);
    }
  }

  async function saveClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsMutating(true);
    setEditorError(null);
    setOperationNotice(null);
    setOperationError(null);
    const data = new FormData(event.currentTarget);
    const id = classEditor !== "new" && classEditor ? classEditor.id : undefined;
    const body = {
      title: String(data.get("title") ?? "").trim(),
      weekday: data.get("weekday"),
      time: data.get("time"),
      durationMinutes: Number(data.get("durationMinutes")),
      capacity: Number(data.get("capacity"))
    };
    try {
      const response = await fetch(id ? `/api/classes/${id}` : "/api/classes", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(friendlyApiError(payload.error, "No se pudo guardar la clase. Revisá los datos e intentá nuevamente."));
      await loadData();
      setClassEditor(null);
      setOperationNotice("Clase guardada correctamente.");
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "No se pudo guardar la clase.");
    } finally {
      setIsMutating(false);
    }
  }

  async function deleteClass(item: WeeklyClass) {
    const confirmed = window.confirm(`¿Eliminar “${item.title}” de la agenda? Si no tiene asistencias ni aparece en un plan mensual se eliminará por completo. Si ya forma parte del historial, se retirará de las agendas futuras y se conservarán sus registros.`);
    if (!confirmed) return;
    setIsMutating(true);
    setEditorError(null);
    setOperationNotice(null);
    setOperationError(null);
    try {
      const response = await fetch(`/api/classes/${item.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(friendlyApiError(payload.error, "No se pudo eliminar la clase."));
      }
      await loadData();
      setClassEditor(null);
      setOperationNotice("La clase se quitó de la agenda. Si tenía asistencias o formaba parte de un plan mensual, el servidor conservó su historial y cerró sus horarios vigentes.");
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "No se pudo eliminar la clase.");
    } finally {
      setIsMutating(false);
    }
  }

  return <main className="mx-auto min-h-screen w-full max-w-6xl px-4 pb-10 pt-5 sm:px-6 lg:px-8">
    <header className="mb-5 flex items-center justify-between gap-4"><div className="min-w-0"><p className="eyebrow">Patryoga · Administración</p><h1 className="text-3xl font-semibold text-ink">Tu salón, en orden</h1></div><div className="flex shrink-0 gap-2"><SignOutButton /><button className="icon-button lg:hidden" aria-label="Abrir menú" onClick={() => setMenuOpen((value) => !value)}><Menu size={22} /></button></div></header>
    <nav className={clsx("mb-6 flex gap-2 rounded-2xl bg-white p-1.5 shadow-soft", menuOpen ? "flex-col lg:flex-row" : "hidden lg:flex")} aria-label="Secciones">
      <NavButton active={tab === "agenda"} icon={<CalendarDays size={18} />} label="Agenda y asistencia" onClick={() => { setTab("agenda"); setMenuOpen(false); }} />
      <NavButton active={tab === "students"} icon={<Users size={18} />} label="Alumnas/os" onClick={() => { setTab("students"); setMenuOpen(false); }} />
      <NavButton active={tab === "classes"} icon={<Clock size={18} />} label="Clases semanales" onClick={() => { setTab("classes"); setMenuOpen(false); }} />
      <NavButton active={tab === "plans"} icon={<Layers3 size={18} />} label="Planes" onClick={() => { setTab("plans"); setMenuOpen(false); }} />
    </nav>
    {loadError ? <Notice tone="error">No se pudo actualizar la información: {loadError}<button className="ml-auto font-semibold underline" onClick={() => void loadData()}>Reintentar</button></Notice> : null}
    {operationError ? <Notice tone="error">{operationError}<button className="ml-auto shrink-0" aria-label="Cerrar error" onClick={() => setOperationError(null)}><X size={17} /></button></Notice> : null}
    {operationNotice ? <Notice>{operationNotice}<button className="ml-auto shrink-0" aria-label="Cerrar aviso" onClick={() => setOperationNotice(null)}><X size={17} /></button></Notice> : null}
    {tab === "agenda" ? <AgendaView {...{ sessions: visibleSessions, visibleSession, agendaMode, setAgendaMode, dayDate, setDayDate, weekStart, setWeekStart, rangeStart, setRangeStart, rangeEnd, setRangeEnd, validationError: agendaValidationError, isLoading, saveState, saveError, hasChanges, dirtyCount, presentCount, absentCount, attendanceByKey, planAssignments, planContextError, selectedKey, setSelectedKey, moveWeek, setAllStatuses, discardChanges, saveAttendance, setStudentStatus }} /> : null}
    {tab === "students" ? <StudentsView students={students} archivedStudents={archivedStudents} classes={classes} isMutating={isMutating} onNew={() => openStudentEditor("new")} onEdit={openStudentEditor} onReenter={reenterStudent} /> : null}
    {tab === "classes" ? <ClassesView classes={classes} onNew={() => openClassEditor("new")} onEdit={openClassEditor} /> : null}
    {tab === "plans" ? <PlanManagement /> : null}
    {studentEditor ? <StudentPanel student={studentEditor} classes={classes} isMutating={isMutating} error={editorError} notice={studentEditorNotice} onClose={() => { setStudentEditor(null); setStudentEditorNotice(null); }} onSave={saveStudent} onArchive={archiveStudent} /> : null}
    {classEditor ? <ClassPanel item={classEditor} isMutating={isMutating} error={editorError} onClose={() => setClassEditor(null)} onSave={saveClass} onDelete={deleteClass} /> : null}
  </main>;
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button className={clsx("nav-button", active && "nav-button-active")} onClick={onClick} type="button">{icon}{label}</button>;
}

function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" }) {
  return <div className={clsx("notice", tone === "error" && "notice-error")} role="status"><History className="shrink-0" size={18} />{children}</div>;
}

type AgendaViewProps = {
  sessions: ClassSession[];
  visibleSession?: ClassSession;
  agendaMode: AgendaMode;
  setAgendaMode: (mode: AgendaMode) => void;
  dayDate: string;
  setDayDate: (date: string) => void;
  weekStart: string;
  setWeekStart: (date: string) => void;
  rangeStart: string;
  setRangeStart: (date: string) => void;
  rangeEnd: string;
  setRangeEnd: (date: string) => void;
  validationError: string | null;
  isLoading: boolean;
  saveState: SaveState;
  saveError: string | null;
  hasChanges: boolean;
  dirtyCount: number;
  presentCount: number;
  absentCount: number;
  attendanceByKey: Record<string, AttendanceStatus>;
  planAssignments: MonthlyPlanAssignment[];
  planContextError: string | null;
  selectedKey: string;
  setSelectedKey: (key: string) => void;
  moveWeek: (direction: -1 | 1) => void;
  setAllStatuses: (status: Exclude<AttendanceStatus, "unmarked">) => void;
  discardChanges: () => void;
  saveAttendance: () => void;
  setStudentStatus: (id: string, status: Exclude<AttendanceStatus, "unmarked">) => void;
};

function AgendaView(props: AgendaViewProps) {
  const { sessions, visibleSession, agendaMode, setAgendaMode, dayDate, setDayDate, weekStart, setWeekStart, rangeStart, setRangeStart, rangeEnd, setRangeEnd, validationError, isLoading, saveState, saveError, hasChanges, dirtyCount, presentCount, absentCount, attendanceByKey, planAssignments, planContextError, selectedKey, setSelectedKey, moveWeek, setAllStatuses, discardChanges, saveAttendance, setStudentStatus } = props;
  return <section>
    <div className="agenda-controls shadow-soft">
      <div className="agenda-view-switch" aria-label="Vista de agenda">
        {(["day", "week", "range"] as AgendaMode[]).map((mode) => <button key={mode} className={clsx(agendaMode === mode && "active")} aria-pressed={agendaMode === mode} onClick={() => setAgendaMode(mode)} type="button">{{ day: "Día", week: "Semana", range: "Rango" }[mode]}</button>)}
      </div>
      {agendaMode === "day" ? <DateControl label="Día" value={dayDate} onChange={setDayDate} /> : null}
      {agendaMode === "week" ? <div className="week-control"><button className="icon-button" aria-label="Semana anterior" disabled={!isIsoDate(weekStart)} onClick={() => moveWeek(-1)}><ChevronLeft size={20} /></button><DateControl label="Fecha dentro de la semana" value={weekStart} onChange={setWeekStart} /><button className="icon-button" aria-label="Semana siguiente" disabled={!isIsoDate(weekStart)} onClick={() => moveWeek(1)}><ChevronRight size={20} /></button></div> : null}
      {agendaMode === "range" ? <div className="range-controls"><DateControl label="Fecha inicial" value={rangeStart} onChange={setRangeStart} /><DateControl label="Fecha final" value={rangeEnd} onChange={setRangeEnd} /></div> : null}
      {validationError ? <Notice tone="error">{validationError}</Notice> : null}
      {planContextError ? <Notice tone="error">{planContextError} La asistencia sigue disponible, pero el pool mensual no puede mostrarse por ahora.</Notice> : null}
    </div>
    <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
      <div className={clsx("min-w-0 space-y-3", isLoading && "opacity-60")} aria-busy={isLoading}>
        {sessions.map((session) => <button key={sessionKey(session)} className={clsx("class-card", selectedKey === sessionKey(session) && "class-card-active")} onClick={() => setSelectedKey(sessionKey(session))} type="button"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="eyebrow text-moss">{weekdayLabels[session.weekday]} · {formatShortDate(session.date)}</p><h2 className="mt-1 truncate text-lg font-semibold text-ink">{session.title}</h2></div><span className="count-pill">{session.students.filter((student) => (attendanceByKey[`${session.id}:${session.date}:${student.id}`] ?? student.status) === "present").length}/{session.students.length}</span></div><p className="mt-3 flex items-center gap-2 text-sm text-ink/65"><Clock size={16} />{session.time} <span>·</span> {session.durationMinutes} min</p></button>)}
        {!isLoading && !validationError && sessions.length === 0 ? <EmptyState label="No hay clases en las fechas elegidas." /> : null}
      </div>
      {visibleSession ? <section className="min-w-0 rounded-2xl bg-white p-4 shadow-soft sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="eyebrow text-moss">{weekdayLabels[visibleSession.weekday]} · {formatShortDate(visibleSession.date)} · {visibleSession.time}</p><h2 className="mt-1 text-2xl font-semibold text-ink">{visibleSession.title}</h2><p className="mt-1 text-sm text-ink/65">{visibleSession.teacher} · {visibleSession.durationMinutes} min · {visibleSession.room} · cupo {visibleSession.capacity}</p></div><div className="grid grid-cols-3 gap-2 sm:min-w-64"><Metric label="Presentes" value={presentCount} tone="moss" /><Metric label="Ausentes" value={absentCount} tone="clay" /><Metric label="Sin registrar" value={visibleSession.students.length - presentCount - absentCount} tone="ink" /></div></div><Notice tone={saveState === "error" ? "error" : "info"}>{saveState === "saving" ? "Guardando asistencia…" : saveState === "saved" ? "Asistencia guardada correctamente." : saveState === "error" ? saveError ?? "No se pudo guardar. Revisá la conexión e intentá nuevamente." : hasChanges ? `${dirtyCount} ${dirtyCount === 1 ? "cambio pendiente" : "cambios pendientes"} de guardar.` : "La asistencia está al día."}</Notice><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]"><button className="action-button action-button-soft" disabled={saveState === "saving"} onClick={() => setAllStatuses("present")}><CheckCheck size={18} />Marcar todos presentes</button><button className="action-button action-button-light" disabled={!hasChanges || saveState === "saving"} onClick={discardChanges}><RotateCcw size={17} />Deshacer</button><button className="action-button action-button-dark" disabled={!hasChanges || saveState === "saving"} onClick={saveAttendance}>{saveState === "saving" ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />}{saveState === "saving" ? "Guardando" : "Guardar cambios"}</button></div><div className="mt-5 space-y-3">{visibleSession.students.map((student) => {
        const assignment = planAssignments.find((item) => item.studentId === student.id && item.month === visibleSession.date.slice(0, 7));
        const planSession = assignment?.sessions.find((item) => item.classId === visibleSession.id && item.date === visibleSession.date);
        return <article className="student-attendance" key={student.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-semibold text-ink">{student.name}</h3><p className="mt-1 text-sm text-ink/60">{student.phone}</p>{assignment ? <p className="mt-2 text-xs font-semibold text-moss">{assignment.planName} · {assignment.usedCount}/{assignment.classLimit} utilizadas</p> : <p className="mt-2 text-xs font-semibold text-clay">Sin plan mensual</p>}{student.notes ? <p className="mt-2 text-sm text-clay">{student.notes}</p> : null}</div><div className="flex flex-col items-end gap-1.5"><span className={clsx("status-chip", `status-${student.status}`)}>{attendanceLabel(student.status, visibleSession.date)}</span>{planSession && !planSession.included ? <span className="status-chip status-outside">Fuera del plan</span> : null}</div></div><div className="mt-3 grid grid-cols-2 gap-2"><StatusButton active={student.status === "present"} icon={<Check size={17} />} label="Presente" onClick={() => setStudentStatus(student.id, "present")} tone="present" /><StatusButton active={student.status === "absent"} icon={<X size={17} />} label="Ausente" onClick={() => setStudentStatus(student.id, "absent")} tone="absent" /></div></article>;
      })}</div></section> : <div className="empty-state min-h-64"><CalendarDays size={28} className="text-moss" /><p>Elegí fechas con clases para tomar asistencia.</p></div>}
    </div>
  </section>;
}

function DateControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="date-control"><span>{label}</span><input type="date" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "moss" | "clay" | "ink" }) {
  return <div className="rounded-xl bg-linen px-2 py-3 text-center"><p className={clsx("text-xl font-semibold", `text-${tone}`)}>{value}</p><p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-ink/55">{label}</p></div>;
}

function StatusButton({ active, icon, label, onClick, tone }: { active: boolean; icon: ReactNode; label: string; onClick: () => void; tone: AttendanceStatus }) {
  return <button aria-pressed={active} className={clsx("status-button", active && `status-button-${tone}`)} onClick={onClick} type="button">{icon}{label}</button>;
}

function StudentsView({ students, archivedStudents, classes, isMutating, onNew, onEdit, onReenter }: { students: Student[]; archivedStudents: Student[]; classes: WeeklyClass[]; isMutating: boolean; onNew: () => void; onEdit: (student: Student) => void; onReenter: (student: Student) => void }) {
  const [view, setView] = useState<"active" | "archive">("active");
  return <section><SectionHeader eyebrow="Listado administrativo" title="Alumnas/os" description={`${students.length} ${students.length === 1 ? "persona activa" : "personas activas"}. Datos de contacto y horarios habituales, sin identificadores técnicos.`} action="Nuevo ingreso" onAction={onNew} /><div className="directory-switch" aria-label="Estado de alumnas/os"><button className={clsx(view === "active" && "active")} onClick={() => setView("active")} type="button">Activas/os <span>{students.length}</span></button><button className={clsx(view === "archive" && "active")} onClick={() => setView("archive")} type="button">Archivo <span>{archivedStudents.length}</span></button></div>{view === "active" ? <><div className="grid gap-3 sm:grid-cols-2">{students.map((student) => { const assignmentCount = classes.filter((item) => item.studentIds.includes(student.id)).length; return <button className="directory-card" key={student.id} onClick={() => onEdit(student)} type="button"><div className="avatar">{student.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div className="min-w-0 flex-1 text-left"><h2 className="truncate font-semibold text-ink">{student.name}</h2><p className="mt-1 text-sm text-ink/60">{student.phone}</p><p className="mt-3 text-xs font-medium text-moss">{assignmentCount} {assignmentCount === 1 ? "horario habitual" : "horarios habituales"}</p></div><Edit3 className="shrink-0 text-ink/35" size={18} /></button>; })}</div>{students.length === 0 ? <EmptyState label="Todavía no hay alumnas/os activos." /> : null}</> : <><Notice>El archivo se carga desde el servidor y conserva el historial y las asistencias para un reingreso seguro.</Notice><div className="mt-3 grid gap-3 sm:grid-cols-2">{archivedStudents.map((student) => <article className="directory-card" key={student.id}><div className="avatar"><Archive size={19} /></div><div className="min-w-0 flex-1"><h2 className="truncate font-semibold text-ink">{student.name}</h2><p className="mt-1 text-sm text-ink/60">{student.phone}</p><button className="action-button action-button-soft mt-3 w-full" disabled={isMutating} onClick={() => onReenter(student)} type="button"><UserRoundCheck size={18} />Reingresar</button></div></article>)}</div>{archivedStudents.length === 0 ? <EmptyState label="No hay alumnas/os archivados." /> : null}</>}</section>;
}

function ClassesView({ classes, onNew, onEdit }: { classes: WeeklyClass[]; onNew: () => void; onEdit: (item: WeeklyClass) => void }) {
  return <section><SectionHeader eyebrow="Plantillas recurrentes" title="Clases semanales" description={`${classes.length} ${classes.length === 1 ? "horario activo" : "horarios activos"}. Editá día, hora, duración y cupo.`} action="Nueva clase" onAction={onNew} /><div className="grid gap-3 sm:grid-cols-2">{classes.map((item) => <button className="directory-card" key={item.id} onClick={() => onEdit(item)} type="button"><div className="class-icon"><Clock size={21} /></div><div className="min-w-0 flex-1 text-left"><p className="eyebrow text-moss">{weekdayLabels[item.weekday]} · {item.time}</p><h2 className="mt-1 font-semibold text-ink">{item.title}</h2><p className="mt-1 text-sm text-ink/60">{item.durationMinutes} min · {item.capacity} lugares</p><p className="mt-3 text-xs font-medium text-moss">{item.studentIds.length} alumnas/os asignados</p></div><Edit3 className="shrink-0 text-ink/35" size={18} /></button>)}</div>{classes.length === 0 ? <EmptyState label="Todavía no hay clases activas." /> : null}</section>;
}

function SectionHeader({ eyebrow, title, description, action, onAction }: { eyebrow: string; title: string; description: string; action: string; onAction: () => void }) {
  return <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><p className="eyebrow text-moss">{eyebrow}</p><h2 className="mt-1 text-3xl font-semibold text-ink">{title}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-ink/65">{description}</p></div><button className="action-button action-button-dark w-full sm:w-auto" onClick={onAction}><Plus size={18} />{action}</button></div>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="empty-state"><Users size={24} className="text-moss" /><p>{label}</p></div>;
}

function Panel({ title, description, children, onClose }: { title: string; description: string; children: ReactNode; onClose: () => void }) {
  return <div className="panel-backdrop" role="presentation"><section className="panel" role="dialog" aria-modal="true" aria-label={title}><div className="flex items-start justify-between gap-4 border-b border-mist pb-4"><div className="min-w-0"><p className="eyebrow text-moss">Editar información</p><h2 className="mt-1 text-2xl font-semibold text-ink">{title}</h2><p className="mt-1 text-sm leading-5 text-ink/60">{description}</p></div><button className="icon-button shrink-0" aria-label="Cerrar" onClick={onClose}><X size={20} /></button></div>{children}</section></div>;
}

function Field({ label, name, defaultValue, type = "text", required = true, min }: { label: string; name: string; defaultValue?: string | number; type?: string; required?: boolean; min?: number }) {
  return <label className="field"><span>{label}</span><input name={name} defaultValue={defaultValue} type={type} required={required} min={min} /></label>;
}

function StudentPanel({ student, classes, isMutating, error, notice, onClose, onSave, onArchive }: { student: Student | "new"; classes: WeeklyClass[]; isMutating: boolean; error: string | null; notice: string | null; onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>, classIds: string[]) => void; onArchive: (student: Student) => void }) {
  const existing = student !== "new" ? student : null;
  const previous = existing ? classes.filter((item) => item.studentIds.includes(existing.id)).map((item) => item.id) : [];
  const [selected, setSelected] = useState(previous);
  return <Panel title={existing ? existing.name : "Nuevo ingreso"} description="El teléfono y las notas son solo para uso administrativo." onClose={onClose}>
    <form className="panel-content" onSubmit={(event) => onSave(event, selected)}>
      <Field label="Nombre y apellido" name="name" defaultValue={existing?.name} />
      <Field label="Teléfono" name="phone" defaultValue={existing?.phone} type="tel" />
      <Field label="Notas" name="notes" defaultValue={existing?.notes} required={false} />
      {notice ? <Notice>{notice}</Notice> : null}
      <div><p className="field-label">Horarios actuales</p><p className="field-help">Podés agregar o quitar horarios. Al quitar uno se cierran solo las asignaciones futuras; la asistencia anterior no se borra.</p><div className="check-list">{classes.map((item) => <label className="check-row" key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span className="min-w-0"><strong>{weekdayLabels[item.weekday]} · {item.time}</strong><small>{item.title} · {item.studentIds.length}/{item.capacity} lugares</small></span></label>)}</div>{classes.length === 0 ? <p className="text-sm text-ink/55">Creá una clase semanal para poder asignar horarios.</p> : null}</div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="panel-actions"><button className="action-button action-button-light" type="button" onClick={onClose}>Cancelar</button><button className="action-button action-button-dark" disabled={isMutating} type="submit">{isMutating ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />}Guardar datos y horarios</button></div>
    </form>
    {existing ? <StudentPlanSection studentId={existing.id} classes={classes} /> : <div className="notice"><Layers3 size={18} />Guardá primero el nuevo ingreso para poder asignarle un plan mensual.</div>}
    {existing ? <div className="panel-footer"><button className="danger-button" disabled={isMutating} onClick={() => onArchive(existing)} type="button"><Archive size={17} />Archivar alumna/o</button><span>Conserva todo el historial</span></div> : null}
  </Panel>;
}

function ClassPanel({ item, isMutating, error, onClose, onSave, onDelete }: { item: WeeklyClass | "new"; isMutating: boolean; error: string | null; onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void; onDelete: (item: WeeklyClass) => void }) {
  const existing = item !== "new" ? item : null;
  return <Panel title={existing ? existing.title : "Nueva clase"} description="El horario se repite cada semana. La docente y la sala ya están definidas por el salón." onClose={onClose}><form className="panel-content" onSubmit={onSave}><Field label="Nombre de la clase" name="title" defaultValue={existing?.title} /><div className="responsive-field-grid"><label className="field"><span>Día</span><select name="weekday" defaultValue={existing?.weekday === "saturday" ? "monday" : existing?.weekday ?? "monday"}>{weekdays.map((day) => <option key={day} value={day}>{weekdayLabels[day]}</option>)}</select></label><Field label="Hora" name="time" defaultValue={existing?.time ?? "09:00"} type="time" /></div><div className="responsive-field-grid"><Field label="Duración (min)" name="durationMinutes" defaultValue={existing?.durationMinutes ?? 60} type="number" min={1} /><Field label="Cupo" name="capacity" defaultValue={existing?.capacity ?? 8} type="number" min={1} /></div>{error ? <Notice tone="error">{error}</Notice> : null}<div className="panel-actions"><button className="action-button action-button-light" type="button" onClick={onClose}>Cancelar</button><button className="action-button action-button-dark" disabled={isMutating} type="submit">{isMutating ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />}Guardar clase</button></div></form>{existing ? <div className="delete-zone"><p><strong>Eliminar clase</strong><span>Solo se borra por completo si no tiene asistencias ni aparece en un plan mensual. De lo contrario se retira y el historial queda protegido.</span></p><button className="danger-button" disabled={isMutating} onClick={() => onDelete(existing)} type="button"><Trash2 size={17} />Eliminar clase</button></div> : null}</Panel>;
}
