// Prepares the hand-drawn Fisher art for use as game sprites.
//
// The source files are 1024/1536-wide renders on an OPAQUE grey-brown gradient with a
// baked contact shadow, and the bird sits at a different height in each one. Sprites in
// this game are drawn as `background-image: contain` on a 40px tile and planted with
// `transform-origin: 50% 100%`, so they must be transparent, tightly cropped, and share a
// common baseline or the bird will bob between poses as it turns.
//
// Steps per file:
//   1. Flood-fill the background to transparent, starting from the border. The fill
//      compares each pixel to the one it CAME FROM rather than to a fixed seed colour, so
//      it walks the smooth gradient and the warm halo without a hand-tuned key colour, and
//      halts at the bird's hard black outline (a large delta).
//   2. Drop the baked contact shadow: any remaining opaque pixel that is dark AND
//      desaturated AND sits below the bird's lowest coloured pixel.
//   3. Crop to the bird's bounding box.
//   4. Re-canvas every pose to ONE square size, horizontally centred, feet flush to the
//      bottom edge — the normalisation step that fixes the differing feet heights.
//
// Usage: node prep_fisher.js [--dry]
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const SRC = path.join(REPO, "art-source/bosses/fisher");
const OUT = path.join(REPO, "public/images/enemies/bosses/fisher");
const DRY = process.argv.includes("--dry");

/** Final canvas for every pose. Square keeps `contain` scaling identical across poses. */
const CANVAS = 512;
/** Breathing room above the bird so a tall pose isn't clipped by the tile edge. */
const TOP_PAD = 6;

// The background is a heavy vignette — measured luma runs from ~197 at the frame edge down
// to ~33 right beside the bird — so no single key colour works, and a colour-distance walk
// leaks straight through the silhouette (it crossed the outline and ate the birds on the
// first attempt: background at luma 37 is only ~13 from the outline at ~24).
//
// What IS clean is the outline itself: the bird is drawn with a near-pure-BLACK contour
// (luma ~0-10) while the background never drops below 33 in any of the seven files. So the
// fill treats dark pixels as walls and floods everything else reachable from the frame
// edge. Nothing about the vignette matters after that.
// Local-contrast threshold that separates the bird's hard pixel edges from the smooth
// backdrop and its blurred shadow.
const CONTRAST_MIN = 16;
// Closing radius. Must exceed half the art's pixel-block size so flat interior blocks fill
// in, and it also seals the gaps in the black outline that defeated the flood-fill attempt.
const CLOSE_R = 7;
// Sanity band for what's left after the fill, as a fraction of the frame. Under this and
// the fill leaked through a gap in the outline; over it and it barely ran.
const KEEP_MIN = 0.01;
const KEEP_MAX = 0.35;
// Shadow test: dark and near-grey.
const SHADOW_MAX_LUMA = 105;
const SHADOW_MAX_CHROMA = 42;

async function load(file) {
  const img = sharp(path.join(SRC, file));
  const { width, height } = await img.metadata();
  const data = await img.ensureAlpha().raw().toBuffer();
  return { data, width, height };
}

/** Separable 1D dilation/erosion of a boolean mask by `r` (square kernel, side 2r+1). */
function morph(mask, width, height, r, dilate) {
  const pass = (src, w, h, stride, step) => {
    const out = new Uint8Array(src.length);
    for (let a = 0; a < h; a++) {
      let count = 0;
      const base = a * stride;
      // Prime the window over [0, r]
      for (let b = 0; b <= Math.min(r, w - 1); b++) count += src[base + b * step];
      for (let b = 0; b < w; b++) {
        out[base + b * step] = dilate ? (count > 0 ? 1 : 0) : (count === 2 * r + 1 ? 1 : 0);
        const add = b + r + 1;
        const rem = b - r;
        if (add < w) count += src[base + add * step];
        if (rem >= 0) count -= src[base + rem * step];
        // Erosion must treat off-image as unset, which the window naturally does by
        // never reaching the full 2r+1 count near the edges.
      }
    }
    return out;
  };
  const h1 = pass(mask, width, height, width, 1); // horizontal
  return pass(h1, height, width, 1, width); // vertical
}

