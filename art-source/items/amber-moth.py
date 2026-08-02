#!/usr/bin/env python3
"""
Amber Moth sprite — a teardrop of amber with a moth caught inside, wings faintly alight.

Drawn on a 26x28 logical pixel grid then nearest-neighbour scaled 10x, matching the
chunky look of the shipped item sprites (snake-medalion.png is ~24 logical px at 15x).

The palette is deliberately warm gold: every other item sprite is in the cool blue family
(medallion, runes, shield), so the moth is instantly findable on a chest tile. The two
cool-cyan sparks on the wings are the only non-amber accent, so the eye lands on the moth
rather than the drop.

The teardrop is generated (circle + taper to an apex) rather than hand-typed so the moth
pattern below has predictable room inside it.
"""
import math
from PIL import Image

W, H = 26, 28
SCALE = 10
OUT = "public/images/items/amber-moth.png"

CLEAR = (0, 0, 0, 0)
OUTLINE = (58, 26, 11, 255)
# Warm amber ramp, shadow -> lit.
# Shifted bright on purpose: amber should look lit from within, and the extra luminance
# also buys contrast against the dark moth so the wings still read at a 32px tile.
RAMP = [
    (146, 74, 22, 255),
    (186, 103, 27, 255),
    (216, 134, 34, 255),
    (238, 165, 49, 255),
    (250, 197, 88, 255),
    (255, 226, 145, 255),
]
BODY = (44, 24, 33, 255)      # moth body + antennae, near-black plum
WING = (109, 60, 74, 255)     # wing membrane — light enough that the wing SHAPE reads,
                              # dark enough to sit clearly against the amber
SPARK = (168, 226, 233, 255)  # wing glimmer, the one cool accent in the sprite

# Bottom circle plus a taper up to the apex.
CX, CY, R = 12.5, 18.0, 8.6
APEX_Y = 1.0

def half_width(y: float) -> float:
    """Half-width of the drop at row y, or 0 outside it."""
    if y > CY:
        dy = y - CY
        if dy > R:
            return 0.0
        return math.sqrt(max(0.0, R * R - dy * dy))
    # Above the circle's centre: taper from full radius to the apex, easing so the
    # shoulders stay round instead of coming to a straight-sided cone.
    t = (CY - y) / (CY - APEX_Y)
    if t > 1.0:
        return 0.0
    return R * (1.0 - t ** 1.85)

inside = [[False] * W for _ in range(H)]
for y in range(H):
    hw = half_width(y + 0.5)
    for x in range(W):
        if abs((x + 0.5) - CX) <= hw:
            inside[y][x] = True

# A moth with wings spread: curled antennae, a dark body line down the middle, a broad
# upper wing pair and a narrower lower pair. 'b' body/antennae, 'w' wing membrane,
# 'g' spark, '.' leaves the amber showing through.
MOTH = [
    "..b.....b..",
    "...b...b...",
    "....bbb....",
    "..wwwbwww..",
    ".wgwwbwwgw.",
    "wwwwwbwwwww",
    ".wwwwbwwww.",
    "..wwwbwww..",
    "...wwbww...",
    "....bbb....",
    "...ww.ww...",
    "....w.w....",
]
MOTH_W = len(MOTH[0])
MOTH_H = len(MOTH)
for i, row in enumerate(MOTH):
    assert len(row) == MOTH_W, f"moth row {i} is {len(row)}, expected {MOTH_W}"

# Centre the moth horizontally, with its widest row a little above the drop's widest row
# so the amber reads as thicker below it (the moth floats in the drop rather than sinking).
MOTH_X0 = int(round(CX - MOTH_W / 2))
MOTH_Y0 = 9

moth_at = {}
for my, row in enumerate(MOTH):
    for mx, ch in enumerate(row):
        if ch == ".":
            continue
        moth_at[(MOTH_Y0 + my, MOTH_X0 + mx)] = {
            "b": BODY,
            "w": WING,
            "g": SPARK,
        }[ch]

def is_edge(y: int, x: int) -> bool:
    """Interior pixel touching the outside — where the outline goes."""
    if not inside[y][x]:
        return False
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        ny, nx = y + dy, x + dx
        if not (0 <= ny < H and 0 <= nx < W) or not inside[ny][nx]:
            return True
    return False


# Fail loudly on clipping: every moth pixel must land strictly inside the amber, never on
# the outline or outside the drop. An earlier draft silently lost both antennae and the
# wingtips this way, which only showed up by eye.
clipped = [
    (y, x)
    for (y, x) in moth_at
    if not (0 <= y < H and 0 <= x < W) or not inside[y][x] or is_edge(y, x)
]
if clipped:
    raise SystemExit(
        f"moth clipped at {len(clipped)} px (e.g. {clipped[:6]}) — "
        "shrink MOTH or move MOTH_Y0 toward the drop's centre"
    )

img = Image.new("RGBA", (W, H), CLEAR)
px = img.load()

for y in range(H):
    for x in range(W):
        if not inside[y][x]:
            continue
        if is_edge(y, x):
            px[x, y] = OUTLINE
            continue

        moth = moth_at.get((y, x))
        if moth is not None:
            px[x, y] = moth
            continue

        # Light from the upper right: shade by distance from that highlight point.
        lx, ly = CX + R * 0.55, CY - R * 0.75
        dist = math.hypot((x + 0.5) - lx, (y + 0.5) - ly)
        t = min(1.0, dist / (R * 2.0))
        idx = int(round((1.0 - t) * (len(RAMP) - 1)))
        px[x, y] = RAMP[max(0, min(len(RAMP) - 1, idx))]

img.resize((W * SCALE, H * SCALE), Image.NEAREST).save(OUT)
print(f"wrote {OUT} ({W * SCALE}x{H * SCALE})")
