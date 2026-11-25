import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError

from app.config import settings

_hasher = PasswordHasher()  # параметры по умолчанию библиотеки, без кастомных настроек

ACCESS_TOKEN_TTL = timedelta(minutes=20)
REFRESH_TOKEN_TTL = timedelta(days=14)

JWT_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def _encode(payload: dict, ttl: timedelta) -> str:
    now = datetime.now(timezone.utc)
    full_payload = {**payload, "iat": now, "exp": now + ttl}
    return jwt.encode(full_payload, settings.secret_key, algorithm=JWT_ALGORITHM)


def create_access_token(user_id: str, csrf_token: str) -> str:
    return _encode({"sub": user_id, "type": "access", "csrf": csrf_token}, ACCESS_TOKEN_TTL)


def create_refresh_token(user_id: str) -> str:
    return _encode({"sub": user_id, "type": "refresh"}, REFRESH_TOKEN_TTL)


def decode_token(token: str, expected_type: Literal["access", "refresh"]) -> dict | None:
    """
    Никогда не бросает исключение наружу — любая проблема (просрочен,
    подделан, неверный тип) трактуется вызывающим кодом (api/deps.py) как
    "не авторизован", без разницы в сообщении пользователю.
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != expected_type or not isinstance(payload.get("sub"), str):
        return None
    return payload
