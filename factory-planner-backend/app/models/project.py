from datetime import datetime, timezone
from sqlalchemy import String, Integer, JSON, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ProjectModel(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    # {"tabs": [...], "activeTabId": "..."} — непрозрачно для бэкенда,
    # форму задаёт фронтовый Tab/PlacedEntity (см. tabsStore.ts/canvasStore.ts).
    # Только переносимые типы (JSON — на Postgres станет JSON/JSONB).
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    # data URL (data:image/png;base64,...) — см. lib/projects/thumbnail.ts.
    thumbnail: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Денормализовано из data.tabs[].entities при каждом create/update —
    # чтобы список проектов не грузил тяжёлый data (см. crud/project.py).
    entity_count: Mapped[int] = mapped_column(Integer, default=0)
    # На будущее, под авторизацию — сейчас не используется ни в одном эндпоинте.
    owner_id: Mapped[str | None] = mapped_column(String, nullable=True)
    # Профиль контента (ваниль/DLC) — см. app/content/profile.py, ALL_PROFILE_IDS.
    # Определяет, какие сущности/рецепты видны в редакторе для ЭТОГО проекта
    # (см. GET /api/entities?profile=...). Смена — только через отдельный
    # PATCH /api/projects/{id}/content-profile с предупреждением на фронте,
    # никогда через общий автосейв (ProjectUpdateSchema намеренно без этого поля).
    content_profile: Mapped[str] = mapped_column(
        String, nullable=False, default="base", server_default="base"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
