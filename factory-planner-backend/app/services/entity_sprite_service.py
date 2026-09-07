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


def _leaf_to_dict(node: dict, inherited: dict) -> dict:
    width = _normalize_dimension(node.get("width") or node.get("size"))
    height = _normalize_dimension(node.get("height") or node.get("size"))
    # Кадры анимации (frame_count/line_length/direction_count) у "слоёных"
    # спрайтов (structure: { layers: [...], frame_count: N, ... }) часто
    # заданы на уровне-обёртке над layers, а не на самом layer-листе с
    # filename — поэтому наследуем их от родителей, если на листе их нет.
    return {
        "filename": node["filename"].rsplit("/", 1)[-1],
        "width": width,
        "height": height,
        "frame_count": node.get("frame_count", inherited.get("frame_count", 1)),
        "direction_count": node.get("direction_count", inherited.get("direction_count", 1)),
        "line_length": (
            node.get("line_length")
            or inherited.get("line_length")
            or node.get("frame_count", inherited.get("frame_count", 1))
        ),
        "shift": node.get("shift", inherited.get("shift", [0, 0])),
        "scale": node.get("scale", inherited.get("scale", 1)),
        "is_shadow": bool(node.get("draw_as_shadow", False)),
    }


_INHERITABLE_KEYS = ("frame_count", "line_length", "direction_count", "shift", "scale")


def _find_first_leaf(node, _depth: int = 0, inherited: dict | None = None):
    """Рекурсивно ищет первый подходящий 'лист' спрайта, игнорируя
    ветки с именами из EXCLUDE_KEY_HINTS и явные тени. По пути вниз
    копит frame_count/line_length/direction_count/shift/scale, найденные
    на родительских узлах (например на обёртке 'layers'), чтобы отдать
    их листу, если у самого листа таких полей нет."""
    if _depth > 8:
        return None
    if inherited is None:
        inherited = {}

    if isinstance(node, dict):
        if _is_sprite_leaf(node) and not node.get("draw_as_shadow", False) and not node.get("draw_as_glow", False) and not node.get("draw_as_light", False):
            return _leaf_to_dict(node, inherited)

        next_inherited = {**inherited, **{k: node[k] for k in _INHERITABLE_KEYS if k in node}}

        for key, value in node.items():
            if any(hint in key.lower() for hint in EXCLUDE_KEY_HINTS):
                continue
            found = _find_first_leaf(value, _depth + 1, next_inherited)
            if found:
                return found

    elif isinstance(node, list):
        for item in node:
            found = _find_first_leaf(item, _depth + 1, inherited)
            if found:
                return found

    return None


def _collect_layers(node, inherited: dict, _depth: int = 0) -> list[dict] | None:
    """
    Если у узла (или у первого элемента, если это список вариантов по
    направлениям — берём только первое направление) есть 'layers' —
    собирает ВСЕ подходящие слои (не только первый), чтобы их потом
    можно было склеить в один финальный кадр композицией поверх друг
    друга — реальные сущности часто рисуются несколькими слоями
    (основа + детали/маска), а не одной картинкой.
    """
    if _depth > 4:
        return None

    if isinstance(node, list):
        if not node:
            return None
        return _collect_layers(node[0], inherited, _depth + 1)

    if not isinstance(node, dict):
        return None

    next_inherited = {**inherited, **{k: node[k] for k in _INHERITABLE_KEYS if k in node}}

    layers = node.get("layers")
    if isinstance(layers, list) and layers:
        collected = []
        for layer in layers:
            leaf = _find_first_leaf(layer, 0, next_inherited)
            if leaf:
                collected.append(leaf)
        return collected or None

    return None


def _resolve_candidate_path(proto: dict, path: list[str]):
    node = proto
    for key in path:
        if not isinstance(node, dict) or key not in node:
            return None
        node = node[key]
    return node


def extract_sprite_layers(proto: dict) -> list[dict] | None:
    """
    Возвращает список слоёв ГЛАВНОГО визуального спрайта сущности (первый
    кадр набора, первое направление) — если у сущности несколько слоёв
    графики (основа + детали), возвращает их все по порядку снизу вверх,
    для последующей композиции в один кадр. Если слоёв несколько не
    найдено — список из одного элемента (как раньше).
    """
    for path in CANDIDATE_PATHS:
        node = _resolve_candidate_path(proto, path)
        if node is None:
            continue
        layers = _collect_layers(node, {})
        if layers:
            return layers
        leaf = _find_first_leaf(node)
        if leaf:
            return [leaf]

    layers = _collect_layers(proto, {})
    if layers:
        return layers
    leaf = _find_first_leaf(proto)
    return [leaf] if leaf else None


def build_entity_sprite_map(raw: dict, entity_names: set[str]) -> dict[str, list[dict]]:
    """
    entity_names — множество typeId, которые уже попали в entity_catalog
    (чтобы не тратить время на прочие 10000+ прототипов, которых нет
    в нашем каталоге сущностей). Значение для каждой сущности — список
    слоёв (обычно 1, иногда больше).
    """
    result: dict[str, list[dict]] = {}

    for section_name, section in raw.items():
        if not isinstance(section, dict):
            continue
        for name, proto in section.items():
            if name not in entity_names or not isinstance(proto, dict):
                continue
            layers = extract_sprite_layers(proto)
            if layers:
                result[name] = layers

    ENTITY_SPRITES_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(ENTITY_SPRITES_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    return result


def get_entity_sprite_map() -> dict[str, dict]:
    if not ENTITY_SPRITES_CACHE_PATH.exists():
        return {}
    with open(ENTITY_SPRITES_CACHE_PATH, encoding="utf-8") as f:
        return json.load(f)