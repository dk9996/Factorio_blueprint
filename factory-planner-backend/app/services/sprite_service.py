import json
import math
from io import BytesIO
from pathlib import Path
import numpy as np
from PIL import Image, ImageChops
from app.config import settings
from app.services.mod_resolver import build_mod_sources


ICON_SIZE = 64
SPRITES_CACHE_DIR = Path("data/cache/sprites")


from app.services.dump_service import get_icon_size_map

def crop_all_icons(force: bool = False) -> dict:
    SPRITES_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    icon_sizes = get_icon_size_map()  # filename -> точный icon_size из dump, если известен

    processed = 0
    skipped = 0
    errors: list[str] = []

    for src_dir in _base_and_core_icon_dirs():
        for png_path in src_dir.rglob("*.png"):
            out_path = SPRITES_CACHE_DIR / png_path.name
            if out_path.exists() and not force:
                skipped += 1
                continue
            try:
                known_size = icon_sizes.get(png_path.name)
                _crop_and_save(png_path.read_bytes(), out_path, known_size)
                processed += 1
            except Exception as e:
                errors.append(f"{png_path.name}: {e}")

    mod_sources = build_mod_sources()
    for mod_name, source in mod_sources.items():
        png_files = source.list_png_files()
        for rel_path in png_files:
            # КРИТИЧНО: берём только файлы из папок с "icon" в пути —
            # иначе entity-spritesheet с тем же именем файла, что и
            # настоящая иконка (частый случай у модов), перезапишет
            # правильную иконку в кэше случайным кадром анимации
            if "icon" not in rel_path.lower():
                continue

            filename = Path(rel_path).name
            out_path = SPRITES_CACHE_DIR / filename
            if out_path.exists() and not force:
                skipped += 1
                continue
            try:
                data = source.read_bytes(rel_path)
                if data is None:
                    continue
                known_size = icon_sizes.get(filename)
                _crop_and_save(data, out_path, known_size)
                processed += 1
            except Exception as e:
                errors.append(f"[{mod_name}] {filename}: {e}")

    return {
        "processed": processed,
        "skipped": skipped,
        "errors": errors,
        "mods_scanned": len(mod_sources),
        "known_icon_sizes": len(icon_sizes),
    }


def _crop_and_save(image_bytes: bytes, out_path: Path, known_size: int | None = None):
    with Image.open(BytesIO(image_bytes)) as img:
        img.load()
        w, h = img.width, img.height

        if known_size and w >= known_size and h >= known_size:
            # Раньше здесь была строгая проверка "w % known_size == 0",
            # но она ошибочно отбраковывала легитимные случаи вроде
            # logistics.png (192x128 при known_size=128 — не паникуем,
            # просто это не идеальная лента кадров, а высота ровно
            # совпадает с known_size, что и есть надёжный признак).
            if h == known_size:
                cropped = img.crop((0, 0, known_size, known_size))
                cropped.save(out_path)
                return
            # высота НЕ совпадает с known_size — вероятная коллизия имён
            # (как было с antimatter-reactor/supercharger), не доверяем
            # known_size, идём в эвристику ниже

        if w < ICON_SIZE or h < ICON_SIZE:
            img.save(out_path)
            return

        if h == ICON_SIZE and w > ICON_SIZE:
            cropped = img.crop((0, 0, ICON_SIZE, ICON_SIZE))
            cropped.save(out_path)
            return

        if w == h:
            resized = img.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
            resized.save(out_path)
            return

        # последний шанс — если высота хотя бы БОЛЬШЕ известного размера
        # кадра и без вариантов, пробуем LANCZOS-ресайз в квадрат вместо
        # копирования "как есть" искажённого прямоугольника
        target = known_size or ICON_SIZE
        resized = img.resize((target, target), Image.LANCZOS)
        resized.save(out_path)

