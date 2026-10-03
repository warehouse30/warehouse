#!/usr/bin/env bash
# Backup SQLite or PostgreSQL + uploads
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP=$(date +%Y%m%d_%H%M%S)
OUT="${BACKUP_DIR:-$ROOT/backups}/backup_$STAMP"
mkdir -p "$OUT"

if [[ -n "${DATABASE_URL:-}" && "$DATABASE_URL" == postgres* ]]; then
  echo "Dumping PostgreSQL..."
  pg_dump "$DATABASE_URL" > "$OUT/db.sql"
elif [[ -f backend/data/warehouse.db ]]; then
  cp backend/data/warehouse.db "$OUT/warehouse.db"
elif [[ -f "$ROOT/warehouse.db" ]]; then
  cp "$ROOT/warehouse.db" "$OUT/warehouse.db"
fi

if [[ -d "$ROOT/backend/uploads" ]]; then
  cp -a "$ROOT/backend/uploads" "$OUT/uploads"
fi

tar -czf "$OUT.tar.gz" -C "$(dirname "$OUT")" "$(basename "$OUT")"
rm -rf "$OUT"
echo "Created $OUT.tar.gz"
