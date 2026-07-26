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
  weekday TEXT NOT NULL CHECK (
    weekday IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday')
  ),
  start_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  teacher TEXT NOT NULL,
  room TEXT NOT NULL,
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
  PRIMARY KEY (class_id, student_id),
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
  FOREIGN KEY (class_id, student_id)
    REFERENCES class_enrollments(class_id, student_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS attendance_records_session_idx
  ON attendance_records (session_date, class_id);

INSERT INTO students (id, full_name, phone, notes) VALUES
  ('stu-ana', 'Ana Molina', '+54 11 5555-0101', 'Prefiere turno manana.'),
  ('stu-clara', 'Clara Perez', '+54 11 5555-0102', NULL),
  ('stu-elena', 'Elena Ruiz', '+54 11 5555-0103', 'Rodilla sensible.'),
  ('stu-marta', 'Marta Silva', '+54 11 5555-0104', NULL),
  ('stu-lucia', 'Lucia Torres', '+54 11 5555-0105', NULL),
  ('stu-paula', 'Paula Gomez', '+54 11 5555-0106', NULL),
  ('stu-nora', 'Nora Castro', '+54 11 5555-0107', NULL),
  ('stu-ines', 'Ines Sosa', '+54 11 5555-0108', NULL)
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  phone = EXCLUDED.phone,
  notes = EXCLUDED.notes,
  active = true;

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
  ('class-lun-0830', 'Yoga suave', 'monday', '08:30', 60, 'Silvia', 'Sala calma', 8),
  ('class-mar-1830', 'Hatha integral', 'tuesday', '18:30', 75, 'Silvia', 'Sala sol', 10),
  ('class-jue-1000', 'Movilidad y respiracion', 'thursday', '10:00', 60, 'Silvia', 'Sala calma', 8),
  ('class-sab-0930', 'Practica semanal', 'saturday', '09:30', 90, 'Silvia', 'Sala sol', 12)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  weekday = EXCLUDED.weekday,
  start_time = EXCLUDED.start_time,
  duration_minutes = EXCLUDED.duration_minutes,
  teacher = EXCLUDED.teacher,
  room = EXCLUDED.room,
  capacity = EXCLUDED.capacity;

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
  ('class-sab-0930', 'stu-elena', '-infinity', 1),
  ('class-sab-0930', 'stu-lucia', '-infinity', 2),
  ('class-sab-0930', 'stu-paula', '-infinity', 3),
  ('class-sab-0930', 'stu-ines', '-infinity', 4)
ON CONFLICT (class_id, student_id) DO UPDATE SET
  active_from = EXCLUDED.active_from,
  active_until = NULL,
  position = EXCLUDED.position;

INSERT INTO attendance_records (class_id, student_id, session_date, status) VALUES
  ('class-lun-0830', 'stu-ana', '2026-07-20', 'present'),
  ('class-lun-0830', 'stu-elena', '2026-07-20', 'absent'),
  ('class-lun-0830', 'stu-marta', '2026-07-20', 'present'),
  ('class-mar-1830', 'stu-clara', '2026-07-21', 'present'),
  ('class-mar-1830', 'stu-lucia', '2026-07-21', 'present'),
  ('class-jue-1000', 'stu-nora', '2026-07-23', 'absent'),
  ('class-sab-0930', 'stu-paula', '2026-07-25', 'present')
ON CONFLICT (class_id, student_id, session_date) DO NOTHING;

COMMIT;
