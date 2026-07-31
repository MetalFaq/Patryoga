export type Weekday = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";

export type AttendanceStatus = "present" | "absent" | "unmarked";

export type PlanAssignmentMode = "full" | "prorated";

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

export type MembershipPlan = {
  id: string;
  name: string;
  classLimit: number;
  description?: string;
  active: boolean;
};

export type MonthlyPlanSession = {
  classId: string;
  date: string;
  position: number;
  included: boolean;
  status: AttendanceStatus;
};

export type MonthlyPlanAssignment = {
  id: string;
  studentId: string;
  month: string;
  planId: string;
  planName: string;
  planDescription?: string;
  mode: PlanAssignmentMode;
  effectiveFrom: string;
  periodStart: string;
  periodEnd: string;
  classLimit: number;
  scheduledCount: number;
  usedCount: number;
  presentCount: number;
  absentCount: number;
  remainingCount: number;
  sessions: MonthlyPlanSession[];
};
