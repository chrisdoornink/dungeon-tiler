/**
 * Turns raw family sprite art into game-ready sprites.
 *
 *   public/images/family/raw/*  ->  public/images/family/<member>-<pose>.png
 *
 * Every raw file needs an entry in SHEET_LAYOUTS below naming its member and
 * the pose of each figure, left to right (null = skip that figure). Sheets
 * from the generator vary in arrangement, so this is declared per file after
 * a quick look rather than guessed.
 *
 * Raw art comes straight from the generator: solid background (light gray for
 * fronts, black-with-glow for sheets), no transparency. This script:
 *   1. removes the background
 *      - light backgrounds: color-distance flood fill from the sampled corner
 *        color (the background is far from every sprite color)
 *      - dark backgrounds (black + glow): darkness is useless as a key — the
 *        hoodie is as dark as the glow — but STRUCTURE works: sprites are
 *        blocky (hard pixel-cell edges everywhere), the glow is perfectly
 *        smooth. Mask = morphological closing over strong-edge pixels, plus
 *        any region fully enclosed by it (bald heads and flat cell interiors
 *        have no edges inside, but their outlines enclose them)
 *   2. splits the result into figures (columns of transparency separate poses)
 *   3. tight-crops each figure and pads it with a uniform margin
 *
 * The game needs front, back, and ONE side facing RIGHT (the engine mirrors
 * it for left) — skip any extra poses with null.
 *
 * Requires ImageMagick (`magick`) for PNG decode/encode. Run:
 *   node scripts/prepare-family-sprites.mjs
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const FAMILY_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public/images/family"
);
const RAW_DIR = join(FAMILY_DIR, "raw");

// Raw file -> one {member, pose, stretch?} entry per figure, ROW-MAJOR (top
// band left-to-right, then the next band). null skips a figure the game
// doesn't need. `stretch` widens a figure horizontally (nearest-neighbor) —
// some sheets came out lankier than Chris's original chunky front (width
// ~0.65 of height vs ~0.5) and the game's stocky world needs the chunk.
// Tune by eye and re-run; omit for 1.0 (leave the art alone).
const f = (member, pose, stretch) => ({ member, pose, stretch });
const SHEET_LAYOUTS = {
  "chris-front.png": { figures: [f("chris", "front")] },
  "chris-back-and-sides.png": {
    figures: [f("chris", "back", 1.18), f("chris", "side", 1.1), null],
  },
  "annie.png": {
    figures: [
      f("annie", "front", 1.2),
      f("annie", "side", 1.08),
      f("annie", "back", 1.14),
    ],
  },
  // 2x4 grid: Emerson on top, Claire below; [front, side-right, back,
  // side-left] each. Left-facing sides are skipped (the engine mirrors).
  "em-and-claire.png": {
    figures: [
      f("emerson", "front"),
      f("emerson", "side"),
      f("emerson", "back"),
      null,
      f("claire", "front"),
      f("claire", "side"),
      f("claire", "back"),
      null,
    ],
  },
};

const LIGHT_BG_TOLERANCE = 55; // color distance from corner color
const EDGE_THRESHOLD = 12; // channel delta that counts as a hard sprite edge
const CLOSE_RADIUS = 8; // dilate+erode radius for the edge mask (px)
const MARGIN_RATIO = 0.05; // padding around the tight crop, relative to height

function identify(file) {
  const out = execFileSync("magick", ["identify", "-format", "%w %h", file], {
    encoding: "utf8",
  });
  const [w, h] = out.trim().split(" ").map(Number);
  return { w, h };
}

function decodeRgba(file, w, h, tmp) {
  const raw = join(tmp, "in.raw");
  execFileSync("magick", [file, "-depth", "8", `rgba:${raw}`]);
  const buf = readFileSync(raw);
  if (buf.length !== w * h * 4) {
    throw new Error(`${file}: expected ${w * h * 4} bytes, got ${buf.length}`);
  }
  return buf;
}

function encodePng(buf, w, h, outFile, tmp) {
  const raw = join(tmp, "out.raw");
  writeFileSync(raw, buf);
  execFileSync("magick", [
    "-size",
    `${w}x${h}`,
    "-depth",
    "8",
    `rgba:${raw}`,
    outFile,
  ]);
}

const luma = (buf, i) =>
  0.299 * buf[i] + 0.587 * buf[i + 1] + 0.114 * buf[i + 2];

function colorDist(buf, i, rgb) {
  const dr = buf[i] - rgb[0];
  const dg = buf[i + 1] - rgb[1];
  const db = buf[i + 2] - rgb[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Flood from every border pixel; removable(i) decides what the flood may eat. */
