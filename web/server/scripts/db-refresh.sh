#!/usr/bin/env bash
# Refresh the local Postgres from production: dump prod, restore over local.
# Uses DATABASE_URL from .env.production (prod) and .env (local).
set -euo pipefail

cd "$(dirname "$0")/../.."

if [[ ! -f .env.production ]]; then
  echo "ERROR: .env.production not found. Expected the prod DATABASE_URL there." >&2
  exit 1
fi
if [[ ! -f .env ]]; then
  echo "ERROR: .env not found. Expected the local DATABASE_URL there." >&2
  exit 1
fi

PROD_URL=$(grep -m1 '^DATABASE_URL=' .env.production | cut -d= -f2-)
LOCAL_URL=$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2-)

if [[ -z "$PROD_URL" || -z "$LOCAL_URL" ]]; then
  echo "ERROR: DATABASE_URL missing in .env.production or .env" >&2
  exit 1
fi

mkdir -p .local
DUMP=.local/todo-prod.dump

echo "→ Dumping production to $DUMP"
pg_dump -Fc --no-owner --no-privileges "$PROD_URL" -f "$DUMP"

echo "→ Restoring into local"
pg_restore --clean --if-exists --no-owner --no-privileges -d "$LOCAL_URL" "$DUMP"

echo "✓ Local DB refreshed from production."