def _base_and_core_icon_dirs() -> list[Path]:
    dirs = []
    base_icons = settings.factorio_game_path / "data" / "base" / "graphics" / "icons"
    if base_icons.exists():
        dirs.append(base_icons)
    base_item_group = settings.factorio_game_path / "data" / "base" / "graphics" / "item-group"
    if base_item_group.exists():
        dirs.append(base_item_group)
    core_icons = settings.factorio_game_path / "data" / "core" / "graphics" / "icons"
    if core_icons.exists():
        dirs.append(core_icons)
    return dirs


def sprite_url(icon_filename: str) -> str:
    return f"/assets/{icon_filename}"

from app.services.entity_sprite_service import get_entity_sprite_map
from app.services.mod_resolver import build_mod_sources

ENTITY_SPRITES_OUTPUT_DIR = Path("data/cache/entity_sprites")


def _find_source_file(filename: str) -> bytes | None:
    """
    filename приходит из дампа как полный путь с префиксом мода вида
    "__base__/graphics/entity/steel-chest/base.png" или
    "__modname__/...". Сначала ищем ТОЧНО по этому пути — важно, потому
    что голое имя файла (например "base.png") у РАЗНЫХ сущностей часто
    совпадает (особенно у сундуков — steel-chest, active-provider-chest,
    aai-strongbox и т.д. все называют свой базовый слой "base.png" каждый
    в своей папке), и поиск по одному basename случайно находил чужой файл.
    Basename-only поиск (как было раньше) оставлен запасным вариантом на
    случай нестандартной структуры у некоторых модов.
    """
    mod_name: str | None = None
    rel_path = filename
    if filename.startswith("__") and "__/" in filename:
        prefix, rel_path = filename.split("__/", 1)
        mod_name = prefix.strip("_")  # "__base__" -> "base", "__krastorio2__" -> "krastorio2"

    basename = Path(rel_path).name

    # 1) точный путь. mod_name может быть встроенным контentом самой игры
    #    не только "base"/"core", но и DLC — Space Age поставляется как
    #    несколько таких же "data/<name>/" папок (data/space-age,
    #    data/elevated-rails, data/quality и т.п.), поэтому пробуем
    #    ЛЮБОЕ имя как подпапку data/, а не только base и core.
    if mod_name:
        candidate = settings.factorio_game_path / "data" / mod_name / rel_path
        if candidate.exists():
            return candidate.read_bytes()
    else:
        candidate = settings.factorio_game_path / "data" / "base" / rel_path
        if candidate.exists():
            return candidate.read_bytes()

    candidate = settings.factorio_game_path / "data" / "core" / rel_path
    if candidate.exists():
        return candidate.read_bytes()

    if mod_name and mod_name not in ("base", "core"):
        source = build_mod_sources().get(mod_name)
        if source:
            data = source.read_bytes(rel_path)
            if data:
                return data

    # 2) запасной вариант — совпадение по ХВОСТУ пути (на случай, если
    #    префикс не распознался или файл лежит не совсем там, где ждали).
    #    Перебираем ВСЕ папки внутри data/ (base, core, и любые DLC вроде
    #    space-age/elevated-rails/quality), а не только base и core.
    data_dir = settings.factorio_game_path / "data"
    entity_dirs = [p / "graphics" / "entity" for p in data_dir.iterdir() if p.is_dir()] if data_dir.exists() else []
    for entity_dir in entity_dirs:
        if entity_dir.exists():
            for candidate in entity_dir.rglob(basename):
                if str(candidate).replace("\\", "/").endswith(rel_path):
                    return candidate.read_bytes()

    for source in build_mod_sources().values():
        for rp in source.list_png_files():
            if rp.endswith(rel_path):
                data = source.read_bytes(rp)
                if data:
                    return data

    # 3) последний резерв — старое поведение (совпадение по одному
    #    basename, без учёта пути) — менее надёжно, но лучше, чем ничего
    for entity_dir in entity_dirs:
        if entity_dir.exists():
            for candidate in entity_dir.rglob(basename):
                return candidate.read_bytes()

    for mod_name_iter, source in build_mod_sources().items():
        for rp in source.list_png_files():
            if Path(rp).name == basename and "entity" in rp.lower():
                data = source.read_bytes(rp)
                if data:
                    return data

    return None