function floodFromBorders(buf, w, h, removable) {
  const removed = new Uint8Array(w * h);
  const queue = [];
  const push = (x, y) => {
    const p = y * w + x;
    if (!removed[p] && removable(p * 4)) {
      removed[p] = 1;
      queue.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (queue.length) {
    const p = queue.pop();
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  return removed;
}

/** 1 where any RGB channel jumps by more than EDGE_THRESHOLD to the right or
 * down neighbor — the hard cell borders of pixel art. Smooth glow never fires. */
function strongEdges(buf, w, h) {
  const edges = new Uint8Array(w * h);
  const delta = (i, j) =>
    Math.max(
      Math.abs(buf[i] - buf[j]),
      Math.abs(buf[i + 1] - buf[j + 1]),
      Math.abs(buf[i + 2] - buf[j + 2])
    );
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (x < w - 1 && delta(p * 4, (p + 1) * 4) > EDGE_THRESHOLD) {
        edges[p] = 1;
        edges[p + 1] = 1;
      }
      if (y < h - 1 && delta(p * 4, (p + w) * 4) > EDGE_THRESHOLD) {
        edges[p] = 1;
        edges[p + w] = 1;
      }
    }
  }
  return edges;
}

/** Black clothing on the glow has no color edge at all (Annie's tank top
 * vanished into it) — but clothing black is NEUTRAL while the glow is warm
 * (red-heavy). Neutral-dark alone also matches noise in the far background,
 * so it only counts within `zone` (a wide dilation of the real edges). */
function addNeutralDarkWithin(edges, zone, buf, w, h) {
  for (let p = 0; p < w * h; p++) {
    if (!zone[p] || edges[p]) continue;
    const i = p * 4;
    const maxc = Math.max(buf[i], buf[i + 1], buf[i + 2]);
    if (maxc >= 8 && maxc <= 45 && Math.abs(buf[i] - buf[i + 2]) <= 8) {
      edges[p] = 1;
    }
  }
}

/** Separable sliding-window box dilate (mode=1) or erode (mode=0). */
function boxMorph(mask, w, h, r, mode) {
  const pass = (src, stride, lineLen, lines, lineStart) => {
    const out = new Uint8Array(src.length);
    for (let l = 0; l < lines; l++) {
      const base = lineStart(l);
      for (let i = 0; i < lineLen; i++) {
        let hit = mode === 1 ? 0 : 1;
        const from = Math.max(0, i - r);
        const to = Math.min(lineLen - 1, i + r);
        for (let k = from; k <= to; k++) {
          const v = src[base + k * stride];
          if (mode === 1 ? v : !v) {
            hit = mode === 1 ? 1 : 0;
            break;
          }
        }
        out[base + i * stride] = hit;
      }
    }
    return out;
  };
  const horizontal = pass(mask, 1, w, h, (l) => l * w);
  return pass(horizontal, w, h, w, (l) => l);
}

function removeBackground(buf, w, h) {
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, (w * h - 1) * 4];
  const avgCornerLuma =
    corners.reduce((sum, i) => sum + luma(buf, i), 0) / corners.length;

  let removed;
  if (avgCornerLuma > 128) {
    // Light background: flood anything near the corner color.
    const corner = [buf[corners[0]], buf[corners[0] + 1], buf[corners[0] + 2]];
    removed = floodFromBorders(buf, w, h, (i) =>
      colorDist(buf, i, corner) < LIGHT_BG_TOLERANCE
    );
  } else {
    // Dark background with glow: keep the closing of the strong-edge mask,
    // plus everything it encloses; remove whatever the border flood reaches.
    const edges = strongEdges(buf, w, h);
    addNeutralDarkWithin(edges, boxMorph(edges, w, h, 40, 1), buf, w, h);
    const closed = boxMorph(
      boxMorph(edges, w, h, CLOSE_RADIUS, 1),
      w,
      h,
      CLOSE_RADIUS,
      0
    );
    removed = floodFromBorders(buf, w, h, (i) => !closed[i / 4]);
  }

  for (let p = 0; p < w * h; p++) {
    if (removed[p]) {
      buf[p * 4] = 0;
      buf[p * 4 + 1] = 0;
      buf[p * 4 + 2] = 0;
      buf[p * 4 + 3] = 0;
    }
  }
}

const GAP = 12; // empty columns/rows that count as a separator
const MIN_FIGURE_W = 60;
const MIN_FIGURE_H = 150;

