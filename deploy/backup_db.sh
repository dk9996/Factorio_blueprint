#!/usr/bin/env bash
# Бэкап Postgres: pg_dump -> gzip в /opt/factory-planner/backups, хранение
# 14 дней. Запускать на сервере (cron — см. DEPLOY.md). Ничего не трогает в
# чужих контейнерах (Amnezia): работает только с factory-planner-postgres.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${BACKUP_DIR:-$ROOT/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$DIR"
OUT="$DIR/factory_planner-$(date +%Y%m%d-%H%M%S).sql.gz"

docker exec factory-planner-postgres pg_dump -U factory_planner -d factory_planner --no-owner \
  | gzip -9 > "$OUT.tmp"
mv "$OUT.tmp" "$OUT"
chmod 600 "$OUT"
find "$DIR" -name 'factory_planner-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
echo "backup: $OUT ($(du -h "$OUT" | cut -f1))"
