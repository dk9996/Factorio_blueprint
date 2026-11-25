from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.content.paths import entity_sprites_dir, profile_cache_dir, sprites_dir, tile_sprites_dir
from app.database import Base, engine, SessionLocal
from app.api import auth, factories, mods, entities, projects
from app.services.sprite_service import crop_all_icons, SPRITES_CACHE_DIR
from app.services.project_migration_service import migrate_factories_to_initial_project

# На сервере схему должен создавать `alembic upgrade head` (см. alembic/) —
# create_all здесь остаётся безвредным идемпотентным fallback'ом для
# локальной разработки (если миграции ещё не накатили, таблицы всё равно
# появятся; если уже накатили — create_all ничего не меняет).
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Factory Planner API")

# allow_credentials=True обязателен для cookie-based авторизации (см.
# app/api/auth.py) — origins берутся из переменной окружения (settings.
# cors_allowed_origins), никогда не "*": с credentials=True браузер и так
# не разрешил бы wildcard origin, но даже если бы разрешил, это не должно
# стать дефолтом для списка, который может расширяться в будущем.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Чертежи с превью (data URL) и книги при импорте могут быть увесистыми,
# но не безграничными — грубая защита по Content-Length (без стриминга,
# без новых зависимостей).
MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024


@app.middleware("http")
async def limit_request_body_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            too_large = int(content_length) > MAX_REQUEST_BODY_BYTES
        except ValueError:
            too_large = False
        if too_large:
            return JSONResponse(status_code=413, content={"detail": "Тело запроса слишком большое"})
    return await call_next(request)


# Понятные по-русски ошибки "поле + сообщение" только для /api/auth/* (см.
# schemas/auth.py — валидаторы уже бросают русские ValueError). Остальные
# роуты (каталог, проекты и т.п.) продолжают получать стандартный формат
# FastAPI — не меняем их поведение, чтобы не рисковать регрессией там, где
# об этом не просили.
@app.exception_handler(RequestValidationError)
async def auth_validation_exception_handler(request: Request, exc: RequestValidationError):
    if not request.url.path.startswith("/api/auth"):
        return await request_validation_exception_handler(request, exc)
    errors = []
    for err in exc.errors():
        field = err["loc"][-1] if err["loc"] else "_"
        msg = err["msg"]
        if msg.startswith("Value error, "):
            msg = msg[len("Value error, "):]
        errors.append({"field": field, "message": msg})
    return JSONResponse(status_code=422, content={"errors": errors})


sprites_dir().mkdir(parents=True, exist_ok=True)
entity_sprites_dir().mkdir(parents=True, exist_ok=True)

app.mount("/assets", StaticFiles(directory=str(sprites_dir())), name="assets")
tile_sprites_dir().mkdir(parents=True, exist_ok=True)
app.mount("/tile-assets", StaticFiles(directory=str(tile_sprites_dir())), name="tile-assets")
app.mount("/entity-assets", StaticFiles(directory=str(entity_sprites_dir())), name="entity-assets")

app.include_router(auth.router)
app.include_router(factories.router)
app.include_router(mods.router)
app.include_router(entities.router)
app.include_router(projects.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.on_event("startup")
def startup_sprite_check():
    # В проде CONTENT_DIR — готовый смонтированный том (см. scripts/
    # build_content.py/DEPLOY.md), игра не установлена вовсе — пытаться
    # кропить иконки там нечем и незачем (rebuild_enabled=false это и
    # гейтит, вместе с /api/entities/rebuild и /api/mods/*/rebuild).
    if not settings.rebuild_enabled:
        return
    if not SPRITES_CACHE_DIR.exists() or not any(SPRITES_CACHE_DIR.iterdir()):
        print("Кэш спрайтов пуст — запускаю первичную нарезку иконок (профиль base)...")
        result = crop_all_icons(profile_cache_dir("base"))
        print(f"Нарезка завершена: обработано {result['processed']}, пропущено {result['skipped']}")
        if result["errors"]:
            print(f"Ошибок: {len(result['errors'])} (первые 5): {result['errors'][:5]}")


@app.on_event("startup")
def startup_migrate_factories_to_project():
    db = SessionLocal()
    try:
        migrate_factories_to_initial_project(db)
    finally:
        db.close()