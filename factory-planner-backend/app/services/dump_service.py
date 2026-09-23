import json
import subprocess
from pathlib import Path
from app.config import settings
from app.services.locale_service import get_item_group_locale
from app.services.entity_sprite_service import (
    build_entity_sprite_map,
    build_pipe_sprite_variant_map,
    build_fluid_overlay_map,
    build_directional_sprite_map,
)
from app.services.locale_service import get_item_group_locale, get_entity_name_locale
from app.services.recipe_service import build_recipe_catalog
from app.services.category_service import CategoryResolver

DUMP_CACHE_PATH = Path("data/cache/data-raw-dump.json")
CATALOG_CACHE_PATH = Path("data/cache/entity_catalog.json")
ICON_SIZES_CACHE_PATH = Path("data/cache/icon_sizes.json")
ENTITY_SPRITES_DIR = Path("data/cache/entity_sprites")

NON_ENTITY_SECTIONS = {
    "font", "gui-style", "utility-constants", "utility-sounds", "sprite",
    "utility-sprites", "god-controller", "editor-controller",
    "spectator-controller", "remote-controller", "noise-function",
    "noise-expression", "mouse-cursor", "virtual-signal", "item",
    "recipe", "quality", "fluid", "tile", "space-location",
    "asteroid-chunk", "recipe-category", "burner-usage", "damage-type",
    "ambient-sound", "collision-layer", "item-group", "item-subgroup",
    "technology", "achievement", "equipment", "equipment-category",
    "equipment-grid", "shortcut", "custom-input", "font-family",
    "sound", "animation", "particle", "trigger-target-type",
    "autoplace-control", "map-gen-presets", "module-category",
    "ammo-category", "fuel-category", "trivial-smoke", "explosion",
    "smoke", "smoke-with-trigger", "sticker", "flame-thrower-explosion",
    "artillery-flare", "beam", "corpse", "particle-source",
    "projectile", "stream", "fire", "resource-category",
    "simple-entity", "simple-entity-with-owner", "simple-entity-with-force",
    "fish", "cliff", "tile-ghost", "item-request-proxy",
    "character", "character-corpse", "item-entity", "unit",
    "unit-spawner", "tree", "plant", "resource", "decorative",
    "optimized-decorative", "flying-text", "highlight-box",
    "cursor-box", "leaf-particle", "rail-remnants", "entity-ghost", "market",
    "gun", "ammo", "capsule", "armor", "spidertron-remote",
}

FORCE_INCLUDE_TYPES = {
    "unit-spawner",
}

# Эвристика-заглушка для детекта модов вроде "массового манипулятора" с картинки:
# такие моды обычно рисуют собственный доп. GUI через скрипт (on_gui_opened),
# а не декларируют это в прототипе — надёжного признака в дампе нет.
# Пока ориентируемся на filter_count + характерное имя сущности.
# Подправить/расширить список подстрок, когда будет точно известен конкретный мод.
_BULK_INSERTER_NAME_HINTS = (
    "bulk", "mass", "long-inserter", "long-handed-inserter-mk", "advanced-inserter",
)


def _looks_like_bulk_inserter(name: str, proto: dict) -> bool:
    if proto.get("filter_count", 0) < 5:
        return False
    lowered = name.lower()
    return any(hint in lowered for hint in _BULK_INSERTER_NAME_HINTS)


def run_game_dump() -> Path:
    exe_path = settings.factorio_executable
    if not exe_path.exists():
        raise FileNotFoundError(f"Factorio не найден: {exe_path}")

    result = subprocess.run(
        [
            str(exe_path),
            "--dump-data",
            "--mod-directory", str(settings.factorio_mods_path),
        ],
        capture_output=True,
        text=True,
        timeout=180,
    )

    if result.returncode != 0:
        raise RuntimeError(f"Factorio завершился с ошибкой:\n{result.stderr}")

    generated_path = settings.factorio_appdata_path / "script-output" / "data-raw-dump.json"
    if not generated_path.exists():
        raise FileNotFoundError(f"Дамп не найден по ожидаемому пути: {generated_path}")

    DUMP_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    DUMP_CACHE_PATH.write_bytes(generated_path.read_bytes())

    return DUMP_CACHE_PATH


