from pydantic_settings import BaseSettings
from pathlib import Path
import os
import platform
import secrets
import warnings

class Settings(BaseSettings):
    # Опциональны (None по умолчанию) — в проде игра не установлена вовсе
    # (сервер читает готовый CONTENT_DIR, см. content_dir ниже), эти поля там
    # просто не используются ни одним активным код-путём (сборка контента
    # /api/entities/rebuild гейтятся rebuild_enabled=false в проде).
    factorio_game_path: Path | None = None
    factorio_mods_path: Path | None = None
    database_url: str = "sqlite:///./data/factory_planner.db"
    # Пусто по умолчанию — реальное значение обязано приходить из .env
    # (переменная SECRET_KEY). Если пусто — см. __init__ (dev-fallback).
    secret_key: str = ""
    # Список через запятую в .env (CORS_ALLOWED_ORIGINS=http://a,http://b) —
    # сознательно не list[str] напрямую, чтобы не зависеть от JSON-парсинга
    # сложных типов в pydantic-settings для .env переменных.
    cors_allowed_origins_raw: str = "http://localhost:5173"
    # True только в проде (HTTPS) — на localhost (HTTP) Secure-cookie браузер
    # просто не отдаст обратно, сессия не будет работать вовсе.
    cookie_secure: bool = False
    # Корень готового контента (каталог/рецепты по профилям + общие
    # спрайты/иконки) — см. app/content/paths.py, services/sprite_service.py,
    # services/entity_sprite_service.py. В деве совпадает с рабочей папкой
    # сборки, в проде указывает на смонтированный read-only том
    # (результат scripts/build_content.py, см. DEPLOY.md).
    content_dir: Path = Path("data/cache")
    # /api/entities/rebuild и /api/mods/*/rebuild — дорогие операции,
    # требующие установленной игры. В проде всегда false (иначе кто угодно
    # мог бы дёргать пересборку, которая там и не сработает без Factorio).
    rebuild_enabled: bool = True
    # Сторонние моды (mod_resolver.py/api/mods.py) — выключены по умолчанию,
    # код не удалён, просто не используется, пока явно не включат в .env.
    mods_enabled: bool = False

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # pydantic/pathlib не разворачивают "~" сами — без этого путь из .env
        # вроде "~/.local/share/.../Factorio" ищется буквально, а не в домашней папке.
        if self.factorio_game_path is not None:
            object.__setattr__(self, "factorio_game_path", self.factorio_game_path.expanduser())
        if self.factorio_mods_path is not None:
            object.__setattr__(self, "factorio_mods_path", self.factorio_mods_path.expanduser())
        if not self.secret_key:
            object.__setattr__(self, "secret_key", secrets.token_urlsafe(32))
            warnings.warn(
                "SECRET_KEY не задан в .env — сгенерирован случайный ключ на время "
                "этого процесса. Все выданные токены (сессии) станут недействительными "
                "при перезапуске сервера. Для продакшна обязательно задайте SECRET_KEY "
                "в .env.",
                stacklevel=2,
            )

    @property
    def cors_allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins_raw.split(",") if o.strip()]

    @property
    def factorio_appdata_path(self) -> Path:
        system = platform.system()
        if system == "Windows":
            appdata = os.environ.get("APPDATA")
            return Path(appdata) / "Factorio"
        elif system == "Linux":
            return Path.home() / ".factorio"
        elif system == "Darwin":
            return Path.home() / "Library" / "Application Support" / "factorio"
        else:
            raise RuntimeError(f"Неизвестная ОС: {system}")

    @property
    def factorio_executable(self) -> Path:
        system = platform.system()
        if system == "Windows":
            return self.factorio_game_path / "bin" / "x64" / "factorio.exe"
        else:
            return self.factorio_game_path / "bin" / "x64" / "factorio"

    class Config:
        env_file = ".env"


settings = Settings()