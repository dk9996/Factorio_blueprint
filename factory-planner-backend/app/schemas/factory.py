from pydantic import BaseModel
from typing import Literal


class PlacedEntitySchema(BaseModel):
    id: int
    typeId: str
    type: str | None = None
    icon: str
    label: str
    x: int
    y: int
    width: int
    height: int
    bottleneck: bool | None = None
    power: float | None = None
    pollution: float | None = None
    throughput: float | None = None
    recipe: str | None = None
    craftingCategories: list[str] | None = None
    moduleSlots: int | None = None
    config: dict | None = None


class FactorySchema(BaseModel):
    id: str
    name: str
    folder: str
    status: Literal["ok", "warn", "bad"]
    width: int
    height: int
    icon: str
    previewIcons: list[str]
    entities: list[PlacedEntitySchema]

    class Config:
        from_attributes = True  # позволяет строить схему прямо из ORM-объекта


class FactoryCreateSchema(BaseModel):
    name: str
    folder: str
    width: int
    height: int
    icon: str
    previewIcons: list[str] = []
    entities: list[PlacedEntitySchema] = []


class FactoryUpdateSchema(BaseModel):
    name: str | None = None
    folder: str | None = None
    status: Literal["ok", "warn", "bad"] | None = None
    entities: list[PlacedEntitySchema] | None = None