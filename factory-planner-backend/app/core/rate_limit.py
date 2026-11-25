import time

# Простой sliding-window лимитер в памяти процесса. Ограничения (см. отчёт
# по задаче): не переживает перезапуск процесса (все блокировки сбрасываются
# при `uvicorn --reload`/рестарте), не шарится между несколькими воркерами
# (`uvicorn --workers N>1` или несколько процессов за балансировщиком имели
# бы каждый свой независимый счётчик) — для текущего однопроцессного
# dev/небольшого деплоя этого достаточно; для настоящего продакшна с
# несколькими воркерами нужно внешнее хранилище (Redis и т.п.).

WINDOW_SECONDS = 15 * 60
MAX_ATTEMPTS = 5

_attempts: dict[str, list[float]] = {}


def _prune(key: str) -> list[float]:
    now = time.time()
    bucket = [t for t in _attempts.get(key, []) if now - t < WINDOW_SECONDS]
    if bucket:
        _attempts[key] = bucket
    else:
        _attempts.pop(key, None)
    return bucket


def record_failure(key: str) -> None:
    bucket = _prune(key)
    bucket.append(time.time())
    _attempts[key] = bucket


def is_locked_out(key: str) -> bool:
    return len(_prune(key)) >= MAX_ATTEMPTS


def clear(key: str) -> None:
    _attempts.pop(key, None)


def check_lockout(email: str, ip: str) -> bool:
    return is_locked_out(f"email:{email}") or is_locked_out(f"ip:{ip}")


def register_failure(email: str, ip: str) -> None:
    record_failure(f"email:{email}")
    record_failure(f"ip:{ip}")


def clear_login_attempts(email: str) -> None:
    # Сбрасываем только по email — счётчик по IP специально не трогаем:
    # это защита от скорости подбора с одного адреса независимо от того,
    # чей конкретно пароль в итоге подошёл (общий IP — офис/NAT и т.п.).
    clear(f"email:{email}")
