import json
from pathlib import Path
from app.services.locale_service import get_recipe_name_locale, get_item_group_locale
from app.services.category_service import CategoryResolver

RECIPES_CACHE_PATH = Path("data/cache/recipes.json")

DEFAULT_CATEGORY = "crafting"
DEFAULT_ENERGY_REQUIRED = 0.5

# Все типы прототипов, которые могут быть "предметом" (результатом или
# ингредиентом рецепта), помимо обычного 'item'. Оружие, броня, модули,
# инструменты и т.д. регистрируются как отдельные типы прототипов,
# а не как 'item' — без этого их иконки не резолвятся.
ITEM_LIKE_SECTIONS = [
    "item",
    "gun",
    "ammo",
    "capsule",
    "armor",
    "module",
    "tool",
    "repair-tool",
    "rail-planner",
    "spidertron-remote",
    "selection-tool",
    "blueprint",
    "blueprint-book",
    "deconstruction-item",
    "upgrade-item",
    "item-with-entity-data",
    "item-with-label",
    "item-with-inventory",
    "item-with-tags",
]


def _build_item_lookup(raw: dict) -> dict[str, dict]:
    """Объединяет все 'предметные' секции в один словарь name -> proto."""
    lookup: dict[str, dict] = {}
    for section_name in ITEM_LIKE_SECTIONS:
        for name, proto in raw.get(section_name, {}).items():
            lookup.setdefault(name, proto)
    return lookup


def _get_icon_filename(proto: dict) -> str | None:
    icon_path = proto.get("icon")
    if not icon_path and proto.get("icons"):
        icon_path = proto["icons"][0].get("icon")
    return icon_path.rsplit("/", 1)[-1] if icon_path else None


def _resolve_recipe_icon(recipe: dict, items: dict, fluids: dict) -> str | None:
    icon_filename = _get_icon_filename(recipe)
    if icon_filename:
        return icon_filename

    results = recipe.get("results") or []
    if not results:
        return None

    first_result_name = results[0].get("name")
    first_result_type = results[0].get("type", "item")
    if not first_result_name:
        return None

    source = fluids if first_result_type == "fluid" else items
    proto = source.get(first_result_name)
    if not proto:
        return None

    return _get_icon_filename(proto)


def _resolve_stack_icon(name: str, stack_type: str, items: dict, fluids: dict) -> str | None:
    source = fluids if stack_type == "fluid" else items
    proto = source.get(name)
    if not proto:
        return None
    return _get_icon_filename(proto)


def _is_hidden_stack(name: str, stack_type: str, items: dict, fluids: dict) -> bool:
    """
    Настоящий игровой признак "не показывать в обычных списках выбора" —
    флаг hidden у прототипа предмета/жидкости (у технических/служебных
    предметов он True, из-за этого они не попадают в стандартные GUI
    выбора вроде фильтра манипулятора). Прототип неизвестен — считаем
    видимым по умолчанию, чтобы не терять реальные предметы модов.
    """
    source = fluids if stack_type == "fluid" else items
    proto = source.get(name)
    if not proto:
        return False
    if proto.get("hidden"):
        return True
    flags = proto.get("flags") or []
    return "hidden" in flags


def build_recipe_catalog(raw: dict) -> dict:
    items = _build_item_lookup(raw)  # теперь включает gun/ammo/capsule/armor и т.д.
    fluids = raw.get("fluid", {})
    recipe_name_locale = get_recipe_name_locale()
    group_locale = get_item_group_locale()
    resolver = CategoryResolver(raw, group_locale)

    catalog: list[dict] = []

    for name, recipe in raw.get("recipe", {}).items():
        icon_filename = _resolve_recipe_icon(recipe, items, fluids)

        ingredients = []
        for ing in (recipe.get("ingredients") or []):
            ing_name = ing.get("name")
            ing_type = ing.get("type", "item")
            ing_icon = _resolve_stack_icon(ing_name, ing_type, items, fluids)
            ingredients.append({
                "name": ing_name,
                "amount": ing.get("amount", 1),
                "type": ing_type,
                "icon": f"/assets/{ing_icon}" if ing_icon else None,
                "hidden": _is_hidden_stack(ing_name, ing_type, items, fluids),
            })

        results = []
        for res in (recipe.get("results") or []):
            res_name = res.get("name")
            res_type = res.get("type", "item")
            res_icon = _resolve_stack_icon(res_name, res_type, items, fluids)
            results.append({
                "name": res_name,
                "amount": res.get("amount", 1),
                "type": res_type,
                "icon": f"/assets/{res_icon}" if res_icon else None,
                "hidden": _is_hidden_stack(res_name, res_type, items, fluids),
            })

        display_cat = resolver.resolve(name)
        if display_cat["name"] == "Прочее" and results:
            display_cat = resolver.resolve(results[0]["name"])

        display_icon = (
            f"/assets/{display_cat['icon_filename']}"
            if display_cat["icon_filename"]
            else (f"/assets/{icon_filename}" if icon_filename else None)
        )

        catalog.append({
            "name": name,
            "label": recipe_name_locale.get(name, name),
            "category": recipe.get("category", DEFAULT_CATEGORY),
            "energyRequired": recipe.get("energy_required", DEFAULT_ENERGY_REQUIRED),
            "icon": f"/assets/{icon_filename}" if icon_filename else None,
            "ingredients": ingredients,
            "results": results,
            "hidden": recipe.get("hidden", False),
            "displayCategory": display_cat["name"],
            "displayCategoryId": display_cat["groupId"],
            "displayCategoryOrder": display_cat["groupOrder"],
            "displayCategoryIcon": display_icon,
            "subgroup": display_cat["subgroup"],
            "subgroupOrder": display_cat["subgroupOrder"],
            "itemOrder": display_cat["itemOrder"],
        })

    RECIPES_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(RECIPES_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)

    return {"total": len(catalog)}


def get_cached_recipes() -> list[dict]:
    if not RECIPES_CACHE_PATH.exists():
        return []
    with open(RECIPES_CACHE_PATH, encoding="utf-8") as f:
        return json.load(f)