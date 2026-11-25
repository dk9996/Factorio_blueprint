from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.core import rate_limit
from app.core.security import (
    ACCESS_TOKEN_TTL,
    REFRESH_TOKEN_TTL,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_csrf_token,
    hash_password,
    verify_password,
)
from app.crud import user as user_crud
from app.database import get_db
from app.api.deps import UNAUTHORIZED_MESSAGE, get_current_user, require_csrf
from app.models.user import UserModel
from app.schemas.auth import (
    AuthResponseSchema,
    LoginSchema,
    RefreshResponseSchema,
    RegisterSchema,
    UserPublicSchema,
)
from app.services.user_migration_service import claim_legacy_projects_for_first_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Общая ошибка при входе — одинаковая независимо от того, что конкретно не
# совпало (нет такого email / неверный пароль / is_active=False у
# legacy-плейсхолдера), чтобы не подсказывать атакующему существование
# аккаунта (см. отчёт по задаче).
LOGIN_FAILURE_MESSAGE = "Неверный email или пароль"
LOCKOUT_MESSAGE = "Слишком много попыток входа. Попробуйте снова через 15 минут."
EMAIL_TAKEN_MESSAGE = "Такой email уже зарегистрирован"
USERNAME_TAKEN_MESSAGE = "Такое имя пользователя уже занято"

# Этап 2 (не реализовано, требует SMTP): POST /forgot-password, POST
# /reset-password — короткоживущий одноразовый токен, тот же JWT-механизм
# из core/security.py со своим claim "type". Также этап 2: GET
# /oauth/{provider}/callback (GitHub/Google) — потребует colonns
# oauth_provider/oauth_subject в UserModel и nullable password_hash для
# чисто-OAuth аккаунтов (схемное изменение, не просто новый эндпоинт).


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _set_session_cookies(response: Response, user_id: str) -> str:
    csrf_token = generate_csrf_token()
    access_token = create_access_token(user_id, csrf_token)
    refresh_token = create_refresh_token(user_id)
    response.set_cookie(
        "access_token",
        access_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=int(ACCESS_TOKEN_TTL.total_seconds()),
        path="/",
    )
    response.set_cookie(
        "refresh_token",
        refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=int(REFRESH_TOKEN_TTL.total_seconds()),
        path="/",
    )
    return csrf_token


@router.post("/register", response_model=AuthResponseSchema)
def register(data: RegisterSchema, response: Response, db: Session = Depends(get_db)):
    # detail — список {field,message} (та же форма, что у 422 от
    # RequestValidationError, см. main.py:auth_validation_exception_handler),
    # а не просто строка — фронт показывает это под конкретным полем формы
    # (см. lib/api/auth.ts:parseAuthError), а не общей ошибкой над формой.
    if user_crud.get_user_by_email(db, data.email) is not None:
        raise HTTPException(status_code=409, detail=[{"field": "email", "message": EMAIL_TAKEN_MESSAGE}])
    if user_crud.get_user_by_username(db, data.username) is not None:
        raise HTTPException(
            status_code=409, detail=[{"field": "username", "message": USERNAME_TAKEN_MESSAGE}]
        )

    # Проверяем ДО создания — сам новый пользователь ещё не должен считаться
    # "настоящим" при подсчёте (см. user_migration_service.py).
    was_first_user = user_crud.count_real_users(db) == 0
    new_user = user_crud.create_user(db, data.email, data.username, hash_password(data.password))
    if was_first_user:
        claim_legacy_projects_for_first_user(db, new_user)

    csrf_token = _set_session_cookies(response, new_user.id)
    return AuthResponseSchema(user=UserPublicSchema.model_validate(new_user), csrf_token=csrf_token)


@router.post("/login", response_model=AuthResponseSchema)
def login(data: LoginSchema, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = _client_ip(request)
    if rate_limit.check_lockout(data.email, ip):
        raise HTTPException(status_code=429, detail=LOCKOUT_MESSAGE)

    user = user_crud.get_user_by_email(db, data.email)
    if user is None or not user.is_active or not verify_password(data.password, user.password_hash):
        rate_limit.register_failure(data.email, ip)
        raise HTTPException(status_code=401, detail=LOGIN_FAILURE_MESSAGE)

    rate_limit.clear_login_attempts(data.email)
    csrf_token = _set_session_cookies(response, user.id)
    return AuthResponseSchema(user=UserPublicSchema.model_validate(user), csrf_token=csrf_token)


@router.post("/logout")
def logout(
    response: Response,
    current_user: UserModel = Depends(get_current_user),
    _: None = Depends(require_csrf),
):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@router.post("/refresh", response_model=RefreshResponseSchema)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    # Без CSRF-защиты — это cookie-only операция (httpOnly refresh-cookie
    # сам является предъявляемым секретом), а худшее, что может сделать
    # межсайтовый атакующий, триггернув этот эндпоинт — заставить браузер
    # жертвы обновить ЕЁ ЖЕ собственную сессию, что не является повышением
    # привилегий и не раскрывает ничего атакующему (см. отчёт по задаче).
    token = request.cookies.get("refresh_token")
    payload = decode_token(token, "refresh") if token else None
    if payload is None:
        raise HTTPException(status_code=401, detail=UNAUTHORIZED_MESSAGE)
    user = user_crud.get_user_by_id(db, payload["sub"])
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail=UNAUTHORIZED_MESSAGE)

    csrf_token = generate_csrf_token()
    access_token = create_access_token(user.id, csrf_token)
    response.set_cookie(
        "access_token",
        access_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=int(ACCESS_TOKEN_TTL.total_seconds()),
        path="/",
    )
    return RefreshResponseSchema(csrf_token=csrf_token)


@router.get("/me", response_model=AuthResponseSchema)
def me(request: Request, current_user: UserModel = Depends(get_current_user)):
    # CSRF-claim уже лежит в текущем access-токене (поставлен при
    # login/register/refresh) — просто достаём его заново, чтобы фронт мог
    # восстановить значение в памяти после перезагрузки страницы (см.
    # client.ts/authStore.ts), без выпуска нового токена на каждый /me.
    token = request.cookies.get("access_token")
    payload = decode_token(token, "access")
    return AuthResponseSchema(
        user=UserPublicSchema.model_validate(current_user),
        csrf_token=payload["csrf"],
    )
