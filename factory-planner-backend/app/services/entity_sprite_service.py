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
    ["stateless_visualisation", "animation"],  # Krastorio2 wind-turbine и т.п. — реальная анимация лежит тут; без явного пути её бы вырезал общий фильтр "visualisation" (задуман для декоративных оверлеев, но задевает и это легитимное поле по подстроке)
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
    "minimap_representation",  # крошечная (20x40) картинка-точка для миникарты
    # у подвижного состава (вагоны/локомотивы) — не сама сущность. Раньше
    # эвристика "несколько именованных листов" (см. _collect_layers) хватала
    # именно её + selected_minimap_representation как "два листа для
    # наложения", подсовывая на выходе тонкий цветной штрих вместо вагона —
    # реальная картинка у подвижного состава лежит в pictures.rotated (dice-
    # нарезка на много файлов по direction_count, как у artillery-turret) —
    # этот формат сознательно не разбираем (см. artillery-turret). После
    # исключения minimap_representation рекурсивный fallback у подвижного
    # состава наткнётся на другие ТЕХНИЧЕСКИЕ спрайты раньше настоящей
    # картинки (её всё равно не разобрать) — тоже исключаем их явно, чтобы
    # результатом было "нет спрайта", а не обманчивый огрызок:
    "reflection",  # water_reflection и т.п. — отражение в воде, не сама сущность
    "front_light",  # у локомотивов front_light — не просто цвет, а {..., picture: light-cone.png} — конус света фары, не корпус
    "horizontal_doors", "vertical_doors",  # анимация открывающихся дверей вагона (кадр разъезда), не корпус целиком
    "in_motion",  # у combat-robot (destroyer/defender/distractor и т.п.) 'idle' и 'in_motion' —
    # два ВЗАИМОИСКЛЮЧАЮЩИХ состояния (стоит/летит), а не слои для наложения;
    # без исключения одного из них эвристика "именованные листы" считала оба
    # валидными контейнерами и удваивала робота с маской (idle-пара + in_motion-пара)
}


# Factorio-конвенция "здесь намеренно ничего не рисуем" — универсальный
# 1x1 плейсхолдер вместо реального спрайта (используется, когда у
# конкретного варианта сущности нет какой-то детали — например двери у
# маленького роборта Krastorio2, или отдельного "base_picture" у маяков
# Space Exploration, где реальная картинка лежит в animation, а
# base_picture — просто заглушка для модуля позиционирования). Если
# принять такой узел за валидный лист, на выходе получается буквально
# пустой прозрачный PNG — именно так ломались se-wide-beacon/
# se-compact-beacon (base_picture опережал animation в CANDIDATE_PATHS)
# и kr-small-roboport (эвристика "несколько именованных листов" у рельсов
# подбирала 3 пустых поля door_animation_up/down/base_patch вместо
# настоящих base/base_animation).
_PLACEHOLDER_BASENAMES = {"empty.png", "blank.png"}


def _is_sprite_leaf(node: dict) -> bool:
    fname = node.get("filename")
    if not isinstance(fname, str) or not fname.lower().endswith(".png"):
        return False
    basename = fname.replace("\\", "/").rsplit("/", 1)[-1].lower()
    return basename not in _PLACEHOLDER_BASENAMES


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


