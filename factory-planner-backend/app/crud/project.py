from copy import deepcopy
from datetime import datetime, timezone
import uuid
from sqlalchemy.orm import Session, load_only
from app.models.project import ProjectModel
from app.schemas.project import ProjectCreateSchema, ProjectUpdateSchema


def _count_entities(data: dict) -> int:
    tabs = data.get("tabs")
    if not isinstance(tabs, list):
        return 0
    total = 0
    for tab in tabs:
        if isinstance(tab, dict) and isinstance(tab.get("entities"), list):
            total += len(tab["entities"])
    return total


# Явная колоночная проекция без `data` — список проектов не должен грузить
# тяжёлый JSON (см. отчёт по задаче, п. "Счётчик сущностей").
_LIST_COLUMNS = (
    ProjectModel.id,
    ProjectModel.name,
    ProjectModel.updated_at,
    ProjectModel.entity_count,
    ProjectModel.thumbnail,
    ProjectModel.content_profile,
)


def get_projects(db: Session, owner_id: str) -> list[ProjectModel]:
    return (
        db.query(ProjectModel)
        .options(load_only(*_LIST_COLUMNS))
        .filter(ProjectModel.owner_id == owner_id)
        .order_by(ProjectModel.updated_at.desc())
        .all()
    )


def get_project(db: Session, project_id: str, owner_id: str) -> ProjectModel | None:
    # owner_id — прямо в WHERE, а не отдельной проверкой после загрузки:
    # чужой project_id даёт ровно тот же None/404, что и несуществующий —
    # разницы между "нет такого" и "есть, но не твой" наружу не просачивается.
    return (
        db.query(ProjectModel)
        .filter(ProjectModel.id == project_id, ProjectModel.owner_id == owner_id)
        .first()
    )


def create_project(db: Session, data: ProjectCreateSchema, owner_id: str) -> ProjectModel:
    project = ProjectModel(
        id=str(uuid.uuid4()),
        name=data.name,
        data=data.data,
        thumbnail=data.thumbnail,
        entity_count=_count_entities(data.data),
        owner_id=owner_id,
        content_profile=data.content_profile,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def update_project(
    db: Session, project_id: str, data: ProjectUpdateSchema, owner_id: str
) -> ProjectModel | None:
    project = get_project(db, project_id, owner_id)
    if not project:
        return None
    if data.name is not None:
        project.name = data.name
    project.data = data.data
    project.thumbnail = data.thumbnail
    project.entity_count = _count_entities(data.data)
    project.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(project)
    return project


def rename_project(db: Session, project_id: str, name: str, owner_id: str) -> ProjectModel | None:
    project = get_project(db, project_id, owner_id)
    if not project:
        return None
    project.name = name
    project.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(project)
    return project


def update_content_profile(
    db: Session, project_id: str, content_profile: str, owner_id: str
) -> ProjectModel | None:
    """
    Отдельная от update_project (автосейва) функция — см. ProjectUpdateSchema.
    Данные в data.tabs НЕ трогаем (сущности вне нового профиля просто
    перестают резолвиться в каталоге, не удаляются физически — см. отчёт
    по задаче "никогда не удалять молча").
    """
    project = get_project(db, project_id, owner_id)
    if not project:
        return None
    project.content_profile = content_profile
    project.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(project)
    return project


def delete_project(db: Session, project_id: str, owner_id: str) -> bool:
    project = get_project(db, project_id, owner_id)
    if not project:
        return False
    db.delete(project)
    db.commit()
    return True


def duplicate_project(db: Session, project_id: str, owner_id: str) -> ProjectModel | None:
    source = get_project(db, project_id, owner_id)
    if not source:
        return None
    now = datetime.now(timezone.utc)
    copy = ProjectModel(
        id=str(uuid.uuid4()),
        name=f"{source.name} (копия)",
        data=deepcopy(source.data),
        thumbnail=source.thumbnail,
        entity_count=source.entity_count,
        owner_id=owner_id,
        content_profile=source.content_profile,
        created_at=now,
        updated_at=now,
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return copy