def _extract_icon_filename(prototype: dict) -> str | None:
    icon_path = prototype.get("icon")
    if not icon_path and "icons" in prototype and prototype["icons"]:
        icon_path = prototype["icons"][0].get("icon")
    if not icon_path:
        return None
    return icon_path.rsplit("/", 1)[-1]


def _box_to_size(box) -> tuple[int, int] | None:
    try:
        if isinstance(box, (list, tuple)) and len(box) == 2:
            (x1, y1), (x2, y2) = box
            width = max(1, round(x2 - x1))
            height = max(1, round(y2 - y1))
            return (width, height)

        if isinstance(box, dict):
            left_top = box.get("left_top", {})
            right_bottom = box.get("right_bottom", {})
            x1 = left_top.get("x", 0) if isinstance(left_top, dict) else left_top[0]
            y1 = left_top.get("y", 0) if isinstance(left_top, dict) else left_top[1]
            x2 = right_bottom.get("x", 0) if isinstance(right_bottom, dict) else right_bottom[0]
            y2 = right_bottom.get("y", 0) if isinstance(right_bottom, dict) else right_bottom[1]
            width = max(1, round(x2 - x1))
            height = max(1, round(y2 - y1))
            return (width, height)

    except (ValueError, TypeError, IndexError, KeyError):
        pass

    return None


def _collision_box_to_size(prototype: dict) -> tuple[int, int]:
    """
    Реальный визуальный "хитбокс" сущности в игре — это selection_box
    (именно он определяет размер при наведении/размещении и подсветке),
    а не collision_box (он может быть меньше — например у рельсовых
    сигналов, труб-в-землю и т.п. — потому что влияет на физику/путь,
    а не на то, сколько тайлов реально занимает постройка визуально).
    Поэтому сперва пробуем selection_box, и только если его нет —
    откатываемся на collision_box, а затем на 1×1.
    """
    size = _box_to_size(prototype.get("selection_box"))
    if size:
        return size
    size = _box_to_size(prototype.get("collision_box"))
    if size:
        return size
    return (1, 1)


def build_icon_size_map(raw: dict) -> dict[str, int]:
    sizes: dict[str, int] = {}

    for section_name, section in raw.items():
        if not isinstance(section, dict):
            continue
        for name, proto in section.items():
            if not isinstance(proto, dict):
                continue

            top_icon_size = proto.get("icon_size")

            icon_path = proto.get("icon")
            if icon_path and top_icon_size:
                filename = icon_path.rsplit("/", 1)[-1]
                sizes.setdefault(filename, top_icon_size)

            icons_layers = proto.get("icons")
            if icons_layers:
                for layer in icons_layers:
                    if not isinstance(layer, dict):
                        continue
                    layer_path = layer.get("icon")
                    layer_size = layer.get("icon_size", top_icon_size)
                    if layer_path and layer_size:
                        filename = layer_path.rsplit("/", 1)[-1]
                        sizes.setdefault(filename, layer_size)

    return sizes


def get_icon_size_map() -> dict[str, int]:
    if not ICON_SIZES_CACHE_PATH.exists():
        return {}
    with open(ICON_SIZES_CACHE_PATH, encoding="utf-8") as f:
        return json.load(f)

PIPE_SPRITE_FRAMES_PATH = ENTITY_SPRITES_DIR.parent / "entity_pipe_sprite_frames.json"


