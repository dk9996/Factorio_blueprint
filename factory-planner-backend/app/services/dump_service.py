import json
import subprocess
from pathlib import Path
from app.config import settings
from app.services.locale_service import get_item_group_locale
from app.services.entity_sprite_service import build_entity_sprite_map
from app.services.locale_service import get_item_group_locale, get_entity_name_locale
from app.services.recipe_service import build_recipe_catalog

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


def _collision_box_to_size(prototype: dict) -> tuple[int, int]:
    box = prototype.get("collision_box")
    if not box:
        return (1, 1)

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


class CategoryResolver:
    def __init__(self, raw: dict, locale_map: dict[str, str] | None = None):
        self.locale_map = locale_map or {}
        self.by_place_result: dict[str, dict] = {}
        self.item_like: dict[str, dict] = {}

        for section_name, section in raw.items():
            if not isinstance(section, dict):
                continue
            for name, proto in section.items():
                if not isinstance(proto, dict):
                    continue
                if "subgroup" not in proto:
                    continue

                place_result = proto.get("place_result")
                if place_result:
                    self.by_place_result.setdefault(place_result, proto)

                self.item_like.setdefault(name, proto)

        self.subgroups = raw.get("item-subgroup", {})
        self.groups = raw.get("item-group", {})

    def resolve(self, entity_name: str) -> dict:
        item = self.by_place_result.get(entity_name) or self.item_like.get(entity_name)

        if not item:
            return {
                "name": "Прочее",
                "groupId": "other",
                "groupOrder": "zzz",
                "subgroup": "other",
                "subgroupOrder": "zzz",
                "itemOrder": entity_name,
                "icon_filename": None,
            }

        subgroup_name = item.get("subgroup")
        subgroup = self.subgroups.get(subgroup_name) if subgroup_name else None
        group_name = subgroup.get("group") if subgroup else None
        group = self.groups.get(group_name) if group_name else None

        if not group:
            return {
                "name": "Прочее",
                "groupId": group_name or "other",
                "groupOrder": "zzz",
                "subgroup": subgroup_name or "other",
                "subgroupOrder": "zzz",
                "itemOrder": item.get("order", entity_name),
                "icon_filename": None,
            }

        icon_filename = None
        icon_path = group.get("icon")
        if icon_path:
            icon_filename = icon_path.rsplit("/", 1)[-1]

        display_name = self.locale_map.get(group_name, group_name)

        return {
            "name": display_name,
            "groupId": group_name,
            "groupOrder": group.get("order", "zzz"),
            "subgroup": subgroup_name,
            "subgroupOrder": subgroup.get("order", "zzz") if subgroup else "zzz",
            "itemOrder": item.get("order", entity_name),
            "icon_filename": icon_filename,
        }


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

            catalog.append({
                "typeId": name,
                "label": entity_name_map.get(name, name),
                "icon": f"/assets/{icon_filename}",
                "entitySprite": f"/entity-assets/{name}.png" if has_sprite else None,
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
    recipe_result = build_recipe_catalog(raw)

    return {
        "total": len(catalog),
        "skipped_no_icon": skipped_no_icon,
        "scanned_sections": scanned_sections,
        "categories_found": categories_found,
        "sections_breakdown": entity_type_counts,
        "sprites_extracted": len(sprite_map),
        "recipes_extracted": recipe_result["total"],
    }


def get_cached_catalog() -> list[dict]:
    if not CATALOG_CACHE_PATH.exists():
        return []
    with open(CATALOG_CACHE_PATH, encoding="utf-8") as f:
        return json.load(f)