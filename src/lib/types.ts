export type Weekday = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";

export type AttendanceStatus = "present" | "absent" | "unmarked";

export type Student = {
  id: string;
  name: string;
  phone: string;
  notes?: string;
};

export type WeeklyClass = {
  id: string;
  title: string;
  weekday: Weekday;
  time: string;
  durationMinutes: number;
  teacher: string;
  room: string;
  capacity: number;
  studentIds: string[];
};

export type AttendanceEntry = {
  classId: string;
  studentId: string;
  date: string;
  status: AttendanceStatus;
};

export type ClassSession = WeeklyClass & {
  date: string;
  students: Array<Student & { status: AttendanceStatus }>;
};
