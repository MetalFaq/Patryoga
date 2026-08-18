#!/bin/sh
set -eu

MIGRATIONS_DIR="/opt/patryoga/db/migrations"
RUNTIME_ROLE_SCRIPT="/opt/patryoga/db/scripts/ensure_runtime_role.sql"

: "${APP_DB_USER:?APP_DB_USER is required for the runtime database role}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required for the runtime database role}"

if [ "$APP_DB_USER" = "${PGUSER:-}" ]; then
  echo "APP_DB_USER must differ from the migration owner PGUSER." >&2
  exit 1
fi

if ! printf '%s' "$APP_DB_USER" | grep -Eq '^[A-Za-z_][A-Za-z0-9_]{0,62}$'; then
  echo "APP_DB_USER must be a simple PostgreSQL identifier (1-63 characters)." >&2
  exit 1
fi

password_length="${#APP_DB_PASSWORD}"
if [ "$password_length" -lt 32 ] || [ "$password_length" -gt 128 ]; then
  echo "APP_DB_PASSWORD must contain between 32 and 128 characters." >&2
  exit 1
fi

case "$APP_DB_PASSWORD" in
  *[!A-Za-z0-9_-]*)
    echo "APP_DB_PASSWORD may contain only URL-safe letters, numbers, underscore or hyphen." >&2
    exit 1
    ;;
esac

psql -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL

for migration in "$MIGRATIONS_DIR"/*.sql; do
  [ -f "$migration" ] || continue

  filename="$(basename "$migration")"
  version="${filename%.sql}"
  checksum="$(sha256sum "$migration" | awk '{print $1}')"
  applied_checksum="$(psql -X -v ON_ERROR_STOP=1 -Atc "SELECT checksum FROM schema_migrations WHERE version = '$version'")"

  if [ -n "$applied_checksum" ]; then
    if [ "$applied_checksum" != "$checksum" ]; then
      echo "Migration $version was modified after being applied." >&2
      exit 1
    fi

    echo "Migration $version already applied."
    continue
  fi

  echo "Applying migration $version..."
  psql -X -v ON_ERROR_STOP=1 --single-transaction \
    -f "$migration" \
    -c "INSERT INTO schema_migrations (version, checksum) VALUES ('$version', '$checksum')"
done

psql -X -v ON_ERROR_STOP=1 -f "$RUNTIME_ROLE_SCRIPT"

echo "Database migrations are up to date."
