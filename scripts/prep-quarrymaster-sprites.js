// Prepares the hand-drawn Quarrymaster art for use as game sprites.
//
// The source is a single labelled CONTACT SHEET: four poses laid out on a near-white
// background with a filename caption under each. Sprites in this game are drawn as
// `background-image: contain` on a 40px tile and planted with `transform-origin: 50% 100%`,
// so each pose has to come out transparent, tightly cropped, and sharing a common baseline
// or he will bob as he turns.
//
// Steps:
//   1. Mask everything that isn't the near-white paper. Unlike the Fisher's source (a heavy
//      grey-brown vignette needing a contrast walk) this background is flat and bright, so a
//      luma threshold is enough.
//   2. Label connected blobs and keep the FOUR LARGEST. That drops the captions for free —
//      each glyph is its own tiny blob — without having to know where the text sits.
//   3. Order the four by position: top row left-to-right, then the row below.
//   4. Per pose: crop to its blob, take alpha from the mask, then drop any baked contact
//      shadow (dark AND desaturated AND below the lowest saturated pixel).
//   5. Re-canvas every pose to ONE square size, horizontally centred, feet flush to the
//      bottom edge, using a SINGLE scale factor shared by all four. Scaling each pose to fit
//      its own crop looked equivalent and is not: the summon pose is wider (arms up) so it
//      would shrink relative to the standing poses, and he would visibly change size the
//      moment he raised his arms. One scale keeps their relative proportions; the flush
//      bottom keeps their feet on the same line.
//
// Usage: node scripts/prep-quarrymaster-sprites.js [--dry]
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const SRC = path.join(REPO, "art-source/bosses/quarrymaster/sprites.png");
const OUT = path.join(REPO, "public/images/enemies/bosses/quarrymaster");
const DRY = process.argv.includes("--dry");

/** Final canvas for every pose. Square keeps `contain` scaling identical across poses. */
const CANVAS = 512;
/** Palette size for the quantised output. See the note at the png() call. */
const PALETTE = 64;
/** Breathing room above him so the raised-arm pose isn't clipped by the tile edge. */
const TOP_PAD = 6;
/**
 * Anything at least this bright AND this grey is paper, not art.
 *
 * 232/14 was too tight and left a white contour along the bottom of his feet: the caption's
 * anti-aliased edge fades through luma 150-230, and the part of it touching his silhouette sat
 * at the same row as his lowest saturated pixel, so a below-the-body rule could not reach it.
 * 200/20 is safe because his palette contains no near-white — measured, the brightest
 * low-chroma pixels anywhere inside the figure are paper at luma 232, and his eyes and embers
 * are high-chroma orange that this test never touches.
 */
const PAPER_MIN_LUMA = 200;
const PAPER_MAX_CHROMA = 20;
/** Blobs smaller than this fraction of the sheet are captions or specks. */
const MIN_BLOB = 0.002;
/** Baked contact shadow: dark and near-grey. */
const SHADOW_MAX_LUMA = 120;
const SHADOW_MAX_CHROMA = 30;
/**
 * Caption residue: the anti-aliased top edge of the filename text under each figure, which
 * lands at luma 150-240 — too dark to be caught by the paper test, too light to be caught by
 * the shadow test, so it survived as a faint pale band under his feet. Only applied BELOW his
 * lowest saturated pixel, and only to LIGHT greys, so his own near-black foot outline (which
 * is also low-chroma and also down there) is untouched.
 */
const RESIDUE_MIN_LUMA = 132;
/**
 * De-halo. The sheet was saved with smoothed edges, so a ring of light anti-aliased pixels
 * hugs the silhouette — it reads as a white contour, worst along the bottom of his feet where
 * it meets near-black stone. No colour threshold separates it cleanly (it fades continuously
 * from paper into art), so it is removed STRUCTURALLY: any light, low-chroma pixel touching
 * transparency is an edge artifact, peeled off one ring at a time. Two passes is enough for
 * this sheet; the art's pixel blocks are ~6px so losing the outermost smoothed pixel costs
 * nothing.
 */
const HALO_PASSES = 2;
const HALO_MIN_LUMA = 150;
const HALO_MAX_CHROMA = 30;
/** Saturation that marks a pixel as definitely HIM (used to find where his feet end). */
const BODY_MIN_CHROMA = 34;

