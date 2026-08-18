INSERT INTO membership_plans (id, name, class_limit, description) VALUES
  ('plan-4', 'Plan 4 clases', 4, 'Cuatro clases mensuales.'),
  ('plan-8', 'Plan 8 clases', 8, 'Ocho clases mensuales.')
ON CONFLICT (id) DO NOTHING;
