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

        # 1. Есть точный размер кадра из dump — режем именно его, без угадывания
        if known_size and w >= known_size and h >= known_size:
            cropped = img.crop((0, 0, known_size, known_size))
            if known_size != ICON_SIZE:
                cropped = cropped.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
            cropped.save(out_path)
            return

        # 2. Фолбэк — прежняя эвристика, если точного размера нет в dump
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

        img.save(out_path)

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