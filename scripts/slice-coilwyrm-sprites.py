"""
Slice the Coilwyrm sprite sheet into individual, TILING game assets.

The hard requirement is geometric, not artistic: for the coil to read as one creature, every
body/corner piece must present the tube at the SAME diameter, centred on the tile edge, and
running right off that edge. So each piece is measured, scaled so its connecting arm(s) hit a
single global diameter D, and translated so each arm's centreline lands on the tile-edge
midpoint. Arms that fall short of the edge are extended by repeating their end scanline.

Usage:  python3 scripts/slice-coilwyrm-sprites.py
Reads   public/images/enemies/bosses/coilwyrm/sprites-source.png  (the sheet as generated)
Writes  public/images/enemies/bosses/coilwyrm/coilwyrm-*.png      (the tiling game assets)

Requires Pillow. Re-run after regenerating the sheet; the BOXES table below is measured from
the sheet by connected-component analysis, so a re-generated sheet with a different layout
needs those boxes re-measured (see the git history of this file for the analysis script).
"""
from PIL import Image
import os

TILE = 512
D = int(os.environ.get("D", 288))          # tube diameter in tile space
BAND = ((TILE - D) // 2, (TILE - D) // 2 + D)
TAIL_LEN = int(TILE * 0.86)                # tails stop short of the far edge

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(HERE, "public/images/enemies/bosses/coilwyrm")
SHEET = os.path.join(ART, "sprites-source.png")
OUT = os.environ.get("OUT", ART)
os.makedirs(OUT, exist_ok=True)

# Measured from the sheet. NOTE: the sheet's own labels for the four corners are unreliable —
# these names are assigned from the MEASURED connecting edges, not from the printed captions.
BOXES = {
    "head-front": (116, 12, 350, 315), "head-back": (505, 12, 739, 317),
    "head-side": (869, 78, 1332, 279), "body-h": (19, 447, 350, 573),
    "body-v": (432, 383, 562, 632), "corner-ne": (651, 405, 816, 606),
    "corner-nw": (858, 405, 1030, 606), "corner-se": (1086, 405, 1253, 606),
    "corner-sw": (1332, 405, 1470, 606), "tail-down": (273, 701, 418, 943),
    "tail-right": (583, 764, 858, 912), "tail-up": (1021, 706, 1167, 946),
}
_sheet = Image.open(SHEET).convert("RGB")

def load(n):
    """Crop one sprite off the sheet and key the flat background out to transparency."""
    x0, y0, x1, y1 = BOXES[n]
    img = _sheet.crop((x0, y0, x1 + 1, y1 + 1)).convert("RGBA")
    p = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = p[x, y]
            # Background is near-neutral and very bright; the tan art always has an R>G>B spread.
            if max(r, g, b) - min(r, g, b) < 10 and min(r, g, b) > 238:
                p[x, y] = (0, 0, 0, 0)
    return img

def tight(im):
    b = im.getbbox()
    return im.crop(b) if b else im

def trim_ragged(im, edges, frac=0.9):
    """Walk in from each named edge while its cross-section is much thinner than the piece's
    fattest — the sheet has a stray column or two of loose pixels at some ends, and stretching
    those to a tile edge is what makes two straights meet with a visible step."""
    p = im.load(); w, h = im.size
    cols = [len([y for y in range(h) if p[x, y][3] > 0]) for x in range(w)]
    rows = [len([x for x in range(w) if p[x, y][3] > 0]) for y in range(h)]
    x0, x1, y0, y1 = 0, w - 1, 0, h - 1
    cmax, rmax = max(cols) or 1, max(rows) or 1
    if "left" in edges:
        while x0 < x1 and cols[x0] < frac * cmax: x0 += 1
    if "right" in edges:
        while x1 > x0 and cols[x1] < frac * cmax: x1 -= 1
    if "top" in edges:
        while y0 < y1 and rows[y0] < frac * rmax: y0 += 1
    if "bottom" in edges:
        while y1 > y0 and rows[y1] < frac * rmax: y1 -= 1
    return im.crop((x0, y0, x1 + 1, y1 + 1))

def trim_fringe(im, edges, ratio=1.2, max_depth=4):
    """Walk in from each named edge while its line of pixels is anomalously BRIGHT.

    The sheet cuts each piece's arms mid-tube and leaves a pale anti-aliased line on the cut.
    trim_ragged cannot see it — the fringe spans the arm's full width, so it never looks "thin",
    and a corner's fattest cross-section is the bend, so the 0.9 threshold would eat the arms.
    But corners get scaled ~2.6x to reach the global diameter, which magnifies one pale source
    column into a 5px bar of near-white straight across the body. Compare each edge line's mean
    brightness against a reference band just inside it instead."""
    p = im.load(); w, h = im.size
    bounds = {"left": 0, "top": 0, "right": w - 1, "bottom": h - 1}
    inward = {"left": 1, "top": 1, "right": -1, "bottom": -1}
    for edge in edges:
        vertical = edge in ("left", "right")

        def mean(i):
            if not 0 <= i < (w if vertical else h):
                return None
            px = ((p[i, y] for y in range(h)) if vertical else (p[x, i] for x in range(w)))
            vals = [sum(c[:3]) / 3 for c in px if c[3] > 0]
            return sum(vals) / len(vals) if vals else None

        d, start = inward[edge], bounds[edge]
        inner = [v for v in (mean(start + d * k) for k in range(5, 11)) if v is not None]
        if not inner:
            continue
        ref = sum(inner) / len(inner)
        cut = 0
        while cut < max_depth:
            m = mean(start + d * cut)
            if m is None or m <= ratio * ref:
                break
            cut += 1
        bounds[edge] = start + d * cut
    return im.crop((bounds["left"], bounds["top"], bounds["right"] + 1, bounds["bottom"] + 1))

def trim_taper(im, edges, tol=0.94, probe=6, max_depth=40):
    """Walk in from each named edge while its cross-section is THINNER than the tube just inside.

    The sheet crops each head partway along its neck, so the outermost columns are the neck
    already curving away: head-side presented 251px at the tile boundary against a 286px body.
    With a one-segment coil — head plus tail cap, no body tile between them — that is the ONLY
    seam on screen, and it reads as the tail being fatter than the creature it is attached to.

    Distinct from trim_ragged, which compares against the piece's FATTEST cross-section. A skull
    is far wider than its neck, so any threshold strict enough to catch this taper eats the whole
    neck (that is why heads trim at frac=0.3). Comparing against the neighbouring band instead
    measures the neck against ITSELF."""
    p = im.load(); w, h = im.size

    def thick(edge, i):
        if edge in ("top", "bottom"):
            if not 0 <= i < h:
                return None
            return len([x for x in range(w) if p[x, i][3] > 0])
        if not 0 <= i < w:
            return None
        return len([y for y in range(h) if p[i, y][3] > 0])

    bounds = {"left": 0, "top": 0, "right": w - 1, "bottom": h - 1}
    inward = {"left": 1, "top": 1, "right": -1, "bottom": -1}
    for edge in edges:
        d, start = inward[edge], bounds[edge]
        ref = thick(edge, start + d * probe)
        if not ref:
            continue
        cut = 0
        while cut < max_depth:
            t = thick(edge, start + d * cut)
            if t is None or t >= tol * ref:
                break
            cut += 1
        bounds[edge] = start + d * cut
    return im.crop((bounds["left"], bounds["top"], bounds["right"] + 1, bounds["bottom"] + 1))

def span_at(im, edge, inset=2):
    """(lo, hi) of opaque pixels along `edge`, sampled `inset` in to dodge 1px bbox slop."""
    p = im.load(); w, h = im.size
    if edge in ("top", "bottom"):
        y = inset if edge == "top" else h - 1 - inset
        idx = [x for x in range(w) if p[x, y][3] > 0]
    else:
        x = inset if edge == "left" else w - 1 - inset
        idx = [y for y in range(h) if p[x, y][3] > 0]
    return (min(idx), max(idx)) if idx else None

def extend_to_edges(im, edges):
    """Grow an arm out to the canvas edge when the source art falls short.

    REFLECTS the adjacent band rather than repeating one scanline. Repeating smeared a single
    row/column of plate across the gap, and on body-corner-se that gap is 34px — which rendered
    as a flat white bar straight across the body. A reflection carries the rib pattern out with
    it, so the filler reads as more tube.
    """
    p = im.load()
    w, h = im.size

    def first_content(seq_len, sample):
        return next((i for i in range(seq_len) if sample(i)), None)

    for edge in edges:
        if edge in ("top", "bottom"):
            row_has = lambda y: any(p[x, y][3] > 0 for x in range(w))
            if edge == "top":
                src = first_content(h, row_has)
                if not src:
                    continue
                for i in range(src):
                    mirror = min(h - 1, src + (src - i))  # reflect about the content edge
                    for x in range(w):
                        p[x, i] = p[x, mirror]
            else:
                src = next((y for y in range(h - 1, -1, -1) if row_has(y)), None)
                if src is None or src >= h - 1:
                    continue
                for i in range(src + 1, h):
                    mirror = max(0, src - (i - src))
                    for x in range(w):
                        p[x, i] = p[x, mirror]
        else:
            col_has = lambda x: any(p[x, y][3] > 0 for y in range(h))
            if edge == "left":
                src = first_content(w, col_has)
                if not src:
                    continue
                for i in range(src):
                    mirror = min(w - 1, src + (src - i))
                    for y in range(h):
                        p[i, y] = p[mirror, y]
            else:
                src = next((x for x in range(w - 1, -1, -1) if col_has(x)), None)
                if src is None or src >= w - 1:
                    continue
                for i in range(src + 1, w):
                    mirror = max(0, src - (i - src))
                    for y in range(h):
                        p[i, y] = p[mirror, y]
    return im


def straight(name, axis):
    """A straight run: stretched to span the tile on `axis`, pinned to the band on the other."""
    im = tight(load(name))
    ends = ["left", "right"] if axis == "h" else ["top", "bottom"]
    im = trim_fringe(trim_ragged(im, ends), ends)
    size = (TILE, D) if axis == "h" else (D, TILE)
    im = im.resize(size, Image.NEAREST)
    out = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    out.paste(im, (0, BAND[0]) if axis == "h" else (BAND[0], 0))
    return out

def corner(name, edges, mirror=False):
    """Two arms: scale to the global diameter, then slide each arm's centre onto a tile-edge
    midpoint. Whatever the bend does in between is art we simply keep."""
    im = tight(load(name))
    if mirror:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
        edges = [{"left": "right", "right": "left"}.get(e, e) for e in edges]
    im = tight(trim_fringe(im, edges))
    w, h = im.size
    arms = {e: span_at(im, e) for e in edges}
    diam = sum((s[1] - s[0] + 1) for s in arms.values()) / len(arms)
    s = D / diam
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    im = im.resize((nw, nh), Image.NEAREST)
    # Slide each arm's centre (in the scaled image) onto the tile centre on its own axis.
    dx = dy = 0
    for e, sp in arms.items():
        c = ((sp[0] + sp[1]) / 2 + 0.5) * s
        if e in ("top", "bottom"):
            dx = round(TILE / 2 - c)
        else:
            dy = round(TILE / 2 - c)
    out = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    out.paste(im, (dx, dy))
    return extend_to_edges(out, edges)

def tail(name, edge):
    im = tight(trim_fringe(load(name), [edge]))
    if edge in ("left", "right"):
        im = im.resize((TAIL_LEN, D), Image.NEAREST)
        pos = (0, BAND[0]) if edge == "left" else (TILE - TAIL_LEN, BAND[0])
    else:
        im = im.resize((D, TAIL_LEN), Image.NEAREST)
        pos = (BAND[0], 0) if edge == "top" else (BAND[0], TILE - TAIL_LEN)
    out = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    out.paste(im, pos)
    return out

def head(name, neck_edge, trim=None, cap=None):
    """Heads connect on ONE edge (the neck). Fit the whole skull in the tile, then align the
    neck's centre and opening to that edge. `trim` drops trailing body tube the body tiles
    already provide; `cap` closes an end that should read as blunt."""
    im = tight(load(name))
    if trim:
        w, h = im.size
        im = tight(im.crop(trim(w, h)))
    # Clean the neck end before anything scales it: a stray sliver there becomes the whole
    # join with the body. A LOW threshold here on purpose — a head's skull is far wider than
    # its neck, so the straight-piece threshold (0.9) walks straight past the neck and eats it.
    im = trim_fringe(trim_ragged(im, [neck_edge], frac=0.3), [neck_edge])
    # Cut back to the neck's full diameter so it meets the body flush (see trim_taper).
    im = trim_taper(im, [neck_edge])
    if cap:
        im = cap(im)
    w, h = im.size
    # Scale by the NECK, so the head's neck matches the body tube it joins — then clamp so the
    # skull still fits the tile. Clamping can only make the neck narrower than the body, which
    # reads as a skull tapering into its neck; a neck WIDER than the body reads as a mistake.
    src_neck = span_at(im, neck_edge)
    s = min(D / (src_neck[1] - src_neck[0] + 1), TILE / w, TILE / h)
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    im = im.resize((nw, nh), Image.NEAREST)
    sp = span_at(im, neck_edge)
    out = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    if neck_edge in ("top", "bottom"):
        dx = round(TILE / 2 - (sp[0] + sp[1] + 1) / 2)
        dy = 0 if neck_edge == "top" else TILE - nh
    else:
        dy = round(TILE / 2 - (sp[0] + sp[1] + 1) / 2)
        dx = 0 if neck_edge == "left" else TILE - nw
    out.paste(im, (dx, dy))
    return extend_to_edges(out, [neck_edge]), (sp[1] - sp[0] + 1)

OUTLINE = (74, 56, 74, 255)

def cap_top(im, rows=8):
    """Paint the outline colour across the top of the silhouette: a blunt, closed end."""
    p = im.load(); w, h = im.size
    for x in range(w):
        top = next((y for y in range(h) if p[x, y][3] > 0), None)
        if top is None: continue
        for y in range(top, min(h, top + rows)):
            p[x, y] = OUTLINE
    return im

jobs = {
    "coilwyrm-body-h": lambda: straight("body-h", "h"),
    "coilwyrm-body-v": lambda: straight("body-v", "v"),
    # Source labels are unreliable; these are assigned from MEASURED connecting edges.
    "coilwyrm-body-corner-ne": lambda: corner("corner-ne", ["top", "right"]),
    "coilwyrm-body-corner-nw": lambda: corner("corner-nw", ["top", "right"], mirror=True),
    "coilwyrm-body-corner-se": lambda: corner("corner-sw", ["bottom", "right"]),
    "coilwyrm-body-corner-sw": lambda: corner("corner-se", ["bottom", "left"]),
    "coilwyrm-tail-down": lambda: tail("tail-down", "top"),
    "coilwyrm-tail-up": lambda: tail("tail-up", "bottom"),
    "coilwyrm-tail-right": lambda: tail("tail-right", "left"),
    "coilwyrm-tail-left": lambda: tail("tail-right", "left").transpose(Image.FLIP_LEFT_RIGHT),
}

for name, fn in jobs.items():
    img = fn()
    img.save(os.path.join(OUT, f"{name}.png"))
    print(f"  {name}")

# Heads. head-side carries a long stretch of plain body the body tiles already draw, so the
# tile is cropped to the skull. head-back's crown wrongly continued off the top as more tube;
# it is cut back to the ribbed dome and capped so it reads as the back of a skull.
hf, nf = head("head-front", "top")
hf.save(os.path.join(OUT, "coilwyrm-head-front.png"))
hb, nb = head("head-back", "bottom", trim=lambda w, h: (0, 100, w, h), cap=cap_top)
hb.save(os.path.join(OUT, "coilwyrm-head-back.png"))
hs, ns = head("head-side", "left", trim=lambda w, h: (int(w * 0.46), 0, w, h))
hs.save(os.path.join(OUT, "coilwyrm-head-side.png"))
print(f"  heads: neck widths front={nf} back={nb} side={ns} (target D={D})")
