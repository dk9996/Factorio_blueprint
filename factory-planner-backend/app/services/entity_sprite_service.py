import json
from pathlib import Path

ENTITY_SPRITES_CACHE_PATH = Path("data/cache/entity_sprites.json")

# Известные "главные" поля графики, проверенные на ключевых ванильных
# типах. Порядок важен — проверяются по очереди, первое найденное
# используется. Каждый путь — цепочка ключей до места, где лежит либо
# сам "лист" (filename+width+height), либо структура с 'layers'/'animation_set'.
CANDIDATE_PATHS: list[list[str]] = [
    ["graphics_set", "idle_animation"],  # турбины/реакторы SE — реальная структура лежит тут, не в animation
    ["graphics_set", "picture"],  # некоторые построечные сущности (cargo-landing-pad и т.п.) — список тайлов-фрагментов; должен проверяться раньше animation, иначе там же в graphics_set может найтись мелкая декоративная анимация вместо настоящей структуры
    ["graphics_set", "animation"],
    ["graphics_set", "animations"],
    ["idle_animation"],  # реакторы/генераторы (не под graphics_set)
    ["on_animation"],   # "включённое"/рабочее состояние — обычно самое полное/анимированное
    ["off_animation"],  # запасной вариант — статичное "выключенное" состояние
    ["horizontal_animation"],  # generator-сущности (турбины и т.п.)
    ["vertical_animation"],
    ["folded_animation"],  # турели в состоянии покоя (самое подходящее для статичного превью)
    ["prepared_animation"],  # запасной вариант — некоторые турели/проекторы видимы только в "развёрнутом" состоянии
    ["base_day_sprite"],  # rocket-silo и родственные — реальный корпус, а не technical "hole"/shadow спрайты
    ["base_picture"],  # некоторые маяки/артиллерия — основная структура отдельным полем, не в animation
    ["pictures", "picture"],  # некоторые storage-tank-сущности (например длинные трубы SE) прячут структуру ещё на уровень глубже под pictures
    ["pictures"],
    ["picture"],
    ["animation"],
    ["animations"],
    ["sprite"],
    ["sprites"],
    ["chargable_graphics", "picture"],
    ["structure"],  # корпус/консоль (разделители, погрузчики, подземные конвейеры и т.п.)
    ["belt_animation_set", "animation_set"],  # запасной вариант — просто лента, без корпуса
]

# Поля, которые НЕ должны рассматриваться как основной визуальный слой,
# даже если рекурсивный fallback на них наткнётся первыми
EXCLUDE_KEY_HINTS = {
    "shadow", "connector", "corpse", "explosion", "particle",
    "remnants", "working_visualisation", "wire", "circuit",
    "highlight", "visualisation", "platform_picture",
    "hand_base_picture", "hand_open_picture", "hand_closed_picture",
}


def _is_sprite_leaf(node: dict) -> bool:
    fname = node.get("filename")
    return isinstance(fname, str) and fname.lower().endswith(".png")


def _is_decorative_overlay(node: dict) -> bool:
    """
    Не основной визуал сущности, а служебный эффект поверх неё — тень
    или подсветка земли под сущностью (draw_as_light — это буквально
    "рисовать как источник света на тайлах вокруг", не часть картинки
    самой сущности). draw_as_glow раньше тоже сюда относили — но это
    неверно: это означает "рисовать, просто особым аддитивным
    смешиванием" (для светящихся деталей — линз, индикаторов и т.п.) —
    оно ЧАСТЬ визуала, а не техническая подсветка, поэтому не исключаем.
    """
    return bool(
        node.get("draw_as_shadow", False)
        or node.get("draw_as_light", False)
    )


def _normalize_dimension(value):
    """Некоторые модовые прототипы хранят width/height как [normal, hr]
    вместо простого числа — берём первое (обычное, не HR) значение."""
    if isinstance(value, list):
        return value[0] if value else None
    return value


def _resolve_size(node: dict) -> tuple:
    """
    Определяет (width, height) листа. 'width'/'height' по отдельности —
    в приоритете (могут быть [normal, hr] — берём normal, см.
    _normalize_dimension). Если их нет, но есть общий 'size' — он бывает
    ЛИБО одним числом (сторона квадрата), ЛИБО парой [width, height]
    (так делают некоторые модовые спрайт-листы, например у 248k-Redux) —
    раньше оба размера в таком случае ошибочно брали ОДНО и то же первое
    значение из size, из-за чего реальная высота кадра отличалась от той,
    что использовалась при нарезке — кадры анимации "плыли"/прыгали.
    """
    width = node.get("width")
    height = node.get("height")
    size = node.get("size")

    if width is None and height is None and size is not None:
        if isinstance(size, list):
            if len(size) >= 2:
                return size[0], size[1]
            return (size[0] if size else None), (size[0] if size else None)
        return size, size

    return (
        _normalize_dimension(width if width is not None else size),
        _normalize_dimension(height if height is not None else size),
    )


