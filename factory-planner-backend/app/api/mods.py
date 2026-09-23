from fastapi import APIRouter
from app.services.sprite_service import (
    crop_all_icons,
    crop_entity_sprites,
    crop_pipe_variant_sprites,
    crop_fluid_overlay_sprites,
    crop_directional_sprites,
)
from app.services.mod_resolver import clear_mod_sources_cache

router = APIRouter(prefix="/api/mods", tags=["mods"])


@router.post("/sprites/rebuild")
def rebuild_sprites(force: bool = False):
    clear_mod_sources_cache()
    result = crop_all_icons(force=force)
    return result


@router.post("/entity-sprites/rebuild")
def rebuild_entity_sprites(force: bool = False):
    result = crop_entity_sprites(force=force)
    result["pipe_variants"] = crop_pipe_variant_sprites(force=force)
    result["fluid_overlays"] = crop_fluid_overlay_sprites(force=force)
    result["directional_sprites"] = crop_directional_sprites(force=force)
    return result