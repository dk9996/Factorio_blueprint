"""
Подсказки входов/выходов сущностей (стрелки pickup/insert манипулятора,
стрелки конвейеров, жидкостные порты, вектор выброса буровых) —
НЕЗАВИСИМАЯ подсистема от entity_sprite_service.py/sprite_service.py:
никаких PNG здесь не режется, только числа (позиции/направления в
тайлах, как они объявлены в прототипе — в "северной" ориентации), их
поворот на entity.direction делает фронт (см. src/lib/ioHints.ts).

Собранные здесь данные не зависят от кэша нарезанных спрайтов и не имеют
двухшаговой задержки пайплайна (в отличие от entitySprite/pipeSpriteVariants/
fluidPipeOverlays) — считаются один раз при сборке entity_catalog.json и
не нуждаются в пересчёте при каждом чтении кэша.
"""

from app.services.recipe_service import _resolve_fluid_color

_DIRECTION_NAMES = {0: "north", 4: "east", 8: "south", 12: "west"}

# См. п.1 задачи — хранилища предметов, подсказок нет вообще.
_CONTAINER_SECTIONS = {
    "container", "logistic-container", "linked-container",
    "infinity-container", "proxy-container", "temporary-container",
}
_BELT_SECTIONS = {"transport-belt", "linked-belt"}
_LOADER_SECTIONS = {"loader", "loader-1x1"}
_SPLITTER_SECTIONS = {"splitter", "lane-splitter"}


def _get_fluid_icon_filename(proto: dict | None) -> str | None:
    if not proto:
        return None
    icon_path = proto.get("icon")
    if not icon_path and proto.get("icons"):
        icon_path = proto["icons"][0].get("icon")
    return icon_path.rsplit("/", 1)[-1] if icon_path else None


def _resolve_fluid_display(name: str, fluids: dict, fluid_locale: dict) -> dict:
    proto = fluids.get(name)
    icon_filename = _get_fluid_icon_filename(proto)
    return {
        "name": name,
        "label": fluid_locale.get(name, name),
        "icon": f"/assets/{icon_filename}" if icon_filename else None,
        "color": _resolve_fluid_color(name, fluids),
    }


def _resolve_connection_position(conn: dict) -> tuple[list | None, list | None]:
    """
    Возвращает (position, positionsByDirection). Обычный случай —
    'position' (одна точка в "северной" системе координат сущности,
    поворачивается на фронте вместе с entity.direction). У
    pumpjack.output_fluid_box встречается 'positions' (МНОЖЕСТВЕННОЕ
    число, 4 готовые точки — по одной на каждое направление сущности
    N/E/S/W) ВМЕСТО 'position' — проверено по реальному дампу
    (data-raw-dump.json), это единственный найденный случай среди всех
    проверенных прототипов. В этом случае фронт берёт нужный элемент по
    индексу направления НАПРЯМУЮ, без дополнительного поворота вектора.
    """
    position = conn.get("position")
    if isinstance(position, list):
        return position, None
    positions = conn.get("positions")
    if isinstance(positions, list) and len(positions) >= 4:
        return None, positions[:4]
    return None, None


def _box_production_type(box: dict, connections: list) -> str:
    """
    production_type бокса, если он однозначен; иначе — единственный
    общий flow_direction среди его коннектов (нужно для сущностей вроде
    pump, где production_type на уровне бокса не задан вовсе, а
    направление объявлено только на каждом connection по отдельности —
    проверено по реальному дампу: pump.fluid_box.production_type=None,
    но pipe_connections[0].flow_direction='output',
    pipe_connections[1].flow_direction='input').
    """
    box_type = box.get("production_type")
    if box_type:
        return box_type
    flow_dirs = {
        c.get("flow_direction")
        for c in connections
        if isinstance(c, dict) and c.get("flow_direction")
    }
    if len(flow_dirs) == 1:
        return next(iter(flow_dirs))
    return "input-output"


