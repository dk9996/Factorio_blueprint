import json
from pathlib import Path
from app.services.locale_service import get_recipe_name_locale

RECIPES_CACHE_PATH = Path("data/cache/recipes.json")

DEFAULT_CATEGORY = "crafting"
DEFAULT_ENERGY_REQUIRED = 0.5


def _resolve_recipe_icon(recipe: dict, items: dict, icon_sizes_lookup=None) -> str | None:
    """
    У рецепта редко бывает свой icon — обычно фронт (и мы) показывает
    иконку первого result. Если у самого рецепта icon всё же есть,
    используем его.
    """
    icon_path = recipe.get("icon")
    if not icon_path and recipe.get("icons"):
        icon_path = recipe["icons"][0].get("icon")

    if icon_path:
        return icon_path.rsplit("/", 1)[-1]

    results = recipe.get("results") or []
    if not results:
        return None

    first_result_name = results[0].get("name")
    if not first_result_name:
        return None

    item_proto = items.get(first_result_name)
    if not item_proto:
        return None

    item_icon = item_proto.get("icon")
    if not item_icon and item_proto.get("icons"):
        item_icon = item_proto["icons"][0].get("icon")

    return item_icon.rsplit("/", 1)[-1] if item_icon else None


def build_recipe_catalog(raw: dict) -> dict:
    items = raw.get("item", {})
    fluids = raw.get("fluid", {})
    recipe_name_locale = get_recipe_name_locale()

    catalog: list[dict] = []

    for name, recipe in raw.get("recipe", {}).items():
        icon_filename = _resolve_recipe_icon(recipe, items)

        ingredients = [
            {
                "name": ing.get("name"),
                "amount": ing.get("amount", 1),
                "type": ing.get("type", "item"),
            }
            for ing in (recipe.get("ingredients") or [])
        ]
        results = [
            {
                "name": res.get("name"),
                "amount": res.get("amount", 1),
                "type": res.get("type", "item"),
            }
            for res in (recipe.get("results") or [])
        ]

        catalog.append({
            "name": name,
            "label": recipe_name_locale.get(name, name),
            "category": recipe.get("category", DEFAULT_CATEGORY),
            "energyRequired": recipe.get("energy_required", DEFAULT_ENERGY_REQUIRED),
            "icon": f"/assets/{icon_filename}" if icon_filename else None,
            "ingredients": ingredients,
            "results": results,
            "hidden": recipe.get("hidden", False),
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