def _load_pipe_sprite_frame_state() -> tuple[dict, set[str]]:
    """
    entity_pipe_sprite_frames.json (entity_name -> {variant_key: meta}) +
    множество реально существующих на диске PNG-файлов вариантов труб
    (имена вида "{entity_name}__pipe_{variant_key}") — та же логика, что
    у entity_sprite_frames.json/existing_sprite_files чуть выше, только
    для вариантов подключения труб (см. crop_pipe_variant_sprites).
    """
    frames: dict = {}
    if PIPE_SPRITE_FRAMES_PATH.exists():
        try:
            frames = json.loads(PIPE_SPRITE_FRAMES_PATH.read_text(encoding="utf-8"))
        except Exception:
            frames = {}
    existing_files = (
        {p.stem for p in ENTITY_SPRITES_DIR.glob("*__pipe_*.png")} if ENTITY_SPRITES_DIR.exists() else set()
    )
    return frames, existing_files


def _build_pipe_variants_field(
    name: str, pipe_sprite_frames: dict, existing_pipe_variant_files: set[str]
) -> dict[str, dict] | None:
    entity_frames = pipe_sprite_frames.get(name)
    if not entity_frames:
        return None
    variants: dict[str, dict] = {}
    for variant_key, meta in entity_frames.items():
        stem = f"{name}__pipe_{variant_key}"
        if stem not in existing_pipe_variant_files:
            continue
        variants[variant_key] = {
            "url": f"/entity-assets/{stem}.png",
            "frameWidth": meta["frameWidth"],
            "frameHeight": meta["frameHeight"],
            "shiftX": meta.get("shiftX", 0),
            "shiftY": meta.get("shiftY", 0),
            "scale": meta.get("scale", 1),
            "gameShiftX": meta.get("gameShiftX", 0),
            "gameShiftY": meta.get("gameShiftY", 0),
        }
    return variants or None


FLUID_OVERLAY_FRAMES_PATH = ENTITY_SPRITES_DIR.parent / "entity_fluid_overlay_frames.json"


def _load_fluid_overlay_frame_state() -> tuple[dict, set[str]]:
    """Аналог _load_pipe_sprite_frame_state, но для патрубков жидкостных
    fluid_boxes сборочных машин (см. crop_fluid_overlay_sprites)."""
    frames: dict = {}
    if FLUID_OVERLAY_FRAMES_PATH.exists():
        try:
            frames = json.loads(FLUID_OVERLAY_FRAMES_PATH.read_text(encoding="utf-8"))
        except Exception:
            frames = {}
    existing_files = (
        {p.stem for p in ENTITY_SPRITES_DIR.glob("*__fluid_*.png")} if ENTITY_SPRITES_DIR.exists() else set()
    )
    return frames, existing_files


def _build_fluid_overlays_field(
    name: str, fluid_overlay_frames: dict, existing_fluid_overlay_files: set[str]
) -> list[dict] | None:
    entity_frames = fluid_overlay_frames.get(name)
    if not entity_frames:
        return None
    overlays: list[dict] = []
    for idx, meta in enumerate(entity_frames):
        stem = f"{name}__fluid_{idx}"
        if stem not in existing_fluid_overlay_files:
            continue
        connection_position = meta.get("connectionPosition") or [0, 0]
        overlays.append({
            "url": f"/entity-assets/{stem}.png",
            "productionType": meta.get("productionType", "input-output"),
            "frameWidth": meta["frameWidth"],
            "frameHeight": meta["frameHeight"],
            "shiftX": meta.get("shiftX", 0),
            "shiftY": meta.get("shiftY", 0),
            "scale": meta.get("scale", 1),
            "gameShiftX": meta.get("gameShiftX", 0),
            "gameShiftY": meta.get("gameShiftY", 0),
            "connectionPositionX": connection_position[0],
            "connectionPositionY": connection_position[1],
        })
    return overlays or None


DIRECTIONAL_SPRITE_FRAMES_PATH = ENTITY_SPRITES_DIR.parent / "entity_directional_sprite_frames.json"
_DIRECTION_NAMES = ("north", "east", "south", "west")


def _load_directional_sprite_frame_state() -> tuple[dict, set[str]]:
    """Аналог _load_pipe_sprite_frame_state/_load_fluid_overlay_frame_state,
    но для механики поворота (R) сущностей (см. crop_directional_sprites)."""
    frames: dict = {}
    if DIRECTIONAL_SPRITE_FRAMES_PATH.exists():
        try:
            frames = json.loads(DIRECTIONAL_SPRITE_FRAMES_PATH.read_text(encoding="utf-8"))
        except Exception:
            frames = {}
    existing_files = (
        {p.stem for p in ENTITY_SPRITES_DIR.glob("*__dir_*.png")} if ENTITY_SPRITES_DIR.exists() else set()
    )
    return frames, existing_files