def _trim_common_margin(
    sheet: Image.Image, frame_w: int, frame_h: int, cols: int, rows: int, frame_count: int
) -> tuple[Image.Image, int, int, float, float]:
    """
    В некоторых сущностях (например у лент — по 32 кадра анимации) объявленный
    в данных размер кадра оказывается больше, чем реально занимает рисунок —
    вокруг остаются пустые прозрачные поля со всех сторон КАЖДОГО кадра.
    Находим объединение непрозрачных пикселей СРАЗУ ПО ВСЕМ кадрам (не по
    одному!) и обрезаем только то, что пусто абсолютно во всех кадрах —
    так нельзя случайно отрезать реальный контент, и кадры анимации не
    рассинхронизируются друг с другом (у всех отрезается одно и то же поле).

    Возвращает также (shift_x, shift_y) — на сколько исходных пикселей
    сместился геометрический центр кадра относительно центра ДО обрезки
    (обрезка почти никогда не симметрична, поэтому наивное центрирование
    уже обрезанного кадра в клетке визуально "съезжает" — эти значения
    компенсируют именно это смещение при рендере).
    """
    if sheet.mode != "RGBA":
        sheet = sheet.convert("RGBA")

    accumulator = Image.new("L", (frame_w, frame_h), 0)
    idx = 0
    for row in range(rows):
        for col in range(cols):
            if idx >= frame_count:
                break
            box = (col * frame_w, row * frame_h, (col + 1) * frame_w, (row + 1) * frame_h)
            frame_alpha = sheet.crop(box).split()[-1]
            accumulator = ImageChops.lighter(accumulator, frame_alpha)
            idx += 1

    bbox = accumulator.getbbox()
    if not bbox or bbox == (0, 0, frame_w, frame_h):
        return sheet, frame_w, frame_h, 0.0, 0.0  # нечего обрезать (или кадр пуст — не трогаем)

    new_w = bbox[2] - bbox[0]
    new_h = bbox[3] - bbox[1]
    if new_w <= 0 or new_h <= 0:
        return sheet, frame_w, frame_h, 0.0, 0.0

    # Защита от рассинхрона кадров (когда реальный шаг между кадрами в
    # файле не совпадает с заявленным width/height — тогда мы режем не по
    # границам кадров, и "объединение" альфы по кривым срезам может дать
    # то слишком маленький, то слишком большой bbox). Если обрезка хочет
    # убрать больше половины кадра по любой оси — это подозрительно похоже
    # на рассинхрон, а не на реальные лишние поля: лучше не трогать кадр,
    # чем сломать его.
    if new_w < frame_w * 0.5 or new_h < frame_h * 0.5:
        return sheet, frame_w, frame_h, 0.0, 0.0

    shift_x = (bbox[0] + new_w / 2) - frame_w / 2
    shift_y = (bbox[1] + new_h / 2) - frame_h / 2

    trimmed = Image.new("RGBA", (new_w * cols, new_h * rows), (0, 0, 0, 0))
    idx = 0
    for row in range(rows):
        for col in range(cols):
            if idx >= frame_count:
                break
            src_box = (
                col * frame_w + bbox[0],
                row * frame_h + bbox[1],
                col * frame_w + bbox[2],
                row * frame_h + bbox[3],
            )
            trimmed.paste(sheet.crop(src_box), (col * new_w, row * new_h))
            idx += 1

    return trimmed, new_w, new_h, shift_x, shift_y