/** Largest 4-connected component of a boolean mask, as a new mask. */
function largestComponent(mask, width, height) {
  const label = new Int32Array(width * height).fill(-1);
  let best = -1;
  let bestSize = 0;
  let next = 0;
  const stack = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || label[s] !== -1) continue;
    const id = next++;
    let size = 0;
    stack.push(s);
    label[s] = id;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % width;
      const y = (p / width) | 0;
      const push = (nx, ny) => {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
        const q = ny * width + nx;
        if (!mask[q] || label[q] !== -1) return;
        label[q] = id;
        stack.push(q);
      };
      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }
    if (size > bestSize) {
      bestSize = size;
      best = id;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let p = 0; p < mask.length; p++) if (label[p] === best) out[p] = 1;
  return out;
}

/**
 * Cut the bird out of its backdrop using TEXTURE, not colour.
 *
 * Colour cannot separate these images. The backdrop is a heavy vignette (luma ~197 at the
 * frame edge down to ~33 beside the bird) so there is no key colour, a colour-distance walk
 * leaks straight through the silhouette, and a "flood until you hit the black outline"
 * barrier fails too because the outlines are NOT closed — for five of the seven poses the
 * fill found a gap, got inside, and ate everything brighter than the outline.
 *
 * What is unambiguous is FREQUENCY. The bird is chunky pixel art: hard block edges and
 * dithering everywhere. The backdrop is a smooth gradient with essentially zero local
 * contrast, and the baked contact shadow is a soft blur — also smooth. So:
 *   1. local contrast (max |luma delta| against neighbours a few px out) -> high on the
 *      bird, ~0 on the backdrop and its shadow
 *   2. morphological CLOSE to solidify the bird's flat interior blocks, which are
 *      individually low-contrast but always ringed by edges
 *   3. keep the largest connected component, dropping stray specks of film grain
 * The soft shadow falls out for free, since a blur has no high-frequency content.
 */
function clearBackground({ data, width, height }) {
  const n = width * height;
  const luma = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    luma[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  // 1. Local contrast against neighbours at a few offsets (cheap stand-in for a full
  // window max/min; the art's blocks are ~8px at this resolution so ±3 straddles an edge).
  const mask = new Uint8Array(n);
  const offs = [1, 3, 5];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const c = luma[p];
      let peak = 0;
      for (const o of offs) {
        if (x - o >= 0) peak = Math.max(peak, Math.abs(c - luma[p - o]));
        if (x + o < width) peak = Math.max(peak, Math.abs(c - luma[p + o]));
        if (y - o >= 0) peak = Math.max(peak, Math.abs(c - luma[p - o * width]));
        if (y + o < height) peak = Math.max(peak, Math.abs(c - luma[p + o * width]));
      }
      if (peak > CONTRAST_MIN) mask[p] = 1;
    }
  }
  // 2. Close: dilate then erode by the same radius. Fills the flat interior blocks and
  // seals the outline gaps that broke the flood-fill approach, without inflating the
  // silhouette (the erode undoes the dilate at the true boundary).
  let m = morph(mask, width, height, CLOSE_R, true);
  m = morph(m, width, height, CLOSE_R, false);
  // Re-dilate by 1 to recover the outline's own outermost pixel row, which the contrast
  // test can miss where the outline meets the very smooth backdrop.
  m = morph(m, width, height, 1, true);
  // 3. Largest component only.
  m = largestComponent(m, width, height);

  let kept = 0;
  for (let p = 0; p < n; p++) {
    if (m[p]) kept++;
    else data[p * 4 + 3] = 0;
  }
  return kept / n;
}

/**
 * Remove the baked contact shadow. It survives the flood fill because it is much darker
 * than the background, so it reads as "part of the bird". Distinguished from the bird's own
 * black outline by being BELOW everything coloured — the outline always has plumage above
 * it, the shadow never does.
 */