def _build_directional_sprites_field(
    name: str, directional_frames: dict, existing_directional_files: set[str]
) -> dict[str, dict] | None:
    """Возвращает {north,east,south,west: {url, frameWidth, ...}} только если
    ВСЕ 4 направления реально нарезаны на диск — частичный комплект хуже,
    чем его отсутствие (см. build_directional_sprite_map): фронт либо
    получает полный набор и переключает картинку по entity.direction, либо
    None и продолжает рисовать обычный entitySprite как раньше."""
    entity_frames = directional_frames.get(name)
    if not entity_frames:
        return None
    result: dict[str, dict] = {}
    for dir_key in _DIRECTION_NAMES:
        meta = entity_frames.get(dir_key)
        stem = f"{name}__dir_{dir_key}"
        if not meta or stem not in existing_directional_files:
            return None
        result[dir_key] = {
            "url": f"/entity-assets/{stem}.png",
            "frameWidth": meta["frameWidth"],
            "frameHeight": meta["frameHeight"],
            "shiftX": meta.get("shiftX", 0),
            "shiftY": meta.get("shiftY", 0),
            "scale": meta.get("scale", 1),
            "gameShiftX": meta.get("gameShiftX", 0),
            "gameShiftY": meta.get("gameShiftY", 0),
        }
    return result