def _paste_additive(base: Image.Image, overlay: Image.Image, pos: tuple) -> None:
    """
    Настоящее аддитивное смешивание (как blend_mode: additive в
    Factorio — используется у светящихся деталей: линз, индикаторов,
    подсветки механизмов) — складывает RGB поверх уже нарисованного
    (альфа overlay'я как вес), а не заменяет пиксели как обычная
    вставка (Image.paste). Меняет base на месте, как и paste.
    """
    x, y = pos
    bw, bh = base.size
    ow, oh = overlay.size
    left, top = max(0, x), max(0, y)
    right, bottom = min(bw, x + ow), min(bh, y + oh)
    if right <= left or bottom <= top:
        return

    base_region = base.crop((left, top, right, bottom))
    overlay_region = overlay.crop((left - x, top - y, right - x, bottom - y))

    base_arr = np.array(base_region, dtype=np.float32)
    ov_arr = np.array(overlay_region, dtype=np.float32)

    ov_alpha = ov_arr[:, :, 3:4] / 255.0
    new_rgb = np.clip(base_arr[:, :, :3] + ov_arr[:, :, :3] * ov_alpha, 0, 255)
    new_alpha = np.clip(base_arr[:, :, 3:4] + ov_arr[:, :, 3:4], 0, 255)

    result_arr = np.concatenate([new_rgb, new_alpha], axis=2).astype(np.uint8)
    base.paste(Image.fromarray(result_arr, "RGBA"), (left, top))


def _apply_tint(img: Image.Image, tint) -> Image.Image:
    """
    Применяет tint (цвет тира — например у погрузчиков Krastorio2 маска
    красится в жёлтый/красный/голубой по уровню) — просто умножает
    R/G/B каждого пикселя на компоненты tint, альфа не трогается. tint
    у Factorio бывает в двух форматах: [r,g,b] (0-255 или 0-1) или
    {"r":..,"g":..,"b":..}; определяем диапазон по максимальному
    значению компонента.
    """
    if not tint:
        return img
    if isinstance(tint, dict):
        r, g, b = tint.get("r", 1), tint.get("g", 1), tint.get("b", 1)
    elif isinstance(tint, (list, tuple)) and len(tint) >= 3:
        r, g, b = tint[0], tint[1], tint[2]
    else:
        return img
    if max(r, g, b) > 1:
        r, g, b = r / 255, g / 255, b / 255
    img = img.convert("RGBA")
    r_band, g_band, b_band, a_band = img.split()
    r_band = r_band.point(lambda x: min(255, round(x * r)))
    g_band = g_band.point(lambda x: min(255, round(x * g)))
    b_band = b_band.point(lambda x: min(255, round(x * b)))
    return Image.merge("RGBA", (r_band, g_band, b_band, a_band))


def _load_layer_frame0(layer: dict) -> Image.Image | None:
    """Загружает ПЕРВЫЙ кадр слоя как есть (без обрезки полей, без анимации) —
    используется для статичных декоративных слоёв поверх основного слоя.
    Применяет tint слоя, если он задан (см. _apply_tint), и учитывает
    x/y-смещение (см. комментарий в crop_entity_sprites про direction_in/
    direction_out погрузчиков Krastorio2 — та же история и здесь)."""
    width = layer.get("width")
    height = layer.get("height")
    if not width or not height:
        return None
    width = int(round(width))
    height = int(round(height))
    off_x = int(layer.get("x", 0) or 0)
    off_y = int(layer.get("y", 0) or 0)
    file_bytes = _find_source_file(layer["filename"])
    if file_bytes is None:
        return None
    try:
        with Image.open(BytesIO(file_bytes)) as img:
            img.load()
            if img.width < off_x + width or img.height < off_y + height:
                return None
            frame = img.crop((off_x, off_y, off_x + width, off_y + height)).convert("RGBA")
            return _apply_tint(frame, layer.get("tint"))
    except Exception:
        return None


