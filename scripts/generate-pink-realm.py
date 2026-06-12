"""Generate pink_realm environment tiles from the cave tile set.

Reads the cave wall/floor PNGs, remaps their dark-green palette to an
ethereal pink palette (hue shift + midtone lift), and scatters soft
glowing motes so the realm reads as luminous rather than just recolored.

Run: python3 scripts/generate-pink-realm.py
"""
import colorsys
import random
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
WALL_DIR = ROOT / "public/images/wall"
FLOOR_DIR = ROOT / "public/images/floor"

PINK_HUE = 0.91  # magenta-pink
GLOW_COLOR = (255, 214, 240)


def pinkify(img: Image.Image, brighten: float) -> Image.Image:
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            _, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            # lift midtones so the realm glows instead of brooding
            v = min(1.0, v ** 0.72 * brighten + 0.10)
            s = min(1.0, s * 0.75 + 0.15)
            nr, ng, nb = colorsys.hsv_to_rgb(PINK_HUE, s, v)
            px[x, y] = (int(nr * 255), int(ng * 255), int(nb * 255), a)
    return img


def add_motes(img: Image.Image, seed: int, count: int) -> Image.Image:
    """Scatter soft 2x2 glowing motes with a faint 1px halo."""
    rng = random.Random(seed)
    px = img.load()
    w, h = img.size
    for _ in range(count):
        cx, cy = rng.randrange(2, w - 3), rng.randrange(2, h - 3)
        if px[cx, cy][3] == 0:
            continue
        for dx in range(-1, 3):
            for dy in range(-1, 3):
                x, y = cx + dx, cy + dy
                r, g, b, a = px[x, y]
                if a == 0:
                    continue
                core = 0 <= dx <= 1 and 0 <= dy <= 1
                t = 0.85 if core else 0.30
                px[x, y] = (
                    int(r + (GLOW_COLOR[0] - r) * t),
                    int(g + (GLOW_COLOR[1] - g) * t),
                    int(b + (GLOW_COLOR[2] - b) * t),
                    a,
                )
    return img


def convert(src: Path, dst: Path, brighten: float, seed: int, motes: int):
    img = Image.open(src)
    img = pinkify(img, brighten)
    img = add_motes(img, seed, motes)
    img.save(dst)
    print(f"{src.name} -> {dst.name}")


def main():
    for i, src in enumerate(sorted(WALL_DIR.glob("wall-[01][01][01][01].png"))):
        pattern = src.stem.split("-")[1]
        convert(src, WALL_DIR / f"pink-realm-wall-{pattern}.png",
                brighten=1.25, seed=100 + i, motes=10)
    convert(FLOOR_DIR / "floor-try-1.png", FLOOR_DIR / "pink-realm-floor.png",
            brighten=1.15, seed=7, motes=6)
    convert(FLOOR_DIR / "floor-1000.png", FLOOR_DIR / "pink-realm-floor-1000.png",
            brighten=1.15, seed=8, motes=6)


if __name__ == "__main__":
    main()
