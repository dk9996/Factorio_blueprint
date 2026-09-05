from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import Base, engine
from app.api import factories, mods, entities
from app.services.sprite_service import crop_all_icons, SPRITES_CACHE_DIR

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Factory Planner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/assets", StaticFiles(directory="data/cache/sprites"), name="assets")
app.mount("/entity-assets", StaticFiles(directory="data/cache/entity_sprites"), name="entity-assets")

app.include_router(factories.router)
app.include_router(mods.router)
app.include_router(entities.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.on_event("startup")
def startup_sprite_check():
    if not SPRITES_CACHE_DIR.exists() or not any(SPRITES_CACHE_DIR.iterdir()):
        print("Кэш спрайтов пуст — запускаю первичную нарезку иконок...")
        result = crop_all_icons()
        print(f"Нарезка завершена: обработано {result['processed']}, пропущено {result['skipped']}")
        if result["errors"]:
            print(f"Ошибок: {len(result['errors'])} (первые 5): {result['errors'][:5]}")