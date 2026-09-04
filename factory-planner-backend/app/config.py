from pydantic_settings import BaseSettings
from pathlib import Path
import os
import platform


class Settings(BaseSettings):
    factorio_game_path: Path
    factorio_mods_path: Path
    database_url: str = "sqlite:///./data/factory_planner.db"

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