def _leaf_from_diced_filenames(node: dict, inherited: dict) -> dict | None:
    """
    Артиллерийские пушки/вагоны хранят rotated-анимацию на 128-256
    направлений раскиданной по НЕСКОЛЬКИМ файлам через 'filenames' (список
    путей, не 'stripes' с явным width_in_frames/height_in_frames) +
    'line_length' (кадров-направлений в строке) + 'lines_per_file' (строк
    в КАЖДОМ файле). Поле 'dice' здесь смущает своим названием, но
    эмпирически (сверено на cannon_base_pictures/cannon_barrel_pictures
    артиллерии и pictures.rotated у вагонов) на РАСКЛАДКУ файла оно не
    влияет: реальный размер файла ВСЕГДА равен ровно
    width*line_length x height*lines_per_file, без дополнительного
    дробления — то есть это просто обычная сетка направлений, разбитая на
    несколько файлов вместо одного. Берём только направление 0 (верхний
    левый кадр ПЕРВОГО файла) для статичного превью — полный разбор всех
    256 направлений тут не нужен и раньше вся эта форма сознательно
    пропускалась целиком как "слишком сложная" (см. artillery-turret).
    """
    filenames = node.get("filenames")
    if not isinstance(filenames, list) or not filenames or not isinstance(filenames[0], str):
        return None

    width, height = _resolve_size(node)
    if not width or not height:
        return None

    return {
        "filename": filenames[0],
        "width": width,
        "height": height,
        "frame_count": 1,
        "direction_count": node.get("direction_count", inherited.get("direction_count", 1)),
        "line_length": 1,
        "shift": node.get("shift", inherited.get("shift", [0, 0])),
        "scale": node.get("scale", inherited.get("scale", 1)),
        "is_shadow": bool(node.get("draw_as_shadow", False)),
        "tint": node.get("tint"),
    }


def _find_first_leaf(node, _depth: int = 0, inherited: dict | None = None, direction: str | None = None):
    """Рекурсивно ищет первый подходящий 'лист' спрайта, игнорируя
    ветки с именами из EXCLUDE_KEY_HINTS и явные тени. По пути вниз
    копит frame_count/line_length/direction_count/shift/scale, найденные
    на родительских узлах (например на обёртке 'layers'), чтобы отдать
    их листу, если у самого листа таких полей нет.

    direction — необязательное предпочитаемое направление ("north"/"east"/
    "south"/"west"). Когда задано и текущий узел похож на словарь вариантов
    по направлению (см. _looks_like_direction_dict), сначала пробуем именно
    запрошенный ключ — и только если его нет, откатываемся на обычный обход
    по порядку ключей (который иначе почти всегда находит "north" первым,
    т.к. в дампе направления обычно объявлены именно в этом порядке). При
    direction=None (все вызовы до появления поворота сущностей) поведение
    не меняется ни на бит — эта ветка просто не выполняется."""
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
            diced_leaf = _leaf_from_diced_filenames(node, inherited)
            if diced_leaf:
                return diced_leaf

        next_inherited = {**inherited, **{k: node[k] for k in _INHERITABLE_KEYS if k in node}}

        if direction is not None and _looks_like_direction_dict(node):
            preferred = node.get(direction)
            if preferred is not None:
                found = _find_first_leaf(preferred, _depth + 1, next_inherited, direction)
                if found:
                    return found

        for key, value in node.items():
            if any(hint in key.lower() for hint in EXCLUDE_KEY_HINTS):
                continue
            found = _find_first_leaf(value, _depth + 1, next_inherited, direction)
            if found:
                return found

    elif isinstance(node, list):
        for item in node:
            found = _find_first_leaf(item, _depth + 1, inherited, direction)
            if found:
                return found

    return None


_DIRECTION_KEYS = (
    "north", "east", "south", "west",
    "northeast", "northwest", "southeast", "southwest",
    "direction_in", "direction_out",  # погрузчики/подземные конвейеры
)

_DIRECTION_LIKE_KEY_NAMES = set(_DIRECTION_KEYS) | {"up", "down", "left", "right"}

# Ключи-варианты соединения тайла у стен/заборов (pictures у wall-сущностей:
# single/straight_vertical/.../gate_connection_patch) — выбирается ОДИН
# вариант в зависимости от соседних тайлов на карте, это не слои для
# наложения (как metals/backplates у рельсов), а взаимоисключающие
# варианты — как и direction-словари. Раньше это работало "случайно"
# (эвристика не умела заглядывать в контейнеры без 'filename' на самом
# верху), но после добавления поддержки вложенных контейнеров она стала
# собирать все 11 вариантов стены в одну кучу.
_WALL_VARIANT_KEY_NAMES = {
    "single", "straight_vertical", "straight_horizontal",
    "corner_right_down", "corner_left_down", "t_up",
    "ending_right", "ending_left", "filling",
    "water_connection_patch", "gate_connection_patch",
}

_MAIN_DIRECTIONS = ("north", "east", "south", "west")


