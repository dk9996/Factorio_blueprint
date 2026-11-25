from fastapi import APIRouter, HTTPException, Query
from app.config import settings
from app.content.paths import profile_cache_dir
from app.services.sprite_service import (
    crop_all_icons,
    crop_entity_sprites,
    crop_pipe_variant_sprites,
    crop_fluid_overlay_sprites,
    crop_directional_sprites,
)
from app.services.mod_resolver import clear_mod_sources_cache

router = APIRouter(prefix="/api/mods", tags=["mods"])

REBUILD_DISABLED_MESSAGE = "Пересборка отключена в этой среде (REBUILD_ENABLED=false)"


def _require_rebuild_enabled() -> None:
    if not settings.rebuild_enabled:
        raise HTTPException(status_code=403, detail=REBUILD_DISABLED_MESSAGE)


@router.post("/sprites/rebuild")
def rebuild_sprites(force: bool = False, profile: str = Query("base")):
    _require_rebuild_enabled()
    clear_mod_sources_cache()
    try:
        profile_dir = profile_cache_dir(profile)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    result = crop_all_icons(profile_dir, force=force)
    return result


@router.post("/entity-sprites/rebuild")
def rebuild_entity_sprites(force: bool = False):
    _require_rebuild_enabled()
    # Общее хранилище (не по-профильное) — см. entity_sprite_service.py,
    # не требует profile здесь: карты уже накоплены ПО ВСЕМ собранным
    # профилям к моменту, когда этот эндпоинт вызывается после
    # /api/entities/rebuild.
    result = crop_entity_sprites(force=force)
    result["pipe_variants"] = crop_pipe_variant_sprites(force=force)
    result["fluid_overlays"] = crop_fluid_overlay_sprites(force=force)
    result["directional_sprites"] = crop_directional_sprites(force=force)
    return result
