from io import BytesIO
from pathlib import Path
from PIL import Image
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
    Ищет файл ИМЕННО в graphics/entity/ (не во всей graphics/ папке!) —
    иначе можно случайно найти одноимённый файл из graphics/icons/
    (UI-иконка вместо настоящего entity-спрайта), как было при первом
    прогоне: assembling-machine-2.png существует и как иконка (120x64
    mip-полоса), и как отдельный крупный спрайт в graphics/entity/.
    """
    base_entity_dir = settings.factorio_game_path / "data" / "base" / "graphics" / "entity"
    if base_entity_dir.exists():
        for candidate in base_entity_dir.rglob(filename):
            return candidate.read_bytes()

    core_entity_dir = settings.factorio_game_path / "data" / "core" / "graphics" / "entity"
    if core_entity_dir.exists():
        for candidate in core_entity_dir.rglob(filename):
            return candidate.read_bytes()

    # для модов — тоже фильтруем по пути, содержащему "graphics/entity" или "entity/"
    for mod_name, source in build_mod_sources().items():
        for rel_path in source.list_png_files():
            if Path(rel_path).name == filename and "entity" in rel_path.lower():
                data = source.read_bytes(rel_path)
                if data:
                    return data

    # fallback — если в модовской структуре "entity" не встретилось в пути
    # (некоторые моды кладут графику по-другому), ищем без фильтра по пути
    for mod_name, source in build_mod_sources().items():
        for rel_path in source.list_png_files():
            if Path(rel_path).name == filename:
                data = source.read_bytes(rel_path)
                if data:
                    return data

    return None


def crop_entity_sprites(force: bool = False) -> dict:
    """
    Нарезает по ОДНОМУ представительному кадру (первый кадр, первое
    направление) для каждой сущности из entity_sprites.json — используя
    точные width/height/line_length, а не угадывание.
    """
    ENTITY_SPRITES_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sprite_map = get_entity_sprite_map()

    processed = 0
    skipped_no_dims = 0
    skipped_size_mismatch = 0
    skipped_exists = 0
    errors: list[str] = []

    for entity_name, meta in sprite_map.items():
        out_path = ENTITY_SPRITES_OUTPUT_DIR / f"{entity_name}.png"
        if out_path.exists() and not force:
            skipped_exists += 1
            continue

        width = meta.get("width")
        height = meta.get("height")

        if not width or not height:
            skipped_no_dims += 1
            continue

        # ширина/высота могут быть дробными у некоторых модов — приводим к int
        width = int(round(width))
        height = int(round(height))

        filename = meta["filename"]
        file_bytes = _find_source_file(filename)
        if file_bytes is None:
            errors.append(f"{entity_name}: файл {filename} не найден на диске")
            continue

        try:
            with Image.open(BytesIO(file_bytes)) as img:
                img.load()

                # защитная проверка: если реальный файл меньше заявленного
                # кадра — данные не совпадают с картинкой, пропускаем,
                # чтобы не вырезать мусор
                if img.width < width or img.height < height:
                    skipped_size_mismatch += 1
                    continue

                # первый кадр — верхний левый угол листа
                cropped = img.crop((0, 0, width, height))
                cropped.save(out_path)
                processed += 1

        except Exception as e:
            errors.append(f"{entity_name}: {e}")

    return {
        "processed": processed,
        "skipped_exists": skipped_exists,
        "skipped_no_dims": skipped_no_dims,
        "skipped_size_mismatch": skipped_size_mismatch,
        "errors": errors[:30],  # не раздуваем ответ, если ошибок много
        "total_errors": len(errors),
    }