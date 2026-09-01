import json
import subprocess
from pathlib import Path
from app.config import settings

DUMP_CACHE_PATH = Path("data/cache/data-raw-dump.json")
CATALOG_CACHE_PATH = Path("data/cache/entity_catalog.json")

ENTITY_TYPES = [
    "assembling-machine",
    "furnace",
    "transport-belt",
    "underground-belt",
    "splitter",
    "inserter",
    "container",
    "logistic-container",
    "storage-tank",
    "pipe",
    "pipe-to-ground",
    "pump",
    "boiler",
    "generator",
    "reactor",
    "solar-panel",
    "accumulator",
    "electric-pole",
    "mining-drill",
    "lab",
    "rocket-silo",
    "roboport",
    "wall",
    "gate",
    "radar",
    "beacon",
]


def run_game_dump() -> Path:
    exe_path = settings.factorio_game_path / "bin" / "x64" / "factorio.exe"
    if not exe_path.exists():
        raise FileNotFoundError(f"Factorio.exe не найден: {exe_path}")

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
    Строит реальные категории игры (item-group) вместо угадывания по типу.
    Связь: entity.name -> item[name].subgroup -> item-subgroup[subgroup].group -> item-group[group]
    """

    def __init__(self, raw: dict):
        self.items = raw.get("item", {})
        self.subgroups = raw.get("item-subgroup", {})
        self.groups = raw.get("item-group", {})

        # если сущность добывается не из "item", а из fluid/recipe и т.п. —
        # на будущее можно расширить список источников subgroup
        self.extra_item_sources = [
            raw.get("item-with-entity-data", {}),
            raw.get("module", {}),
        ]

    def resolve(self, entity_name: str) -> dict:
        item = self.items.get(entity_name)
        if not item:
            for source in self.extra_item_sources:
                if entity_name in source:
                    item = source[entity_name]
                    break

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
    category_meta: dict[str, dict] = {}  # name -> {order, icon}
    skipped_no_icon = 0
    skipped_no_type = 0

    for entity_type in ENTITY_TYPES:
        prototypes = raw.get(entity_type)
        if prototypes is None:
            skipped_no_type += 1
            continue

        for name, proto in prototypes.items():
            icon_filename = _extract_icon_filename(proto)
            if not icon_filename:
                skipped_no_icon += 1
                continue

            width, height = _collision_box_to_size(proto)
            cat = resolver.resolve(name)

            category_meta.setdefault(cat["name"], {
                "order": cat["order"],
                "icon": f"/assets/{cat['icon_filename']}" if cat["icon_filename"] else None,
            })

            catalog.append({
                "typeId": name,
                "label": name,
                "icon": f"/assets/{icon_filename}",
                "category": cat["name"],
                "categoryOrder": cat["order"],
                "width": width * 32,
                "height": height * 32,
            })

    # сортируем сам каталог так, чтобы группы шли в игровом порядке (по 'order')
    catalog.sort(key=lambda e: (e["categoryOrder"], e["typeId"]))

    CATALOG_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CATALOG_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)

    return {
        "total": len(catalog),
        "skipped_no_icon": skipped_no_icon,
        "skipped_no_type": skipped_no_type,
        "categories_found": len(category_meta),
    }


def get_cached_catalog() -> list[dict]:
    if not CATALOG_CACHE_PATH.exists():
        return []
    with open(CATALOG_CACHE_PATH, encoding="utf-8") as f:
        return json.load(f)