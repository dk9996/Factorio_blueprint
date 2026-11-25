#!/usr/bin/env python3
"""
Сборка готового контента (каталог/рецепты по профилям + общие спрайты/иконки)
для выкладки на сервер — см. DEPLOY.md в корне репозитория.

Запускать из factory-planner-backend/ с активированным venv:
  python scripts/build_content.py --profiles base
  python scripts/build_content.py --profiles base,base+quality
  python scripts/build_content.py --profiles all
  python scripts/build_content.py --profiles all --force-redump
  python scripts/build_content.py --profiles all --output ../content

Идемпотентен: без --force-redump повторный запуск с теми же профилями не
дублирует работу (дамп/кроп иконок/entity-спрайтов уже идемпотентны сами по
себе, см. app/services/profile_build_service.py/entity_sprite_service.py).
"""
import argparse
import json
import shutil
import sys
import time
from pathlib import Path

# Запускается как `python scripts/build_content.py` — sys.path[0] по
# умолчанию становится папкой скрипта (scripts/), а не корнем бэкенда, где
# лежит пакет app/. Добавляем родителя явно, чтобы импорт работал без
# дополнительных PYTHONPATH/`-m` плясок при обычном запуске.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.content.paths import (
    directional_sprite_frames_path,
    directional_sprite_map_path,
    entity_sprite_frames_path,
    entity_sprite_map_path,
    entity_sprites_dir,
    fluid_overlay_frames_path,
    fluid_overlay_map_path,
    pipe_sprite_frames_path,
    pipe_sprite_map_path,
    profile_cache_dir,
    sprites_dir,
    tile_sprite_map_path,
    tile_sprites_dir,
)
from app.content.profile import ALL_PROFILE_IDS, parse_profile_id, verify_profile_ids_match
from app.services.dump_service import build_entity_profile_origin_map
from app.services.profile_build_service import build_profile

# Общие (не по-профильные) JSON-метаданные общего спрайт-хранилища — см.
# app/content/paths.py/отчёт по задаче "контент-профили".
_SHARED_JSON_PATHS = (
    entity_sprite_map_path,
    pipe_sprite_map_path,
    fluid_overlay_map_path,
    directional_sprite_map_path,
    entity_sprite_frames_path,
    pipe_sprite_frames_path,
    fluid_overlay_frames_path,
    directional_sprite_frames_path,
    tile_sprite_map_path,
)


def _dir_size(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


def _assemble_output(output_dir: Path, profile_ids: list[str]) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    # По-профильный слой (дёшево, ~десятки МБ на профиль).
    for pid in profile_ids:
        src = profile_cache_dir(pid)
        dst = output_dir / "profiles" / pid
        dst.mkdir(parents=True, exist_ok=True)
        for filename in ("entity_catalog.json", "modules.json", "qualities.json", "tiles.json", "signals.json", "recipes.json", "icon_sizes.json", "data-raw-dump.json"):
            src_file = src / filename
            if src_file.exists():
                shutil.copy2(src_file, dst / filename)

    # Общий слой (большой, ~1.5ГБ) — копируется ОДИН раз, не дублируется
    # между профилями.
    shutil.copytree(sprites_dir(), output_dir / "sprites", dirs_exist_ok=True)
    shutil.copytree(entity_sprites_dir(), output_dir / "entity_sprites", dirs_exist_ok=True)
    shutil.copytree(tile_sprites_dir(), output_dir / "tile_sprites", dirs_exist_ok=True)

    for path_fn in _SHARED_JSON_PATHS:
        src_path = path_fn()
        if src_path.exists():
            shutil.copy2(src_path, output_dir / src_path.name)

    origin_map = build_entity_profile_origin_map(profile_ids)
    (output_dir / "entity_profile_origin.json").write_text(
        json.dumps(origin_map, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--profiles", default="base", help="id профилей через запятую, или 'all'")
    parser.add_argument("--force-redump", action="store_true", help="пересобрать дамп, даже если уже есть")
    parser.add_argument("--output", default="content", help="итоговая папка для выкладки (по умолчанию ./content)")
    args = parser.parse_args()

    print("Проверяю соответствие ALL_PROFILE_IDS реальному дереву зависимостей DLC...")
    verify_profile_ids_match()
    print("OK — захардкоженный список профилей совпадает с живым info.json\n")

    if args.profiles == "all":
        requested = list(ALL_PROFILE_IDS)
    else:
        requested = [p.strip() for p in args.profiles.split(",") if p.strip()]

    for pid in requested:
        if pid not in ALL_PROFILE_IDS:
            print(f"ОШИБКА: неизвестный id профиля '{pid}'. Допустимые: {ALL_PROFILE_IDS}", file=sys.stderr)
            sys.exit(1)

    # Строим СТРОГО в каноническом порядке (от простого к сложному) —
    # детерминизм на случай теоретического конфликта геометрии спрайтов
    # между профилями при merge-write в общее хранилище (см. отчёт по
    # задаче). Также гарантирует строго последовательные дампы (Factorio
    # всегда пишет в один и тот же appdata-путь — см.
    # profile_build_service.run_profile_dump).
    profile_ids = [p for p in ALL_PROFILE_IDS if p in requested]

    t0 = time.time()
    for pid in profile_ids:
        profile = parse_profile_id(pid)
        print(f"[{pid}] сборка... (force_redump={args.force_redump})")
        t1 = time.time()
        result = build_profile(profile, force_redump=args.force_redump)
        elapsed = time.time() - t1
        print(
            f"[{pid}] готово за {elapsed:.1f}с — {result['catalog']['total']} сущностей, "
            f"{result['catalog']['recipes_extracted']} рецептов "
            f"(общее хранилище спрайтов сейчас: {result['catalog']['sprites_extracted']})"
        )

    output_dir = Path(args.output)
    print(f"\nСобираю {output_dir}/ ...")
    _assemble_output(output_dir, profile_ids)

    elapsed = time.time() - t0
    size_mb = _dir_size(output_dir) / 1024 / 1024
    print(f"\nГотово за {elapsed:.1f}с. Итоговый размер {output_dir}/: {size_mb:.1f} МБ")


if __name__ == "__main__":
    main()
