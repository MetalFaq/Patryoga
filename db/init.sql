CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS weekly_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 6),
  start_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  teacher TEXT NOT NULL,
  room TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS class_enrollments (
  class_id UUID NOT NULL REFERENCES weekly_classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  active_from DATE NOT NULL DEFAULT CURRENT_DATE,
  active_until DATE,
  PRIMARY KEY (class_id, student_id)
);

DO $$
BEGIN
  CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'unmarked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS attendance_records (
  class_id UUID NOT NULL REFERENCES weekly_classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  status attendance_status NOT NULL DEFAULT 'unmarked',
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, student_id, session_date)
);

CREATE INDEX IF NOT EXISTS attendance_records_session_idx
  ON attendance_records (session_date, class_id);