def build_entity_catalog(force_redump: bool = False) -> dict:
    if force_redump or not DUMP_CACHE_PATH.exists():
        run_game_dump()

    with open(DUMP_CACHE_PATH, encoding="utf-8") as f:
        raw = json.load(f)

    locale_map = get_item_group_locale()
    entity_name_map = get_entity_name_locale()
    resolver = CategoryResolver(raw, locale_map)

    icon_sizes = build_icon_size_map(raw)
    ICON_SIZES_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(ICON_SIZES_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(icon_sizes, f)

    catalog: list[dict] = []
    skipped_no_icon = 0
    scanned_sections = 0
    entity_type_counts: dict[str, int] = {}

    existing_sprite_files = set()
    if ENTITY_SPRITES_DIR.exists():
        existing_sprite_files = {p.stem for p in ENTITY_SPRITES_DIR.glob("*.png")}

    entity_sprite_frames: dict = {}
    frames_meta_path = ENTITY_SPRITES_DIR.parent / "entity_sprite_frames.json"
    if frames_meta_path.exists():
        try:
            entity_sprite_frames = json.loads(frames_meta_path.read_text(encoding="utf-8"))
        except Exception:
            entity_sprite_frames = {}

    pipe_sprite_frames, existing_pipe_variant_files = _load_pipe_sprite_frame_state()
    fluid_overlay_frames, existing_fluid_overlay_files = _load_fluid_overlay_frame_state()
    directional_sprite_frames, existing_directional_files = _load_directional_sprite_frame_state()

    for section_name, section in raw.items():
        if not isinstance(section, dict):
            continue
        if section_name in NON_ENTITY_SECTIONS and section_name not in FORCE_INCLUDE_TYPES:
            continue

        has_any_entity = any(
            isinstance(p, dict) and "collision_box" in p for p in section.values()
        )
        if not has_any_entity:
            continue

        scanned_sections += 1

        for name, proto in section.items():
            if not isinstance(proto, dict) or "collision_box" not in proto:
                continue

            icon_filename = _extract_icon_filename(proto)
            if not icon_filename:
                skipped_no_icon += 1
                continue

            width, height = _collision_box_to_size(proto)
            cat = resolver.resolve(name)

            category_icon = (
                f"/assets/{cat['icon_filename']}" if cat["icon_filename"] else f"/assets/{icon_filename}"
            )

            has_sprite = name in existing_sprite_files
            frame_info = entity_sprite_frames.get(name)

            catalog.append({
                "typeId": name,
                "type": section_name,
                "label": entity_name_map.get(name, name),
                "icon": f"/assets/{icon_filename}",
                "entitySprite": f"/entity-assets/{name}.png" if has_sprite else None,
                "spriteFrameWidth": frame_info["frameWidth"] if frame_info else None,
                "spriteFrameHeight": frame_info["frameHeight"] if frame_info else None,
                "spriteFrameCount": frame_info["frameCount"] if frame_info else None,
                "spriteLineLength": frame_info["lineLength"] if frame_info else None,
                "spriteShiftX": frame_info.get("shiftX", 0) if frame_info else 0,
                "spriteShiftY": frame_info.get("shiftY", 0) if frame_info else 0,
                "spriteScale": frame_info.get("scale", 1) if frame_info else 1,
                "spriteGameShiftX": frame_info.get("gameShiftX", 0) if frame_info else 0,
                "spriteGameShiftY": frame_info.get("gameShiftY", 0) if frame_info else 0,
                "category": cat["name"],
                "categoryId": cat["groupId"],
                "categoryOrder": cat["groupOrder"],
                "subgroup": cat["subgroup"],
                "subgroupOrder": cat["subgroupOrder"],
                "itemOrder": cat["itemOrder"],
                "categoryIcon": category_icon,
                "width": width * 32,
                "height": height * 32,
                "craftingCategories": proto.get("crafting_categories"),
                "moduleSlots": proto.get("module_slots", 0),
                "craftingSpeed": proto.get("crafting_speed"),
                "miningSpeed": proto.get("mining_speed"),
                "researchingSpeed": proto.get("researching_speed"),
                "rocketPartsRequired": proto.get("rocket_parts_required"),
                "filterCount": proto.get("filter_count", 0),
                "bulkInserterConfig": _looks_like_bulk_inserter(name, proto),
                "logisticRadius": proto.get("logistic_radius"),
                "constructionRadius": proto.get("construction_radius"),
                "pipeSpriteVariants": _build_pipe_variants_field(
                    name, pipe_sprite_frames, existing_pipe_variant_files
                ),
                "fluidPipeOverlays": _build_fluid_overlays_field(
                    name, fluid_overlay_frames, existing_fluid_overlay_files
                ),
                "directionalSprites": _build_directional_sprites_field(
                    name, directional_sprite_frames, existing_directional_files
                ),
            })
            entity_type_counts[section_name] = entity_type_counts.get(section_name, 0) + 1

    seen = set()
    deduped = []
    for e in catalog:
        if e["typeId"] in seen:
            continue
        seen.add(e["typeId"])
        deduped.append(e)
    catalog = deduped

    catalog.sort(key=lambda e: (e["categoryOrder"], e["subgroupOrder"], e["itemOrder"]))

    CATALOG_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CATALOG_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)

    categories_found = len(set(e["category"] for e in catalog))

    entity_names = {e["typeId"] for e in catalog}
    sprite_map = build_entity_sprite_map(raw, entity_names)
    pipe_variant_map = build_pipe_sprite_variant_map(raw, entity_names)
    fluid_overlay_map = build_fluid_overlay_map(raw, entity_names)
    # Трубы и жидкостные патрубки сборочных машин уже сами по себе
    # направленные (свой отдельный механизм выбора картинки по соседям/
    # рецепту) — не даём им попасть ещё и в directional_map поворота
    # сущностей, чтобы не плодить два конфликтующих источника направления
    # на одну и ту же сущность.
    directional_skip_names = set(pipe_variant_map) | set(fluid_overlay_map)
    directional_map = build_directional_sprite_map(raw, entity_names, directional_skip_names)
    recipe_result = build_recipe_catalog(raw)

    return {
        "total": len(catalog),
        "skipped_no_icon": skipped_no_icon,
        "scanned_sections": scanned_sections,
        "categories_found": categories_found,
        "sections_breakdown": entity_type_counts,
        "sprites_extracted": len(sprite_map),
        "pipe_variant_entities": len(pipe_variant_map),
        "fluid_overlay_entities": len(fluid_overlay_map),
        "directional_sprite_entities": len(directional_map),
        "recipes_extracted": recipe_result["total"],
    }


