from fastapi import APIRouter
from app.services.sprite_service import crop_all_icons
from app.services.mod_resolver import clear_mod_sources_cache

router = APIRouter(prefix="/api/mods", tags=["mods"])


@router.post("/sprites/rebuild")
def rebuild_sprites(force: bool = False):
    clear_mod_sources_cache()
    result = crop_all_icons(force=force)
    return result