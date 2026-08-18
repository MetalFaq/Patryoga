#!/bin/sh
set -eu

MIGRATIONS_DIR="/opt/patryoga/db/migrations"

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

echo "Database migrations are up to date."
