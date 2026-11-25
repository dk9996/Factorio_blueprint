#!/usr/bin/env bash
# Заливка на сервер. Запускать с локального ПК из корня репозитория:
#   deploy/push.sh root@factory-planner.duckdns.org [code|content|front|all]
# По умолчанию all. Серверная папка: /opt/factory-planner (REMOTE_DIR).
# Никогда не трогает на сервере: .env, backups/, а content/ и frontend-dist/
# обновляются на месте (тот же inode — контейнеры видят новые файлы сразу,
# перезапуск не нужен; --delay-updates подменяет файлы в конце передачи).
set -euo pipefail

TARGET="${1:?usage: deploy/push.sh user@host [code|content|front|all]}"
WHAT="${2:-all}"
REMOTE_DIR="${REMOTE_DIR:-/opt/factory-planner}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v rsync >/dev/null || { echo "rsync не установлен (Arch: sudo pacman -S rsync)"; exit 1; }

"$ROOT/deploy/check_deploy.sh" || { echo "Проверка не пройдена — заливка отменена."; exit 1; }

ssh "$TARGET" "mkdir -p '$REMOTE_DIR'/{content,frontend-dist,backups,deploy}"

push_code() {
  echo ">> код (backend, compose, Caddyfile, deploy/)"
  rsync -az --delete \
    --exclude 'venv/' --exclude 'data/' --exclude '/content/' --exclude '__pycache__/' \
    --exclude '*.pyc' --exclude '.env' --exclude '.pytest_cache/' \
    factory-planner-backend/ "$TARGET:$REMOTE_DIR/factory-planner-backend/"
  rsync -az docker-compose.yml Caddyfile .env.example DEPLOY.md "$TARGET:$REMOTE_DIR/"
  rsync -az --delete deploy/ "$TARGET:$REMOTE_DIR/deploy/"
}
push_content() {
  echo ">> content/ (PNG не сжимаются — без -z)"
  rsync -a --delete --delay-updates --info=progress2 \
    factory-planner-backend/content/ "$TARGET:$REMOTE_DIR/content/"
}
push_front() {
  echo ">> фронт -> frontend-dist/"
  rsync -a --delete --delay-updates factory-planner-front/dist/ "$TARGET:$REMOTE_DIR/frontend-dist/"
}

case "$WHAT" in
  code) push_code ;;
  content) push_content ;;
  front) push_front ;;
  all) push_code; push_front; push_content ;;
  *) echo "неизвестный режим: $WHAT"; exit 1 ;;
esac
echo "Готово. Дальше на сервере: см. DEPLOY.md (раздел «Обновление»)."
