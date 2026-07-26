import type { AttendanceEntry, AttendanceStatus, ClassSession, Student, Weekday, WeeklyClass } from "@/lib/types";

export const weekdayLabels: Record<Weekday, string> = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miercoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sabado"
};

export const students: Student[] = [
  { id: "stu-ana", name: "Ana Molina", phone: "+54 11 5555-0101", notes: "Prefiere turno manana." },
  { id: "stu-clara", name: "Clara Perez", phone: "+54 11 5555-0102" },
  { id: "stu-elena", name: "Elena Ruiz", phone: "+54 11 5555-0103", notes: "Rodilla sensible." },
  { id: "stu-marta", name: "Marta Silva", phone: "+54 11 5555-0104" },
  { id: "stu-lucia", name: "Lucia Torres", phone: "+54 11 5555-0105" },
  { id: "stu-paula", name: "Paula Gomez", phone: "+54 11 5555-0106" },
  { id: "stu-nora", name: "Nora Castro", phone: "+54 11 5555-0107" },
  { id: "stu-ines", name: "Ines Sosa", phone: "+54 11 5555-0108" }
];

export const weeklyClasses: WeeklyClass[] = [
  {
    id: "class-lun-0830",
    title: "Yoga suave",
    weekday: "monday",
    time: "08:30",
    durationMinutes: 60,
    teacher: "Silvia",
    room: "Sala calma",
    capacity: 8,
    studentIds: ["stu-ana", "stu-elena", "stu-marta", "stu-paula"]
  },
  {
    id: "class-mar-1830",
    title: "Hatha integral",
    weekday: "tuesday",
    time: "18:30",
    durationMinutes: 75,
    teacher: "Silvia",
    room: "Sala sol",
    capacity: 10,
    studentIds: ["stu-clara", "stu-lucia", "stu-nora", "stu-ines"]
  },
  {
    id: "class-jue-1000",
    title: "Movilidad y respiracion",
    weekday: "thursday",
    time: "10:00",
    durationMinutes: 60,
    teacher: "Silvia",
    room: "Sala calma",
    capacity: 8,
    studentIds: ["stu-ana", "stu-clara", "stu-marta", "stu-nora"]
  },
  {
    id: "class-sab-0930",
    title: "Practica semanal",
    weekday: "saturday",
    time: "09:30",
    durationMinutes: 90,
    teacher: "Silvia",
    room: "Sala sol",
    capacity: 12,
    studentIds: ["stu-elena", "stu-lucia", "stu-paula", "stu-ines"]
  }
];

export const attendance: AttendanceEntry[] = [
  { classId: "class-lun-0830", studentId: "stu-ana", date: "2026-07-20", status: "present" },
  { classId: "class-lun-0830", studentId: "stu-elena", date: "2026-07-20", status: "absent" },
  { classId: "class-lun-0830", studentId: "stu-marta", date: "2026-07-20", status: "present" },
  { classId: "class-mar-1830", studentId: "stu-clara", date: "2026-07-21", status: "present" },
  { classId: "class-mar-1830", studentId: "stu-lucia", date: "2026-07-21", status: "present" },
  { classId: "class-jue-1000", studentId: "stu-nora", date: "2026-07-23", status: "absent" },
  { classId: "class-sab-0930", studentId: "stu-paula", date: "2026-07-25", status: "present" }
];

type AttendanceStoreGlobal = typeof globalThis & {
  __yogaSalonAttendanceStore?: Map<string, AttendanceStatus>;
};

const runtime = globalThis as AttendanceStoreGlobal;

function attendanceKey(classId: string, date: string, studentId: string) {
  return `${classId}:${date}:${studentId}`;
}

runtime.__yogaSalonAttendanceStore ??= new Map(
  attendance.map((entry) => [attendanceKey(entry.classId, entry.date, entry.studentId), entry.status])
);

function getAttendanceStatus(classId: string, date: string, studentId: string) {
  return runtime.__yogaSalonAttendanceStore?.get(attendanceKey(classId, date, studentId));
}

export function saveAttendanceEntries(
  classId: string,
  date: string,
  entries: Array<{ studentId: string; status: AttendanceStatus }>
): AttendanceEntry[] {
  const saved = entries.map((entry) => ({ ...entry, classId, date }));

  for (const entry of saved) {
    runtime.__yogaSalonAttendanceStore?.set(
      attendanceKey(entry.classId, entry.date, entry.studentId),
      entry.status
    );
  }

  return saved;
}

const weekdayIndex: Record<Weekday, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

export function buildWeekSessions(weekStartIso = "2026-07-20"): ClassSession[] {
  const weekStart = new Date(`${weekStartIso}T00:00:00`);

  return weeklyClasses
    .map((weeklyClass) => {
      const sessionDate = new Date(weekStart);
      sessionDate.setDate(weekStart.getDate() + weekdayIndex[weeklyClass.weekday] - 1);
      const date = sessionDate.toISOString().slice(0, 10);

      return {
        ...weeklyClass,
        date,
        students: weeklyClass.studentIds.map((studentId) => {
          const student = students.find((item) => item.id === studentId);
          const status = getAttendanceStatus(weeklyClass.id, date, studentId);

          if (!student) {
            throw new Error(`Missing mock student ${studentId}`);
          }

          return {
            ...student,
            status: status ?? "unmarked"
          };
        })
      };
    })
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

export function getClassSession(classId: string, date: string): ClassSession | undefined {
  const weeklyClass = weeklyClasses.find((item) => item.id === classId);

  if (!weeklyClass) {
    return undefined;
  }

  return {
    ...weeklyClass,
    date,
    students: weeklyClass.studentIds.map((studentId) => {
      const student = students.find((item) => item.id === studentId);
      const status = getAttendanceStatus(classId, date, studentId);

      if (!student) {
        throw new Error(`Missing mock student ${studentId}`);
      }

      return {
        ...student,
        status: status ?? "unmarked"
      };
    })
  };
}
