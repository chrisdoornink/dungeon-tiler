#!/usr/bin/env python3
"""Clean up hand-cut sprite PNGs: stray specks, thin cut lines, light halos, shadow residue.

Most sprites here are upscaled pixel art that was cut out of a light background by hand. The cut
leaves junk that is much smaller than one "art pixel" (the upscaled block, 3-50 source px
depending on the sprite):

  1. Faint alpha dust        alpha < FAINT_ALPHA anywhere
  2. Grey residue            semi-transparent, colourless pixels (leftover drop shadows / backdrop)
  2b. Thick residue          semi-transparent patches reaching well beyond a 1-2px anti-alias rim
  3. Specks and cut lines    isolated crumbs, and dots/hairlines hugging the outline (e.g. the
                             ghost outline left where a flame was erased)
  4. Light halo              an outline shell much lighter than the art just inside it (the white
                             backdrop bleeding into the edge)
  5. Pinholes                tiny enclosed gaps where the cut punched through light interior pixels

Every threshold scales with the sprite's estimated art-pixel size, so a 20px-block hero and a
3px-block boss are both judged against their own grid. Real art is at least one block wide, so
removing anything thinner than ~30% of a block (or recolouring a lighter shell thinner than ~15%
of a block) cannot eat into a drawn feature. Recoloured pixels copy the nearest interior pixel
rather than an average, so no new colours appear and palette PNGs re-quantise losslessly.

Changed pixels need a NEW filename (CLAUDE.md, "Art assets"): write the result next to the
original as NAME-clean.png, move every reference, and delete the old file.

Usage:
  python3 scripts/clean-sprites.py IN.png OUT.png [--profile NAME] [--diag DIAG.png]
  python3 scripts/clean-sprites.py --batch MANIFEST.json     # [{in, out, profile?, ...}] entries

  --diag writes the original with removed pixels red and recoloured ones cyan: check it on every
  new sprite before shipping. Inputs under public/images pick up their per-file settings (or a
  refusal, for art that is meant to be translucent) from scripts/clean-sprites.config.json.

Profiles: "pixel" (default: every step), "soft" (art with deliberate particles or glow around it:
no opening, no thick-residue or pinhole steps), "effect" (sparkles/explosions: dust and tiny crumbs
only). --ground-shadow also removes an opaque drop shadow painted under an item; the config-only
"textured_backdrop" makes the backdrop-block step (3c) see through speckled backdrop cells.

Requires: pip install numpy scipy pillow   (and pngquant on PATH for palette-mode inputs)
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

FAINT_ALPHA = 10          # alpha below this is invisible dust -> 0
GREY_MAX_ALPHA = 200      # "semi-transparent" for the grey-residue rule
GREY_MAX_CHROMA = 28      # max(R,G,B)-min(R,G,B) at or below this counts as colourless
HALO_LUM_DELTA = 38       # shell pixel this much lighter than the interior = halo


def luminance(rgb):
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def estimate_art_px(a):
    """Estimate the upscaled pixel-art block size from the periodicity of colour edges."""
    rgb = a[..., :3].astype(np.float64)
    opaque = a[..., 3] >= 200
    lags = []
    for axis in (1, 0):
        d = np.abs(np.diff(rgb, axis=axis)).sum(-1)
        if axis == 1:
            both = opaque[:, 1:] & opaque[:, :-1]
        else:
            both = opaque[1:, :] & opaque[:-1, :]
        prof = (d * both).sum(axis=1 - axis)
        cnt = both.sum(axis=1 - axis)
        valid = cnt > 5
        if valid.sum() < 16:
            continue
        prof = prof / np.maximum(cnt, 1)
        p = np.where(valid, prof - prof[valid].mean(), 0.0)
        n = len(p)
        denom = (p * p).sum() + 1e-9
        ac = np.array([(p[:-L] * p[L:]).sum() / denom for L in range(1, min(80, n // 3))])
        for i in range(2, len(ac) - 1):
            if ac[i] > ac[i - 1] and ac[i] >= ac[i + 1] and ac[i] > 0.12:
                lags.append(i + 1)
                break
    if not lags:
        return max(3, round(max(a.shape[:2]) / 40))
    return min(lags)


def square(k):
    return np.ones((k, k), dtype=bool)


def drop_crumbs(vis, min_area):
    """Remove 8-connected components smaller than min_area pixels."""
    lab, n = ndi.label(vis, structure=square(3))
    if not n:
        return vis
    sizes = ndi.sum(vis, lab, index=np.arange(1, n + 1))
    tiny = np.zeros(n + 1, dtype=bool)
    tiny[1:] = sizes < min_area
    return vis & ~tiny[lab]


def clean(a, profile="pixel", art_px=None, ground_shadow=False, textured_backdrop=False):
    """Return (cleaned RGBA uint8 array, stats dict, removed mask, recoloured mask).

    Profiles:
      pixel   hard-edged pixel art: every step below
      soft    art with deliberate particles/glow around it: dust, grey residue, crumbs
              well under a block, light halo; no opening (it would eat the particles)
      effect  sparkles/explosions/rings: dust and crumbs of a few pixels only
    """
    a = a.copy()
    h, w = a.shape[:2]
    rgb = a[..., :3].astype(np.int32)
    alpha = a[..., 3].astype(np.int32)
    orig_rgb = rgb.copy()
    orig_alpha = alpha.copy()
    orig_vis = alpha > 0
    px = art_px or estimate_art_px(a)
    chroma = rgb.max(-1) - rgb.min(-1)

    # 1. Faint alpha dust.
    alpha[alpha < FAINT_ALPHA] = 0

    if profile in ("pixel", "soft"):
        # 2. Grey residue: semi-transparent and colourless.
        grey = (alpha > 0) & (alpha < GREY_MAX_ALPHA) & (chroma <= GREY_MAX_CHROMA)
        alpha[grey] = 0

    vis = alpha > 0

    if ground_shadow:
        # Opaque drop shadow painted under an item (the generator's, not ours): the colourless
        # region that reaches the bottom of the sprite. Anything it leaves behind is crumbs.
        ys = np.nonzero(vis.any(1))[0]
        bottom = ys.max() - int((ys.max() - ys.min()) * 0.12)
        low = vis & (chroma <= 34)
        lab, n = ndi.label(low, structure=square(3))
        if n:
            hits = np.unique(lab[bottom:][low[bottom:]])
            vis &= ~np.isin(lab, hits[hits > 0])
        # The shadow picks up the item's tint near it, so tinted scraps survive the colourless
        # test; they float free of the item once the rest is gone. Keep only the item itself.
        lab, n = ndi.label(vis, structure=square(3))
        if n > 1:
            sizes = ndi.sum(vis, lab, index=np.arange(1, n + 1))
            big = np.zeros(n + 1, dtype=bool)
            big[1:] = sizes >= 0.1 * sizes.max()
            vis &= big[lab]

    if profile == "pixel":
        # 2b. Thick residue: anti-aliasing is a 1-2px semi-transparent rim hugging solid art, but
        # leftover backdrop/shadow is a semi-transparent patch reaching well away from it. Measure
        # distance from the solid core (opened, so scattered opaque noise inside a patch doesn't
        # count as core) and drop semi-transparent pixels beyond the rim width.
        k = int(np.clip(round(px * 0.3), 2, 9))
        core = ndi.binary_opening(vis & (alpha >= 230), structure=square(k))
        partial = vis & (alpha < 230)
        if core.any():
            far = ndi.distance_transform_edt(~core) > max(2.0, px * 0.15)
            vis &= ~(partial & far)

    if profile in ("pixel", "soft"):
        # 3a. Isolated crumbs: components far smaller than one art block.
        scale = 0.55 if profile == "pixel" else 0.3
        vis = drop_crumbs(vis, max(4, int((px * scale) ** 2)))
    else:
        vis = drop_crumbs(vis, 9)

    if profile == "pixel":
        # 3b. Hairlines and specks hugging the outline: morphological opening with a square a
        # fraction of a block wide. Square openings preserve block corners exactly, so only
        # sub-block slivers go. Then sweep crumbs the opening orphaned.
        vis = ndi.binary_opening(vis, structure=square(k))
        vis = drop_crumbs(vis, max(4, int((px * 0.55) ** 2)))

        # 3c. Backdrop blocks: whole opaque cells of the light backdrop left standing outside the
        # dark outline, typically in the notch where a rounded outline turns a corner. Signature:
        # a light, nearly colourless patch (at most a couple of blocks) whose surroundings are
        # only dark outline and transparency. Drawn light details (highlights, eyes, blade tips)
        # touch other art colours, or no transparency at all.
        lum = luminance(rgb)
        light = vis & (lum > 115) & (chroma < 70)
        lab, n = ndi.label(light, structure=square(3))
        if n:
            ring_w = max(2, int(round(px * 0.25)))
            sizes = ndi.sum(light, lab, index=np.arange(1, n + 1))
            boxes = ndi.find_objects(lab)
            drop = np.zeros_like(vis)
            for i in np.nonzero((sizes <= 2.0 * px * px) & (sizes >= 4))[0]:
                sy, sx = boxes[i]
                y0, y1 = max(0, sy.start - ring_w), min(h, sy.stop + ring_w)
                x0, x1 = max(0, sx.start - ring_w), min(w, sx.stop + ring_w)
                comp = lab[y0:y1, x0:x1] == i + 1
                ring = ndi.binary_dilation(comp, structure=square(2 * ring_w + 1)) & ~comp
                total = ring.sum()
                if not total:
                    continue
                v = vis[y0:y1, x0:x1]
                clear = (ring & ~v).sum() / total
                other = (ring & v & (lum[y0:y1, x0:x1] >= 70)).sum() / total
                if clear > 0.2 and other < 0.1:
                    drop[y0:y1, x0:x1] |= comp
            vis &= ~drop
            vis = drop_crumbs(vis, max(4, int((px * 0.55) ** 2)))

        if textured_backdrop:
            # 3d. Speckled backdrop blocks (per-file opt-in): dark grains through the light cells
            # shatter 3c's light mask into crumbs that each look ringed by art. Seed from the light
            # crumbs, grow over everything that is not dark outline (4-connected, so the outline's
            # diagonal corners hold), and drop a grown region only if it stays small, light and
            # colourless and touches transparency. A seed that leaks into the body grows huge and
            # is left alone.
            seeds = vis & (lum > 115) & (chroma < 70)
            cells, _ = ndi.label(vis & (lum >= 60))
            drop = np.zeros_like(vis)
            for i in np.unique(cells[seeds]):
                if i == 0:
                    continue
                region = cells == i
                size = region.sum()
                if size > 3.0 * px * px or size < px:
                    continue
                if lum[region].mean() < 110 or chroma[region].mean() > 60:
                    continue
                edge = ndi.binary_dilation(region, structure=square(3)) & ~region
                if (edge & ~vis).sum() / max(1, edge.sum()) < 0.15:
                    continue
                drop |= region
            if drop.any():
                vis &= ~drop
                vis = ndi.binary_opening(vis, structure=square(k))
                vis = drop_crumbs(vis, max(4, int((px * 0.55) ** 2)))

    recolour = np.zeros_like(vis)
    if profile in ("pixel", "soft"):
        # 4. Light halo: outer shell much lighter than the nearest interior pixel. Recolour it with
        # that interior pixel (keeps the silhouette, adds no new colours).
        b = int(np.clip(round(px * 0.15), 1, 4))
        depth = ndi.distance_transform_edt(vis)
        shell = vis & (depth <= b)
        inner = vis & (depth > b + 0.5)
        if inner.any() and shell.any():
            _, (iy, ix) = ndi.distance_transform_edt(~inner, return_indices=True)
            ref_rgb = rgb[iy, ix]
            # Only trust a reference that is actually close (within ~half a block).
            near = np.hypot(iy - np.arange(h)[:, None], ix - np.arange(w)[None, :]) <= b + max(3, px * 0.5)
            halo = shell & near & (luminance(rgb) > luminance(ref_rgb) + HALO_LUM_DELTA)
            rgb[halo] = ref_rgb[halo]
            recolour = halo

    if profile == "pixel":
        # 5. Pinholes: tiny enclosed transparent gaps where the original cut punched through light
        # interior pixels. Fill from the nearest surviving pixel, fully opaque.
        holes = ndi.binary_fill_holes(vis) & ~vis
        if holes.any():
            lab, n = ndi.label(holes)
            sizes = ndi.sum(holes, lab, index=np.arange(1, n + 1))
            small = np.zeros(n + 1, dtype=bool)
            # Well under a block: a real gap in the art is at least one whole block.
            small[1:] = sizes < max(2, (0.35 * px) ** 2)
            fill = small[lab]
            if fill.any():
                _, (iy, ix) = ndi.distance_transform_edt(~vis, return_indices=True)
                rgb[fill] = rgb[iy, ix][fill]
                alpha[fill] = 255
                vis |= fill
                recolour |= fill

    alpha[~vis] = 0
    removed = orig_vis & (alpha == 0)
    out = np.dstack([rgb, alpha]).astype(np.uint8)
    # Keep fully transparent pixels' RGB at 0 so they compress well.
    out[out[..., 3] == 0, :3] = 0

    # How much a viewer can actually see changed, in "fully opaque pixel" units: removed pixels
    # weighted by their old opacity, recoloured ones by their luminance shift.
    seen = orig_alpha[removed].sum() / 255.0
    changed = recolour & vis
    seen += (np.abs(luminance(rgb) - luminance(orig_rgb))[changed] * alpha[changed] / 255.0).sum() / 255.0
    stats = {
        "art_px": int(px),
        "removed": int(removed.sum()),
        "recoloured": int(recolour.sum()),
        "visible": int(orig_vis.sum()),
        "seen": round(float(seen), 1),
    }
    return out, stats, removed, recolour


def diag_image(orig, removed, recolour):
    """Original over dark grey, removed pixels red, recoloured pixels cyan."""
    base = Image.new("RGBA", (orig.shape[1], orig.shape[0]), (30, 35, 30, 255))
    base.alpha_composite(Image.fromarray(orig))
    d = np.array(base)
    d[removed] = (255, 0, 0, 255)
    d[recolour] = (0, 255, 255, 255)
    return Image.fromarray(d)


def save(out, dst, palette_source):
    img = Image.fromarray(out)
    if palette_source and shutil.which("pngquant"):
        with tempfile.TemporaryDirectory() as td:
            tmp = os.path.join(td, "in.png")
            img.save(tmp, optimize=True)
            res = subprocess.run(
                ["pngquant", "--quality=90-100", "--speed", "1", "--nofs", "--strip",
                 "--force", "--output", dst, tmp],
                capture_output=True,
            )
            if res.returncode == 0:
                return
    img.save(dst, optimize=True)


def run_one(src, dst, profile="pixel", diag=None, art_px=None, ground_shadow=False,
            textured_backdrop=False):
    im = Image.open(src)
    was_palette = im.mode == "P"
    a = np.array(im.convert("RGBA"))
    out, stats, removed, recolour = clean(a, profile, art_px, ground_shadow, textured_backdrop)
    save(out, dst, was_palette)
    if diag:
        diag_image(a, removed, recolour).save(diag)
    return stats


CONFIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "clean-sprites.config.json")


def config_for(src):
    """Per-file settings for a file under public/images (keyed by its pre-clean name)."""
    marker = os.sep + os.path.join("public", "images") + os.sep
    full = os.path.abspath(src)
    if marker not in full or not os.path.exists(CONFIG):
        return None, {}
    rel = full.split(marker, 1)[1].replace(os.sep, "/")
    rel = rel.replace("-clean.png", ".png")
    with open(CONFIG) as fh:
        cfg = json.load(fh)
    return rel in cfg.get("skip", []), cfg.get("files", {}).get(rel, {})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", nargs="?")
    ap.add_argument("dst", nargs="?")
    ap.add_argument("--profile", choices=["pixel", "soft", "effect"])
    ap.add_argument("--art-px", type=int)
    ap.add_argument("--ground-shadow", action="store_true")
    ap.add_argument("--diag")
    ap.add_argument("--batch")
    args = ap.parse_args()
    if args.batch:
        with open(args.batch) as fh:
            jobs = json.load(fh)
        for job in jobs:
            stats = run_one(job["in"], job["out"], job.get("profile", "pixel"),
                            job.get("diag"), job.get("art_px"), job.get("ground_shadow", False),
                            job.get("textured_backdrop", False))
            print(json.dumps({"in": job["in"], **stats}), flush=True)
        return
    if not (args.src and args.dst):
        ap.error("need SRC and DST (or --batch)")
    skip, conf = config_for(args.src)
    if skip:
        sys.exit(f"{args.src} is on the skip list in {CONFIG} (meant to be translucent/feathered)")
    print(json.dumps(run_one(
        args.src, args.dst,
        args.profile or conf.get("profile", "pixel"),
        args.diag,
        args.art_px or conf.get("art_px"),
        args.ground_shadow or conf.get("ground_shadow", False),
        conf.get("textured_backdrop", False),
    )))


if __name__ == "__main__":
    sys.exit(main())
