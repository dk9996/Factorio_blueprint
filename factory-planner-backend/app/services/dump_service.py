import json
from pathlib import Path
from app.content.paths import (
    entity_sprite_frames_path,
    entity_sprites_dir,
    fluid_overlay_frames_path,
    pipe_sprite_frames_path,
    directional_sprite_frames_path,
    profile_cache_dir,
    tile_sprite_map_path,
)
from app.content.icons import icon_key, icon_url, proto_icon_key
from app.services.locale_service import get_item_group_locale
from app.services.entity_sprite_service import (
    build_entity_sprite_map,
    build_pipe_sprite_variant_map,
    build_fluid_overlay_map,
    build_directional_sprite_map,
)
from app.services.locale_service import get_item_group_locale, get_entity_name_locale, get_fluid_name_locale, get_quality_name_locale, get_tile_name_locale, get_virtual_signal_name_locale, get_speaker_locale
from app.services.recipe_service import build_recipe_catalog, _build_item_lookup
from app.services.category_service import CategoryResolver
from app.services.io_hints_service import build_io_hints

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


def _extract_icon_filename(prototype: dict) -> str | None:
    # Ключ иконки = мод + полный путь из дампа (см. app/content/icons.py),
    # а не basename. Для icons[] — первый слой (как и раньше).
    return proto_icon_key(prototype)


ALL_MODULE_EFFECTS = ["speed", "productivity", "consumption", "pollution", "quality"]


def _module_slots(proto: dict) -> int:
    # 2.0: module_slots на самом прототипе; 1.1: module_specification.module_slots
    slots = proto.get("module_slots")
    if slots is None:
        spec = proto.get("module_specification")
        if isinstance(spec, dict):
            slots = spec.get("module_slots")
    return int(slots or 0)


def _allowed_effects(proto: dict) -> list[str]:
    # allowed_effects — строка или список; не задан => разрешены все эффекты
    # (так в игре: отсутствие поля = без ограничений).
    value = proto.get("allowed_effects")
    if value is None:
        return list(ALL_MODULE_EFFECTS)
    if isinstance(value, str):
        return [value]
    return [str(v) for v in value]


def _allowed_module_categories(proto: dict) -> list[str] | None:
    # Есть только в 2.0; не задано => ограничений по категориям нет (None).
    value = proto.get("allowed_module_categories")
    if value is None:
        return None
    if isinstance(value, str):
        return [value]
    return [str(v) for v in value]


_MODULE_CATEGORY_ORDER = {"speed": 0, "productivity": 1, "efficiency": 2, "quality": 3}


def build_module_catalog(raw: dict, entity_name_map: dict[str, str]) -> list[dict]:
    """
    Модули профиля (raw["module"]) для выбора в слотах сущностей. Поля как в
    дампе: category, tier, effect ({speed|productivity|consumption|
    pollution|quality: число}); limitation/limitation_blacklist — только в
    формате 1.1 (список рецептов), в 2.0 их нет и ограничения идут через
    флаги рецепта allow_*.
    """
    modules: list[dict] = []
    for name, proto in raw.get("module", {}).items():
        if not isinstance(proto, dict):
            continue
        icon = proto_icon_key(proto)
        entry = {
            "name": name,
            "label": entity_name_map.get(name, name),
            "category": proto.get("category", ""),
            "tier": proto.get("tier", 0),
            "effect": {k: v for k, v in (proto.get("effect") or {}).items() if isinstance(v, (int, float))},
            "icon": icon_url(icon) if icon else None,
        }
        if proto.get("limitation"):
            entry["limitation"] = list(proto["limitation"])
        if proto.get("limitation_blacklist"):
            entry["limitationBlacklist"] = list(proto["limitation_blacklist"])
        modules.append(entry)
    modules.sort(key=lambda m: (_MODULE_CATEGORY_ORDER.get(m["category"], 99), m["tier"], m["name"]))
    return modules


