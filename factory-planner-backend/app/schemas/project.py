from datetime import datetime
from typing import Any
from pydantic import BaseModel, field_validator

from app.content.profile import ALL_PROFILE_IDS

INVALID_PROFILE_MESSAGE = "Недопустимый профиль контента"


def _validate_content_profile(v: str) -> str:
    if v not in ALL_PROFILE_IDS:
        raise ValueError(f"{INVALID_PROFILE_MESSAGE}: {v}")
    return v


class ProjectListItemSchema(BaseModel):
    """Лёгкая форма для списка — без data (см. crud.get_projects, колоночная проекция)."""

    id: str
    name: str
    updated_at: datetime
    entity_count: int
    thumbnail: str | None = None
    content_profile: str

    class Config:
        from_attributes = True


class ProjectDetailSchema(ProjectListItemSchema):
    data: dict[str, Any]
    created_at: datetime


class ProjectCreateSchema(BaseModel):
    name: str
    data: dict[str, Any] = {}
    thumbnail: str | None = None
    content_profile: str = "base"

    _validate_content_profile = field_validator("content_profile")(_validate_content_profile)


class ProjectUpdateSchema(BaseModel):
    """
    PUT — полная замена data (автосохранение/явное сохранение), опционально
    имя/превью. НАМЕРЕННО без content_profile — смена профиля идёт только
    через отдельный PATCH /{id}/content-profile (с предупреждением на
    фронте о том, что станет невидимым/нерабочим), автосейв не должен иметь
    возможность тихо поменять профиль мимо этого предупреждения.
    """

    name: str | None = None
    data: dict[str, Any]
    thumbnail: str | None = None


class ProjectRenameSchema(BaseModel):
    name: str


class ProjectProfileChangeSchema(BaseModel):
    content_profile: str

    _validate_content_profile = field_validator("content_profile")(_validate_content_profile)
