BEGIN;

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
  weekday TEXT NOT NULL CONSTRAINT weekly_classes_weekday_check CHECK (
    weekday IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday')
  ),
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

CREATE UNIQUE INDEX IF NOT EXISTS membership_plans_active_name_idx
  ON membership_plans (lower(name))
  WHERE active;

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

-- Upgrade databases created with the initial single-period enrollment model.
-- Historical Saturday templates remain readable, but the NOT VALID constraint
-- rejects any new Saturday class without rewriting past records.
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

CREATE UNIQUE INDEX IF NOT EXISTS class_enrollments_one_active_period_idx
  ON class_enrollments (class_id, student_id)
  WHERE active_until IS NULL;

CREATE INDEX IF NOT EXISTS attendance_records_session_idx
  ON attendance_records (session_date, class_id);

CREATE INDEX IF NOT EXISTS monthly_plan_assignments_month_idx
  ON monthly_plan_assignments (month, student_id);

CREATE INDEX IF NOT EXISTS monthly_plan_sessions_lookup_idx
  ON monthly_plan_sessions (class_id, session_date, assignment_id);

INSERT INTO students (id, full_name, phone, notes) VALUES
  ('stu-ana', 'Ana Molina', '+54 11 5555-0101', 'Prefiere turno manana.'),
  ('stu-clara', 'Clara Perez', '+54 11 5555-0102', NULL),
  ('stu-elena', 'Elena Ruiz', '+54 11 5555-0103', 'Rodilla sensible.'),
  ('stu-marta', 'Marta Silva', '+54 11 5555-0104', NULL),
  ('stu-lucia', 'Lucia Torres', '+54 11 5555-0105', NULL),
  ('stu-paula', 'Paula Gomez', '+54 11 5555-0106', NULL),
  ('stu-nora', 'Nora Castro', '+54 11 5555-0107', NULL),
  ('stu-ines', 'Ines Sosa', '+54 11 5555-0108', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO weekly_classes (
  id,
  title,
  weekday,
  start_time,
  duration_minutes,
  teacher,
  room,
  capacity
) VALUES
  ('class-lun-0830', 'Yoga suave', 'monday', '08:30', 60, 'Patricia', 'Sala unica', 8),
  ('class-mar-1830', 'Hatha integral', 'tuesday', '18:30', 75, 'Patricia', 'Sala unica', 10),
  ('class-jue-1000', 'Movilidad y respiracion', 'thursday', '10:00', 60, 'Patricia', 'Sala unica', 8),
  ('class-vie-0930', 'Practica semanal', 'friday', '09:30', 90, 'Patricia', 'Sala unica', 12)
ON CONFLICT (id) DO NOTHING;

INSERT INTO class_enrollments (class_id, student_id, active_from, position) VALUES
  ('class-lun-0830', 'stu-ana', '-infinity', 1),
  ('class-lun-0830', 'stu-elena', '-infinity', 2),
  ('class-lun-0830', 'stu-marta', '-infinity', 3),
  ('class-lun-0830', 'stu-paula', '-infinity', 4),
  ('class-mar-1830', 'stu-clara', '-infinity', 1),
  ('class-mar-1830', 'stu-lucia', '-infinity', 2),
  ('class-mar-1830', 'stu-nora', '-infinity', 3),
  ('class-mar-1830', 'stu-ines', '-infinity', 4),
  ('class-jue-1000', 'stu-ana', '-infinity', 1),
  ('class-jue-1000', 'stu-clara', '-infinity', 2),
  ('class-jue-1000', 'stu-marta', '-infinity', 3),
  ('class-jue-1000', 'stu-nora', '-infinity', 4),
  ('class-vie-0930', 'stu-elena', '-infinity', 1),
  ('class-vie-0930', 'stu-lucia', '-infinity', 2),
  ('class-vie-0930', 'stu-paula', '-infinity', 3),
  ('class-vie-0930', 'stu-ines', '-infinity', 4)
ON CONFLICT (class_id, student_id, active_from) DO NOTHING;

INSERT INTO attendance_records (class_id, student_id, session_date, status) VALUES
  ('class-lun-0830', 'stu-ana', '2026-07-20', 'present'),
  ('class-lun-0830', 'stu-elena', '2026-07-20', 'absent'),
  ('class-lun-0830', 'stu-marta', '2026-07-20', 'present'),
  ('class-mar-1830', 'stu-clara', '2026-07-21', 'present'),
  ('class-mar-1830', 'stu-lucia', '2026-07-21', 'present'),
  ('class-jue-1000', 'stu-nora', '2026-07-23', 'absent'),
  ('class-vie-0930', 'stu-paula', '2026-07-24', 'present')
ON CONFLICT (class_id, student_id, session_date) DO NOTHING;

INSERT INTO membership_plans (id, name, class_limit, description) VALUES
  ('plan-4', 'Plan 4 clases', 4, 'Cuatro clases mensuales.'),
  ('plan-8', 'Plan 8 clases', 8, 'Ocho clases mensuales.')
ON CONFLICT (id) DO NOTHING;

COMMIT;