def _looks_like_direction_dict(node: dict) -> bool:
    """Узел похож на словарь "выбери одно из 4 направлений" (а не просто
    случайно содержит ключ с таким именем среди прочих полей) — когда
    среди его ключей есть хотя бы 2 из 4 основных направлений."""
    return sum(1 for k in _MAIN_DIRECTIONS if k in node) >= 2


def _collect_layers(
    node, inherited: dict, _depth: int = 0, _allow_named_heuristic: bool = True,
    direction: str | None = None,
) -> list[dict] | None:
    """
    Если у узла (или у первого элемента, если это список вариантов по
    направлениям — берём только первое направление) есть 'layers' —
    собирает ВСЕ подходящие слои (не только первый), чтобы их потом
    можно было склеить в один финальный кадр композицией поверх друг
    друга — реальные сущности часто рисуются несколькими слоями
    (основа + детали/маска), а не одной картинкой.

    _allow_named_heuristic=False запрещает ТОЛЬКО последний блок ("словарь
    именованных листов" ниже) СРАЗУ внутри себя же — иначе у многосоставных
    сущностей вроде ноги спидертрона (graphics_set.upper_part.top_end/
    middle/bottom_end, у каждого свой 'layers') эвристика раскручивается
    рекурсивно на 2-3 уровня и сгребает ВСЕ сегменты всех суставов в одну
    кучу (они позиционируются игрой процедурно, не рисуются одним кадром).
    Один уровень вложенности (как structure у boiler, base/base_animation
    у roboport) — это нормальный случай, его функция всё ещё находит.
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
                sub_result = _collect_layers(item, inherited, _depth + 1, direction=direction)
                if sub_result:
                    collected_from_list.extend(sub_result)
            return collected_from_list or None
        return _collect_layers(node[0], inherited, _depth + 1, direction=direction)

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
            nested = _collect_layers(layer, next_inherited, _depth + 1, direction=direction)
            if nested:
                collected.extend(nested)
                continue
            leaf = _find_first_leaf(layer, 0, next_inherited, direction)
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
    # свой layers. Если вызывающий код просит конкретное направление
    # (поворот сущности) — пробуем его первым; иначе (и если у узла нет
    # именно этого ключа) — как раньше, берём первое найденное по
    # фиксированному порядку _DIRECTION_KEYS. В обоих случаях забираем ВСЕ
    # слои выбранного направления, а не только первый попавшийся (иначе
    # теряются детали вроде лотка выхода руды у буровых).
    dir_key_order = _DIRECTION_KEYS
    if direction is not None and direction in _DIRECTION_KEYS:
        dir_key_order = (direction,) + tuple(k for k in _DIRECTION_KEYS if k != direction)
    for dir_key in dir_key_order:
        sub = node.get(dir_key)
        if isinstance(sub, dict):
            result = _collect_layers(sub, next_inherited, _depth + 1, direction=direction)
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
                result = _collect_layers(structure, next_inherited, _depth + 1, direction=direction)
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
    if _allow_named_heuristic and not (
        set(node.keys()) & (_DIRECTION_LIKE_KEY_NAMES | _WALL_VARIANT_KEY_NAMES)
    ):
        named_leaves = []
        for key, value in node.items():
            if any(hint in key.lower() for hint in EXCLUDE_KEY_HINTS):
                continue
            if isinstance(value, dict) and _is_sprite_leaf(value) and not _is_decorative_overlay(value):
                leaf = _leaf_to_dict(value, next_inherited)
                if leaf.get("width") and leaf.get("height"):
                    named_leaves.append(("background" in key.lower(), leaf))
            elif isinstance(value, dict):
                # Именованный ключ сам не лист, а контейнер со своим 'layers'
                # (например pictures.north.structure у boiler — реальный
                # корпус+тень лежит на уровень глубже под 'structure', рядом
                # с плоскими 'fire'/'fire_glow' листьями-эффектами). Раньше
                # такие контейнеры молча пропускались, и если рядом
                # случайно было ≥2 плоских decorативных листьев (как раз
                # fire+fire_glow), эвристика собирала ТОЛЬКО их — котёл
                # рендерился одним чёрным силуэтом без самого корпуса.
                # _allow_named_heuristic=False здесь намеренно — см. докстринг.
                nested = _collect_layers(value, next_inherited, _depth + 1, False, direction=direction)
                if nested:
                    is_bg = "background" in key.lower()
                    named_leaves.extend((is_bg, leaf) for leaf in nested)
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


def _extract_turret_layers(proto: dict) -> list[dict] | None:
    """
    У турелей (ammo-turret/electric-turret/fluid-turret — gun-turret,
    laser-turret, flamethrower-turret, Krastorio2-турели и т.п.) визуал
    разделён на ДВЕ независимые части: graphics_set.base_visualisation —
    неподвижный постамент/база (виден всегда, отдельный файл), и folded_
    animation/prepared_animation и т.п. — собственно орудие (раскладывается/
    складывается). Раньше через обычный CANDIDATE_PATHS-перебор брали
    ТОЛЬКО орудие (folded_animation попадает в список раньше, чем что-либо
    из graphics_set.base_visualisation, а последнего там вообще нет как
    отдельного пути) — без постамента турель выглядела мельче и "обрубленной"
    относительно скриншотов из игры, особенно у gun-turret и flamethrower-
    turret, где сама по себе "орудийная" часть — лишь небольшая деталь
    поверх крупной базы. Теперь собираем базу первым (нижним) слоем, поверх
    — уже существующий результат обычного поиска (оружие).
    """
    base_layers = _resolve_layers_for_path(proto, ["graphics_set", "base_visualisation", "animation"])
    if not base_layers:
        return None
    weapon_layers = _extract_base_layers(proto)
    return base_layers + weapon_layers if weapon_layers else base_layers


def _extract_artillery_turret_layers(proto: dict) -> list[dict] | None:
    """
    artillery-turret — три независимых поля: base_picture (неподвижная
    платформа, уже забирается обычным CANDIDATE_PATHS), cannon_base_
    pictures (вращающийся постамент пушки) и cannon_barrel_pictures (сам
    ствол) — раньше показывали только платформу, ствол/постамент пушки
    пропускали как "слишком сложные" (rotated-анимация на 256 направлений,
    раскиданная по 8 файлам через 'dice'+'filenames'). Теперь, когда
    _find_first_leaf умеет доставать направление 0 из такой раскладки (см.
    _leaf_from_diced_filenames), просто добавляем их поверх платформы —
    получается полноценная пушка со стволом, а не голый постамент.
    """
    base_layers = _resolve_layers_for_path(proto, ["base_picture"])
    if not base_layers:
        return None

    layers = list(base_layers)
    for field in ("cannon_base_pictures", "cannon_barrel_pictures"):
        leaf = _find_first_leaf(proto.get(field))
        if leaf and leaf.get("width") and leaf.get("height"):
            layers.append(leaf)

    return layers if len(layers) > len(base_layers) else None


def _extract_base_layers(proto: dict, direction: str | None = None) -> list[dict] | None:
    for path in CANDIDATE_PATHS:
        node = _resolve_candidate_path(proto, path)
        if node is None:
            continue
        layers = _collect_layers(node, {}, direction=direction)
        if layers:
            return layers
        leaf = _find_first_leaf(node, direction=direction)
        if leaf:
            return [leaf]

    layers = _collect_layers(proto, {}, direction=direction)
    if layers:
        return layers
    leaf = _find_first_leaf(proto, direction=direction)
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


def _find_giga_hatch_layers(proto: dict) -> list[dict]:
    """
    cargo-landing-pad: большой круглый приёмный люк — не часть обычного
    graphics_set, а отдельная АНИМАЦИЯ открытия/закрытия, спрятанная в
    cargo_station_parameters.giga_hatch_definitions[0].hatch_graphics_back/
    hatch_graphics_front (по образцу rocket-silo door_back/door_front, но
    тут не статичная картинка, а лист кадров: 0 — закрыто, дальше —
    открывается). Без неё viewport показывал голый тёмный колодец
    (planet-hub-3.png), потому что настоящая крышка вообще не входила ни
    в один из проверяемых путей. _load_layer_frame0 в sprite_service и так
    берёт только самый первый кадр любого доп. слоя — то есть ровно
    "закрыто", раз оно первое в анимации (сущность в состоянии покоя).
    back добавляем раньше front (совпадает с порядком в самих данных —
    задняя половина крышки едет под передней).
    """
    ghd = proto.get("cargo_station_parameters", {}).get("giga_hatch_definitions")
    if not isinstance(ghd, list) or not ghd or not isinstance(ghd[0], dict):
        return []

    found = []
    for key in ("hatch_graphics_back", "hatch_graphics_front"):
        leaf = _find_first_leaf(ghd[0].get(key))
        if leaf and leaf.get("width") and leaf.get("height"):
            found.append(leaf)
    return found


def extract_sprite_layers(proto: dict, direction: str | None = None) -> list[dict] | None:
    """
    Возвращает список слоёв визуального спрайта сущности (первый кадр
    набора, первое направление). Сначала — основные слои (graphics_set/
    pictures/animation и т.п.), затем, если у прототипа отдельно есть
    working_visualisation(s) с реальным содержимым — они добавляются
    ДОПОЛНИТЕЛЬНЫМИ слоями поверх (у некоторых типов построек именно там
    лежит настоящая "рабочая" анимация, а не только декоративные искры —
    из-за чего такие сущности раньше показывали только голую статичную
    базу без реальной механики).

    direction — см. _find_first_leaf/_collect_layers. Прокидывается ТОЛЬКО
    в _extract_base_layers (единственный путь, реально проходящий через
    CANDIDATE_PATHS и способный встретить словарь вариантов по
    направлению) — специализированные экстракторы выше (лента, rocket-
    silo, animation_list, турели, артиллерия) вызываются БЕЗ направления
    и первыми, как раньше: направление там не имеет смысла (эти типы
    прототипов не хранят направленную графику в таком виде), а порядок и
    условия их срабатывания должны совпадать 1-в-1 с вызовом без
    direction — иначе для одной и той же сущности north мог бы прийти по
    одному пути, а east/south/west — по другому, и слепиться в
    противоречивый набор.
    """
    layers = (
        _extract_belt_and_structure(proto)
        or _extract_rocket_silo_layers(proto)
        or _extract_animation_list_layers(proto)
        or _extract_turret_layers(proto)
        or _extract_artillery_turret_layers(proto)
        or _extract_base_layers(proto, direction=direction)
    )
    extra = _find_working_visualisation_layers(proto) + _find_giga_hatch_layers(proto)

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


PIPE_SPRITES_CACHE_PATH = Path("data/cache/entity_pipe_sprites.json")

# Ключи pictures у труб (pipe/kr-steel-pipe/se-space-pipe/infinity-pipe) —
# один статичный лист на КАЖДУЮ комбинацию подключений N/E/S/W (в отличие
# от обычных сущностей, где extract_sprite_layers берёт ОДИН "главный"
# спрайт). Названия ключей отражают, какие стороны СОЕДИНЕНЫ: straight_*
# по осям, corner_<up|down>_<right|left> — две смежные стороны, t_<dir> —
# три стороны (не хватает стороны, противоположной <dir> — так же, как имя
# отражает "торчащий отросток" буквы T), cross — все четыре, ending_<dir> —
# только одна сторона <dir>, straight_vertical_single — вообще без
# подключений. Соответствие проверено эмпирически по альфа-каналу самих
# PNG (где именно рисунок трубы дотягивается до края тайла/заходит на
# соседний), не только по названию — англоязычная документация по этому
# полю неоднозначна в описании ending_*/t_* вариантов.
PIPE_VARIANT_KEY_BY_SIDES: dict[frozenset[str], str] = {
    frozenset(): "straight_vertical_single",
    frozenset({"N"}): "ending_up",
    frozenset({"S"}): "ending_down",
    # ending_left/ending_right — единственная пара, где имя НЕ совпадает с
    # подключённой стороной (в отличие от ending_up/ending_down и всех
    # corner_*/t_*, где имя = сторона(ы) подключения). Проверено визуально
    # по самим PNG (data/base/graphics/entity/pipe/pipe-ending-left.png и
    # pipe-ending-right.png при 4-кратном увеличении): "ending_left"
    # показывает открытый (болтовой) фланец СПРАВА и глухую заглушку-купол
    # СЛЕВА — то есть реально подключается ВОСТОК, а не запад, как можно
    # подумать по названию; "ending_right" — зеркально, подключается ЗАПАД.
    # Стиль открытого фланца (кольцо с заклёпками) сверен с заведомо
    # двусторонне открытым straight_horizontal.png (тот же рисунок с обеих
    # сторон), стиль заглушки — с гладким куполом без заклёпок.
    frozenset({"E"}): "ending_left",
    frozenset({"W"}): "ending_right",
    frozenset({"N", "S"}): "straight_vertical",
    frozenset({"E", "W"}): "straight_horizontal",
    frozenset({"N", "E"}): "corner_up_right",
    frozenset({"N", "W"}): "corner_up_left",
    frozenset({"S", "E"}): "corner_down_right",
    frozenset({"S", "W"}): "corner_down_left",
    frozenset({"N", "E", "W"}): "t_up",
    frozenset({"S", "E", "W"}): "t_down",
    frozenset({"N", "S", "W"}): "t_left",
    frozenset({"N", "S", "E"}): "t_right",
    frozenset({"N", "S", "E", "W"}): "cross",
}


def _extract_pipe_picture_variants(proto: dict) -> dict[str, dict] | None:
    """
    Возвращает ВСЕ 16 вариантов картинки трубы (по одному листу на каждую
    комбинацию подключений — см. PIPE_VARIANT_KEY_BY_SIDES), а не один
    произвольный, как обычный extract_sprite_layers (для труб он и так
    натыкается на этот же словарь через _WALL_VARIANT_KEY_NAMES-эвристику,
    но останавливается на первом найденном ключе). None, если у прототипа
    нет полного комплекта (не труба такого типа).
    """
    pics = proto.get("pictures")
    if not isinstance(pics, dict):
        return None

    result: dict[str, dict] = {}
    for variant_key in PIPE_VARIANT_KEY_BY_SIDES.values():
        node = pics.get(variant_key)
        if not isinstance(node, dict) or not _is_sprite_leaf(node):
            return None  # неполный комплект — не тот формат сущности
        leaf = _leaf_to_dict(node, {})
        if not leaf.get("width") or not leaf.get("height"):
            return None
        result[variant_key] = leaf
    return result


def build_pipe_sprite_variant_map(raw: dict, entity_names: set[str]) -> dict[str, dict[str, dict]]:
    """
    Аналог build_entity_sprite_map, но для труб — сохраняет ВСЕ 16
    вариантов на сущность (entity_name -> {variant_key: leaf}), чтобы
    фронт мог на канвасе выбирать нужный спрайт по факту подключения
    соседей, а не показывать один и тот же спрайт всегда.
    """
    result: dict[str, dict[str, dict]] = {}

    for section_name, section in raw.items():
        if not isinstance(section, dict):
            continue
        for name, proto in section.items():
            if name not in entity_names or not isinstance(proto, dict):
                continue
            variants = _extract_pipe_picture_variants(proto)
            if variants:
                result[name] = variants

    PIPE_SPRITES_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(PIPE_SPRITES_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    return result


def get_pipe_sprite_variant_map() -> dict[str, dict]:
    if not PIPE_SPRITES_CACHE_PATH.exists():
        return {}
    with open(PIPE_SPRITES_CACHE_PATH, encoding="utf-8") as f:
        return json.load(f)


FLUID_OVERLAYS_CACHE_PATH = Path("data/cache/entity_fluid_overlays.json")

_DIRECTION_TO_KEY = {0: "north", 4: "east", 8: "south", 12: "west"}


_DIRECTION_TO_INDEX = {0: 0, 4: 1, 8: 2, 12: 3}  # north/east/south/west -> индекс в гипотетическом 'positions'


def _resolve_connection_position(conn: dict, direction: int) -> list | None:
    """
    Позиция точки подключения относительно центра сущности, в тайлах.
    Обычно (проверено на всём текущем data-raw-dump.json — ванильные
    протитипы И все модовые, 0 исключений) лежит прямо в 'position'
    одним полем на каждый элемент pipe_connections. Гипотеза, что часть
    протитипов в этом дампе вместо этого использует 'positions' (список
    из 4 позиций north/east/south/west под один connection,
    параметризованный под поворот) НЕ подтвердилась — такого поля нет
    нигде в дампе. Ветка на 'positions' оставлена как дешёвая защита на
    будущее (другая версия игры/мода) — сейчас она никогда не
    срабатывает, весь реальный фикс — в переборе ВСЕХ connections ниже,
    а не только первого (см. _extract_assembling_machine_fluid_overlays).
    """
    if isinstance(conn.get("position"), list):
        return conn["position"]
    positions = conn.get("positions")
    if isinstance(positions, list):
        idx = _DIRECTION_TO_INDEX.get(direction)
        if idx is not None and idx < len(positions) and isinstance(positions[idx], list):
            return positions[idx]
    return None


def _extract_assembling_machine_fluid_overlays(proto: dict) -> list[dict] | None:
    """
    У части assembling-machine (примерно 60 из 135 в ванили+модах — не у
    всех, см. отчёт по задаче) есть fluid_boxes[].pipe_picture —
    отдельная картинка патрубка/трубы, который в игре виден ТОЛЬКО когда
    у выбранного рецепта есть жидкостный ingredient/result
    (fluid_boxes_off_when_no_fluid_recipe). У oil-refinery/chemical-plant
    и т.п. такого поля нет вовсе — труба у них нарисована прямо в
    основном спрайте всегда, накладывать нечего.

    pipe_picture — словарь на все 4 возможных поворота ЭНТИТИ
    (north/east/south/west), но поворот сущностей не поддержан (см.
    отчёт от 2026-09-19) — сущность всегда в дефолтной ориентации, значит
    для КАЖДОЙ точки подключения нужен вариант, соответствующий
    СОБСТВЕННОМУ направлению именно этой точки (direction, 0/4/8/12 =
    N/E/S/W) при дефолтном повороте сущности — проверено на
    assembling-machine-2 (box с direction=0/position=[0,-1] реально
    рисует патрубок вверх/на север именно через ключ "north").

    ВАЖНО: перебираем ВСЕ элементы pipe_connections, а не только первый.
    У маленьких машин (assembling-machine-2/3) на fluid_box всегда ровно
    одна точка — там разницы не было. Но у крупных (kr-bio-lab/
    kr-greenhouse — 7×7, kr-atmospheric-condenser — 5×5,
    se-energy-transmitter-emitter — 10×10 и т.п., проверено по дампу) на
    ОДНОМ fluid_box может быть до 8 точек подключения (например у
    kr-atmospheric-condenser — по 2 на каждую из 4 сторон), и старая
    версия (только connections[0]) рисовала один-единственный патрубок
    вместо полного набора — эффективно "теряя" все остальные точки
    стыковки по краям крупного корпуса.
    """
    fluid_boxes = proto.get("fluid_boxes")
    if not isinstance(fluid_boxes, list) or not fluid_boxes:
        return None

    overlays: list[dict] = []
    for fb in fluid_boxes:
        if not isinstance(fb, dict):
            continue
        pipe_picture = fb.get("pipe_picture")
        connections = fb.get("pipe_connections")
        if not isinstance(pipe_picture, dict) or not isinstance(connections, list) or not connections:
            continue

        for conn in connections:
            if not isinstance(conn, dict):
                continue
            direction = conn.get("direction", 0)  # по умолчанию north, как в самой игре
            direction_key = _DIRECTION_TO_KEY.get(direction)
            if direction_key is None:
                continue
            node = pipe_picture.get(direction_key)
            if not isinstance(node, dict) or not _is_sprite_leaf(node):
                continue
            leaf = _leaf_to_dict(node, {})
            if not leaf.get("width") or not leaf.get("height"):
                continue
            # position — координаты САМОЙ точки подключения относительно
            # центра сущности В ТАЙЛАХ (например [0,-1] у input-бокса
            # assembling-machine-2 — на тайл севернее центра). Без неё
            # патрубок рисуется у геометрического центра машины (используя
            # только мелкую пиксельную поправку picture.shift) — реальное
            # смещение к краю корпуса пропадает. leaf['shift'] — это
            # отдельная, доп. подвижка САМОЙ картинки (обычно доли тайла),
            # складывается с position, а не заменяет его.
            position = _resolve_connection_position(conn, direction) or [0, 0]
            overlays.append({
                "productionType": fb.get("production_type", "input-output"),
                "leaf": leaf,
                "connectionPosition": [position[0], position[1]],
            })

    return overlays or None


def build_fluid_overlay_map(raw: dict, entity_names: set[str]) -> dict[str, list[dict]]:
    """
    Аналог build_pipe_sprite_variant_map, но для патрубков жидкостных
    fluid_boxes сборочных машин (см. _extract_assembling_machine_fluid_overlays).
    """
    result: dict[str, list[dict]] = {}

    section = raw.get("assembling-machine")
    if isinstance(section, dict):
        for name, proto in section.items():
            if name not in entity_names or not isinstance(proto, dict):
                continue
            overlays = _extract_assembling_machine_fluid_overlays(proto)
            if overlays:
                result[name] = overlays

    FLUID_OVERLAYS_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(FLUID_OVERLAYS_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    return result


def get_fluid_overlay_map() -> dict[str, list[dict]]:
    if not FLUID_OVERLAYS_CACHE_PATH.exists():
        return {}
    with open(FLUID_OVERLAYS_CACHE_PATH, encoding="utf-8") as f:
        return json.load(f)


DIRECTIONAL_SPRITES_CACHE_PATH = Path("data/cache/entity_directional_sprites.json")


def _layers_signature(layers: list[dict]) -> tuple:
    return tuple((l["filename"], l.get("x", 0), l.get("y", 0)) for l in layers)


def build_directional_sprite_map(
    raw: dict, entity_names: set[str], skip_names: set[str]
) -> dict[str, dict[str, list[dict]]]:
    """
    Для механики поворота (R) сущностей — для каждой сущности (кроме труб
    и жидкостных патрубков сборочных машин, у них УЖЕ своя, отдельная
    направленная логика, см. build_pipe_sprite_variant_map/
    build_fluid_overlay_map — эта функция их сознательно обходит через
    skip_names, чтобы не плодить конфликтующие источники направления)
    пробует извлечь ВСЕ 4 направления (north/east/south/west) через
    extract_sprite_layers(proto, direction=...).

    Сохраняем результат ТОЛЬКО если найдены все 4 направления (частичный
    комплект хуже, чем ничего — на фронте либо показываем все 4 варианта
    корректно, либо не показываем направленную графику вовсе, падать
    обратно на entitySprite для одних направлений и directionalSprites
    для других не нужно) И хотя бы одно отличается от north (сравнение по
    filename+x+y всех слоёв) — иначе это не направленная сущность, а
    просто совпадение поддерева данных (например direction-словарь есть,
    но реально во всех 4 лежит одна и та же картинка), рендерить и резать
    в PNG 4 одинаковых файла незачем.
    """
    result: dict[str, dict[str, list[dict]]] = {}

    for section_name, section in raw.items():
        if not isinstance(section, dict):
            continue
        for name, proto in section.items():
            if name not in entity_names or name in skip_names or not isinstance(proto, dict):
                continue

            per_direction: dict[str, list[dict]] = {}
            for dir_key in _MAIN_DIRECTIONS:
                layers = extract_sprite_layers(proto, direction=dir_key)
                if layers:
                    per_direction[dir_key] = layers

            if len(per_direction) < 4:
                continue

            north_sig = _layers_signature(per_direction["north"])
            if any(_layers_signature(per_direction[k]) != north_sig for k in ("east", "south", "west")):
                result[name] = per_direction

    DIRECTIONAL_SPRITES_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(DIRECTIONAL_SPRITES_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    return result


def get_directional_sprite_map() -> dict[str, dict[str, list[dict]]]:
    if not DIRECTIONAL_SPRITES_CACHE_PATH.exists():
        return {}
    with open(DIRECTIONAL_SPRITES_CACHE_PATH, encoding="utf-8") as f:
        return json.load(f)