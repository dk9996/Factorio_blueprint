import uuid
from sqlalchemy.orm import Session
from app.models.factory import FactoryModel
from app.models.project import ProjectModel
from app.crud.project import create_project
from app.schemas.project import ProjectCreateSchema
from app.services.user_migration_service import LEGACY_USER_ID


def migrate_factories_to_initial_project(db: Session) -> None:
    """
    Одноразово, при первом запуске с новой `projects` таблицей: уже
    сохранённые Factory (единственное, что реально было персистентно у
    пользователя до появления экрана проектов — localStorage для чертежей
    не использовался вовсе) оборачиваются в один стартовый Project, каждая
    Factory становится отдельной вкладкой. Таблица `factories` НЕ трогается
    (не удаляется, не помечается) — сайдбар "Мои заводы" продолжает ей
    пользоваться как раньше. Срабатывает только если `projects` пуста —
    идемпотентно для последующих запусков.
    """
    if db.query(ProjectModel.id).first() is not None:
        return
    factories = db.query(FactoryModel).all()
    if not factories:
        return

    tabs = []
    for f in factories:
        entities = f.entities or []
        max_id = max((e.get("id", 0) for e in entities if isinstance(e, dict)), default=0)
        tabs.append({
            "id": f"tab-{uuid.uuid4().hex[:8]}",
            "title": f.name,
            "factoryId": f.id,
            "entities": entities,
            "nextId": max_id + 1,
            "past": [],
            "future": [],
            "offsetX": 0,
            "offsetY": 0,
            "scale": 1,
            "savedEntitiesJson": "",
        })

    data = {"tabs": tabs, "activeTabId": tabs[0]["id"]}
    # На старте пользователя ещё нет — вешаем на служебного legacy-владельца
    # (как и для всех проектов, у которых owner_id был NULL до авторизации,
    # см. alembic 0002/user_migration_service.py), первый зарегистрированный
    # пользователь получит этот проект автоматически вместе с остальными.
    create_project(db, ProjectCreateSchema(name="Мои чертежи", data=data), owner_id=LEGACY_USER_ID)
