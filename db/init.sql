\set ON_ERROR_STOP on

-- Compatibilidad para pruebas y entornos de demostracion.
-- Produccion usa db/migrate.sh y NO carga seeds automaticamente.
\ir migrations/0001_current_schema.sql
\ir migrations/0002_default_membership_plans.sql
\ir seeds/demo.sql
