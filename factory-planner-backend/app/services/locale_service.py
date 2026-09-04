from pathlib import Path
from app.config import settings
from app.services.mod_resolver import build_mod_sources

PREFERRED_LANGS = ["ru", "en"]


def _parse_section(text: str, section_name: str) -> dict[str, str]:
    """
    Простой построчный парсер одной секции .cfg файла Factorio.
    Не использует configparser — файлы Factorio не строго придерживаются
    INI-формата (могут начинаться без секции, содержать дублирующиеся
    ключи в разных секциях и т.д.), из-за чего configparser падает
    на файле целиком вместо того, чтобы просто пропустить проблемные места.
    """
    result: dict[str, str] = {}
    in_target_section = False
    target_header = f"[{section_name}]"

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith(";"):
            continue

        if line.startswith("[") and line.endswith("]"):
            in_target_section = line == target_header
            continue

        if not in_target_section:
            continue

        if "=" not in line:
            continue

        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if key:
            result[key] = value

    return result


def _base_locale_dirs(lang: str) -> list[Path]:
    dirs = []
    base_locale = settings.factorio_game_path / "data" / "base" / "locale" / lang
    if base_locale.exists():
        dirs.append(base_locale)
    core_locale = settings.factorio_game_path / "data" / "core" / "locale" / lang
    if core_locale.exists():
        dirs.append(core_locale)
    return dirs


def get_item_group_locale() -> dict[str, str]:
    """
    Возвращает {group_technical_id: человекочитаемое_имя} из секции
    [item-group-name] всех .cfg файлов — базовой игры, core и всех модов.
    Первое найденное значение побеждает (setdefault), поэтому порядок
    обхода (сначала база, потом моды) задаёт приоритет источника.
    """
    result: dict[str, str] = {}
    mod_sources = build_mod_sources()

    for lang in PREFERRED_LANGS:
        for locale_dir in _base_locale_dirs(lang):
            for cfg_path in locale_dir.rglob("*.cfg"):
                try:
                    text = cfg_path.read_bytes().decode("utf-8", errors="ignore")
                except Exception:
                    continue
                for key, value in _parse_section(text, "item-group-name").items():
                    result.setdefault(key, value)

        for mod_name, source in mod_sources.items():
            for rel_path in source.list_files(f"locale/{lang}", ".cfg"):
                data = source.read_bytes(rel_path)
                if not data:
                    continue
                text = data.decode("utf-8", errors="ignore")
                for key, value in _parse_section(text, "item-group-name").items():
                    result.setdefault(key, value)

    return result