def _extract_ports_from_box(
    box: dict, port_index_start: int, recipe_match_index: int | None,
    fluids: dict, fluid_locale: dict,
) -> list[dict]:
    connections = box.get("pipe_connections")
    if not isinstance(connections, list) or not connections:
        return []

    box_production_type = _box_production_type(box, connections)
    filter_name = box.get("filter")
    filter_display = (
        _resolve_fluid_display(filter_name, fluids, fluid_locale)
        if isinstance(filter_name, str)
        else None
    )

    ports = []
    for offset, conn in enumerate(connections):
        if not isinstance(conn, dict):
            continue
        # Подземная сторона pipe-to-ground (connection_type="underground") —
        # это не видимый патрубок, к которому можно подключить трубу, а
        # внутренняя связь с парным pipe-to-ground (см. src/lib/underground.ts,
        # _extract_underground_pipe_info ниже). Рисовать её как обычную
        # нейтральную io-hint стрелку неверно — на сущности и так один
        # видимый патрубок, а подземная сторона физически смотрит в
        # противоположную сторону, создавая у игрока впечатление "двух
        # портов, направленных друг против друга".
        if conn.get("connection_type") == "underground":
            continue
        direction = conn.get("direction", 0)
        if direction not in _DIRECTION_NAMES:
            continue
        position, positions_by_direction = _resolve_connection_position(conn)
        if position is None and positions_by_direction is None:
            continue
        production_type = conn.get("flow_direction") or box_production_type
        ports.append({
            "index": port_index_start + offset,
            "productionType": production_type,
            "position": position,
            "positionsByDirection": positions_by_direction,
            "direction": direction,
            "filter": filter_display,
            # Для сопоставления с i-м жидкостным ingredient/result рецепта
            # (см. lib/ioHints.ts) — только у чисто input/output боксов,
            # у смешанных/неоднозначных (input-output без явного filter)
            # авто-сопоставление не делаем, порт рисуется нейтральным.
            "recipeMatchIndex": recipe_match_index if production_type in ("input", "output") else None,
        })
    return ports


def _extract_fluid_ports(proto: dict, fluids: dict, fluid_locale: dict) -> list[dict] | None:
    """
    Перебирает ВСЕ источники жидкостных боксов прототипа (fluid_boxes —
    список; fluid_box/input_fluid_box/output_fluid_box — одиночные
    поля) и внутри каждого — ВСЕ pipe_connections (не только первый —
    см. entity_sprite_service._extract_assembling_machine_fluid_overlays,
    та же идея, но это НЕЗАВИСИМАЯ копия специально для подсказок, не
    трогаем существующий код патрубков).
    """
    ports: list[dict] = []
    next_index = 0
    input_box_count = 0
    output_box_count = 0

    def handle_box(box, type_hint: str | None = None):
        nonlocal next_index, input_box_count, output_box_count
        if not isinstance(box, dict):
            return
        connections = box.get("pipe_connections")
        box_type = _box_production_type(box, connections if isinstance(connections, list) else [])
        if box_type == "input-output" and type_hint:
            box_type = type_hint

        recipe_match_index = None
        if box_type == "input":
            recipe_match_index = input_box_count
            input_box_count += 1
        elif box_type == "output":
            recipe_match_index = output_box_count
            output_box_count += 1

        extracted = _extract_ports_from_box(box, next_index, recipe_match_index, fluids, fluid_locale)
        ports.extend(extracted)
        next_index += len(extracted)

    fluid_boxes = proto.get("fluid_boxes")
    if isinstance(fluid_boxes, list):
        for box in fluid_boxes:
            handle_box(box)

    handle_box(proto.get("fluid_box"))
    handle_box(proto.get("input_fluid_box"), "input")
    handle_box(proto.get("output_fluid_box"), "output")

    return ports or None


def _extract_inserter_hint(proto: dict) -> dict | None:
    pickup = proto.get("pickup_position")
    insert = proto.get("insert_position")
    if not isinstance(pickup, list) or not isinstance(insert, list):
        return None
    return {"pickup": [pickup[0], pickup[1]], "drop": [insert[0], insert[1]]}


def _extract_drop_vector(proto: dict) -> list | None:
    vec = proto.get("vector_to_place_result")
    if isinstance(vec, list) and len(vec) >= 2 and (vec[0] != 0 or vec[1] != 0):
        return [vec[0], vec[1]]
    return None


