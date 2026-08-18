DO $$
BEGIN
  CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'unmarked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE students ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS weekly_classes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  weekday TEXT NOT NULL,
  start_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  teacher TEXT NOT NULL DEFAULT 'Patricia',
  room TEXT NOT NULL DEFAULT 'Sala unica',
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS class_enrollments (
  class_id TEXT NOT NULL REFERENCES weekly_classes(id) ON DELETE RESTRICT,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  active_from DATE NOT NULL DEFAULT '-infinity',
  active_until DATE,
  position SMALLINT NOT NULL CHECK (position > 0),
  PRIMARY KEY (class_id, student_id, active_from),
  UNIQUE (class_id, position),
  CHECK (active_until IS NULL OR active_until >= active_from)
);

CREATE TABLE IF NOT EXISTS attendance_records (
  class_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  session_date DATE NOT NULL,
  status attendance_status NOT NULL DEFAULT 'unmarked',
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, student_id, session_date),
  CONSTRAINT attendance_records_class_fk
    FOREIGN KEY (class_id) REFERENCES weekly_classes(id) ON DELETE RESTRICT,
  CONSTRAINT attendance_records_student_fk
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS membership_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  class_limit INTEGER NOT NULL CHECK (class_limit > 0),
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monthly_plan_assignments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  month DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  plan_id TEXT NOT NULL REFERENCES membership_plans(id) ON DELETE RESTRICT,
  plan_name TEXT NOT NULL,
  plan_description TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('full', 'prorated')),
  effective_from DATE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  class_limit INTEGER NOT NULL CHECK (class_limit > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, month),
  CHECK (period_start <= effective_from AND effective_from <= period_end)
);

CREATE TABLE IF NOT EXISTS monthly_plan_sessions (
  assignment_id TEXT NOT NULL
    REFERENCES monthly_plan_assignments(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL,
  class_title TEXT NOT NULL,
  weekday TEXT NOT NULL CHECK (
    weekday IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday')
  ),
  start_time TIME NOT NULL,
  session_date DATE NOT NULL,
  position INTEGER NOT NULL CHECK (position > 0),
  included BOOLEAN NOT NULL,
  PRIMARY KEY (assignment_id, class_id, session_date),
  UNIQUE (assignment_id, position)
);

ALTER TABLE weekly_classes
  ALTER COLUMN teacher SET DEFAULT 'Patricia',
  ALTER COLUMN room SET DEFAULT 'Sala unica';

UPDATE weekly_classes
SET teacher = 'Patricia', room = 'Sala unica'
WHERE active;

UPDATE weekly_classes
SET active = false
WHERE active AND weekday = 'saturday';

ALTER TABLE weekly_classes
  DROP CONSTRAINT IF EXISTS weekly_classes_weekday_check;
ALTER TABLE weekly_classes
  ADD CONSTRAINT weekly_classes_weekday_check
  CHECK (weekday IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday'))
  NOT VALID;

ALTER TABLE attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_class_id_student_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_records_class_fk'
      AND conrelid = 'attendance_records'::regclass
  ) THEN
    ALTER TABLE attendance_records
      ADD CONSTRAINT attendance_records_class_fk
      FOREIGN KEY (class_id) REFERENCES weekly_classes(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_records_student_fk'
      AND conrelid = 'attendance_records'::regclass
  ) THEN
    ALTER TABLE attendance_records
      ADD CONSTRAINT attendance_records_student_fk
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE class_enrollments
  DROP CONSTRAINT IF EXISTS class_enrollments_pkey;
ALTER TABLE class_enrollments
  ADD PRIMARY KEY (class_id, student_id, active_from);

CREATE UNIQUE INDEX IF NOT EXISTS membership_plans_active_name_idx
  ON membership_plans (lower(name))
  WHERE active;

CREATE UNIQUE INDEX IF NOT EXISTS class_enrollments_one_active_period_idx
  ON class_enrollments (class_id, student_id)
  WHERE active_until IS NULL;

CREATE INDEX IF NOT EXISTS attendance_records_session_idx
  ON attendance_records (session_date, class_id);

CREATE INDEX IF NOT EXISTS monthly_plan_assignments_month_idx
  ON monthly_plan_assignments (month, student_id);

CREATE INDEX IF NOT EXISTS monthly_plan_sessions_lookup_idx
  ON monthly_plan_sessions (class_id, session_date, assignment_id);