/** Runs of consecutive indices where hasContent(i), separated by > GAP empties. */
function contentRuns(length, hasContent) {
  const runs = [];
  let start = -1;
  let gap = 0;
  for (let i = 0; i <= length; i++) {
    if (i < length && hasContent(i)) {
      if (start === -1) start = i;
      gap = 0;
    } else if (start !== -1 && (++gap > GAP || i === length)) {
      runs.push([start, i - gap]);
      start = -1;
      gap = 0;
    }
  }
  return runs;
}

/**
 * Split into figures, row-major: horizontal bands of content first (multi-row
 * sheets like em-and-claire), then columns within each band.
 */
function findFigures(buf, w, h) {
  const opaque = (y, x) => buf[(y * w + x) * 4 + 3] > 0;
  const bands = contentRuns(h, (y) => {
    for (let x = 0; x < w; x++) if (opaque(y, x)) return true;
    return false;
  }).filter(([y0, y1]) => y1 - y0 >= MIN_FIGURE_H);

  const figures = [];
  for (const [by0, by1] of bands) {
    const cols = contentRuns(w, (x) => {
      for (let y = by0; y <= by1; y++) if (opaque(y, x)) return true;
      return false;
    }).filter(([x0, x1]) => x1 - x0 >= MIN_FIGURE_W);
    for (const [x0, x1] of cols) {
      let y0 = by1;
      let y1 = by0;
      for (let y = by0; y <= by1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (opaque(y, x)) {
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
            break;
          }
        }
      }
      figures.push({ x0, x1, y0, y1 });
    }
  }
  return figures;
}

/** Widen a cropped figure horizontally (nearest-neighbor). */
function stretchX(buf, w, h, factor) {
  const nw = Math.round(w * factor);
  const out = Buffer.alloc(nw * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(w - 1, Math.floor(x / factor));
      buf.copy(out, (y * nw + x) * 4, (y * w + sx) * 4, (y * w + sx) * 4 + 4);
    }
  }
  return { out, nw };
}

function cropWithMargin(buf, w, box) {
  const margin = Math.round((box.y1 - box.y0) * MARGIN_RATIO);
  const cw = box.x1 - box.x0 + 1 + margin * 2;
  const ch = box.y1 - box.y0 + 1 + margin * 2;
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = box.y0; y <= box.y1; y++) {
    const srcStart = (y * w + box.x0) * 4;
    const dstStart = ((y - box.y0 + margin) * cw + margin) * 4;
    buf.copy(out, dstStart, srcStart, srcStart + (box.x1 - box.x0 + 1) * 4);
  }
  return { out, cw, ch };
}

function opaquePercent(buf) {
  let opaque = 0;
  for (let i = 3; i < buf.length; i += 4) if (buf[i] > 0) opaque++;
  return Math.round((opaque / (buf.length / 4)) * 100);
}

function process(rawFile, layout, tmp) {
  const src = join(RAW_DIR, rawFile);
  const { w, h } = identify(src);
  const buf = decodeRgba(src, w, h, tmp);
  removeBackground(buf, w, h);
  const figures = findFigures(buf, w, h);
  if (figures.length !== layout.figures.length) {
    throw new Error(
      `${rawFile}: found ${figures.length} figures, layout declares ${layout.figures.length}`
    );
  }
  layout.figures.forEach((fig, i) => {
    if (!fig) return; // extra pose the game doesn't need
    let { out, cw, ch } = cropWithMargin(buf, w, figures[i]);
    const factor = fig.stretch ?? 1;
    if (factor !== 1) {
      const stretched = stretchX(out, cw, ch, factor);
      out = stretched.out;
      cw = stretched.nw;
    }
    const outName = `${fig.member}-${fig.pose}.png`;
    encodePng(out, cw, ch, join(FAMILY_DIR, outName), tmp);
    console.log(
      `  ${outName} (${cw}x${ch}${factor !== 1 ? `, stretched ${factor}x` : ""}, ${opaquePercent(out)}% opaque) from figure ${i + 1}/${figures.length}`
    );
  });
}

const tmp = mkdtempSync(join(tmpdir(), "family-sprites-"));
try {
  for (const rawFile of readdirSync(RAW_DIR).filter((f) => f.endsWith(".png"))) {
    const layout = SHEET_LAYOUTS[rawFile];
    if (!layout) {
      console.warn(`SKIP ${rawFile}: add it to SHEET_LAYOUTS first`);
      continue;
    }
    console.log(`${rawFile}:`);
    process(rawFile, layout, tmp);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
