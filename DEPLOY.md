# Деплой Factory Planner на VPS

Целевой сервер: Ubuntu 24.04, 1 vCPU / 2 ГБ RAM (+2 ГБ swap) / 30 ГБ диска,
Docker + docker compose v2, домен `factory-planner.duckdns.org`.
Схема: **Caddy** (80/443, HTTPS Let's Encrypt автоматически) → статика фронта
+ иконки каталога напрямую с диска, `/api/*` → **backend** (FastAPI, 1 воркер)
→ **postgres**. Наружу опубликованы только порты Caddy; backend и postgres
доступны лишь внутри сети compose `factory-planner_net`.

На сервере рядом работает Amnezia VPN — этот проект с ним не пересекается:
все контейнеры/сеть/тома называются `factory-planner*`, лежит всё в
`/opt/factory-planner`. **Никогда не запускайте на этом сервере
`docker system prune` / `docker container prune` / `docker network prune` /
`docker volume prune`** — они заденут контейнеры VPN. Все команды ниже
адресуют только наш compose-проект.

Контент игры (каталог, рецепты, спрайты) собирается **один раз локально**
(на ПК, где установлена Factorio) и заливается готовым. Сервер ничего не
пересчитывает (`REBUILD_ENABLED=false` зашит в compose).

```
/opt/factory-planner/
├── docker-compose.yml, Caddyfile, .env      # .env создаётся на сервере
├── factory-planner-backend/                 # исходники backend (Docker собирает образ тут)
├── content/                                 # ~850 МБ, монтируется в контейнеры read-only
├── frontend-dist/                           # собранный фронт (~11 МБ), read-only
├── deploy/                                  # check_deploy.sh, backup_db.sh, push.sh
└── backups/                                 # дампы Postgres
```

Места на диске сервера: content ≈ 0,85 ГБ + образы (python/postgres/caddy)
≈ 0,6 ГБ + БД (десятки МБ) + бэкапы — итого около 2–3 ГБ из 30.

---

## 0. Один раз: подготовка сервера

```bash
ssh root@factory-planner.duckdns.org

# rsync нужен на обеих сторонах
apt-get update && apt-get install -y rsync

# убедиться, что 80/443 свободны (должна быть пустая выдача) и версии
ss -ltn '( sport = :80 or sport = :443 )'
docker --version && docker compose version
ufw status        # 22, 80, 443 должны быть разрешены

mkdir -p /opt/factory-planner
exit
```

На Arch-ПК нужны `rsync`, `openssh`, `nodejs`/`npm` (`sudo pacman -S rsync openssh nodejs npm`).

DNS: `getent hosts factory-planner.duckdns.org` должен вернуть IP сервера
(иначе Caddy не получит сертификат).

## 1. Локально (Arch ПК): собрать контент

```bash
cd ~/Desktop/"factorio проект"/factory-planner-backend
source venv/bin/activate
python scripts/build_content.py --profiles all
```

Результат — `factory-planner-backend/content/` (≈ 850 МБ, 1265 иконок +
~1350 спрайтов + каталоги/рецепты профилей).

Почему `all`, а не только `base`: спрайты — общее хранилище, оно в любом
случае целиком копируется в `content/`; отдельные профили добавляют по
14–28 МБ. Если собрать только `base`, то в окне «Новый чертёж» варианты с DLC
(Elevated Rails / Quality / Space Age) останутся с пустым каталогом.
Если всё же нужен только `base`: `--profiles base` (размер почти тот же).

Повторный запуск идемпотентен и быстрый. Если Factorio обновилась или
менялся код нарезки спрайтов — пересоберите дампы: добавьте `--force-redump`.

## 2. Локально: собрать фронт

```bash
cd ~/Desktop/"factorio проект"/factory-planner-front
npm ci
VITE_API_BASE=/api VITE_SERVER_ORIGIN= npm run build
```

Обе переменные обязательны: без них бандл будет ходить на
`http://localhost:8000`. Результат — `factory-planner-front/dist/`
(бандл лежит в `dist/static/`, а `/assets/` занят иконками каталога).

## 3. Локально: проверка перед выкладкой

```bash
cd ~/Desktop/"factorio проект"
./deploy/check_deploy.sh
```

Проверяет: `content/` собран и свежий (нет устаревших плоских иконок),
фронт собран с правильными переменными. Должно закончиться
«Готово к выкладке».

## 4. Залить на сервер

```bash
cd ~/Desktop/"factorio проект"
./deploy/push.sh root@factory-planner.duckdns.org all
```

`push.sh` сам запускает проверку и затем rsync'ом заливает: код
(backend, `docker-compose.yml`, `Caddyfile`, `deploy/`) → фронт → `content/`.
Первый раз content (≈ 850 МБ, ~2600 файлов) идёт минуты (≈ 1,5 мин при
100 Мбит/с, ≈ 6 мин при 20 Мбит/с); дальше передаются только изменения.
Отдельные части: `push.sh <host> code|front|content`.

Что `push.sh` делает на сервере безопасно: не трогает `.env` и `backups/`;
`content/` и `frontend-dist/` обновляются на месте с `--delay-updates`
(контейнеры видят новые файлы сразу, перезапуск не нужен).

## 5. Сервер: создать `.env`

```bash
ssh root@factory-planner.duckdns.org
cd /opt/factory-planner
cp .env.example .env

PW=$(openssl rand -hex 24)
SK=$(openssl rand -base64 48 | tr -d '\n=+/')
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$PW|; s|^SECRET_KEY=.*|SECRET_KEY=$SK|" .env
chmod 600 .env

cat .env     # убедиться: домен/ORIGIN верные, пароль и ключ заполнены
```

Что в `.env`: `PUBLIC_DOMAIN`, `ORIGIN` (= `https://` + домен, без `/` на
конце), `POSTGRES_PASSWORD`, `DATABASE_URL` (на сервис `postgres`, пароль
подставляется автоматически), `SECRET_KEY`, `MODS_ENABLED=false`,
`COOKIE_SECURE=true`, `CONTENT_DIR=/content` (compose всё равно задаёт
`/content` и монтирует `./content`). Не теряйте `POSTGRES_PASSWORD` —
после первого старта БД он зашит в том `factory-planner_pgdata`.

Предстартовая проверка на сервере:

```bash
./deploy/check_deploy.sh --server
```

## 6. Сервер: запуск

```bash
cd /opt/factory-planner
docker compose up -d --build
docker compose ps
docker compose logs -f --tail=50 backend    # Ctrl+C для выхода
```

Миграции Alembic применяются **автоматически** при каждом старте
контейнера `backend` (`alembic upgrade head` в `CMD`); в логах будет
«Running upgrade -> 0001 … 0003». Вручную при необходимости:

```bash
docker compose exec backend alembic current
docker compose exec backend alembic upgrade head
```

Первая сборка образа на 1 vCPU — несколько минут. Caddy стартует после
того, как backend станет `healthy`, и сразу запрашивает сертификат
(10–60 секунд): `docker compose logs caddy | grep -i -E "certificate|obtained|error"`.

Расход памяти в простое (проверено локально): backend ≈ 75 МБ,
postgres ≈ 70 МБ, caddy ≈ 30 МБ; лимиты 512 / 384 / 128 МБ.

## 7. Проверка работы

```bash
curl -s https://factory-planner.duckdns.org/api/health          # {"status":"ok"}
curl -sI https://factory-planner.duckdns.org/ | head -3          # HTTP/2 200
curl -s 'https://factory-planner.duckdns.org/api/entities?profile=base' | head -c 200
docker ps --format '{{.Names}}\t{{.Ports}}'                      # наружу только caddy 80/443
```

В браузере:
1. Откройте https://factory-planner.duckdns.org — должна открыться страница
   входа, замок в адресной строке (сертификат Let's Encrypt).
2. «Регистрация» → создайте первого пользователя (email, имя, пароль ≥ 8).
3. «Создать» → выберите набор контента → в редакторе слева должна появиться
   палитра с иконками, перетащите пару сущностей, вернитесь в меню — проект
   в списке с миниатюрой.
4. Обновите страницу (F5) и перезайдите — проект на месте.

## 8. Бэкап Postgres (cron)

Ручной бэкап (хранит 14 дней в `/opt/factory-planner/backups`):

```bash
/opt/factory-planner/deploy/backup_db.sh
```

Ежедневно в 03:15:

```bash
cat > /etc/cron.d/factory-planner-backup <<'EOF'
15 3 * * * root /opt/factory-planner/deploy/backup_db.sh >> /var/log/factory-planner-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/factory-planner-backup
```

Копию стоит держать и вне сервера — с Arch-ПК:

```bash
rsync -av root@factory-planner.duckdns.org:/opt/factory-planner/backups/ ~/backups/factory-planner/
```

Восстановление (в пустую/новую БД; остановите backend на время):

```bash
cd /opt/factory-planner
docker compose stop backend
docker exec factory-planner-postgres psql -U factory_planner -d postgres \
  -c "DROP DATABASE factory_planner" -c "CREATE DATABASE factory_planner OWNER factory_planner"
zcat backups/factory_planner-ГГГГММДД-ЧЧММСС.sql.gz | \
  docker exec -i factory-planner-postgres psql -U factory_planner -d factory_planner -v ON_ERROR_STOP=1
docker compose start backend
```

Бэкап и восстановление проверены локально на настоящем Postgres 16.

## 9. Обновление версии

**Контент или фронт** (данные пользователей не затрагиваются, без простоя):

```bash
# на ПК: пересобрать (шаги 1–3), затем
./deploy/push.sh root@factory-planner.duckdns.org content     # и/или front
```

Файлы подменяются на месте, перезапуск не нужен. У пользователей с уже
открытой вкладкой после обновления фронта может понадобиться F5.

**Код backend** (новые эндпоинты, миграции):

```bash
# на ПК
./deploy/push.sh root@factory-planner.duckdns.org code

# на сервере — сначала бэкап, потом пересборка
ssh root@factory-planner.duckdns.org
cd /opt/factory-planner
./deploy/backup_db.sh
docker compose build backend            # старая версия продолжает работать
docker compose up -d backend            # перезапуск ~10–30 с, при старте применяются миграции
docker compose logs --tail=30 backend
```

Простой — только эти секунды перезапуска backend (Caddy отвечает 502);
БД и пользователи живут в томе `factory-planner_pgdata` и не затрагиваются.
Откат: вернуть прежнюю версию кода (`git checkout` на ПК + `push.sh code`)
и `docker compose up -d --build backend`; если миграция была необратима —
восстановить БД из бэкапа (раздел 8).

После обновления Docker-образов можно освободить место **только своим**:
`docker image prune -f` удалит все висячие образы всего сервера, включая
чужие, поэтому используйте точечно: `docker image rm factory-planner-backend:<старый-id>`.

## 10. Диагностика

| Симптом | Что смотреть |
|---|---|
| Сайт не открывается / нет HTTPS | `docker compose logs caddy` (ACME-ошибки), `getent hosts factory-planner.duckdns.org`, `ufw status`, порты 80/443 свободны |
| 502 от Caddy | `docker compose ps` → backend `healthy`? `docker compose logs backend` |
| Backend перезапускается | почти всегда пусто в `content/` (`ls /opt/factory-planner/content/profiles`) или неверный `DATABASE_URL`/пароль |
| Пустая палитра в редакторе | нет `content/profiles/<профиль>/` для выбранного набора — соберите нужные профили и `push.sh content` |
| Логин не держится | `COOKIE_SECURE=true` требует HTTPS; проверьте, что заходите по https и `ORIGIN` совпадает с адресом сайта |
| 403 на POST/PUT/PATCH | `ORIGIN` в `.env` не совпадает буква в букву с адресом сайта |
| Забыли пароль БД | он в `.env`; для смены — `ALTER USER` внутри контейнера и правка `.env`, затем `docker compose up -d` |

Остановить/запустить наш стек (VPN не затрагивается):
`cd /opt/factory-planner && docker compose stop` / `docker compose up -d`.
Полное удаление **с данными**: `docker compose down -v` (внимание: удаляет БД).

## Переменные окружения

| Переменная | Назначение |
|---|---|
| `PUBLIC_DOMAIN` | Домен сайта: Caddy использует для маршрутизации и сертификата |
| `ORIGIN` | `https://<домен>` — единственный разрешённый origin (CORS/CSRF) |
| `POSTGRES_PASSWORD` | Пароль БД (создаётся один раз) |
| `DATABASE_URL` | Строка подключения backend к `postgres` |
| `SECRET_KEY` | Подпись сессий; смена разлогинит всех |
| `MODS_ENABLED` | Сторонние моды — задел, держать `false` |
| `COOKIE_SECURE` | `true` на проде |
| `CONTENT_DIR` | `/content` внутри контейнера (задан в compose) |
| `REBUILD_ENABLED` | Всегда `false` на сервере (зашито в compose) |
