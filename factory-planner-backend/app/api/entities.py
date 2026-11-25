from fastapi import APIRouter, HTTPException, Query
from app.config import settings
from app.content.paths import profile_cache_dir
from app.content.profile import ALL_PROFILE_IDS, parse_profile_id
from app.services.dump_service import (
    build_entity_catalog,
    build_entity_profile_origin_map,
    get_cached_catalog,
    get_cached_modules,
    get_cached_qualities,
    get_cached_signals,
    get_cached_tiles,
)
from app.services.recipe_service import get_cached_recipes
from app.services.profile_build_service import run_profile_dump

router = APIRouter(prefix="/api/entities", tags=["entities"])

REBUILD_DISABLED_MESSAGE = "Пересборка отключена в этой среде (REBUILD_ENABLED=false)"


@router.get("/recipes")
def list_recipes(profile: str = Query("base")):
    try:
        profile_dir = profile_cache_dir(profile)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return get_cached_recipes(profile_dir)


@router.get("/modules")
def list_modules(profile: str = Query("base")):
    try:
        profile_dir = profile_cache_dir(profile)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return get_cached_modules(profile_dir)


@router.get("/qualities")
def list_qualities(profile: str = Query("base")):
    try:
        profile_dir = profile_cache_dir(profile)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return get_cached_qualities(profile_dir)


@router.get("/signals")
def list_signals(profile: str = Query("base")):
    try:
        profile_dir = profile_cache_dir(profile)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return get_cached_signals(profile_dir)


@router.get("/tiles")
def list_tiles(profile: str = Query("base")):
    try:
        profile_dir = profile_cache_dir(profile)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return get_cached_tiles(profile_dir)


@router.get("")
def list_entities(profile: str = Query("base")):
    try:
        profile_dir = profile_cache_dir(profile)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return get_cached_catalog(profile_dir)


@router.get("/profile-origin")
def entity_profile_origin():
    """
    typeId -> id первого профиля (в каноническом порядке ALL_PROFILE_IDS),
    где эта сущность встречается. Нужно фронту, чтобы при импорте
    чертежа предложить "включить <DLC>" для пропущенных сущностей (см.
    MenuImportDialog.tsx/ImportExportPanel.tsx). Считается на лету из
    уже собранных data/cache/profiles/<id>/entity_catalog.json — работает
    одинаково и в деве, и в проде (там же, где build_content.py пишет
    entity_profile_origin.json в assembled content/, для той же цели).
    """
    return build_entity_profile_origin_map(ALL_PROFILE_IDS)


@router.post("/rebuild")
def rebuild_entities(profile: str = Query("base"), force_redump: bool = False):
    if not settings.rebuild_enabled:
        raise HTTPException(status_code=403, detail=REBUILD_DISABLED_MESSAGE)
    try:
        content_profile = parse_profile_id(profile)
        profile_dir = profile_cache_dir(profile)
        if force_redump or not (profile_dir / "data-raw-dump.json").exists():
            run_profile_dump(content_profile)
        result = build_entity_catalog(profile_dir)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
