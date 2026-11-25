import re
from datetime import datetime

from email_validator import validate_email, EmailNotValidError
from pydantic import BaseModel, field_validator

_USERNAME_RE = re.compile(r"^[A-Za-z0-9_-]+$")


class RegisterSchema(BaseModel):
    # Подтверждение пароля (password_confirm) — чисто фронтовая проверка
    # (см. RegisterPage.tsx), сюда не дублируется: бэкенду достаточно
    # одного значения пароля.
    email: str
    username: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email_field(cls, v: str) -> str:
        try:
            result = validate_email(v, check_deliverability=False)
        except EmailNotValidError:
            raise ValueError("Введите корректный email")
        return result.normalized.lower()

    @field_validator("username")
    @classmethod
    def validate_username_field(cls, v: str) -> str:
        if not (3 <= len(v) <= 32):
            raise ValueError("Имя пользователя должно быть от 3 до 32 символов")
        if not _USERNAME_RE.fullmatch(v):
            raise ValueError("Имя пользователя может содержать только буквы, цифры, _ и -")
        return v

    @field_validator("password")
    @classmethod
    def validate_password_field(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Пароль должен быть не менее 8 символов")
        if len(v) > 128:
            raise ValueError("Пароль слишком длинный (максимум 128 символов)")
        return v


class LoginSchema(BaseModel):
    """
    Специально без строгой валидации формата/длины (в отличие от
    RegisterSchema) — при входе неверный формат/пустое поле должны вести к
    той же самой общей ошибке "неверный email или пароль" (см. api/auth.py),
    а не к отдельному полевому сообщению, которое могло бы подсказать
    атакующему, что он угадал хотя бы формат email верно.
    """

    email: str
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class UserPublicSchema(BaseModel):
    id: str
    email: str
    username: str
    created_at: datetime

    class Config:
        from_attributes = True


class AuthResponseSchema(BaseModel):
    user: UserPublicSchema
    csrf_token: str


class RefreshResponseSchema(BaseModel):
    csrf_token: str