def _composite_layers(
    primary_sheet: Image.Image,
    primary_w: int,
    primary_h: int,
    primary_cols: int,
    primary_rows: int,
    primary_frame_count: int,
    primary_scale: float,
    primary_shift: tuple[float, float],
    secondary_layers: list[dict],
) -> tuple[Image.Image, int, int, float, float] | str:
    """
    Склеивает основной (уже нарезанный/обрезанный, возможно анимированный)
    слой с дополнительными слоями — каждый кладётся на СВОЁ место по
    собственным shift/scale относительно центра сущности (а не просто
    "поверх друг друга", как в прошлой сломанной попытке). Если у доп.
    слоя тоже есть кадры анимации — берётся только первый кадр (анимация
    вторичных слоёв — отдельная, более объёмная задача, пока не делаем).
    Все расчёты — в тайлах (общая система координат вне зависимости от
    scale конкретного слоя), результат переводится в единый холст с
    scale=1 (1 тайл = 32px).
    Возвращает СТРОКУ с причиной, если ничего не склеилось (вместо
    молчаливого None) — чтобы было видно в диагностике эндпоинта, что
    именно пошло не так, а не просто "почему-то не сработало".
    """
    px, py = primary_shift
    p_tile_w = primary_w * primary_scale / 32
    p_tile_h = primary_h * primary_scale / 32
    bounds = [(px - p_tile_w / 2, py - p_tile_h / 2, px + p_tile_w / 2, py + p_tile_h / 2)]

    loaded_secondary = []
    load_failures = 0
    for layer in secondary_layers:
        frame = _load_layer_frame0(layer)
        if frame is None:
            load_failures += 1
            continue
        l_scale = layer.get("scale", 1) or 1
        lsx, lsy = layer.get("shift") or [0, 0]
        l_tile_w = frame.width * l_scale / 32
        l_tile_h = frame.height * l_scale / 32
        bounds.append((lsx - l_tile_w / 2, lsy - l_tile_h / 2, lsx + l_tile_w / 2, lsy + l_tile_h / 2))
        loaded_secondary.append((frame, l_scale, lsx, lsy, l_tile_w, l_tile_h, bool(layer.get("is_additive"))))

    if not loaded_secondary:
        return f"ни один доп. слой не загрузился ({load_failures} из {len(secondary_layers)} не найдены/битые)"

    min_x = min(b[0] for b in bounds)
    min_y = min(b[1] for b in bounds)
    max_x = max(b[2] for b in bounds)
    max_y = max(b[3] for b in bounds)

    canvas_w = max(1, round((max_x - min_x) * 32))
    canvas_h = max(1, round((max_y - min_y) * 32))
    if canvas_w > 4000 or canvas_h > 4000 or canvas_w * canvas_h * primary_frame_count > 60_000_000:
        return f"холст вышел слишком большим ({canvas_w}x{canvas_h}px × {primary_frame_count} кадров) — пропущено"

    canvas_center_x = (min_x + max_x) / 2
    canvas_center_y = (min_y + max_y) / 2

    result = Image.new("RGBA", (canvas_w * primary_cols, canvas_h * primary_rows), (0, 0, 0, 0))

    p_disp_w = max(1, round(primary_w * primary_scale))
    p_disp_h = max(1, round(primary_h * primary_scale))
    p_left = round((px - p_tile_w / 2 - min_x) * 32)
    p_top = round((py - p_tile_h / 2 - min_y) * 32)

    idx = 0
    for row in range(primary_rows):
        for col in range(primary_cols):
            if idx >= primary_frame_count:
                break
            frame_box = (col * primary_w, row * primary_h, (col + 1) * primary_w, (row + 1) * primary_h)
            frame_img = primary_sheet.crop(frame_box).convert("RGBA")
            if (frame_img.width, frame_img.height) != (p_disp_w, p_disp_h):
                frame_img = frame_img.resize((p_disp_w, p_disp_h), Image.LANCZOS)

            cell = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
            cell.paste(frame_img, (p_left, p_top), frame_img)

            for frame, l_scale, lsx, lsy, l_tile_w, l_tile_h, is_additive in loaded_secondary:
                disp_w = max(1, round(frame.width * l_scale))
                disp_h = max(1, round(frame.height * l_scale))
                layer_img = frame if (frame.width, frame.height) == (disp_w, disp_h) else frame.resize(
                    (disp_w, disp_h), Image.LANCZOS
                )
                l_left = round((lsx - l_tile_w / 2 - min_x) * 32)
                l_top = round((lsy - l_tile_h / 2 - min_y) * 32)
                if is_additive:
                    _paste_additive(cell, layer_img, (l_left, l_top))
                else:
                    cell.paste(layer_img, (l_left, l_top), layer_img)

            result.paste(cell, (col * canvas_w, row * canvas_h))
            idx += 1

    return result, canvas_w, canvas_h, canvas_center_x, canvas_center_y


