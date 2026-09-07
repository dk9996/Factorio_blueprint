import json
import math
from io import BytesIO
from pathlib import Path
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

    # 1) точный путь
    if mod_name in (None, "base"):
        candidate = settings.factorio_game_path / "data" / "base" / rel_path
        if candidate.exists():
            return candidate.read_bytes()
    if mod_name in (None, "core"):
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
    #    префикс не распознался или файл лежит не совсем там, где ждали)
    base_entity_dir = settings.factorio_game_path / "data" / "base" / "graphics" / "entity"
    core_entity_dir = settings.factorio_game_path / "data" / "core" / "graphics" / "entity"
    for entity_dir in (base_entity_dir, core_entity_dir):
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
    for entity_dir in (base_entity_dir, core_entity_dir):
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


def crop_entity_sprites(force: bool = False) -> dict:
    """
    Нарезает для каждой сущности из entity_sprites.json полосу кадров анимации
    (первое направление, все frame_count кадров, разложенные по line_length
    в ряду — как они лежат в исходном листе Factorio), СКЛЕИВАЯ все слои
    сущности (basic + детали и т.п., если их несколько) в одно изображение
    через alpha-композицию — раньше брался только первый слой. Метаданные
    раскладки сохраняются в data/cache/entity_sprite_frames.json, чтобы
    фронт мог покадрово анимировать через CSS background-position/steps().
    Если исходный файл меньше, чем нужно для полной полосы — откатываемся
    на один кадр (как раньше), чтобы не вырезать мусор.
    """
    ENTITY_SPRITES_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sprite_map = get_entity_sprite_map()  # entity_name -> list[layer_meta]

    processed = 0
    skipped_no_dims = 0
    skipped_size_mismatch = 0
    skipped_exists = 0
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
            # ВРЕМЕННЫЙ откат: раньше здесь склеивались все слои
            # (alpha_composite) в предположении, что каждый слой — это
            # независимый цветной элемент. На практике часть "слоёв" —
            # маски/тонировки/подсветка, которые так не рендерятся, и
            # слепая склейка портила спрайт. Пока используем только
            # первый валидный слой — как было в изначальной, рабочей
            # версии, просто с уже исправленным наследованием
            # frame_count/line_length.
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

            file_bytes = _find_source_file(base["filename"])
            if file_bytes is None:
                errors.append(f"{entity_name}: файл {base['filename']} не найден на диске")
                continue

            with Image.open(BytesIO(file_bytes)) as img:
                img.load()

                if img.width < width or img.height < height:
                    skipped_size_mismatch += 1
                    continue

                if img.width >= sheet_width and img.height >= sheet_height and frame_count > 1:
                    cropped = img.crop((0, 0, sheet_width, sheet_height))
                    saved_frame_count = frame_count
                    saved_cols = cols
                    rows_actual = rows_needed
                else:
                    cropped = img.crop((0, 0, width, height))
                    saved_frame_count = 1
                    saved_cols = 1
                    rows_actual = 1

                trimmed, saved_width, saved_height, shift_x, shift_y = _trim_common_margin(
                    cropped, width, height, saved_cols, rows_actual, saved_frame_count
                )
                trimmed.save(out_path)
                processed += 1

            frame_meta[entity_name] = {
                "frameWidth": saved_width,
                "frameHeight": saved_height,
                "frameCount": saved_frame_count,
                "lineLength": saved_cols,
                "shiftX": shift_x,
                "shiftY": shift_y,
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
        "errors": errors[:30],  # не раздуваем ответ, если ошибок много
        "total_errors": len(errors),
    }