def _quality_color_hex(color) -> str:
    """Цвет прототипа quality: список [r,g,b] или {r,g,b} (в дампе 0..255,
    у служебных — доли 0..1) -> '#rrggbb'."""
    if isinstance(color, dict):
        parts = [color.get("r", 0), color.get("g", 0), color.get("b", 0)]
    else:
        parts = list(color or [0, 0, 0])[:3]
    scale = 255 if max(parts) <= 1 else 1
    r, g, b = (max(0, min(255, round(c * scale))) for c in parts)
    return f"#{r:02x}{g:02x}{b:02x}"


def build_quality_catalog(raw: dict) -> list[dict]:
    """
    Качества профиля в порядке level (normal, uncommon, rare, epic,
    legendary). Скрытые (quality-unknown) не включаются. Если в профиле нет
    ни одного качества выше normal (base, elevated-rails) — список ПУСТОЙ:
    по нему фронт включает функцию качества.
    """
    names = get_quality_name_locale()
    qualities: list[dict] = []
    for name, proto in raw.get("quality", {}).items():
        if not isinstance(proto, dict) or proto.get("hidden"):
            continue
        icon = proto_icon_key(proto)
        qualities.append({
            "name": name,
            "level": proto.get("level", 0),
            "color": _quality_color_hex(proto.get("color")),
            "localizedName": names.get(name, name),
            "icon": icon_url(icon) if icon else None,
        })
    qualities.sort(key=lambda q: q["level"])
    return qualities if len(qualities) > 1 else []


def get_cached_qualities(profile_dir: Path) -> list[dict]:
    path = profile_dir / "qualities.json"
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# --- Схемная сеть (провода) -------------------------------------------------
# Точки подключения проводов в дампе 2.0 — в тайлах от центра сущности, для
# направлений N,E,S,W (индексы 0..3 -> direction 0|4|8|12 Factorio):
#   комбинаторы: input_connection_points[dir] / output_connection_points[dir],
#   constant-combinator: circuit_wire_connection_points[dir],
#   остальные: circuit_connector (один dict на все направления, либо список
#   по направлениям; у конвейеров список по формам — берём первый),
#   power-switch: circuit_wire_connection_point, электростолбы:
#   connection_points[вариант] (с copper-точкой).
# Каждая точка — {"wire": {"red": [x,y], "green": [x,y]}, "shadow": ...}.
_DIRECTION_KEYS = ("0", "4", "8", "12")


def _wire_pair(point: dict | None) -> dict | None:
    wire = (point or {}).get("wire") or {}
    if "red" in wire and "green" in wire:
        return {"red": list(wire["red"]), "green": list(wire["green"])}
    return None


def _pick_direction(value, index: int):
    """list -> элемент по направлению (первый, если список другой длины,
    например форм конвейера), dict -> он же для всех направлений."""
    if isinstance(value, list):
        if not value:
            return None
        return value[index] if len(value) == 4 else value[0]
    return value


def build_circuit_connectors(proto: dict) -> dict | None:
    """connectors: {"0"|"4"|"8"|"12": [{id, kind, red:[x,y], green:[x,y]}]} или
    None, если сущность не участвует в схемной сети."""
    result: dict[str, list[dict]] = {}
    for i, key in enumerate(_DIRECTION_KEYS):
        entries: list[dict] = []
        inp = _pick_direction(proto.get("input_connection_points"), i)
        out = _pick_direction(proto.get("output_connection_points"), i)
        if proto.get("input_connection_points") is not None and proto.get("output_connection_points") is not None:
            for cid, point in (("input", inp), ("output", out)):
                pair = _wire_pair(point)
                if pair:
                    entries.append({"id": cid, "kind": cid, **pair})
        elif proto.get("circuit_wire_connection_points") is not None:
            pair = _wire_pair(_pick_direction(proto["circuit_wire_connection_points"], i))
            if pair:
                entries.append({"id": "single", "kind": "single", **pair})
        elif proto.get("connection_points") is not None and proto.get("type") == "electric-pole":
            variant = _pick_direction(proto["connection_points"], 0)
            wire = (variant or {}).get("wire") or {}
            if "red" in wire and "green" in wire:
                # Точки столба заданы с высотой подвеса (≈ -2.5 тайла вверх,
                # провода висят над столбом) — для вида сверху сдвигаем так,
                # чтобы медная точка была в центре: красный/зелёный остаются
                # по бокам от неё.
                cx, cy = wire.get("copper", [0, 0])
                entries.append({
                    "id": "single", "kind": "single",
                    "red": [wire["red"][0] - cx, wire["red"][1] - cy],
                    "green": [wire["green"][0] - cx, wire["green"][1] - cy],
                })
        elif proto.get("circuit_wire_connection_point") is not None:
            pair = _wire_pair(proto["circuit_wire_connection_point"])
            if pair:
                entries.append({"id": "single", "kind": "single", **pair})
        elif proto.get("circuit_connector") is not None:
            pair = _wire_pair((_pick_direction(proto["circuit_connector"], i) or {}).get("points"))
            if pair:
                entries.append({"id": "single", "kind": "single", **pair})
        if not entries:
            return None
        result[key] = entries
    return result