def _leaf_to_dict(node: dict, inherited: dict) -> dict:
    width, height = _resolve_size(node)
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
        "tint": node.get("tint"),
        "x": node.get("x", 0) or 0,
        "y": node.get("y", 0) or 0,
        "is_additive": node.get("blend_mode") == "additive",
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

    width, height = _resolve_size(node)
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
        "tint": node.get("tint") or first.get("tint"),
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


_DIRECTION_KEYS = (
    "north", "east", "south", "west",
    "northeast", "northwest", "southeast", "southwest",
    "direction_in", "direction_out",  # погрузчики/подземные конвейеры
)

_DIRECTION_LIKE_KEY_NAMES = set(_DIRECTION_KEYS) | {"up", "down", "left", "right"}


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
        # Список элементов, у КАЖДОГО из которых есть 'render_layer' —
        # это несколько СЛОЁВ КОМПОЗИЦИИ (как у cargo-landing-pad:
        # graphics_set.picture — список групп тайлов для разных проходов
        # отрисовки), их нужно собрать ВСЕ вместе. Обычный список
        # вариантов по направлению (не имеющих render_layer) — это
        # "выбери один", тут по-прежнему берём только первый элемент.
        if all(isinstance(item, dict) and "render_layer" in item for item in node):
            collected_from_list: list[dict] = []
            for item in node:
                sub_result = _collect_layers(item, inherited, _depth + 1)
                if sub_result:
                    collected_from_list.extend(sub_result)
            return collected_from_list or None
        return _collect_layers(node[0], inherited, _depth + 1)

    if not isinstance(node, dict):
        return None

    next_inherited = {**inherited, **{k: node[k] for k in _INHERITABLE_KEYS if k in node}}

    layers = node.get("layers") or node.get("sheets")
    if isinstance(layers, list) and layers:
        collected = []
        for layer in layers:
            # Элемент списка может сам оборачивать ЕЩЁ один layers/sheets
            # (двойная вложенность — так собраны "мозаичные" структуры из
            # нескольких сегментов со своим shift у каждого, например
            # длинные трубы). Разворачиваем его целиком рекурсивно, а не
            # берём только первый лист внутри — иначе от всей мозаики
            # остаётся один случайный кусок вместо полной картины.
            nested = _collect_layers(layer, next_inherited, _depth + 1)
            if nested:
                collected.extend(nested)
                continue
            leaf = _find_first_leaf(layer, 0, next_inherited)
            # Без реальных width/height слой нечем резать (ни своих, ни
            # унаследованных от родителя) — пропускаем его, а не тащим
            # дальше None, который потом уронит обрезку картинки.
            if leaf and leaf.get("width") and leaf.get("height"):
                collected.append(leaf)
        if not collected:
            return None
        # Слои с аддитивным блендингом (blend_mode: additive — обычно
        # свечение/подсветка, красится через tint под конкретный вариант)
        # отодвигаем в конец списка, чтобы "основным" (первым, у него
        # берутся кадры анимации всей композиции) не оказался случайно
        # именно такой декоративный слой, если в исходных данных он идёт
        # раньше настоящей структуры. Среди всех остальных слоёв порядок
        # НЕ меняем — сортировка стабильна, трогает только положение
        # аддитивных слоёв, ничего больше (по площади/кол-ву кадров эти
        # два признака слишком ненадёжны — на разных сущностях реальная
        # структура оказывается то крупнее, то мельче/статичнее декора).
        collected.sort(key=lambda l: l.get("is_additive", False))
        return collected

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
            # Некоторые сущности (SE-трубы и т.п.) держат ещё один уровень
            # обёртки 'structure' между направлением и самим layers —
            # без этого мы бы вообще не находили нужное направление через
            # _collect_layers и проваливались в неструктурированный поиск,
            # который берёт ПЕРВОЕ попавшееся направление (обычно не то,
            # что реально соответствует хитбоксу сущности).
            structure = sub.get("structure")
            if isinstance(structure, dict):
                result = _collect_layers(structure, next_inherited, _depth + 1)
                if result:
                    return result

    # Некоторые прототипы (например рельсы) хранят набор слоёв не
    # списком 'layers', а словарём с произвольными именами ключей
    # (metals/backplates/ties/stone_path/... — каждый самостоятельный
    # лист, который нужно наложить поверх остальных). Если у узла
    # НЕСКОЛЬКО (не один) прямых значений сами являются листами —
    # считаем это тем же случаем и собираем их все. НО: если ключи узла
    # сами похожи на названия направлений/сторон (north/east/.../up/
    # down/left/right) — это, скорее всего, варианты "выбери один под
    # текущий поворот", а не слои для наложения (так устроен, например,
    # splitter или pipe-to-ground) — тогда эвристику не применяем вообще,
    # иначе получим наложенные друг на друга все 4 поворота одновременно.
    if not (set(node.keys()) & _DIRECTION_LIKE_KEY_NAMES):
        named_leaves = []
        for key, value in node.items():
            if any(hint in key.lower() for hint in EXCLUDE_KEY_HINTS):
                continue
            if isinstance(value, dict) and _is_sprite_leaf(value) and not _is_decorative_overlay(value):
                leaf = _leaf_to_dict(value, next_inherited)
                if leaf.get("width") and leaf.get("height"):
                    named_leaves.append(("background" in key.lower(), leaf))
        if len(named_leaves) >= 2:
            # "Фоновые" слои (по имени ключа — например
            # stone_path_background у рельсов) должны рисоваться
            # первыми/снизу, иначе перекрывают собой всё остальное —
            # именно это давало у рельсов пропавшие шпалы/странную полосу:
            # фон стоял почти последним в исходном словаре, то есть
            # рисовался поверх шпал и рельсов, а не под ними.
            named_leaves.sort(key=lambda pair: (pair[1].get("is_additive", False), not pair[0]))
            return [leaf for _, leaf in named_leaves]

    return None


