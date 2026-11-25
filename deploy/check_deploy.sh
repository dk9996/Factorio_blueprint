#!/usr/bin/env bash
# Проверка готовности к выкладке. Два режима:
#   deploy/check_deploy.sh            — на локальном ПК, перед rsync
#   deploy/check_deploy.sh --server   — на сервере, в /opt/factory-planner,
#                                       перед `docker compose up -d`
# Код возврата 0 — всё в порядке, 1 — есть ошибки (предупреждения не валят).
set -u

MODE=local
[ "${1:-}" = "--server" ] && MODE=server

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ERR=0
ok()   { printf '  \033[32mOK\033[0m    %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; ERR=1; }
warn() { printf '  \033[33mWARN\033[0m  %s\n' "$1"; }

if [ "$MODE" = local ]; then
  CONTENT="$ROOT/factory-planner-backend/content"
  DIST="$ROOT/factory-planner-front/dist"
  ENVFILE=""
  echo "== Локальная проверка ($ROOT)"
else
  CONTENT="$ROOT/content"
  DIST="$ROOT/frontend-dist"
  ENVFILE="$ROOT/.env"
  echo "== Проверка на сервере ($ROOT)"
fi

echo "-- контент"
if [ -d "$CONTENT" ]; then
  [ -f "$CONTENT/profiles/base/entity_catalog.json" ] && ok "профиль base: entity_catalog.json" || fail "нет $CONTENT/profiles/base/entity_catalog.json (python scripts/build_content.py --profiles base)"
  [ -f "$CONTENT/profiles/base/recipes.json" ] && ok "профиль base: recipes.json" || fail "нет recipes.json в профиле base"
  for prof in "$CONTENT"/profiles/*/; do
    [ -f "${prof}modules.json" ] || fail "нет modules.json в $(basename "$prof") (контент собран до появления выбора модулей — пересоберите)"
    [ -f "${prof}tiles.json" ] || fail "нет tiles.json в $(basename "$prof") (контент собран до появления плиток — пересоберите)"
    [ -f "${prof}signals.json" ] || fail "нет signals.json в $(basename "$prof") (контент собран до появления схемной сети — пересоберите)"
    [ -f "${prof}qualities.json" ] || fail "нет qualities.json в $(basename "$prof") (контент собран до появления качества — пересоберите)"
  done
  NPROF=$(find "$CONTENT/profiles" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
  ok "профилей в content/: $NPROF"
  [ "$NPROF" -lt 5 ] && warn "собраны не все 5 профилей — в меню создания проекта DLC-варианты будут с пустым каталогом"
  NS=$(find "$CONTENT/sprites" -type f -name '*.png' 2>/dev/null | wc -l)
  NE=$(find "$CONTENT/entity_sprites" -type f -name '*.png' 2>/dev/null | wc -l)
  [ "$NS" -gt 100 ] && ok "иконок в sprites/: $NS" || fail "в $CONTENT/sprites мало PNG ($NS)"
  [ "$NE" -gt 100 ] && ok "спрайтов в entity_sprites/: $NE" || fail "в $CONTENT/entity_sprites мало PNG ($NE)"
  # Старый плоский кэш иконок (до ключей мод+путь) — признак устаревшей сборки.
  FLAT=$(find "$CONTENT/sprites" -maxdepth 1 -type f 2>/dev/null | wc -l)
  [ "$FLAT" -eq 0 ] && ok "плоских устаревших иконок нет" || fail "в sprites/ лежат $FLAT плоских файлов — пересоберите контент"
  [ -f "$CONTENT/entity_sprite_frames.json" ] && ok "entity_sprite_frames.json" || fail "нет entity_sprite_frames.json"
  NT=$(find "$CONTENT/tile_sprites" -type f -name '*.png' 2>/dev/null | wc -l)
  [ "$NT" -gt 10 ] && ok "текстур плиток в tile_sprites/: $NT" || fail "в $CONTENT/tile_sprites мало PNG ($NT) — пересоберите контент (плитки)"
  [ -f "$CONTENT/tile_sprites.json" ] && ok "tile_sprites.json" || fail "нет tile_sprites.json"
  ok "размер content/: $(du -sh "$CONTENT" | cut -f1)"
else
  fail "нет папки $CONTENT"
fi

echo "-- фронт"
if [ -f "$DIST/index.html" ]; then
  ok "index.html на месте"
  if grep -rlq "localhost:8000" "$DIST/static" 2>/dev/null; then
    fail "в бандле есть localhost:8000 — фронт собран без VITE_API_BASE=/api VITE_SERVER_ORIGIN="
  else
    ok "бандл не содержит localhost:8000"
  fi
  ls "$DIST"/static/*.js >/dev/null 2>&1 && ok "бандл в static/" || fail "нет $DIST/static/*.js (старая сборка без assetsDir?)"
else
  fail "нет $DIST/index.html (cd factory-planner-front && VITE_API_BASE=/api VITE_SERVER_ORIGIN= npm run build)"
fi

if [ "$MODE" = server ]; then
  echo "-- .env"
  if [ -f "$ENVFILE" ]; then
    get() { grep -E "^$1=" "$ENVFILE" | tail -1 | cut -d= -f2-; }
    PERM=$(stat -c %a "$ENVFILE")
    [ "$PERM" = 600 ] && ok ".env права 600" || warn ".env права $PERM (рекомендуется chmod 600 .env)"
    for v in PUBLIC_DOMAIN ORIGIN POSTGRES_PASSWORD DATABASE_URL SECRET_KEY; do
      [ -n "$(get $v)" ] && ok "$v задан" || fail "$v пуст или отсутствует"
    done
    SK="$(get SECRET_KEY)"
    [ "${#SK}" -ge 32 ] && ok "SECRET_KEY достаточно длинный (${#SK})" || fail "SECRET_KEY короче 32 символов"
    PW="$(get POSTGRES_PASSWORD)"
    [ "${#PW}" -ge 16 ] && ok "POSTGRES_PASSWORD достаточно длинный" || fail "POSTGRES_PASSWORD короче 16 символов"
    case "$PW$SK" in *change-me*|*changeme*) fail "в .env остались значения-заглушки";; esac
    case "$(get DATABASE_URL)" in
      postgresql://*@postgres:5432/*) ok "DATABASE_URL указывает на сервис postgres";;
      *) fail "DATABASE_URL должен быть postgresql://...@postgres:5432/...";;
    esac
    case "$(get ORIGIN)" in https://*) ok "ORIGIN начинается с https://";; *) fail "ORIGIN должен начинаться с https://";; esac
    case "$(get ORIGIN)" in */) fail "ORIGIN не должен заканчиваться на / (сравнивается с заголовком Origin буквально)";; esac
    [ "$(get ORIGIN)" = "https://$(get PUBLIC_DOMAIN)" ] && ok "ORIGIN совпадает с PUBLIC_DOMAIN" || fail "ORIGIN должен быть https://<PUBLIC_DOMAIN>"
    [ "$(get COOKIE_SECURE)" = "false" ] && fail "COOKIE_SECURE=false на проде — сессия небезопасна"
    [ "$(get MODS_ENABLED)" = "true" ] && warn "MODS_ENABLED=true (на сервере нет модов, ожидается false)"
    D="$(get PUBLIC_DOMAIN)"
    [ -n "$D" ] && [ "$D" != "example.com" ] && ok "PUBLIC_DOMAIN=$D"
  else
    fail "нет $ENVFILE (cp .env.example .env)"
  fi
  echo "-- docker"
  if command -v docker >/dev/null 2>&1; then
    docker compose version >/dev/null 2>&1 && ok "docker compose доступен" || fail "нет docker compose v2"
    docker compose -f "$ROOT/docker-compose.yml" config -q 2>/dev/null && ok "docker-compose.yml валиден" || fail "docker compose config выдаёт ошибку (проверьте .env)"
  else
    fail "docker не найден"
  fi
  FREE=$(df -BG --output=avail "$ROOT" | tail -1 | tr -dc 0-9)
  [ "${FREE:-0}" -ge 5 ] && ok "свободно на диске: ${FREE} ГБ" || warn "свободно только ${FREE} ГБ"
fi

echo
if [ "$ERR" -eq 0 ]; then echo "Готово к выкладке."; else echo "Есть ошибки — выкладывать рано."; fi
exit "$ERR"
