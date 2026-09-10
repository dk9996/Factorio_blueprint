from PIL import Image
import os

SRC_DIR = "public/assets/icons"
OUT_DIR = "public/assets/icons-cropped"
ICON_SIZE = 64  # первый (самый крупный) кадр mip-полоски

os.makedirs(OUT_DIR, exist_ok=True)

processed = 0
skipped = 0

for filename in os.listdir(SRC_DIR):
    if not filename.endswith(".png"):
        continue

    path = os.path.join(SRC_DIR, filename)
    img = Image.open(path)

    if img.width < ICON_SIZE or img.height < ICON_SIZE:
        print(f"[skip] {filename} — меньше {ICON_SIZE}px, реальный размер {img.size}")
        skipped += 1
        continue

    cropped = img.crop((0, 0, ICON_SIZE, ICON_SIZE))
    cropped.save(os.path.join(OUT_DIR, filename))
    processed += 1

print(f"\nГотово: обработано {processed}, пропущено {skipped}")