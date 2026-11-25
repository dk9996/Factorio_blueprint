FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Не root: контейнеру нужно только читать код и /content (read-only том).
RUN useradd --system --no-create-home --uid 10001 appuser
USER appuser

# Игра Factorio внутри не нужна: прод только читает готовый CONTENT_DIR
# (см. DEPLOY.md), REBUILD_ENABLED=false гейтит всё, что её требует.
EXPOSE 8000

# Миграции при каждом старте (идемпотентно). Ровно один воркер: лимитер
# попыток входа (app/core/rate_limit.py) живёт в памяти процесса.
# --proxy-headers/--forwarded-allow-ips: бэкенд доступен только из сети
# compose (за Caddy), поэтому доверяем X-Forwarded-For — иначе лимитер
# видел бы один и тот же IP (контейнер Caddy) у всех пользователей.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 --proxy-headers --forwarded-allow-ips='*'"]
