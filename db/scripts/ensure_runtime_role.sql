\set ON_ERROR_STOP on
\getenv app_db_user APP_DB_USER
\getenv app_db_password APP_DB_PASSWORD

BEGIN;

SELECT format('CREATE ROLE %I LOGIN', :'app_db_user')
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = :'app_db_user'
)
\gexec

SELECT format(
  'DO $guard$ BEGIN RAISE EXCEPTION %L; END $guard$;',
  'APP_DB_USER must not own the database, schema or relations'
)
WHERE EXISTS (
  SELECT 1
  FROM pg_database
  WHERE datdba = (SELECT oid FROM pg_roles WHERE rolname = :'app_db_user')
  UNION ALL
  SELECT 1
  FROM pg_namespace
  WHERE nspowner = (SELECT oid FROM pg_roles WHERE rolname = :'app_db_user')
  UNION ALL
  SELECT 1
  FROM pg_class
  WHERE relowner = (SELECT oid FROM pg_roles WHERE rolname = :'app_db_user')
)
\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
  :'app_db_user',
  :'app_db_password'
)
\gexec

SELECT format('REVOKE %I FROM %I', granted_role.rolname, :'app_db_user')
FROM pg_auth_members AS membership
JOIN pg_roles AS granted_role ON granted_role.oid = membership.roleid
JOIN pg_roles AS member_role ON member_role.oid = membership.member
WHERE member_role.rolname = :'app_db_user'
\gexec

SELECT format(
  'REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I',
  current_database(),
  :'app_db_user'
)
\gexec

SELECT format(
  'GRANT CONNECT ON DATABASE %I TO %I',
  current_database(),
  :'app_db_user'
)
\gexec

SELECT format('REVOKE ALL PRIVILEGES ON SCHEMA public FROM %I', :'app_db_user')
\gexec

SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'app_db_user')
\gexec

SELECT format(
  'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
  schemaname,
  tablename,
  :'app_db_user'
)
FROM pg_tables
WHERE schemaname = 'public'
\gexec

SELECT format(
  'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I.%I TO %I',
  schemaname,
  tablename,
  :'app_db_user'
)
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename <> 'schema_migrations'
\gexec

SELECT format(
  'REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM %I',
  schemaname,
  sequencename,
  :'app_db_user'
)
FROM pg_sequences
WHERE schemaname = 'public'
\gexec

SELECT format(
  'GRANT USAGE, SELECT, UPDATE ON SEQUENCE %I.%I TO %I',
  schemaname,
  sequencename,
  :'app_db_user'
)
FROM pg_sequences
WHERE schemaname = 'public'
\gexec

COMMIT;
