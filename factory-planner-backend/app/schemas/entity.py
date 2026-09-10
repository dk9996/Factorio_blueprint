from pydantic import BaseModel


class CatalogEntitySchema(BaseModel):
    typeId: str
    label: str
    icon: str
    category: str
    width: int
    height: int