import secrets
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import decode_token
from app.crud.user import get_user_by_id
from app.database import get_db
from app.models.user import UserModel

UNAUTHORIZED_MESSAGE = "Не авторизован"
CSRF_MESSAGE = "Недействительный CSRF-токен"


def get_current_user(request: Request, db: Session = Depends(get_db)) -> UserModel:
    token = request.cookies.get("access_token")
    payload = decode_token(token, "access") if token else None
    if payload is None:
        raise HTTPException(status_code=401, detail=UNAUTHORIZED_MESSAGE)
    user = get_user_by_id(db, payload["sub"])
    # is_active=False — ровно так помечен служебный legacy-пользователь
    # (см. user_migration_service.py/alembic 0002): даже если бы для него
    # как-то возник валидный токен, залогиниться под ним нельзя.
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail=UNAUTHORIZED_MESSAGE)
    return user


def require_csrf(request: Request) -> None:
    """
    Двойная отправка токена (решение №4 в отчёте по задаче): CSRF-токен —
    claim внутри самого access-JWT (а не отдельный читаемый cookie — фронт
    и бэк на разных origin в dev, document.cookie с другого origin не
    читается), фронт получает его в теле ответа register/login/me/refresh
    и подставляет в заголовок X-CSRF-Token. Плюс дёшевая проверка Origin —
    defense-in-depth на случай обхода основной схемы.
    """
    origin = request.headers.get("origin")
    if origin is not None and origin not in settings.cors_allowed_origins:
        raise HTTPException(status_code=403, detail=CSRF_MESSAGE)

    token = request.cookies.get("access_token")
    payload = decode_token(token, "access") if token else None
    header_token = request.headers.get("x-csrf-token")
    if (
        payload is None
        or not header_token
        or not secrets.compare_digest(payload.get("csrf", ""), header_token)
    ):
        raise HTTPException(status_code=403, detail=CSRF_MESSAGE)