def circuit_wire_max_distance(proto: dict) -> float | None:
    for key in ("circuit_wire_max_distance", "maximum_wire_distance", "wire_max_distance"):
        if proto.get(key):
            return float(proto[key])
    return None


def _recipe_results(recipe: dict) -> list[dict]:
    res = recipe.get("results")
    if isinstance(res, list):
        return [r for r in res if isinstance(r, dict)]
    if recipe.get("result"):
        return [{"type": "item", "name": recipe["result"], "amount": recipe.get("result_count", 1)}]
    return []


def _recipe_ingredients(recipe: dict) -> list[dict]:
    out = []
    for ing in recipe.get("ingredients", []) or []:
        if isinstance(ing, dict):
            out.append(ing)
        elif isinstance(ing, list) and len(ing) >= 2:
            out.append({"type": "item", "name": ing[0], "amount": ing[1]})
    return out


def _expected_amount(r: dict) -> float:
    amount = r.get("amount")
    if amount is None:
        amount = (float(r.get("amount_min", 0)) + float(r.get("amount_max", 0))) / 2
    return float(amount) * float(r.get("probability", 1))


def compute_item_weights(raw: dict, items: dict[str, dict]) -> dict[str, float]:
    """
    Вес предметов по правилам игры (lua-api auxiliary/item-weight): явный
    `weight`, иначе по первому рецепту (вес ингредиентов / число продуктов *
    ingredient_to_weight_coefficient, с поправкой на целое число стаков в
    ракете), иначе default_item_weight. Петли рецептов -> default.
    """
    utility = (raw.get("utility-constants") or {}).get("default") or {}
    lift = float(utility.get("rocket_lift_weight", 1_000_000))
    default_weight = float(utility.get("default_item_weight", 100))

    recipes_by_product: dict[str, list[dict]] = {}
    for rname, recipe in raw.get("recipe", {}).items():
        if not isinstance(recipe, dict) or recipe.get("hidden") or recipe.get("allow_decomposition") is False:
            continue
        recipe = {**recipe, "name": rname}
        for r in _recipe_results(recipe):
            if r.get("type", "item") == "item":
                recipes_by_product.setdefault(r["name"], []).append(recipe)

    def recipe_rank(item_name: str, recipe: dict):
        uses_item = any(i.get("name") == item_name for i in _recipe_ingredients(recipe))
        return (
            recipe["name"] != item_name,
            uses_item,
            str(recipe.get("category", "crafting")),
            str(recipe.get("subgroup", "")),
            str(recipe.get("order", "")),
            recipe["name"],
        )

    cache: dict[str, float] = {}
    in_progress: set[str] = set()

    def weight_of(name: str) -> float:
        if name in cache:
            return cache[name]
        proto = items.get(name)
        if proto is None:
            return default_weight
        if proto.get("weight") is not None:
            cache[name] = float(proto["weight"])
            return cache[name]
        flags = proto.get("flags") or []
        if "only-in-cursor" in flags and "spawnable" in flags:
            cache[name] = 0.0
            return 0.0
        if name in in_progress:
            return default_weight
        candidates = recipes_by_product.get(name)
        if not candidates:
            cache[name] = default_weight
            return default_weight
        in_progress.add(name)
        try:
            recipe = sorted(candidates, key=lambda r: recipe_rank(name, r))[0]
            recipe_weight = 0.0
            for ing in _recipe_ingredients(recipe):
                if ing.get("type", "item") == "fluid":
                    recipe_weight += float(ing.get("amount", 0)) * 100
                else:
                    recipe_weight += weight_of(ing["name"]) * float(ing.get("amount", 0))
            product_count = sum(_expected_amount(r) for r in _recipe_results(recipe) if r.get("type", "item") == "item")
            if recipe_weight == 0 or product_count == 0:
                result = default_weight
            else:
                coeff = float(proto.get("ingredient_to_weight_coefficient", 0.5))
                stack = max(1, int(proto.get("stack_size", 1)))
                intermediate = recipe_weight / product_count * coeff
                simple = lift / stack
                if not recipe.get("allow_productivity", False) and simple >= intermediate:
                    result = simple
                else:
                    stacks = lift / intermediate / stack if intermediate > 0 else 0
                    result = intermediate if stacks <= 1 else lift / int(stacks) / stack
        finally:
            in_progress.discard(name)
        cache[name] = result
        return result

    return {name: weight_of(name) for name in items}


