#!/bin/sh
set -eu

# Creates additional databases from POSTGRES_EXTRA_DATABASES (comma-separated).
# The default database (POSTGRES_DB) is created automatically by the official image.
# Example: POSTGRES_EXTRA_DATABASES=games,wallets

if [ -n "${POSTGRES_EXTRA_DATABASES:-}" ]; then
  old_ifs=$IFS
  IFS=','
  for db in $POSTGRES_EXTRA_DATABASES; do
    db=$(printf '%s' "$db" | xargs)
    if [ -z "$db" ]; then
      continue
    fi

    echo "Creating database: $db"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
      SELECT 'CREATE DATABASE "$db"'
      WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
EOSQL
    echo "Database '$db' created (or already exists)."
  done
  IFS=$old_ifs
fi
