from fastapi import APIRouter, HTTPException
from app.services.dump_service import build_entity_catalog, get_cached_catalog
from app.services.recipe_service import get_cached_recipes

router = APIRouter(prefix="/api/entities", tags=["entities"])

@router.get("/recipes")
def list_recipes():
    return get_cached_recipes()

@router.get("")
def list_entities():
    return get_cached_catalog()


@router.post("/rebuild")
def rebuild_entities(force_redump: bool = False):
    try:
        result = build_entity_catalog(force_redump=force_redump)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))