def build_speaker_instruments(proto: dict) -> list[dict] | None:
    """Инструменты и звуки программируемой колонки (порядок = id в
    circuit_parameters.instrument_id / note_id) с локализацией; у остальных
    сущностей None."""
    instruments = proto.get("instruments")
    if proto.get("type") != "programmable-speaker" or not isinstance(instruments, list):
        return None
    instr_names, note_names = get_speaker_locale()
    out = []
    for ins in instruments:
        notes = [
            {"name": n.get("name"), "label": note_names.get(n.get("name"), n.get("name"))}
            for n in ins.get("notes", [])
            if isinstance(n, dict)
        ]
        out.append({"name": ins.get("name"), "label": instr_names.get(ins.get("name"), ins.get("name")), "notes": notes})
    return out


def build_signal_catalog(raw: dict, entity_name_map: dict[str, str]) -> dict:
    """Сигналы для окна выбора (как в игре): виртуальные сигналы, предметы и
    жидкости (не скрытые) с группой/подгруппой и порядком. Иконки — по полному
    ключу (app/content/icons.py)."""
    virtual_names = get_virtual_signal_name_locale()
    fluid_names = get_fluid_name_locale()
    group_names = get_item_group_locale()
    subgroups = raw.get("item-subgroup", {})
    groups = raw.get("item-group", {})

    def place(proto: dict, default_subgroup: str) -> tuple[str, str, str, str]:
        sg = proto.get("subgroup") or default_subgroup
        sg_proto = subgroups.get(sg) or {}
        group = sg_proto.get("group") or "other"
        return group, sg, str(sg_proto.get("order", "")), str(proto.get("order", ""))

    signals: list[dict] = []
    seen_groups: set[str] = set()
    item_lookup = _build_item_lookup(raw)
    weights = compute_item_weights(raw, item_lookup)
    lift = float(((raw.get("utility-constants") or {}).get("default") or {}).get("rocket_lift_weight", 1_000_000))

    def add(stype: str, name: str, proto: dict, label: str, default_subgroup: str):
        if proto.get("hidden"):
            return
        icon = proto_icon_key(proto)
        group, sg, sg_order, order = place(proto, default_subgroup)
        seen_groups.add(group)
        entry = {
            "type": stype, "name": name, "label": label,
            "icon": icon_url(icon) if icon else None,
            "group": group, "subgroup": sg, "subgroupOrder": sg_order, "order": order,
        }
        if stype == "item":
            entry["stackSize"] = int(proto.get("stack_size", 1))
            w = weights.get(name, 0)
            # вместимость ракеты: предметы тяжелее подъёмного веса и нулевого веса не грузятся
            if 0 < w <= lift:
                entry["rocketCapacity"] = int(lift // w)
        signals.append(entry)

    for name, proto in raw.get("virtual-signal", {}).items():
        add("virtual", name, proto, virtual_names.get(name, name), "virtual-signal")
    for name, proto in raw.get("fluid", {}).items():
        add("fluid", name, proto, fluid_names.get(name, name), "fluid")
    for name, proto in item_lookup.items():
        add("item", name, proto, entity_name_map.get(name, name), "other")

    group_list = []
    for gname in seen_groups:
        gp = groups.get(gname) or {}
        icon = proto_icon_key(gp)
        group_list.append({
            "name": gname,
            "label": group_names.get(gname, gname),
            "order": str(gp.get("order", "zzz")),
            "icon": icon_url(icon) if icon else None,
        })
    group_list.sort(key=lambda g: g["order"])
    signals.sort(key=lambda s: (s["group"], s["subgroupOrder"], s["subgroup"], s["order"], s["name"]))
    return {"groups": group_list, "signals": signals}


def get_cached_signals(profile_dir: Path) -> dict:
    path = profile_dir / "signals.json"
    if not path.exists():
        return {"groups": [], "signals": []}
    return json.loads(path.read_text(encoding="utf-8"))


TILE_CATEGORY_NAME = "Плитки"


def _color_hex_any(color) -> str:
    return _quality_color_hex(color)


def placeable_tile_names(raw: dict) -> dict[str, str]:
    """
    tile name -> имя предмета, которым плитка кладётся. Плитка кладётся, если
    ЕСТЬ предмет с place_as_tile.result == плитка (так в 2.0: stone-brick ->
    stone-path, concrete, landfill, ...) ИЛИ у самой плитки задан placeable_by
    (парные hazard-*-right и т.п., которые кладутся тем же предметом, что и
    -left). Автоподмены по поверхности (frozen-* на Акилоне: у них задан
    thawed_variant) в палитру не попадают — это не отдельный выбор игрока.
    """
    by_item: dict[str, str] = {}
    for section in raw.values():
        if not isinstance(section, dict):
            continue
        for item_name, proto in section.items():
            if isinstance(proto, dict) and isinstance(proto.get("place_as_tile"), dict):
                result = proto["place_as_tile"].get("result")
                if result:
                    by_item.setdefault(result, item_name)
    placeable: dict[str, str] = {}
    for name, tile in raw.get("tile", {}).items():
        if not isinstance(tile, dict) or tile.get("thawed_variant") or tile.get("hidden"):
            continue
        pb = tile.get("placeable_by")
        if isinstance(pb, list):
            pb = pb[0] if pb else None
        item = (pb.get("item") if isinstance(pb, dict) else None) or by_item.get(name)
        if item:
            placeable[name] = item
    return placeable


def _find_item_proto(raw: dict, item_name: str) -> dict | None:
    for section in raw.values():
        if isinstance(section, dict) and isinstance(section.get(item_name), dict) and section[item_name].get("stack_size") is not None:
            return section[item_name]
    return None


def build_tile_catalog(raw: dict, entity_name_map: dict[str, str]) -> list[dict]:
    """Плитки, которые игрок может положить (см. placeable_tile_names), в
    порядке order прототипа: {name, localizedName, icon (иконка предмета),
    item, mapColor, category}. Текстуры (textureVariants) добавляются при
    чтении из tile_sprites.json (см. get_cached_tiles)."""
    names = get_tile_name_locale()
    tiles: list[dict] = []
    for name, item in placeable_tile_names(raw).items():
        tile = raw["tile"][name]
        item_proto = _find_item_proto(raw, item)
        icon = proto_icon_key(item_proto) if item_proto else None
        tiles.append({
            "name": name,
            "localizedName": names.get(name) or entity_name_map.get(item, name),
            "icon": icon_url(icon) if icon else None,
            "item": item,
            "mapColor": _color_hex_any(tile.get("map_color")),
            "category": TILE_CATEGORY_NAME,
            "_order": str(tile.get("order", "")),
        })
    tiles.sort(key=lambda t: (t["_order"], t["name"]))
    for t in tiles:
        del t["_order"]
    return tiles


def get_cached_tiles(profile_dir: Path) -> list[dict]:
    path = profile_dir / "tiles.json"
    if not path.exists():
        return []
    tiles = json.loads(path.read_text(encoding="utf-8"))
    sprites: dict = {}
    map_path = tile_sprite_map_path()
    if map_path.exists():
        try:
            sprites = json.loads(map_path.read_text(encoding="utf-8"))
        except Exception:
            sprites = {}
    for t in tiles:
        info = sprites.get(t["name"])
        # textureVariants: None => фронт рисует однотонной заливкой mapColor
        t["textureVariants"] = (
            {
                "mode": info["mode"],
                "cols": info["cols"],
                "rows": info["rows"],
                "urls": [f"/tile-assets/{t['name']}/{i}.png" for i in range(info["count"])],
            }
            if info
            else None
        )
    return tiles


def get_cached_modules(profile_dir: Path) -> list[dict]:
    path = profile_dir / "modules.json"
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


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
                filename = icon_key(icon_path)
                if filename:
                    sizes.setdefault(filename, top_icon_size)

            icons_layers = proto.get("icons")
            if icons_layers:
                for layer in icons_layers:
                    if not isinstance(layer, dict):
                        continue
                    layer_path = layer.get("icon")
                    layer_size = layer.get("icon_size", top_icon_size)
                    if layer_path and layer_size:
                        filename = icon_key(layer_path)
                        if filename:
                            sizes.setdefault(filename, layer_size)

    return sizes


def get_icon_size_map(profile_dir: Path) -> dict[str, int]:
    icon_sizes_path = profile_dir / "icon_sizes.json"
    if not icon_sizes_path.exists():
        return {}
    with open(icon_sizes_path, encoding="utf-8") as f:
        return json.load(f)


def _load_pipe_sprite_frame_state() -> tuple[dict, set[str]]:
    """
    entity_pipe_sprite_frames.json (entity_name -> {variant_key: meta}) +
    множество реально существующих на диске PNG-файлов вариантов труб
    (имена вида "{entity_name}__pipe_{variant_key}") — та же логика, что
    у entity_sprite_frames.json/existing_sprite_files чуть выше, только
    для вариантов подключения труб (см. crop_pipe_variant_sprites). Общее
    хранилище (не по-профильное), см. app/content/paths.py.
    """
    frames_path = pipe_sprite_frames_path()
    frames: dict = {}
    if frames_path.exists():
        try:
            frames = json.loads(frames_path.read_text(encoding="utf-8"))
        except Exception:
            frames = {}
    sprites_dir = entity_sprites_dir()
    existing_files = {p.stem for p in sprites_dir.glob("*__pipe_*.png")} if sprites_dir.exists() else set()
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


def _load_fluid_overlay_frame_state() -> tuple[dict, set[str]]:
    """Аналог _load_pipe_sprite_frame_state, но для патрубков жидкостных
    fluid_boxes сборочных машин (см. crop_fluid_overlay_sprites)."""
    frames_path = fluid_overlay_frames_path()
    frames: dict = {}
    if frames_path.exists():
        try:
            frames = json.loads(frames_path.read_text(encoding="utf-8"))
        except Exception:
            frames = {}
    sprites_dir = entity_sprites_dir()
    existing_files = {p.stem for p in sprites_dir.glob("*__fluid_*.png")} if sprites_dir.exists() else set()
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


_DIRECTION_NAMES = ("north", "east", "south", "west")


def _load_directional_sprite_frame_state() -> tuple[dict, set[str]]:
    """Аналог _load_pipe_sprite_frame_state/_load_fluid_overlay_frame_state,
    но для механики поворота (R) сущностей (см. crop_directional_sprites)."""
    frames_path = directional_sprite_frames_path()
    frames: dict = {}
    if frames_path.exists():
        try:
            frames = json.loads(frames_path.read_text(encoding="utf-8"))
        except Exception:
            frames = {}
    sprites_dir = entity_sprites_dir()
    existing_files = {p.stem for p in sprites_dir.glob("*__dir_*.png")} if sprites_dir.exists() else set()
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


def build_entity_catalog(profile_dir: Path) -> dict:
    """
    Строит каталог для УЖЕ ДОСТУПНОГО дампа конкретного профиля
    (profile_dir/data-raw-dump.json). Сам дамп сюда не запускает — это
    ответственность app/services/profile_build_service.run_profile_dump
    (решение: "какие моды дампить" — забота профиля, "как превратить дамп
    в каталог" — чистая функция от файла дампа + папки вывода).
    """
    dump_path = profile_dir / "data-raw-dump.json"
    if not dump_path.exists():
        raise FileNotFoundError(
            f"Дамп не найден: {dump_path} (вызовите profile_build_service.run_profile_dump сначала)"
        )

    with open(dump_path, encoding="utf-8") as f:
        raw = json.load(f)

    locale_map = get_item_group_locale()
    entity_name_map = get_entity_name_locale()
    fluid_locale_map = get_fluid_name_locale()
    fluids = raw.get("fluid", {})
    resolver = CategoryResolver(raw, locale_map)

    icon_sizes = build_icon_size_map(raw)
    icon_sizes_path = profile_dir / "icon_sizes.json"
    icon_sizes_path.parent.mkdir(parents=True, exist_ok=True)
    with open(icon_sizes_path, "w", encoding="utf-8") as f:
        json.dump(icon_sizes, f)

    catalog: list[dict] = []
    skipped_no_icon = 0
    scanned_sections = 0
    entity_type_counts: dict[str, int] = {}

    sprites_dir = entity_sprites_dir()
    existing_sprite_files = set()
    if sprites_dir.exists():
        existing_sprite_files = {p.stem for p in sprites_dir.glob("*.png")}

    entity_sprite_frames: dict = {}
    frames_meta_path = entity_sprite_frames_path()
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
                icon_url(cat["icon_filename"]) if cat["icon_filename"] else icon_url(icon_filename)
            )

            has_sprite = name in existing_sprite_files
            frame_info = entity_sprite_frames.get(name)

            catalog.append({
                "typeId": name,
                "type": section_name,
                "label": entity_name_map.get(name, name),
                "icon": icon_url(icon_filename),
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
                "moduleSlots": _module_slots(proto),
                # Допустимость модулей в сущности (см. front lib/modules.ts):
                # эффекты — всегда массив, категории — массив или null.
                "allowedEffects": _allowed_effects(proto),
                "allowedModuleCategories": _allowed_module_categories(proto),
                # Схемная сеть: коннекторы проводов по направлениям (или None)
                # и максимальная длина провода в тайлах.
                "connectors": build_circuit_connectors(proto),
                "circuitWireMaxDistance": circuit_wire_max_distance(proto),
                "craftingSpeed": proto.get("crafting_speed"),
                "miningSpeed": proto.get("mining_speed"),
                "researchingSpeed": proto.get("researching_speed"),
                # Скорость конвейера/погрузчика/сплиттера (тайлов/тик) —
                # у остальных типов сущностей этого поля в прототипе нет,
                # будет null. Нужна для статистики по группе-сети конвейеров
                # (см. src/lib/networks.ts, GroupStatsPanel.tsx).
                "speed": proto.get("speed"),
                "rocketPartsRequired": proto.get("rocket_parts_required"),
                "filterCount": proto.get("filter_count", 0),
                # число слотов инвентаря (контейнеры, вагоны, хабы) — максимум
                # для ограничения слотов `bar` в окне настроек сущности
                "inventorySize": proto.get("inventory_size"),
                "speakerInstruments": build_speaker_instruments(proto),
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
                "ioHints": build_io_hints(
                    section_name, proto, bool(proto.get("crafting_categories")),
                    fluids, fluid_locale_map,
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

    catalog_path = profile_dir / "entity_catalog.json"
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    with open(catalog_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)

    categories_found = len(set(e["category"] for e in catalog))

    from app.services.sprite_service import crop_tile_sprites  # лениво: sprite_service импортирует этот модуль

    signal_catalog = build_signal_catalog(raw, entity_name_map)
    with open(profile_dir / "signals.json", "w", encoding="utf-8") as f:
        json.dump(signal_catalog, f, ensure_ascii=False)

    tile_catalog = build_tile_catalog(raw, entity_name_map)
    with open(profile_dir / "tiles.json", "w", encoding="utf-8") as f:
        json.dump(tile_catalog, f, ensure_ascii=False, indent=2)
    # текстуры плиток этого профиля — в общее хранилище (merge-write)
    tile_sprites_result = crop_tile_sprites(raw, [t["name"] for t in tile_catalog])

    quality_catalog = build_quality_catalog(raw)
    with open(profile_dir / "qualities.json", "w", encoding="utf-8") as f:
        json.dump(quality_catalog, f, ensure_ascii=False, indent=2)

    module_catalog = build_module_catalog(raw, entity_name_map)
    with open(profile_dir / "modules.json", "w", encoding="utf-8") as f:
        json.dump(module_catalog, f, ensure_ascii=False, indent=2)

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
    recipe_result = build_recipe_catalog(raw, profile_dir)

    return {
        "total": len(catalog),
        "skipped_no_icon": skipped_no_icon,
        "scanned_sections": scanned_sections,
        "categories_found": categories_found,
        "sections_breakdown": entity_type_counts,
        # ВНИМАНИЕ: sprite_map/pipe_variant_map/fluid_overlay_map/directional_map
        # теперь ОБЩЕЕ (не по-профильное) хранилище, см. merge-write в
        # entity_sprite_service.py — длины ниже отражают размер ОБЩЕГО
        # хранилища после этой сборки, а не только сущностей ЭТОГО профиля.
        "sprites_extracted": len(sprite_map),
        "pipe_variant_entities": len(pipe_variant_map),
        "fluid_overlay_entities": len(fluid_overlay_map),
        "directional_sprite_entities": len(directional_map),
        "recipes_extracted": recipe_result["total"],
        "modules": len(module_catalog),
        "qualities": len(quality_catalog),
        "tiles": len(tile_catalog),
        "signals": len(signal_catalog["signals"]),
        "tile_sprites": tile_sprites_result,
    }


def get_cached_catalog(profile_dir: Path) -> list[dict]:
    catalog_path = profile_dir / "entity_catalog.json"
    if not catalog_path.exists():
        return []
    with open(catalog_path, encoding="utf-8") as f:
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
    frames_meta_path = entity_sprite_frames_path()
    if frames_meta_path.exists():
        try:
            entity_sprite_frames = json.loads(frames_meta_path.read_text(encoding="utf-8"))
        except Exception:
            entity_sprite_frames = {}

    sprites_dir = entity_sprites_dir()
    existing_sprite_files = (
        {p.stem for p in sprites_dir.glob("*.png")} if sprites_dir.exists() else set()
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


def build_entity_profile_origin_map(profile_ids: list[str]) -> dict[str, str]:
    """
    Для каждого typeId — id ПЕРВОГО (в переданном порядке, обычно от
    простого к сложному — см. app.content.profile.ALL_PROFILE_IDS)
    собранного профиля, в чьём каталоге эта сущность встречается.
    Используется и scripts/build_content.py (для entity_profile_origin.json
    в сборке деплоя), и GET /api/entities/profile-origin (для дев-сервера,
    где нет собранного content/) — единая логика, читает те же
    profile_cache_dir(pid)/entity_catalog.json, что и get_cached_catalog.
    """
    origin: dict[str, str] = {}
    for pid in profile_ids:
        catalog_path = profile_cache_dir(pid) / "entity_catalog.json"
        if not catalog_path.exists():
            continue
        with open(catalog_path, encoding="utf-8") as f:
            catalog = json.load(f)
        for entry in catalog:
            type_id = entry.get("typeId")
            if type_id and type_id not in origin:
                origin[type_id] = pid
    return origin