def crop_entity_sprites(force: bool = False) -> dict:
    """
    Нарезает для каждой сущности из entity_sprites.json полосу кадров
    анимации ОСНОВНОГО слоя (первое направление, все frame_count кадров),
    и, если у сущности есть ещё слои (декоративные детали — как антенны,
    подсветка, зелень у крупных построек), докладывает их на своё место
    по собственным shift/scale — см. _composite_layers. Слои с анимацией
    (кроме основного) пока склеиваются только своим первым кадром —
    собственная анимация вторичных слоёв не поддержана. Метаданные
    раскладки сохраняются в data/cache/entity_sprite_frames.json, чтобы
    фронт мог покадрово анимировать через CSS background-position.
    Если исходный файл меньше, чем нужно для полной полосы — откатываемся
    на один кадр (как раньше), чтобы не вырезать мусор.
    """
    ENTITY_SPRITES_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sprite_map = get_entity_sprite_map()  # entity_name -> list[layer_meta]

    processed = 0
    skipped_no_dims = 0
    skipped_size_mismatch = 0
    skipped_exists = 0
    composited = 0
    composite_skipped: list[str] = []
    errors: list[str] = []
    frame_meta: dict[str, dict] = {}

    frames_meta_path = ENTITY_SPRITES_OUTPUT_DIR.parent / "entity_sprite_frames.json"
    if frames_meta_path.exists() and not force:
        try:
            frame_meta = json.loads(frames_meta_path.read_text(encoding="utf-8"))
        except Exception:
            frame_meta = {}

    for entity_name, layers in sprite_map.items():
        out_path = ENTITY_SPRITES_OUTPUT_DIR / f"{entity_name}.png"
        if out_path.exists() and not force:
            skipped_exists += 1
            continue

        # Защита от устаревшего entity_sprites.json старого формата (там
        # было "entity_name: {..}", теперь "entity_name: [{..}, ...]") —
        # если формат не сошёлся, пропускаем сущность, а не роняем весь
        # запрос. Обычно чинится вызовом /api/entities/rebuild перед этим
        # эндпоинтом (он и пересобирает entity_sprites.json в новом виде).
        if not isinstance(layers, list) or not layers:
            errors.append(
                f"{entity_name}: entity_sprites.json в старом формате — "
                f"сначала вызови POST /api/entities/rebuild, потом повтори"
            )
            continue

        try:
            # Первый (обычно самый "основной"/анимированный) слой — от него
            # берём геометрию кадров/анимацию; остальные слои докладываются
            # позже через _composite_layers по своим собственным shift/scale
            # (не альфа-склейка вслепую, как в прошлой сломанной версии).
            base = layers[0]
            if not isinstance(base, dict):
                errors.append(f"{entity_name}: некорректные данные слоя")
                continue

            width = base.get("width")
            height = base.get("height")

            if not width or not height:
                skipped_no_dims += 1
                continue

            width = int(round(width))
            height = int(round(height))

            frame_count = max(1, int(base.get("frame_count") or 1))
            line_length = int(base.get("line_length") or frame_count) or frame_count
            cols = min(line_length, frame_count)
            rows_needed = math.ceil(frame_count / cols)
            sheet_width = width * cols
            sheet_height = height * rows_needed
            # x/y — смещение внутри файла (некоторые спрайты — это ОБЛАСТЬ
            # общего спрайт-листа, а не файл целиком; например у Krastorio2
            # погрузчиков direction_in/direction_out лежат в одном файле,
            # различаясь только "y" — без учёта смещения мы бы всегда брали
            # верхнюю область файла независимо от того, что реально нужно).
            off_x = int(base.get("x", 0) or 0)
            off_y = int(base.get("y", 0) or 0)

            file_bytes = _find_source_file(base["filename"])
            if file_bytes is None:
                errors.append(f"{entity_name}: файл {base['filename']} не найден на диске")
                continue

            with Image.open(BytesIO(file_bytes)) as img:
                img.load()

                if img.width < off_x + width or img.height < off_y + height:
                    skipped_size_mismatch += 1
                    continue

                if img.width >= off_x + sheet_width and img.height >= off_y + sheet_height and frame_count > 1:
                    cropped = img.crop((off_x, off_y, off_x + sheet_width, off_y + sheet_height))
                    saved_frame_count = frame_count
                    saved_cols = cols
                    rows_actual = rows_needed
                else:
                    cropped = img.crop((off_x, off_y, off_x + width, off_y + height))
                    saved_frame_count = 1
                    saved_cols = 1
                    rows_actual = 1

                trimmed, saved_width, saved_height, shift_x, shift_y = _trim_common_margin(
                    cropped, width, height, saved_cols, rows_actual, saved_frame_count
                )
                processed += 1

            scale_val = base.get("scale", 1) or 1
            game_shift = base.get("shift") or [0, 0]

            final_image = trimmed
            final_w, final_h = saved_width, saved_height
            final_scale = scale_val
            final_gsx, final_gsy = game_shift[0], game_shift[1]
            final_tsx, final_tsy = shift_x, shift_y

            if len(layers) > 1:
                # компенсация обрезки полей у основного слоя переводится
                # из исходных пикселей в тайлы, чтобы сложить с родным
                # игровым shift — дальше все слои считаются в общей
                # системе координат (тайлах), см. _composite_layers
                primary_effective_shift = (
                    game_shift[0] + shift_x * scale_val / 32,
                    game_shift[1] + shift_y * scale_val / 32,
                )
                composite_result = _composite_layers(
                    trimmed, saved_width, saved_height, saved_cols, rows_actual, saved_frame_count,
                    scale_val, primary_effective_shift, layers[1:],
                )
                if isinstance(composite_result, str):
                    composite_skipped.append(f"{entity_name}: {composite_result}")
                else:
                    final_image, final_w, final_h, final_gsx, final_gsy = composite_result
                    final_scale = 1
                    final_tsx, final_tsy = 0.0, 0.0
                    composited += 1

            final_image.save(out_path)

            frame_meta[entity_name] = {
                "frameWidth": final_w,
                "frameHeight": final_h,
                "frameCount": saved_frame_count,
                "lineLength": saved_cols,
                "shiftX": final_tsx,
                "shiftY": final_tsy,
                # scale и gameShift* — родные игровые данные (в частности
                # scale переводит пиксели файла в игровые тайлы: 1 тайл =
                # 32px при scale=1). Раньше извлекались, но никуда не
                # передавались — рендер всегда "подгонял под клетку", из-за
                # чего сущности вроде сундуков, которые в игре специально
                # рисуются больше своего хитбокса и выступают на соседние
                # тайлы, обрезались вместо естественного выступа.
                "scale": final_scale,
                "gameShiftX": final_gsx,
                "gameShiftY": final_gsy,
            }

        except Exception as e:
            errors.append(f"{entity_name}: {e}")

    frames_meta_path.write_text(
        json.dumps(frame_meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    return {
        "processed": processed,
        "skipped_exists": skipped_exists,
        "skipped_no_dims": skipped_no_dims,
        "skipped_size_mismatch": skipped_size_mismatch,
        "composited": composited,
        "composite_skipped": composite_skipped[:30],
        "total_composite_skipped": len(composite_skipped),
        "errors": errors[:30],  # не раздуваем ответ, если ошибок много
        "total_errors": len(errors),
    }