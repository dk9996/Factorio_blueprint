from io import BytesIO
from pathlib import Path
from PIL import Image
from app.config import settings
from app.services.mod_resolver import build_mod_sources

ICON_SIZE = 64
SPRITES_CACHE_DIR = Path("data/cache/sprites")


def crop_all_icons(force: bool = False) -> dict:
    SPRITES_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    processed = 0
    skipped = 0
    errors: list[str] = []

    # 1. Базовая игра и core — как раньше, обычные папки на диске
    for src_dir in _base_and_core_icon_dirs():
        for png_path in src_dir.rglob("*.png"):
            out_path = SPRITES_CACHE_DIR / png_path.name
            if out_path.exists() and not force:
                skipped += 1
                continue
            try:
                _crop_and_save(png_path.read_bytes(), out_path)
                processed += 1
            except Exception as e:
                errors.append(f"{png_path.name}: {e}")

    # 2. Моды — через ModSource, поддерживает и папки, и zip
    mod_sources = build_mod_sources()
    for mod_name, source in mod_sources.items():
        # иконки сущностей у модов обычно лежат в graphics/icons,
        # но некоторые кладут их в другие подпапки graphics/ — берём всё graphics
        png_files = source.list_png_files()  # весь мод целиком — иконки могут лежать где угодно
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
                _crop_and_save(data, out_path)
                processed += 1
            except Exception as e:
                errors.append(f"[{mod_name}] {filename}: {e}")

    return {
        "processed": processed,
        "skipped": skipped,
        "errors": errors,
        "mods_scanned": len(mod_sources),
    }


def _crop_and_save(image_bytes: bytes, out_path: Path):
    with Image.open(BytesIO(image_bytes)) as img:
        img.load()
        w, h = img.width, img.height

        if w < ICON_SIZE or h < ICON_SIZE:
            # маленькая иконка — просто сохраняем как есть, ничего не режем
            img.save(out_path)
            return

        if h == ICON_SIZE and w % ICON_SIZE == 0 and w > ICON_SIZE:
            # классическая mip-полоса: высота ровно ICON_SIZE,
            # ширина кратна ICON_SIZE (64+32+16+8=120 не кратно 64,
            # поэтому проверяем по-другому — см. ниже)
            cropped = img.crop((0, 0, ICON_SIZE, ICON_SIZE))
            cropped.save(out_path)
            return

        if h == ICON_SIZE and w > ICON_SIZE:
            # высота точно ICON_SIZE, ширина больше — это mip-полоса
            # (даже если сумма кадров не кратна ровно, первый кадр всегда ICON_SIZE)
            cropped = img.crop((0, 0, ICON_SIZE, ICON_SIZE))
            cropped.save(out_path)
            return

        if w == h:
            # квадратная иконка большего размера (128x128, 256x256 и т.п.)
            # без мип-полосы — просто уменьшаем до ICON_SIZE, не обрезаем
            resized = img.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
            resized.save(out_path)
            return

        # нестандартные пропорции — не пытаемся угадать, сохраняем оригинал
        # как есть, чтобы не испортить визуально; фронт сам впишет в рамку
        img.save(out_path)


def _base_and_core_icon_dirs() -> list[Path]:
    dirs = []
    base_icons = settings.factorio_game_path / "data" / "base" / "graphics" / "icons"
    if base_icons.exists():
        dirs.append(base_icons)
    core_icons = settings.factorio_game_path / "data" / "core" / "graphics" / "icons"
    if core_icons.exists():
        dirs.append(core_icons)
    return dirs


def sprite_url(icon_filename: str) -> str:
    return f"/assets/{icon_filename}"