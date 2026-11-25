import json
import subprocess
from pathlib import Path

from app.config import settings
from app.content.paths import profile_cache_dir
from app.content.profile import ALLOWED_PAK_NAMES, ContentProfile, implicit_pak_names
from app.services.dump_service import build_entity_catalog
from app.services.sprite_service import (
    crop_all_icons,
    crop_directional_sprites,
    crop_entity_sprites,
    crop_fluid_overlay_sprites,
    crop_pipe_variant_sprites,
)

# Одноразовые изолированные mod-list.json на профиль — НЕ часть готового
# content/ (см. scripts/build_content.py), чисто рабочая папка сборки,
# дешёвая и безопасная для перезаписи при каждом запуске. Не зависит от
# settings.content_dir — никогда не читается рантаймом/не рассылается на
# сервер.
PROFILE_BUILD_ROOT = Path("data/profile-build")


def _isolated_mod_dir(profile: ContentProfile) -> Path:
    """
    Папка только с mod-list.json (base + нужные паки enabled, остальные
    официальные паки явно disabled) — физические файлы DLC/base туда
    копировать не нужно, они берутся из инсталляции игры (подтверждено
    живым запуском при планировании задачи, см. отчёт). Сторонние моды в
    этот список никогда не попадают — изоляция от реального
    factorio_mods_path пользователя это и обеспечивает.
    """
    d = PROFILE_BUILD_ROOT / profile.id
    d.mkdir(parents=True, exist_ok=True)
    enabled_names = {m.name for m in profile.mods}
    mods = [{"name": "base", "enabled": True}]
    for pak in sorted(ALLOWED_PAK_NAMES | implicit_pak_names()):
        mods.append({"name": pak, "enabled": pak in enabled_names})
    (d / "mod-list.json").write_text(json.dumps({"mods": mods}, indent=2), encoding="utf-8")
    return d


def run_profile_dump(profile: ContentProfile) -> Path:
    """
    Запускает `factorio --dump-data --mod-directory <изолированная папка>`
    и копирует результат в data/cache/profiles/<id>/data-raw-dump.json.

    ВАЖНО: Factorio ВСЕГДА пишет дамп в один и тот же путь в appdata
    (~/.factorio/script-output/data-raw-dump.json) НЕЗАВИСИМО от
    --mod-directory (подтверждено живым запуском при планировании) —
    значит эту функцию нельзя вызывать параллельно для разных профилей
    (asyncio.gather/потоки/процессы), только строго последовательно, одну
    сборку за раз, с копированием результата СРАЗУ после завершения
    процесса, до запуска следующего дампа. build_content.py это соблюдает
    простым `for`-циклом.
    """
    if settings.factorio_game_path is None:
        raise RuntimeError(
            "FACTORIO_GAME_PATH не задан — сборка контента требует установленной "
            "локально игры (на сервере это не нужно, см. DEPLOY.md/CONTENT_DIR)."
        )

    isolated_dir = _isolated_mod_dir(profile)
    exe_path = settings.factorio_executable
    if not exe_path.exists():
        raise FileNotFoundError(f"Factorio не найден: {exe_path}")

    result = subprocess.run(
        [str(exe_path), "--dump-data", "--mod-directory", str(isolated_dir)],
        capture_output=True,
        text=True,
        timeout=180,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Factorio завершился с ошибкой (profile={profile.id}):\n{result.stderr}")

    generated_path = settings.factorio_appdata_path / "script-output" / "data-raw-dump.json"
    if not generated_path.exists():
        raise FileNotFoundError(f"Дамп не найден по ожидаемому пути: {generated_path}")

    out_dir = profile_cache_dir(profile.id)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "data-raw-dump.json"
    out_path.write_bytes(generated_path.read_bytes())
    return out_path


def build_profile(profile: ContentProfile, force_redump: bool = False) -> dict:
    """
    Полный цикл для одного профиля: дамп (если нужен) -> каталог+рецепты
    (по-профильно) -> кроп иконок + entity-спрайтов (общее хранилище,
    см. app/content/paths.py). Возвращает сводку для логов
    build_content.py.
    """
    profile_dir = profile_cache_dir(profile.id)
    dump_path = profile_dir / "data-raw-dump.json"
    if force_redump or not dump_path.exists():
        run_profile_dump(profile)

    catalog_result = build_entity_catalog(profile_dir)
    icons_result = crop_all_icons(profile_dir)
    entity_sprites_result = crop_entity_sprites()
    entity_sprites_result["pipe_variants"] = crop_pipe_variant_sprites()
    entity_sprites_result["fluid_overlays"] = crop_fluid_overlay_sprites()
    entity_sprites_result["directional_sprites"] = crop_directional_sprites()

    return {
        "profile_id": profile.id,
        "catalog": catalog_result,
        "icons": icons_result,
        "entity_sprites": entity_sprites_result,
    }