def _extract_underground_pipe_info(proto: dict) -> tuple[int | None, int | None]:
    """
    Подземная сторона трубы (pipe-to-ground и аналоги) — запись с
    connection_type "underground" внутри fluid_box.pipe_connections
    (одиночный fluid_box, не список fluid_boxes — проверено по реальному
    дампу на всех найденных pipe-to-ground прототипах, вкл. модовые).
    Возвращает (max_underground_distance, direction) ЛОКАЛЬНОЙ (до
    поворота сущности) стороны — direction разворачивается на
    entity.direction на фронте (см. src/lib/underground.ts), так же как
    остальные "северные" координаты в этом модуле. (None, None), если
    такой записи нет (сущность — не подземная труба).
    """
    box = proto.get("fluid_box")
    if not isinstance(box, dict):
        return None, None
    connections = box.get("pipe_connections")
    if not isinstance(connections, list):
        return None, None
    for conn in connections:
        if isinstance(conn, dict) and conn.get("connection_type") == "underground":
            return conn.get("max_underground_distance"), conn.get("direction")
    return None, None


def build_io_hints(
    section_name: str, proto: dict, has_crafting_categories: bool,
    fluids: dict, fluid_locale: dict,
) -> dict | None:
    """
    Решает kind сущности и собирает релевантные под-поля подсказок
    входов/выходов. None — подсказок для этой сущности нет вовсе
    (хранилища, или тип без портов и без рецепта — стены, лампы,
    столбы и т.п.).
    """
    if section_name in _CONTAINER_SECTIONS:
        return None

    # undergroundMaxDistance/undergroundDirection — см. src/lib/underground.ts
    # (механика подземных конвейеров/труб). undergroundDirection нужен
    # только трубам (у подземного конвейера ось = его собственный
    # entity.direction, отдельное поле не нужно) — у остальных кладём
    # None, чтобы форма словаря была одинаковой во всех ветках.
    if section_name == "inserter":
        inserter = _extract_inserter_hint(proto)
        if not inserter:
            return None
        return {
            "kind": "inserter", "inserter": inserter, "fluidPorts": None, "dropVector": None,
            "undergroundMaxDistance": None, "undergroundDirection": None,
        }

    if section_name in _BELT_SECTIONS:
        return {
            "kind": "belt", "inserter": None, "fluidPorts": None, "dropVector": None,
            "undergroundMaxDistance": None, "undergroundDirection": None,
        }

    if section_name == "underground-belt":
        return {
            "kind": "underground-belt", "inserter": None, "fluidPorts": None, "dropVector": None,
            "undergroundMaxDistance": proto.get("max_distance"), "undergroundDirection": None,
        }

    if section_name in _SPLITTER_SECTIONS:
        return {
            "kind": "splitter", "inserter": None, "fluidPorts": None, "dropVector": None,
            "undergroundMaxDistance": None, "undergroundDirection": None,
        }

    if section_name in _LOADER_SECTIONS:
        return {
            "kind": "loader", "inserter": None, "fluidPorts": None, "dropVector": None,
            "undergroundMaxDistance": None, "undergroundDirection": None,
        }

    fluid_ports = _extract_fluid_ports(proto, fluids, fluid_locale)

    if has_crafting_categories:
        return {
            "kind": "crafting", "inserter": None, "fluidPorts": fluid_ports, "dropVector": None,
            "undergroundMaxDistance": None, "undergroundDirection": None,
        }

    if section_name == "mining-drill":
        drop_vector = _extract_drop_vector(proto)
        if not drop_vector and not fluid_ports:
            return None
        return {
            "kind": "mining-drill", "inserter": None, "fluidPorts": fluid_ports, "dropVector": drop_vector,
            "undergroundMaxDistance": None, "undergroundDirection": None,
        }

    if fluid_ports:
        underground_distance, underground_direction = _extract_underground_pipe_info(proto)
        return {
            "kind": "fixed-fluid", "inserter": None, "fluidPorts": fluid_ports, "dropVector": None,
            "undergroundMaxDistance": underground_distance, "undergroundDirection": underground_direction,
        }

    return None