ENTITY_SPRITE_FRAMES_PATH = ENTITY_SPRITES_DIR.parent / "entity_sprite_frames.json"


def get_cached_catalog() -> list[dict]:
    if not CATALOG_CACHE_PATH.exists():
        return []
    with open(CATALOG_CACHE_PATH, encoding="utf-8") as f:
        catalog = json.load(f)

    # Спрайты (PNG + entity_sprite_frames.json) пересобираются ОТДЕЛЬНЫМ
    # эндпоинтом (/api/mods/entity-sprites/rebuild) — обычно ПОСЛЕ
    # /api/entities/rebuild, который и запекает entity_catalog.json. Из-за
    # этого поля spriteFrameWidth/Height/Scale/... в закэшированном файле
    # почти всегда отстают на один шаг пайплайна от реальных PNG на диске
    # (типичный порядок вызовов: entities/rebuild → mods/entity-sprites/
    # rebuild — в момент первого вызова новых размеров кадров ещё нет).
    # Например se-space-pipe так показывался "расплющенным" — в кэше лежал
    # старый 160×80/scale=1 от предыдущей generación, хотя реальный PNG на
    # диске уже честные 128×128/scale=0.5. Патчим эти поля здесь заново при
    # КАЖДОМ чтении каталога, а не доверяем однажды запечённым — тогда
    # порядок вызовов эндпоинтов пересборки перестаёт иметь значение.
    entity_sprite_frames: dict = {}
    if ENTITY_SPRITE_FRAMES_PATH.exists():
        try:
            entity_sprite_frames = json.loads(ENTITY_SPRITE_FRAMES_PATH.read_text(encoding="utf-8"))
        except Exception:
            entity_sprite_frames = {}

    existing_sprite_files = (
        {p.stem for p in ENTITY_SPRITES_DIR.glob("*.png")} if ENTITY_SPRITES_DIR.exists() else set()
    )

    pipe_sprite_frames, existing_pipe_variant_files = _load_pipe_sprite_frame_state()
    fluid_overlay_frames, existing_fluid_overlay_files = _load_fluid_overlay_frame_state()
    directional_sprite_frames, existing_directional_files = _load_directional_sprite_frame_state()

    for entry in catalog:
        name = entry.get("typeId")
        has_sprite = name in existing_sprite_files
        frame_info = entity_sprite_frames.get(name)
        entry["entitySprite"] = f"/entity-assets/{name}.png" if has_sprite else None
        entry["spriteFrameWidth"] = frame_info["frameWidth"] if frame_info else None
        entry["spriteFrameHeight"] = frame_info["frameHeight"] if frame_info else None
        entry["spriteFrameCount"] = frame_info["frameCount"] if frame_info else None
        entry["spriteLineLength"] = frame_info["lineLength"] if frame_info else None
        entry["spriteShiftX"] = frame_info.get("shiftX", 0) if frame_info else 0
        entry["spriteShiftY"] = frame_info.get("shiftY", 0) if frame_info else 0
        entry["spriteScale"] = frame_info.get("scale", 1) if frame_info else 1
        entry["spriteGameShiftX"] = frame_info.get("gameShiftX", 0) if frame_info else 0
        entry["spriteGameShiftY"] = frame_info.get("gameShiftY", 0) if frame_info else 0
        entry["pipeSpriteVariants"] = _build_pipe_variants_field(
            name, pipe_sprite_frames, existing_pipe_variant_files
        )
        entry["fluidPipeOverlays"] = _build_fluid_overlays_field(
            name, fluid_overlay_frames, existing_fluid_overlay_files
        )
        entry["directionalSprites"] = _build_directional_sprites_field(
            name, directional_sprite_frames, existing_directional_files
        )

    return catalog