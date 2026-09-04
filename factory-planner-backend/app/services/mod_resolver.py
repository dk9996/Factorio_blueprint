import json
import zipfile
from pathlib import Path
from functools import lru_cache
from app.config import settings


class ModSource:
    """Источник файлов одного мода — либо распакованная папка, либо .zip архив."""

    def __init__(self, name: str, kind: str, path: Path, zip_root: str | None = None):
        self.name = name
        self.kind = kind
        self.path = path
        self.zip_root = zip_root

    def read_bytes(self, rel_path: str) -> bytes | None:
        rel_path = rel_path.replace("\\", "/")
        if self.kind == "dir":
            file_path = self.path / rel_path
            return file_path.read_bytes() if file_path.exists() else None

        with zipfile.ZipFile(self.path, "r") as zf:
            full_path = f"{self.zip_root}/{rel_path}"
            try:
                return zf.read(full_path)
            except KeyError:
                return None

    def list_png_files(self, rel_dir: str = "") -> list[str]:
        """Список .png файлов (путь относительно корня мода). Пустой rel_dir — весь мод целиком."""
        rel_dir = rel_dir.strip("/")
        results = []

        if self.kind == "dir":
            dir_path = self.path / rel_dir if rel_dir else self.path
            if dir_path.exists():
                for p in dir_path.rglob("*.png"):
                    results.append(str(p.relative_to(self.path)).replace("\\", "/"))
            return results

        with zipfile.ZipFile(self.path, "r") as zf:
            prefix = f"{self.zip_root}/{rel_dir}/" if rel_dir else f"{self.zip_root}/"
            for name in zf.namelist():
                if name.startswith(prefix) and name.lower().endswith(".png"):
                    results.append(name[len(self.zip_root) + 1:])
        return results

    def list_files(self, rel_dir: str, suffix: str) -> list[str]:
        """Универсальный список файлов с заданным суффиксом внутри rel_dir."""
        rel_dir = rel_dir.strip("/")
        results = []

        if self.kind == "dir":
            dir_path = self.path / rel_dir
            if dir_path.exists():
                for p in dir_path.rglob(f"*{suffix}"):
                    results.append(str(p.relative_to(self.path)).replace("\\", "/"))
            return results

        with zipfile.ZipFile(self.path, "r") as zf:
            prefix = f"{self.zip_root}/{rel_dir}/"
            for name in zf.namelist():
                if name.startswith(prefix) and name.lower().endswith(suffix.lower()):
                    results.append(name[len(self.zip_root) + 1:])
        return results


@lru_cache(maxsize=1)
def build_mod_sources() -> dict[str, ModSource]:
    """
    Сканирует папку модов (и распакованные папки, и .zip-архивы),
    читает info.json каждого мода, чтобы узнать его реальное внутреннее
    имя (токен __modname__ в путях Factorio — может не совпадать
    с именем файла/папки на диске).
    """
    sources: dict[str, ModSource] = {}
    mods_path = settings.factorio_mods_path

    if not mods_path.exists():
        return sources

    for entry in mods_path.iterdir():
        if entry.is_dir():
            info_path = entry / "info.json"
            if not info_path.exists():
                continue
            try:
                info = json.loads(info_path.read_text(encoding="utf-8"))
                name = info.get("name")
                if name:
                    sources[name] = ModSource(name, "dir", entry)
            except Exception:
                continue

        elif entry.suffix == ".zip":
            try:
                with zipfile.ZipFile(entry, "r") as zf:
                    names = zf.namelist()
                    if not names:
                        continue
                    root_folder = names[0].split("/")[0]
                    info_path_in_zip = f"{root_folder}/info.json"
                    if info_path_in_zip not in names:
                        continue
                    info = json.loads(zf.read(info_path_in_zip).decode("utf-8"))
                    name = info.get("name")
                    if name:
                        sources[name] = ModSource(name, "zip", entry, zip_root=root_folder)
            except Exception:
                continue

    return sources


def clear_mod_sources_cache():
    build_mod_sources.cache_clear()