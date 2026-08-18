\set ON_ERROR_STOP on

\if :{?confirm}
SELECT :'confirm' = 'RESET_PATRYOGA_OPERATIONAL_DATA' AS confirmed \gset
\else
\echo 'Missing required variable: confirm'
DO $$ BEGIN RAISE EXCEPTION 'Missing reset confirmation'; END $$;
\endif

\if :confirmed
BEGIN;

LOCK TABLE
  monthly_plan_sessions,
  monthly_plan_assignments,
  attendance_records,
  class_enrollments,
  weekly_classes,
  students
IN ACCESS EXCLUSIVE MODE;

TRUNCATE TABLE
  monthly_plan_sessions,
  monthly_plan_assignments,
  attendance_records,
  class_enrollments,
  weekly_classes,
  students;

DELETE FROM membership_plans
WHERE id NOT IN ('plan-4', 'plan-8');

UPDATE membership_plans
SET
  name = CASE id
    WHEN 'plan-4' THEN 'Plan 4 clases'
    WHEN 'plan-8' THEN 'Plan 8 clases'
  END,
  class_limit = CASE id
    WHEN 'plan-4' THEN 4
    WHEN 'plan-8' THEN 8
  END,
  description = CASE id
    WHEN 'plan-4' THEN 'Cuatro clases mensuales.'
    WHEN 'plan-8' THEN 'Ocho clases mensuales.'
  END,
  active = true,
  updated_at = now()
WHERE id IN ('plan-4', 'plan-8');

COMMIT;
\else
\echo 'Invalid confirmation. No data was changed.'
DO $$ BEGIN RAISE EXCEPTION 'Invalid reset confirmation'; END $$;
\endif