function clearShadow({ data, width, height }) {
  const idx = (x, y) => (y * width + x) * 4;
  const isShadowish = (i) => {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    return luma <= SHADOW_MAX_LUMA && chroma <= SHADOW_MAX_CHROMA;
  };
  // Per column, find the lowest opaque pixel that is NOT shadow-ish (i.e. real plumage or
  // a lit leg). Everything shadow-ish below that in the column goes.
  let cleared = 0;
  for (let x = 0; x < width; x++) {
    let lastSolid = -1;
    for (let y = 0; y < height; y++) {
      const i = idx(x, y);
      if (data[i + 3] === 0) continue;
      if (!isShadowish(i)) lastSolid = y;
    }
    for (let y = lastSolid + 1; y < height; y++) {
      const i = idx(x, y);
      if (data[i + 3] !== 0) {
        data[i + 3] = 0;
        cleared++;
      }
    }
  }
  return cleared;
}

function bbox({ data, width, height }) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// source file -> destination sprite name(s). See the registry/pose wiring in
// lib/enemies/registry.ts and components/Tile.tsx.
const MAP = [
  ["fisher-forward.png", "fisher-stand-front.png"],
  ["fisher-back.png", "fisher-stand-back.png"],
  ["fisher-standing-right.png", "fisher-stand-right.png"],
  ["fisher-forward-mean.png", "fisher-stalk.png"],
  ["fisher-cocked-to-throw-right.png", "fisher-cocked.png"],
  ["fisher-forward-cocked.png", "fisher-cocked-front.png"],
  ["fisher-pick-up-right.png", "fisher-pickup.png"],
];

(async () => {
  const report = [];
  for (const [src, dst] of MAP) {
    const img = await load(src);
    const kept = clearBackground(img);
    const sh = clearShadow(img);
    const box = bbox(img);
    if (!box) {
      report.push(`${src}: EMPTY after clear — check OUTLINE_LUMA_MAX`);
      continue;
    }
    const warn =
      kept < KEEP_MIN
        ? "  <-- TOO LITTLE KEPT (fill ate the bird?)"
        : kept > KEEP_MAX
        ? "  <-- TOO MUCH KEPT (outline gap? fill blocked?)"
        : "";
    report.push(
      `${src.padEnd(34)} ${img.width}x${img.height} kept=${(kept * 100).toFixed(1)}% ` +
        `shadow=${sh} bbox=${box.w}x${box.h} @(${box.minX},${box.minY})${warn}`
    );
    if (DRY) continue;

    // Crop to the bird, then scale so the TALLEST pose fills the canvas height minus the
    // top pad. Scaling each pose by its own height would make short poses look huge, so
    // every pose is scaled by the same factor derived from the source art's common size.
    const cropped = await sharp(img.data, {
      raw: { width: img.width, height: img.height, channels: 4 },
    })
      .extract({ left: box.minX, top: box.minY, width: box.w, height: box.h })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(OUT, `.stage-${dst}`), cropped);
  }
  console.log(report.join("\n"));
  if (DRY) return;

  // --- Normalise: one canvas, centred horizontally, feet on the bottom edge. Uses a
  // SHARED scale factor (the tallest crop sets it) so relative sizes between poses survive.
  const staged = MAP.map(([, dst]) => dst).filter((d) =>
    fs.existsSync(path.join(OUT, `.stage-${d}`))
  );
  const dims = {};
  for (const d of staged) {
    const m = await sharp(path.join(OUT, `.stage-${d}`)).metadata();
    dims[d] = { w: m.width, h: m.height };
  }
  const tallest = Math.max(...staged.map((d) => dims[d].h));
  const scale = (CANVAS - TOP_PAD) / tallest;
  console.log(`\ntallest crop=${tallest}px -> shared scale ${scale.toFixed(3)}`);

  for (const d of staged) {
    const w = Math.max(1, Math.round(dims[d].w * scale));
    const h = Math.max(1, Math.round(dims[d].h * scale));
    const resized = await sharp(path.join(OUT, `.stage-${d}`))
      .resize(w, h, { kernel: "nearest" }) // nearest keeps the pixel-art edges crisp
      .png()
      .toBuffer();
    await sharp({
      create: {
        width: CANVAS,
        height: CANVAS,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: resized,
          left: Math.round((CANVAS - w) / 2),
          top: CANVAS - h, // feet flush to the bottom edge
        },
      ])
      .png()
      .toFile(path.join(OUT, d));
    fs.unlinkSync(path.join(OUT, `.stage-${d}`));
    console.log(`  ${d.padEnd(26)} ${w}x${h} -> ${CANVAS}x${CANVAS}, feet at baseline`);
  }
})();
