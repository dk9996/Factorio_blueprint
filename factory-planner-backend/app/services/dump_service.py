import json
import subprocess
from pathlib import Path
from app.config import settings

DUMP_CACHE_PATH = Path("data/cache/data-raw-dump.json")
CATALOG_CACHE_PATH = Path("data/cache/entity_catalog.json")

# Секции dump, которые заведомо НЕ являются физическими сущностями на карте
# (даже если в них случайно завалялось поле collision_box) — исключаем,
# чтобы не тащить в каталог мусор вроде декоративных частиц/GUI-стилей.
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
    "equipment-category", "unit-spawner",  # unit-spawner (биттеры) — оставим?
}

# Точечные категории, которые заведомо оставляем, даже если бы попали
# под фильтр "тип начинается с decorative/optimized" и т.п.
FORCE_INCLUDE_TYPES = {
    "unit-spawner",  # гнёзда биттеров — не строишь их, но пусть будут видны
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
    (x1, y1), (x2, y2) = box
    width = max(1, round(x2 - x1))
    height = max(1, round(y2 - y1))
    return (width, height)


class CategoryResolver:
    """
    entity.name -> item_like[name].subgroup -> item-subgroup[subgroup].group -> item-group[group]
    item_like собирается из ВСЕХ секций dump, где у прототипа есть поле
    'subgroup' — не только из "item", а из чего угодно (моды часто кладут
    subgroup прямо в описание предмета любого типа).
    """

    def __init__(self, raw: dict):
        self.item_like: dict[str, dict] = {}
        for section_name, section in raw.items():
            if not isinstance(section, dict):
                continue
            for name, proto in section.items():
                if not isinstance(proto, dict):
                    continue
                if "subgroup" in proto and name not in self.item_like:
                    self.item_like[name] = proto

        self.subgroups = raw.get("item-subgroup", {})
        self.groups = raw.get("item-group", {})

    def resolve(self, entity_name: str) -> dict:
        item = self.item_like.get(entity_name)
        if not item:
            return {"name": "Прочее", "order": "zzz", "icon_filename": None}

        subgroup_name = item.get("subgroup")
        subgroup = self.subgroups.get(subgroup_name) if subgroup_name else None
        group_name = subgroup.get("group") if subgroup else None
        group = self.groups.get(group_name) if group_name else None

        if not group:
            return {"name": "Прочее", "order": "zzz", "icon_filename": None}

        icon_filename = None
        icon_path = group.get("icon")
        if icon_path:
            icon_filename = icon_path.rsplit("/", 1)[-1]

        return {
            "name": group.get("name", group_name),
            "order": group.get("order", "zzz"),
            "icon_filename": icon_filename,
        }


def build_entity_catalog(force_redump: bool = False) -> dict:
    if force_redump or not DUMP_CACHE_PATH.exists():
        run_game_dump()

    with open(DUMP_CACHE_PATH, encoding="utf-8") as f:
        raw = json.load(f)

    resolver = CategoryResolver(raw)

    catalog: list[dict] = []
    skipped_no_icon = 0
    scanned_sections = 0
    entity_type_counts: dict[str, int] = {}

    for section_name, section in raw.items():
        if not isinstance(section, dict):
            continue
        if section_name in NON_ENTITY_SECTIONS and section_name not in FORCE_INCLUDE_TYPES:
            continue

        # признак "это физическая сущность": есть collision_box
        # (у чистых item/recipe/technology его нет)
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

            catalog.append({
                "typeId": name,
                "label": name,
                "icon": f"/assets/{icon_filename}",
                "category": cat["name"],
                "categoryOrder": cat["order"],
                "categoryIcon": category_icon,
                "width": width * 32,
                "height": height * 32,
            })
            entity_type_counts[section_name] = entity_type_counts.get(section_name, 0) + 1

    # дедуп на случай, если одно имя встретилось в двух секциях подряд
    seen = set()
    deduped = []
    for e in catalog:
        if e["typeId"] in seen:
            continue
        seen.add(e["typeId"])
        deduped.append(e)
    catalog = deduped

    catalog.sort(key=lambda e: (e["categoryOrder"], e["typeId"]))

    CATALOG_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CATALOG_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)

    categories_found = len(set(e["category"] for e in catalog))

    return {
        "total": len(catalog),
        "skipped_no_icon": skipped_no_icon,
        "scanned_sections": scanned_sections,
        "categories_found": categories_found,
        "sections_breakdown": entity_type_counts,
    }


def get_cached_catalog() -> list[dict]:
    if not CATALOG_CACHE_PATH.exists():
        return []
    with open(CATALOG_CACHE_PATH, encoding="utf-8") as f:
        return json.load(f)