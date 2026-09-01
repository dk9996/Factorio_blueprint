from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.factory import FactorySchema, FactoryCreateSchema, FactoryUpdateSchema
from app.crud import factory as factory_crud

router = APIRouter(prefix="/api/factories", tags=["factories"])


@router.get("", response_model=list[FactorySchema])
def list_factories(db: Session = Depends(get_db)):
    factories = factory_crud.get_factories(db)
    return [_to_schema(f) for f in factories]


@router.get("/{factory_id}", response_model=FactorySchema)
def get_factory(factory_id: str, db: Session = Depends(get_db)):
    factory = factory_crud.get_factory(db, factory_id)
    if not factory:
        raise HTTPException(status_code=404, detail="Factory not found")
    return _to_schema(factory)


@router.post("", response_model=FactorySchema)
def create_factory(data: FactoryCreateSchema, db: Session = Depends(get_db)):
    factory = factory_crud.create_factory(db, data)
    return _to_schema(factory)


@router.patch("/{factory_id}", response_model=FactorySchema)
def update_factory(factory_id: str, data: FactoryUpdateSchema, db: Session = Depends(get_db)):
    factory = factory_crud.update_factory(db, factory_id, data)
    if not factory:
        raise HTTPException(status_code=404, detail="Factory not found")
    return _to_schema(factory)


@router.delete("/{factory_id}")
def delete_factory(factory_id: str, db: Session = Depends(get_db)):
    ok = factory_crud.delete_factory(db, factory_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Factory not found")
    return {"ok": True}


def _to_schema(factory) -> FactorySchema:
    return FactorySchema(
        id=factory.id,
        name=factory.name,
        folder=factory.folder,
        status=factory.status,
        width=factory.width,
        height=factory.height,
        icon=factory.icon,
        previewIcons=factory.preview_icons,
        entities=factory.entities,
    )