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
    # Официальные DLC-паки (названия модулей качества, сущностей Space Age и
    # т.д.) — после base/core, чтобы при совпадении ключа побеждали они.
    for pak in ("elevated-rails", "quality", "space-age", "recycler"):
        pak_locale = settings.factorio_game_path / "data" / pak / "locale" / lang
        if pak_locale.exists():
            dirs.append(pak_locale)
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

def get_entity_name_locale() -> dict[str, str]:
    """
    Возвращает {entity_technical_id: человекочитаемое_имя} из секций
    [entity-name] и [item-name] всех .cfg файлов — базовой игры, core
    и всех модов. Приоритет: entity-name, затем item-name как fallback
    (некоторые сущности локализуются только через свой item).
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
                for key, value in _parse_section(text, "entity-name").items():
                    result.setdefault(key, value)
                for key, value in _parse_section(text, "item-name").items():
                    result.setdefault(key, value)

        for mod_name, source in mod_sources.items():
            for rel_path in source.list_files(f"locale/{lang}", ".cfg"):
                data = source.read_bytes(rel_path)
                if not data:
                    continue
                text = data.decode("utf-8", errors="ignore")
                for key, value in _parse_section(text, "entity-name").items():
                    result.setdefault(key, value)
                for key, value in _parse_section(text, "item-name").items():
                    result.setdefault(key, value)

    return result

def get_recipe_name_locale() -> dict[str, str]:
    """
    Локализация рецептов: сначала пробуем [recipe-name], затем [item-name]
    как fallback — в Factorio рецепт с тем же именем, что и производимый
    предмет, обычно не имеет собственной записи в [recipe-name] и
    показывается под именем предмета.
    """
    recipe_names: dict[str, str] = {}
    item_names: dict[str, str] = {}
    mod_sources = build_mod_sources()

    for lang in PREFERRED_LANGS:
        for locale_dir in _base_locale_dirs(lang):
            for cfg_path in locale_dir.rglob("*.cfg"):
                try:
                    text = cfg_path.read_bytes().decode("utf-8", errors="ignore")
                except Exception:
                    continue
                for key, value in _parse_section(text, "recipe-name").items():
                    recipe_names.setdefault(key, value)
                for key, value in _parse_section(text, "item-name").items():
                    item_names.setdefault(key, value)

        for mod_name, source in mod_sources.items():
            for rel_path in source.list_files(f"locale/{lang}", ".cfg"):
                data = source.read_bytes(rel_path)
                if not data:
                    continue
                text = data.decode("utf-8", errors="ignore")
                for key, value in _parse_section(text, "recipe-name").items():
                    recipe_names.setdefault(key, value)
                for key, value in _parse_section(text, "item-name").items():
                    item_names.setdefault(key, value)

    # объединяем: recipe-name приоритетнее, item-name — fallback
    result = dict(item_names)
    result.update(recipe_names)
    return result


def get_fluid_name_locale() -> dict[str, str]:
    """Возвращает {fluid_technical_id: человекочитаемое_имя} из секции
    [fluid-name] всех .cfg файлов — для подписи жидкостных портов
    (см. io_hints_service.py)."""
    result: dict[str, str] = {}
    mod_sources = build_mod_sources()

    for lang in PREFERRED_LANGS:
        for locale_dir in _base_locale_dirs(lang):
            for cfg_path in locale_dir.rglob("*.cfg"):
                try:
                    text = cfg_path.read_bytes().decode("utf-8", errors="ignore")
                except Exception:
                    continue
                for key, value in _parse_section(text, "fluid-name").items():
                    result.setdefault(key, value)

        for mod_name, source in mod_sources.items():
            for rel_path in source.list_files(f"locale/{lang}", ".cfg"):
                data = source.read_bytes(rel_path)
                if not data:
                    continue
                text = data.decode("utf-8", errors="ignore")
                for key, value in _parse_section(text, "fluid-name").items():
                    result.setdefault(key, value)

    return result


def get_quality_name_locale() -> dict[str, str]:
    """{quality_name: человекочитаемое_имя} из секции [quality-name]
    (core + пак quality) — для списка качеств профиля (см. dump_service)."""
    result: dict[str, str] = {}
    mod_sources = build_mod_sources()
    for lang in PREFERRED_LANGS:
        for locale_dir in _base_locale_dirs(lang):
            for cfg_path in locale_dir.rglob("*.cfg"):
                try:
                    text = cfg_path.read_bytes().decode("utf-8", errors="ignore")
                except Exception:
                    continue
                for key, value in _parse_section(text, "quality-name").items():
                    result.setdefault(key, value)
        for mod_name, source in mod_sources.items():
            for rel_path in source.list_files(f"locale/{lang}", ".cfg"):
                data = source.read_bytes(rel_path)
                if not data:
                    continue
                for key, value in _parse_section(data.decode("utf-8", errors="ignore"), "quality-name").items():
                    result.setdefault(key, value)
    return result


def get_tile_name_locale() -> dict[str, str]:
    """{tile_name: имя} из секции [tile-name] (base/core/DLC)."""
    result: dict[str, str] = {}
    mod_sources = build_mod_sources()
    for lang in PREFERRED_LANGS:
        for locale_dir in _base_locale_dirs(lang):
            for cfg_path in locale_dir.rglob("*.cfg"):
                try:
                    text = cfg_path.read_bytes().decode("utf-8", errors="ignore")
                except Exception:
                    continue
                for key, value in _parse_section(text, "tile-name").items():
                    result.setdefault(key, value)
        for mod_name, source in mod_sources.items():
            for rel_path in source.list_files(f"locale/{lang}", ".cfg"):
                data = source.read_bytes(rel_path)
                if not data:
                    continue
                for key, value in _parse_section(data.decode("utf-8", errors="ignore"), "tile-name").items():
                    result.setdefault(key, value)
    return result


def _get_section_locale(section: str) -> dict[str, str]:
    """{ключ: текст} из секции locale-файлов игры и модов (русский приоритетнее)."""
    result: dict[str, str] = {}
    mod_sources = build_mod_sources()
    for lang in PREFERRED_LANGS:
        for locale_dir in _base_locale_dirs(lang):
            for cfg_path in locale_dir.rglob("*.cfg"):
                try:
                    text = cfg_path.read_bytes().decode("utf-8", errors="ignore")
                except Exception:
                    continue
                for key, value in _parse_section(text, section).items():
                    result.setdefault(key, value)
        for mod_name, source in mod_sources.items():
            for rel_path in source.list_files(f"locale/{lang}", ".cfg"):
                data = source.read_bytes(rel_path)
                if not data:
                    continue
                for key, value in _parse_section(data.decode("utf-8", errors="ignore"), section).items():
                    result.setdefault(key, value)
    return result


def get_virtual_signal_name_locale() -> dict[str, str]:
    """{virtual_signal_name: имя} из секции [virtual-signal-name]."""
    return _get_section_locale("virtual-signal-name")


def get_speaker_locale() -> tuple[dict[str, str], dict[str, str]]:
    """({инструмент: имя}, {нота/звук: имя}) программируемой колонки."""
    return _get_section_locale("programmable-speaker-instrument"), _get_section_locale("programmable-speaker-note")