/**
 * Filenames in layout order: the sheet reads front, back, right across the top with the
 * summon pose centred beneath. Kept explicit rather than parsed from the captions — OCR on
 * four known files would be a lot of machinery to avoid typing them out.
 */
const NAMES = [
  "quarry-stand-front.png",
  "quarry-stand-back.png",
  "quarry-stand-right.png",
  "quarry-summon-front.png",
];

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const chroma = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b);

async function main() {
  if (!fs.existsSync(SRC)) throw new Error(`missing source sheet: ${SRC}`);
  const { data, info } = await sharp(SRC)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;

  // 1. Art mask.
  const isArt = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += C) {
    const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
    if (a < 16) continue;
    const paper = luma(r, g, b) >= PAPER_MIN_LUMA && chroma(r, g, b) <= PAPER_MAX_CHROMA;
    if (!paper) isArt[i] = 1;
  }

  // 2. Label blobs (4-connected flood, iterative so a 1.5M-pixel sheet can't blow the stack).
  const label = new Int32Array(W * H).fill(-1);
  const blobs = [];
  const stack = new Int32Array(W * H);
  for (let seed = 0; seed < W * H; seed++) {
    if (!isArt[seed] || label[seed] !== -1) continue;
    const id = blobs.length;
    let top = 0;
    stack[top++] = seed;
    label[seed] = id;
    let count = 0, minX = W, maxX = -1, minY = H, maxY = -1;
    while (top > 0) {
      const i = stack[--top];
      const x = i % W, y = (i - x) / W;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const push = (j) => {
        if (j >= 0 && j < W * H && isArt[j] && label[j] === -1) {
          label[j] = id;
          stack[top++] = j;
        }
      };
      if (x > 0) push(i - 1);
      if (x < W - 1) push(i + 1);
      if (y > 0) push(i - W);
      if (y < H - 1) push(i + W);
    }
    blobs.push({ id, count, minX, maxX, minY, maxY });
  }

  const big = blobs
    .filter((b) => b.count >= MIN_BLOB * W * H)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  if (big.length !== 4) {
    throw new Error(
      `expected 4 figures on the sheet, found ${big.length} blobs over the size floor ` +
        `(largest: ${blobs.sort((a, b) => b.count - a.count).slice(0, 6).map((b) => b.count).join(", ")})`
    );
  }

  // 3. Reading order: group into rows by vertical overlap, then left-to-right within a row.
  big.sort((a, b) => a.minY - b.minY);
  const rows = [];
  for (const b of big) {
    const row = rows.find((r) => b.minY <= r.maxY);
    if (row) {
      row.items.push(b);
      row.maxY = Math.max(row.maxY, b.maxY);
    } else {
      rows.push({ maxY: b.maxY, items: [b] });
    }
  }
  const ordered = rows.flatMap((r) => r.items.sort((a, b) => a.minX - b.minX));

  console.log(`sheet ${W}x${H}, ${blobs.length} blobs, ${ordered.length} figures`);

  // PASS 1: crop every pose and strip its shadow, keeping native pixel sizes.
  const poses = [];
  for (let n = 0; n < ordered.length; n++) {
    const blob = ordered[n];
    const bw = blob.maxX - blob.minX + 1;
    const bh = blob.maxY - blob.minY + 1;

    const rgba = Buffer.alloc(bw * bh * 4);
    let bodyBottom = -1;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const si = (blob.minY + y) * W + (blob.minX + x);
        if (label[si] !== blob.id) continue;
        const sp = si * C;
        if (chroma(data[sp], data[sp + 1], data[sp + 2]) >= BODY_MIN_CHROMA && y > bodyBottom) {
          bodyBottom = y;
        }
      }
    }
    let shadowDropped = 0;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const si = (blob.minY + y) * W + (blob.minX + x);
        if (label[si] !== blob.id) continue;
        const sp = si * C;
        const r = data[sp], g = data[sp + 1], b = data[sp + 2];
        const lum = luma(r, g, b);
        const chr = chroma(r, g, b);
        const belowBody = y > bodyBottom;
        const isShadow = belowBody && lum <= SHADOW_MAX_LUMA && chr <= SHADOW_MAX_CHROMA;
        const isResidue = belowBody && lum >= RESIDUE_MIN_LUMA && chr <= SHADOW_MAX_CHROMA;
        if (isShadow || isResidue) {
          shadowDropped++;
          continue;
        }
        const di = (y * bw + x) * 4;
        rgba[di] = r;
        rgba[di + 1] = g;
        rgba[di + 2] = b;
        rgba[di + 3] = 255;
      }
    }

    // De-halo before cropping, so the bounding box is his real silhouette.
    let haloDropped = 0;
    for (let pass = 0; pass < HALO_PASSES; pass++) {
      const doomed = [];
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const di = (y * bw + x) * 4;
          if (rgba[di + 3] === 0) continue;
          const lum2 = luma(rgba[di], rgba[di + 1], rgba[di + 2]);
          const chr2 = chroma(rgba[di], rgba[di + 1], rgba[di + 2]);
          if (lum2 < HALO_MIN_LUMA || chr2 > HALO_MAX_CHROMA) continue;
          const touchesVoid =
            (x === 0 || rgba[(y * bw + x - 1) * 4 + 3] === 0) ||
            (x === bw - 1 || rgba[(y * bw + x + 1) * 4 + 3] === 0) ||
            (y === 0 || rgba[((y - 1) * bw + x) * 4 + 3] === 0) ||
            (y === bh - 1 || rgba[((y + 1) * bw + x) * 4 + 3] === 0);
          if (touchesVoid) doomed.push(di);
        }
      }
      for (const di of doomed) rgba[di + 3] = 0;
      haloDropped += doomed.length;
      if (doomed.length === 0) break;
    }

    let minX = bw, maxX = -1, minY = bh, maxY = -1;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        if (rgba[(y * bw + x) * 4 + 3] === 0) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const tw = maxX - minX + 1;
    const th = maxY - minY + 1;
    const tight = Buffer.alloc(tw * th * 4);
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const sIdx = ((y + minY) * bw + (x + minX)) * 4;
        const dIdx = (y * tw + x) * 4;
        tight[dIdx] = rgba[sIdx];
        tight[dIdx + 1] = rgba[sIdx + 1];
        tight[dIdx + 2] = rgba[sIdx + 2];
        tight[dIdx + 3] = rgba[sIdx + 3];
      }
    }
    poses.push({ name: NAMES[n], tight, tw, th, shadowDropped, haloDropped });
  }

  // PASS 2: one scale for all four, so nobody changes size between poses.
  const maxW = Math.max(...poses.map((p) => p.tw));
  const maxH = Math.max(...poses.map((p) => p.th));
  const scale = Math.min((CANVAS - TOP_PAD) / maxH, CANVAS / maxW);
  console.log(`shared scale ${scale.toFixed(3)} (widest ${maxW}, tallest ${maxH})`);

  for (const pose of poses) {
    const sw = Math.max(1, Math.round(pose.tw * scale));
    const sh = Math.max(1, Math.round(pose.th * scale));
    const resized = await sharp(pose.tight, {
      raw: { width: pose.tw, height: pose.th, channels: 4 },
    })
      .resize(sw, sh, { kernel: "nearest" }) // nearest: never blur the pixel blocks
      .png()
      .toBuffer();

    const out = await sharp({
      create: {
        width: CANVAS,
        height: CANVAS,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        { input: resized, left: Math.round((CANVAS - sw) / 2), top: CANVAS - sh },
      ])
      // Palette-quantise. The source carries hundreds of near-identical colours from the
      // generator's smoothing, which defeats PNG compression — the first output ran ~300KB a
      // pose against the Fisher's ~45KB for the same canvas. Quantising also pushes the art
      // FURTHER toward flat pixel art, which is the look being aimed at. Dithering is off on
      // purpose: it would scatter noise through the flat stone faces.
      .png({ compressionLevel: 9, palette: true, colours: PALETTE, dither: 0 })
      .toBuffer();

    console.log(
      `  ${pose.name}: ${pose.tw}x${pose.th} -> ${sw}x${sh}, feet at y=${CANVAS}` +
        ` (shadow ${pose.shadowDropped}, halo ${pose.haloDropped})`
    );
    if (!DRY) {
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(path.join(OUT, pose.name), out);
    }
  }
  console.log(DRY ? "(dry run, nothing written)" : `wrote ${poses.length} sprites to ${OUT}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