def _resolve_candidate_path(proto: dict, path: list[str]):
    node = proto
    for key in path:
        if not isinstance(node, dict) or key not in node:
            return None
        node = node[key]
    return node


def _resolve_layers_for_path(proto: dict, path: list[str]) -> list[dict] | None:
    node = _resolve_candidate_path(proto, path)
    if node is None:
        return None
    layers = _collect_layers(node, {})
    if layers:
        return layers
    leaf = _find_first_leaf(node)
    return [leaf] if leaf else None


def _extract_rocket_silo_layers(proto: dict) -> list[dict] | None:
    """
    У rocket-silo корпус (base_day_sprite) и створки люка (door_back_
    sprite/door_front_sprite) — три независимых плоских поля. В покое
    (обычное превью, ракета не летит) створки закрыты и перекрывают
    отверстие — именно так силос обычно выглядит в игре, поэтому берём
    все три вместе: корпус основным слоем, обе створки поверх. hole_
    sprite (видно только когда люк ОТКРЫТ) сюда сознательно не берём.
    """
    base = proto.get("base_day_sprite")
    back = proto.get("door_back_sprite")
    front = proto.get("door_front_sprite")
    if not (isinstance(base, dict) and isinstance(back, dict) and isinstance(front, dict)):
        return None

    layers = []
    for node in (base, back, front):
        leaf = _find_first_leaf(node)
        if leaf and leaf.get("width") and leaf.get("height"):
            layers.append(leaf)
    return layers if len(layers) >= 2 else None


def _extract_belt_and_structure(proto: dict) -> list[dict] | None:
    """
    У разделителей/подземных конвейеров/погрузчиков корпус (structure) и
    сама лента (belt_animation_set) — два независимых поля, и в игре они
    рисуются вместе: лента снизу (движется, красится по тиру), корпус
    поверх (обычно статичный). У погрузчиков корпус вообще ОДИН И ТОТ ЖЕ
    файл на все тиры — цвет тира виден только через ленту, просвечивающую
    в прорезях корпуса. Раньше брали что-то одно (либо голая лента без
    корпуса, либо одинаково серый корпус без цвета тира у погрузчиков) —
    теперь собираем оба вместе как основной (лента, анимация) + доп. слой
    (корпус) через уже готовую композицию слоёв.
    """
    belt_layers = _resolve_layers_for_path(proto, ["belt_animation_set", "animation_set"])
    structure_layers = _resolve_layers_for_path(proto, ["structure"])
    if not belt_layers or not structure_layers:
        return None
    return belt_layers + structure_layers


def _extract_animation_list_layers(proto: dict) -> list[dict] | None:
    """
    Современная структура graphics_set.animation_list (маяки и похожие
    сущности) — это список ОБЁРТОК {render_layer, always_draw,
    animation}, где реальный спрайт лежит на уровень глубже, внутри
    animation. Обычный обход не ныряет через этот доп. уровень и находит
    только ПЕРВЫЙ попавшийся кусок (например только нижнюю часть маяка,
    без вращающейся верхушки — та лежит в отдельном элементе списка).
    Берём все элементы с always_draw=true (это и есть основные,
    постоянно видимые части — база + верхушка); элементы с
    always_draw=false обычно альтернативные версии одного и того же
    мигающего огонька под разный tint — не нужны для статичного превью.
    """
    gs = proto.get("graphics_set")
    if not isinstance(gs, dict):
        return None
    items = gs.get("animation_list")
    if not isinstance(items, list) or not items:
        return None

    collected: list[dict] = []
    for item in items:
        if not isinstance(item, dict) or item.get("always_draw") is False:
            continue
        anim = item.get("animation")
        if anim is None:
            continue
        sub = _collect_layers(anim, {})
        if sub:
            collected.extend(sub)
        else:
            leaf = _find_first_leaf(anim)
            if leaf:
                collected.append(leaf)
    return collected or None


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
    layers = (
        _extract_belt_and_structure(proto)
        or _extract_rocket_silo_layers(proto)
        or _extract_animation_list_layers(proto)
        or _extract_base_layers(proto)
    )
    extra = _find_working_visualisation_layers(proto)

    if extra:
        layers = (layers or []) + extra

    # Финальная защита: слой без реальных width/height (ни своих, ни
    # унаследованных) нечем резать — уронит обрезку картинки ниже по
    # цепочке. Проще один раз отфильтровать на выходе, чем гоняться за
    # каждой отдельной веткой сборки списка слоёв выше.
    if layers:
        layers = [l for l in layers if l.get("width") and l.get("height")]

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