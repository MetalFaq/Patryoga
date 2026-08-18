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
  id, title, weekday, start_time, duration_minutes, teacher, room, capacity
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
