import json
from pathlib import Path

ENTITY_SPRITES_CACHE_PATH = Path("data/cache/entity_sprites.json")

# Известные "главные" поля графики, проверенные на ключевых ванильных
# типах. Порядок важен — проверяются по очереди, первое найденное
# используется. Каждый путь — цепочка ключей до места, где лежит либо
# сам "лист" (filename+width+height), либо структура с 'layers'/'animation_set'.
CANDIDATE_PATHS: list[list[str]] = [
    ["graphics_set", "animation"],
    ["graphics_set", "animations"],
    ["pictures"],
    ["picture"],
    ["animation"],
    ["animations"],
    ["sprite"],
    ["sprites"],
    ["chargable_graphics", "picture"],
    ["belt_animation_set", "animation_set"],
    ["structure"],  # некоторые построечные сущности (pipe-to-ground и т.п.)
]

# Поля, которые НЕ должны рассматриваться как основной визуальный слой,
# даже если рекурсивный fallback на них наткнётся первыми
EXCLUDE_KEY_HINTS = {
    "shadow", "connector", "corpse", "explosion", "particle",
    "remnants", "working_visualisation", "wire", "circuit",
    "highlight", "radius_visualisation", "platform_picture",
    "hand_base_picture", "hand_open_picture", "hand_closed_picture",
}


def _is_sprite_leaf(node: dict) -> bool:
    fname = node.get("filename")
    return isinstance(fname, str) and fname.lower().endswith(".png")


def _normalize_dimension(value):
    """Некоторые модовые прототипы хранят width/height как [normal, hr]
    вместо простого числа — берём первое (обычное, не HR) значение."""
    if isinstance(value, list):
        return value[0] if value else None
    return value


def _leaf_to_dict(node: dict) -> dict:
    width = _normalize_dimension(node.get("width") or node.get("size"))
    height = _normalize_dimension(node.get("height") or node.get("size"))
    return {
        "filename": node["filename"].rsplit("/", 1)[-1],
        "width": width,
        "height": height,
        "frame_count": node.get("frame_count", 1),
        "direction_count": node.get("direction_count", 1),
        "line_length": node.get("line_length") or node.get("frame_count", 1),
        "shift": node.get("shift", [0, 0]),
        "scale": node.get("scale", 1),
        "is_shadow": bool(node.get("draw_as_shadow", False)),
    }


def _find_first_leaf(node, _depth: int = 0):
    """Рекурсивно ищет первый подходящий 'лист' спрайта, игнорируя
    ветки с именами из EXCLUDE_KEY_HINTS и явные тени."""
    if _depth > 8:
        return None

    if isinstance(node, dict):
        if _is_sprite_leaf(node) and not node.get("draw_as_shadow", False):
            return _leaf_to_dict(node)
        for key, value in node.items():
            if any(hint in key.lower() for hint in EXCLUDE_KEY_HINTS):
                continue
            found = _find_first_leaf(value, _depth + 1)
            if found:
                return found

    elif isinstance(node, list):
        for item in node:
            found = _find_first_leaf(item, _depth + 1)
            if found:
                return found

    return None


def _resolve_candidate_path(proto: dict, path: list[str]):
    node = proto
    for key in path:
        if not isinstance(node, dict) or key not in node:
            return None
        node = node[key]
    return node


def extract_main_sprite(proto: dict) -> dict | None:
    """
    Возвращает метаданные ОДНОГО главного визуального спрайта сущности
    (первый кадр, первое направление) — для использования как замена
    иконки на canvas. Не полная анимация — просто представительный кадр.
    """
    for path in CANDIDATE_PATHS:
        node = _resolve_candidate_path(proto, path)
        if node is None:
            continue
        leaf = _find_first_leaf(node)
        if leaf:
            return leaf

    # ничего из известных полей не подошло — последний шанс,
    # свободный обход всего прототипа целиком
    return _find_first_leaf(proto)


def build_entity_sprite_map(raw: dict, entity_names: set[str]) -> dict[str, dict]:
    """
    entity_names — множество typeId, которые уже попали в entity_catalog
    (чтобы не тратить время на прочие 10000+ прототипов, которых нет
    в нашем каталоге сущностей).
    """
    result: dict[str, dict] = {}

    for section_name, section in raw.items():
        if not isinstance(section, dict):
            continue
        for name, proto in section.items():
            if name not in entity_names or not isinstance(proto, dict):
                continue
            sprite = extract_main_sprite(proto)
            if sprite:
                result[name] = sprite

    ENTITY_SPRITES_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(ENTITY_SPRITES_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    return result


def get_entity_sprite_map() -> dict[str, dict]:
    if not ENTITY_SPRITES_CACHE_PATH.exists():
        return {}
    with open(ENTITY_SPRITES_CACHE_PATH, encoding="utf-8") as f:
        return json.load(f)