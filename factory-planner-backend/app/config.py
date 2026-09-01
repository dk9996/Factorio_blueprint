from pydantic_settings import BaseSettings
from pathlib import Path
import os


class Settings(BaseSettings):
    factorio_game_path: Path
    factorio_mods_path: Path
    database_url: str = "sqlite:///./data/factory_planner.db"

    @property
    def factorio_appdata_path(self) -> Path:
        # %APPDATA%\Factorio на Windows — куда обычный клиент пишет script-output
        appdata = os.environ.get("APPDATA")
        return Path(appdata) / "Factorio"

    class Config:
        env_file = ".env"


settings = Settings()