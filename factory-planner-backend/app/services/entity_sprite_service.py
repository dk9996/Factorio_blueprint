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
    ["on_animation"],   # "включённое"/рабочее состояние — обычно самое полное/анимированное
    ["off_animation"],  # запасной вариант — статичное "выключенное" состояние
    ["horizontal_animation"],  # generator-сущности (турбины и т.п.)
    ["vertical_animation"],
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


def _is_decorative_overlay(node: dict) -> bool:
    """
    Не основной визуал сущности, а декоративный эффект поверх неё —
    тень, свечение/подсветка (draw_as_glow/draw_as_light), либо слой с
    аддитивным блендингом (blend_mode: additive — в Factorio это всегда
    какой-то световой эффект, а не сама постройка; например у ламп/линз
    некоторых модовых зданий).
    """
    return bool(
        node.get("draw_as_shadow", False)
        or node.get("draw_as_glow", False)
        or node.get("draw_as_light", False)
        or node.get("blend_mode") == "additive"
    )


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
        "filename": node["filename"],
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


def _leaf_from_stripes(node: dict, inherited: dict) -> dict | None:
    """
    Крупные анимации в Factorio иногда разбиты на НЕСКОЛЬКО файлов через
    механизм 'stripes' (у узла нет 'filename' вообще, вместо этого —
    список 'stripes', каждый со своим файлом, покрывающим ЧАСТЬ общего
    frame_count — так делают, когда один спрайт-лист вышел бы слишком
    большим). Берём только ПЕРВЫЙ файл и честно уменьшаем frame_count/
    line_length до того, что реально есть в НЁМ (сколько кадров именно в
    этом файле — width_in_frames × height_in_frames), а не наследуем
    полный frame_count всей анимации от родителя — иначе нарезка кадров
    съедет мимо границ (файл физически меньше, чем "полный" frame_count
    предполагает), и получится "половина спрайта пропала" — потому что
    часть вырезанных кадров попадает за пределы реального изображения.
    Анимация выйдет короче настоящей (не все 100% кадров), но каждый
    кадр будет честным, не мусором.
    """
    stripes = node.get("stripes")
    if not isinstance(stripes, list) or not stripes:
        return None
    first = stripes[0]
    if not isinstance(first, dict) or not isinstance(first.get("filename"), str):
        return None

    width = _normalize_dimension(node.get("width") or node.get("size"))
    height = _normalize_dimension(node.get("height") or node.get("size"))
    if not width or not height:
        return None

    w_in_frames = first.get("width_in_frames", 1) or 1
    h_in_frames = first.get("height_in_frames", 1) or 1

    return {
        "filename": first["filename"],
        "width": width,
        "height": height,
        "frame_count": w_in_frames * h_in_frames,
        "direction_count": node.get("direction_count", inherited.get("direction_count", 1)),
        "line_length": w_in_frames,
        "shift": node.get("shift", inherited.get("shift", [0, 0])),
        "scale": node.get("scale", inherited.get("scale", 1)),
        "is_shadow": bool(node.get("draw_as_shadow", False)),
    }


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
        if _is_sprite_leaf(node) and not _is_decorative_overlay(node):
            return _leaf_to_dict(node, inherited)

        if not _is_decorative_overlay(node):
            stripe_leaf = _leaf_from_stripes(node, inherited)
            if stripe_leaf:
                return stripe_leaf

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


_DIRECTION_KEYS = ("north", "east", "south", "west", "northeast", "northwest", "southeast", "southwest")


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

    # Некоторые прототипы (буровые и т.п.) хранят варианты по направлению
    # как ключи словаря (north/east/south/west), и уже ВНУТРИ каждого —
    # свой layers. Направление сущности мы не моделируем — берём первое
    # найденное, но забираем ВСЕ его слои, а не только первый попавшийся
    # (иначе теряются детали вроде лотка выхода руды у буровых).
    for dir_key in _DIRECTION_KEYS:
        sub = node.get(dir_key)
        if isinstance(sub, dict):
            result = _collect_layers(sub, next_inherited, _depth + 1)
            if result:
                return result

    return None


def _resolve_candidate_path(proto: dict, path: list[str]):
    node = proto
    for key in path:
        if not isinstance(node, dict) or key not in node:
            return None
        node = node[key]
    return node


def _extract_base_layers(proto: dict) -> list[dict] | None:
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


def _find_working_visualisation_layers(proto: dict, max_layers: int = 4) -> list[dict]:
    """
    Некоторые типы построек (шахты, часть лабораторий — особенно у
    Krastorio2) держат свой настоящий "рабочий" визуал именно в
    working_visualisation(s), а не в обычном graphics_set/pictures —
    там лежит только статичная база. Обычный поиск (_extract_base_layers)
    намеренно пропускает working_visualisation, чтобы не тащить
    декоративные искры/подсветку у сущностей, где это действительно
    просто эффект поверх основного визуала (так работает для большинства
    построек). Здесь — целевой обход ИМЕННО working_visualisation(s),
    собирающий реально найденные спрайты как ДОПОЛНИТЕЛЬНЫЕ слои: если
    внутри что-то есть — сущность станет полнее, если пусто — ничего не
    меняется.
    """
    found: list[dict] = []

    def walk(node, inherited, depth=0):
        if len(found) >= max_layers or depth > 6:
            return
        if isinstance(node, dict):
            if _is_sprite_leaf(node) and not _is_decorative_overlay(node):
                found.append(_leaf_to_dict(node, inherited))
                return
            next_inherited = {**inherited, **{k: node[k] for k in _INHERITABLE_KEYS if k in node}}
            for key, value in node.items():
                lower = key.lower()
                if any(hint in lower for hint in EXCLUDE_KEY_HINTS if hint != "working_visualisation"):
                    continue
                walk(value, next_inherited, depth + 1)
        elif isinstance(node, list):
            for item in node:
                walk(item, inherited, depth + 1)

    for key, value in proto.items():
        if "working_visualisation" in key.lower():
            walk(value, {})

    return found


def extract_sprite_layers(proto: dict) -> list[dict] | None:
    """
    Возвращает список слоёв визуального спрайта сущности (первый кадр
    набора, первое направление). Сначала — основные слои (graphics_set/
    pictures/animation и т.п.), затем, если у прототипа отдельно есть
    working_visualisation(s) с реальным содержимым — они добавляются
    ДОПОЛНИТЕЛЬНЫМИ слоями поверх (у некоторых типов построек именно там
    лежит настоящая "рабочая" анимация, а не только декоративные искры —
    из-за чего такие сущности раньше показывали только голую статичную
    базу без реальной механики).
    """
    layers = _extract_base_layers(proto)
    extra = _find_working_visualisation_layers(proto)

    if extra:
        layers = (layers or []) + extra

    return layers or None


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