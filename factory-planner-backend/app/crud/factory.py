from sqlalchemy.orm import Session
from app.models.factory import FactoryModel
from app.schemas.factory import FactoryCreateSchema, FactoryUpdateSchema
import uuid


def get_factories(db: Session) -> list[FactoryModel]:
    return db.query(FactoryModel).all()


def get_factory(db: Session, factory_id: str) -> FactoryModel | None:
    return db.query(FactoryModel).filter(FactoryModel.id == factory_id).first()


def create_factory(db: Session, data: FactoryCreateSchema) -> FactoryModel:
    factory = FactoryModel(
        id=str(uuid.uuid4()),
        name=data.name,
        folder=data.folder,
        status="ok",
        width=data.width,
        height=data.height,
        icon=data.icon,
        preview_icons=data.previewIcons,
        entities=[e.model_dump() for e in data.entities],
    )
    db.add(factory)
    db.commit()
    db.refresh(factory)
    return factory


def update_factory(db: Session, factory_id: str, data: FactoryUpdateSchema) -> FactoryModel | None:
    factory = get_factory(db, factory_id)
    if not factory:
        return None
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "entities" and value is not None:
            value = [e if isinstance(e, dict) else e.model_dump() for e in value]
        db_key = "preview_icons" if key == "previewIcons" else key
        setattr(factory, db_key, value)
    db.commit()
    db.refresh(factory)
    return factory


def delete_factory(db: Session, factory_id: str) -> bool:
    factory = get_factory(db, factory_id)
    if not factory:
        return False
    db.delete(factory)
    db.commit()
    return True