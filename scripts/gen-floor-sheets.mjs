// Generated floor sheets: rebuilds the cave and grass floors as ONE seamless, periodic
// N x N-tile texture per environment, so a long run of floor stops showing the single
// tile repeating on the grid.
//
// Why a sheet and not more tile variants: the repeat is visible for two reasons. Each
// hand-made tile has a seam baked into its edges (the grass tile's last row is a bright
// line, its first rows run dark), and every tile carries the same motifs in the same
// spot (the grass leaf fans, the cave cobbles), so the eye locks onto the lattice. A
// sheet sampled by world position fixes both: neighbouring tiles read neighbouring
// regions of one continuous image, and the motifs land wherever the synthesis put them.
//
// How: image quilting (Efros & Freeman 2001) on a torus. The output is assembled from
// overlapping square patches cut out of the ORIGINAL tiles, each chosen to agree with
// what is already placed and joined along a minimum-error seam. Every pixel is a real
// pixel from the hand-made art, so the grain, palette and pixel density match exactly;
// only the arrangement is new. The wrap-around means the sheet also tiles against
// itself, so the game can repeat it every N tiles without a seam.
//
// Source material is the plain tile plus its wall-shaded NESW variants where they are
// the same stone: those are un-shaded first (their shadow is a smooth per-row/per-column
// darkening, divided back out) and only their well-lit part is used. Shading is NOT
// baked into the sheet; the game draws it per tile from the wall neighbours instead.
//
// On top of the quilt, a faint low-frequency tone field (also periodic) adds the
// "little more variation": broad patches a few percent lighter/darker and warmer/cooler,
// the way real ground varies over a few metres.
//
// Usage:  node scripts/gen-floor-sheets.mjs [outDir]
// Default outDir is public/images/floor/generated. Deterministic: same seeds, same
// sheets. Env knobs for experimenting: TONE=0 drops the tone field, PNG=1 also writes a
// lossless copy. The output filenames carry a version suffix: when the art changes,
// bump it (served images are cached for a week, see the Art assets section of
// CLAUDE.md) and update lib/floor_sheet.ts.

import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FLOOR_DIR = path.join(ROOT, "public/images/floor");

const SHEETS = [
  {
    out: "cave-floor-sheet-v1",
    tilePx: 100,
    tiles: 8,
    seed: 0xcafe01,
    // Only the two cave tiles the game actually draws. floor-1001 is a different stone
    // (squared blocks with straight bevelled edges, which read as cracks once quilted)
    // and floor-0001 carries a scratch mark; neither is on screen today.
    exemplars: [{ file: "floor-try-1.png" }, { file: "floor-1000.png", shade: { top: true } }],
    // brightness swing, warm/cool swing (fractions)
    tone: { light: 0.035, hue: 0.02 },
  },
  {
    out: "grass-floor-sheet-v1",
    tilePx: 120,
    tiles: 8,
    seed: 0x6a55,
    exemplars: [
      { file: "outdoor-floor-0000.png" },
      { file: "outdoor-floor-1000.png", shade: { top: true } },
      { file: "outdoor-floor-0001.png", shade: { left: true } },
      { file: "outdoor-floor-1001.png", shade: { top: true, left: true } },
    ],
    tone: { light: 0.025, hue: 0.012 },
  },
  {
    // Mauve cobbles like the cave's, plus the realm's scattered star-fleck pixels, which
    // the quilt redistributes along with everything else (tiled, they formed a dot grid).
    out: "pink-realm-floor-sheet-v1",
    tilePx: 100,
    tiles: 8,
    seed: 0x9197,
    exemplars: [{ file: "pink-realm-floor.png" }, { file: "pink-realm-floor-1000.png", shade: { top: true } }],
    tone: { light: 0.03, hue: 0.015 },
  },
];

// Quilting geometry. STEP must divide the sheet size; PATCH = STEP + OVERLAP must fit
// inside the usable part of every exemplar and be bigger than a motif (~30-40px).
const STEP = 40;
const OVERLAP = 14;
const PATCH = STEP + OVERLAP;
const BORDER = 3; // tile edges carry baked seams; never sample them
const MIN_SHADE_FACTOR = 0.72; // don't un-shade rows darker than this (noise blows up)
const TOLERANCE = 0.12; // pick among candidates within 12% of the best match
const STRUCT_SIGMA = 1.5; // match on blurred luminance, so grain doesn't drive the choice
const SEAM_SIGMA = 5; // scale below which seams stay hard cuts (see end of quilt())

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianKernel(sigma) {
  const r = Math.ceil(sigma * 3);
  const k = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k.push(v);
    sum += v;
  }
  return { r, k: k.map((v) => v / sum) };
}

// Separable blur of a single-channel image, edges clamped.
function blur(src, w, h, sigma) {
  const { r, k } = gaussianKernel(sigma);
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += k[i + r] * src[y * w + Math.min(w - 1, Math.max(0, x + i))];
      tmp[y * w + x] = s;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += k[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
      out[y * w + x] = s;
    }
  return out;
}

// Same blur on the sheet torus: indices wrap, so the result still tiles.
function blurWrap(src, w, h, sigma) {
  const { r, k } = gaussianKernel(sigma);
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += k[i + r] * src[y * w + ((x + i + w) % w)];
      tmp[y * w + x] = s;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += k[i + r] * tmp[((y + i + h) % h) * w + x];
      out[y * w + x] = s;
    }
  return out;
}

// Per-channel darkening profile along one axis ("row" = varies with y), measured as the
// line mean over the lit part of the tile relative to the lit baseline, smoothed, and
// forced to 1 once it has recovered so unshaded lines are left untouched.
function shadeProfile(rgb, w, h, axis, crossStart) {
  const len = axis === "row" ? h : w;
  const means = [];
  for (let i = 0; i < len; i++) {
    const m = [0, 0, 0];
    let n = 0;
    for (let j = crossStart; j < (axis === "row" ? w : h) - BORDER; j++) {
      const x = axis === "row" ? j : i;
      const y = axis === "row" ? i : j;
      const o = (y * w + x) * 3;
      m[0] += rgb[o];
      m[1] += rgb[o + 1];
      m[2] += rgb[o + 2];
      n++;
    }
    means.push(m.map((v) => v / n));
  }
  const litFrom = Math.round(len * 0.6);
  const base = [0, 1, 2].map((c) => {
    let s = 0;
    for (let i = litFrom; i < len - BORDER; i++) s += means[i][c];
    return s / (len - BORDER - litFrom);
  });
  const { r, k } = gaussianKernel(3);
  const f = [];
  let recovered = false;
  for (let i = 0; i < len; i++) {
    if (recovered) {
      f.push([1, 1, 1]);
      continue;
    }
    const v = [0, 1, 2].map((c) => {
      let s = 0;
      for (let t = -r; t <= r; t++) s += k[t + r] * means[Math.min(len - 1, Math.max(0, i + t))][c];
      return Math.min(1, s / base[c]);
    });
    const lum = 0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2];
    if (lum >= 0.985) {
      recovered = true;
      f.push([1, 1, 1]);
    } else f.push(v);
  }
  return f;
}

// Solve the n x n system A x = b in place (Gaussian elimination, partial pivoting).
function solve(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    [b[i], b[p]] = [b[p], b[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
    x[i] = s / A[i][i];
  }
  return x;
}

// Divide out each exemplar's own smooth lighting (a quadratic fit per channel over the
// usable area) so every source tile sits at the same flat level. Without this the tiles'
// differences (one runs ~10% brighter, another darkens toward one side) survive the
// quilt as blotchy light and dark zones, because matching chains like with like. The
// tone field below is what adds broad variation back, on purpose and evenly.
function flatten(rgb, w, { x0, y0, x1, y1 }) {
  const basis = (x, y) => {
    const u = (x - (x0 + x1) / 2) / (x1 - x0);
    const v = (y - (y0 + y1) / 2) / (y1 - y0);
    return [1, u, v, u * u, v * v, u * v];
  };
  for (let c = 0; c < 3; c++) {
    const A = Array.from({ length: 6 }, () => new Array(6).fill(0));
    const b = new Array(6).fill(0);
    let mean = 0;
    let n = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const val = rgb[(y * w + x) * 3 + c];
        const phi = basis(x, y);
        for (let i = 0; i < 6; i++) {
          b[i] += phi[i] * val;
          for (let j = 0; j < 6; j++) A[i][j] += phi[i] * phi[j];
        }
        mean += val;
        n++;
      }
    mean /= n;
    const coef = solve(A, b);
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const phi = basis(x, y);
        let fit = 0;
        for (let i = 0; i < 6; i++) fit += coef[i] * phi[i];
        rgb[(y * w + x) * 3 + c] *= mean / fit;
      }
  }
}

// Scale every exemplar's channels to the first (plain) tile's mean colour.
function matchMeans(exemplars) {
  const meanOf = (ex) => {
    const m = [0, 0, 0];
    let n = 0;
    for (let y = ex.y0; y < ex.y1; y++)
      for (let x = ex.x0; x < ex.x1; x++) {
        const o = (y * ex.w + x) * 3;
        for (let c = 0; c < 3; c++) m[c] += ex.rgb[o + c];
        n++;
      }
    return m.map((v) => v / n);
  };
  const target = meanOf(exemplars[0]);
  for (const ex of exemplars.slice(1)) {
    const m = meanOf(ex);
    for (let i = 0; i < ex.w * ex.h; i++) for (let c = 0; c < 3; c++) ex.rgb[i * 3 + c] *= target[c] / m[c];
    const lum = new Float32Array(ex.w * ex.h);
    for (let i = 0; i < ex.w * ex.h; i++)
      lum[i] = 0.299 * ex.rgb[i * 3] + 0.587 * ex.rgb[i * 3 + 1] + 0.114 * ex.rgb[i * 3 + 2];
    ex.struct = blur(lum, ex.w, ex.h, STRUCT_SIGMA);
  }
}

async function loadExemplar({ file, shade = {} }) {
  const { data, info } = await sharp(path.join(FLOOR_DIR, file))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const rgb = new Float32Array(w * h * 3);
  for (let i = 0; i < rgb.length; i++) rgb[i] = data[i];
  let x0 = BORDER;
  let y0 = BORDER;
  const x1 = w - BORDER;
  const y1 = h - BORDER;
  const lumOf = (f) => 0.299 * f[0] + 0.587 * f[1] + 0.114 * f[2];
  // Measure both profiles before correcting either, each over the part of the tile the
  // other shadow doesn't reach.
  const rowF = shade.top ? shadeProfile(rgb, w, h, "row", shade.left ? Math.round(w * 0.55) : BORDER) : null;
  const colF = shade.left ? shadeProfile(rgb, w, h, "col", shade.top ? Math.round(h * 0.55) : BORDER) : null;
  if (rowF) {
    while (y0 < h && lumOf(rowF[y0]) < MIN_SHADE_FACTOR) y0++;
  }
  if (colF) {
    while (x0 < w && lumOf(colF[x0]) < MIN_SHADE_FACTOR) x0++;
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) {
        let f = 1;
        if (rowF) f *= rowF[y][c];
        if (colF) f *= colF[x][c];
        rgb[o + c] = rgb[o + c] / f;
      }
    }
  flatten(rgb, w, { x0, y0, x1, y1 });
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++)
    lum[i] = 0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2];
  const struct = blur(lum, w, h, STRUCT_SIGMA);
  return { file, w, h, rgb, struct, x0, y0, x1, y1 };
}

// Periodic smooth field on the sheet torus: fractal value noise whose lattices divide
// the sheet evenly (so it wraps exactly), normalised to zero mean and unit std. (Plane
// waves were tried first and read as stripes.) The lattice counts are deliberately
// coprime with the tile count: a lattice point on every tile corner would line the
// variation up with the grid we're trying to hide. For 8 tiles: blobs ~2.7, 1.6 and
// 0.7 tiles across.
function toneField(W, H, tiles, rnd) {
  const octaves = [
    { cells: 3, amp: 1 },
    { cells: 5, amp: 0.55 },
    { cells: 11, amp: 0.25 },
  ].filter(({ cells }) => tiles % cells !== 0);
  const f = new Float32Array(W * H);
  for (const { cells, amp } of octaves) {
    const lattice = Array.from({ length: cells * cells }, () => rnd() * 2 - 1);
    const at = (cx, cy) => lattice[(((cy % cells) + cells) % cells) * cells + (((cx % cells) + cells) % cells)];
    const fade = (t) => t * t * (3 - 2 * t);
    for (let y = 0; y < H; y++) {
      const gy = (y / H) * cells;
      const cy = Math.floor(gy);
      const ty = fade(gy - cy);
      for (let x = 0; x < W; x++) {
        const gx = (x / W) * cells;
        const cx = Math.floor(gx);
        const tx = fade(gx - cx);
        const a = at(cx, cy) + (at(cx + 1, cy) - at(cx, cy)) * tx;
        const b = at(cx, cy + 1) + (at(cx + 1, cy + 1) - at(cx, cy + 1)) * tx;
        f[y * W + x] += amp * (a + (b - a) * ty);
      }
    }
  }
  let mean = 0;
  for (let i = 0; i < f.length; i++) mean += f[i];
  mean /= f.length;
  let s2 = 0;
  for (let i = 0; i < f.length; i++) {
    f[i] -= mean;
    s2 += f[i] * f[i];
  }
  const std = Math.sqrt(s2 / f.length);
  for (let i = 0; i < f.length; i++) f[i] /= std;
  return f;
}

function quilt(exemplars, W, H, rnd) {
  const nx = W / STEP;
  const ny = H / STEP;
  if (!Number.isInteger(nx) || !Number.isInteger(ny)) throw new Error("STEP must divide the sheet");

  // Candidate patches: every PATCH-square in each exemplar's usable area (stride 2).
  // Mirrored copies were tried and dropped: a patch's mirror matches its own seam
  // perfectly, so the quilt kept butting the two together into symmetric "butterflies".
  const cands = [];
  exemplars.forEach((ex, e) => {
    for (let y = ex.y0; y + PATCH <= ex.y1; y += 2)
      for (let x = ex.x0; x + PATCH <= ex.x1; x += 2)
        cands.push({ e, x, y, flip: 0, key: `${e}:${x >> 3}:${y >> 3}` });
  });
  const uses = new Map();

  const out = new Float32Array(W * H * 3);
  const soft = new Float32Array(W * H * 3);
  const outS = new Float32Array(W * H);
  const filled = new Uint8Array(W * H);
  const wrapX = (x) => ((x % W) + W) % W;
  const wrapY = (y) => ((y % H) + H) % H;
  const srcIdx = (c, u, v) => {
    const ex = exemplars[c.e];
    return (c.y + v) * ex.w + (c.x + (c.flip ? PATCH - 1 - u : u));
  };

  for (let i = 0; i < ny; i++)
    for (let j = 0; j < nx; j++) {
      const ox = j * STEP;
      const oy = i * STEP;
      // Filled pixels of this footprint, subsampled 2x2 for the match search.
      const U = [];
      const V = [];
      const T = [];
      for (let v = 0; v < PATCH; v += 2)
        for (let u = 0; u < PATCH; u += 2) {
          const p = wrapY(oy + v) * W + wrapX(ox + u);
          if (filled[p]) {
            U.push(u);
            V.push(v);
            T.push(outS[p]);
          }
        }

      let chosen;
      if (U.length === 0) {
        chosen = cands[Math.floor(rnd() * cands.length)];
      } else {
        const errs = new Float64Array(cands.length);
        let best = Infinity;
        for (let ci = 0; ci < cands.length; ci++) {
          const c = cands[ci];
          const S = exemplars[c.e].struct;
          let err = 0;
          for (let q = 0; q < U.length; q++) {
            const d = T[q] - S[srcIdx(c, U[q], V[q])];
            err += d * d;
          }
          // Discourage re-using the same bit of source so a motif doesn't stamp itself
          // across the sheet (neighbouring candidates are near-identical, hence the
          // coarse key).
          err *= 1 + 0.35 * (uses.get(c.key) ?? 0);
          errs[ci] = err;
          if (err < best) best = err;
        }
        const limit = best * (1 + TOLERANCE) + 1e-6;
        const pool = [];
        for (let ci = 0; ci < cands.length; ci++) if (errs[ci] <= limit) pool.push(ci);
        chosen = cands[pool[Math.floor(rnd() * pool.length)]];
      }
      uses.set(chosen.key, (uses.get(chosen.key) ?? 0) + 1);
      const ex = exemplars[chosen.e];

      // Per-pixel overlap error for the seam cuts.
      const E = new Float32Array(PATCH * PATCH);
      const isFilled = new Uint8Array(PATCH * PATCH);
      for (let v = 0; v < PATCH; v++)
        for (let u = 0; u < PATCH; u++) {
          const p = wrapY(oy + v) * W + wrapX(ox + u);
          if (filled[p]) {
            isFilled[v * PATCH + u] = 1;
            const d = outS[p] - ex.struct[srcIdx(chosen, u, v)];
            E[v * PATCH + u] = d * d;
          }
        }
      const bandFilled = (u0, u1, v0, v1) => {
        let n = 0;
        let f = 0;
        for (let v = v0; v < v1; v++)
          for (let u = u0; u < u1; u++) {
            n++;
            f += isFilled[v * PATCH + u];
          }
        return f > n * 0.9;
      };
      // Minimum-error path through a band: vertical paths pick a column per row,
      // horizontal paths a row per column; each step may drift one pixel.
      const cut = (vertical, lo) => {
        const L = PATCH; // path length
        const Wd = OVERLAP; // band width
        const cost = new Float64Array(L * Wd);
        const at = (t, s) => (vertical ? E[t * PATCH + (lo + s)] : E[(lo + s) * PATCH + t]);
        for (let s = 0; s < Wd; s++) cost[s] = at(0, s);
        for (let t = 1; t < L; t++)
          for (let s = 0; s < Wd; s++) {
            let m = cost[(t - 1) * Wd + s];
            if (s > 0) m = Math.min(m, cost[(t - 1) * Wd + s - 1]);
            if (s < Wd - 1) m = Math.min(m, cost[(t - 1) * Wd + s + 1]);
            cost[t * Wd + s] = at(t, s) + m;
          }
        const path = new Int32Array(L);
        let s = 0;
        for (let q = 1; q < Wd; q++) if (cost[(L - 1) * Wd + q] < cost[(L - 1) * Wd + s]) s = q;
        path[L - 1] = s;
        for (let t = L - 2; t >= 0; t--) {
          let bs = s;
          for (const q of [s - 1, s + 1])
            if (q >= 0 && q < Wd && cost[t * Wd + q] < cost[t * Wd + bs]) bs = q;
          s = bs;
          path[t] = s;
        }
        return path;
      };
      const R = PATCH - OVERLAP;
      const left = bandFilled(0, OVERLAP, 0, PATCH) ? cut(true, 0) : null;
      const right = bandFilled(R, PATCH, 0, PATCH) ? cut(true, R) : null;
      const top = bandFilled(0, PATCH, 0, OVERLAP) ? cut(false, 0) : null;
      const bottom = bandFilled(0, PATCH, R, PATCH) ? cut(false, R) : null;

      const ramp = (t) => {
        const x = Math.min(1, Math.max(0, t));
        return x * x * (3 - 2 * x);
      };
      for (let v = 0; v < PATCH; v++)
        for (let u = 0; u < PATCH; u++) {
          const p = wrapY(oy + v) * W + wrapX(ox + u);
          const s = srcIdx(chosen, u, v);
          let take = true;
          let alpha = 1; // the soft copy cross-fades across the whole band instead
          if (isFilled[v * PATCH + u]) {
            if (left && u < OVERLAP) {
              if (u < left[v]) take = false;
              alpha = Math.min(alpha, ramp((u + 0.5) / OVERLAP));
            }
            if (right && u >= R) {
              if (u - R > right[v]) take = false;
              alpha = Math.min(alpha, ramp((PATCH - u - 0.5) / OVERLAP));
            }
            if (top && v < OVERLAP) {
              if (v < top[u]) take = false;
              alpha = Math.min(alpha, ramp((v + 0.5) / OVERLAP));
            }
            if (bottom && v >= R) {
              if (v - R > bottom[u]) take = false;
              alpha = Math.min(alpha, ramp((PATCH - v - 0.5) / OVERLAP));
            }
            const inBand =
              (left && u < OVERLAP) || (right && u >= R) || (top && v < OVERLAP) || (bottom && v >= R);
            if (!inBand) {
              take = false;
              alpha = 0;
            }
          }
          for (let c = 0; c < 3; c++) soft[p * 3 + c] = alpha * ex.rgb[s * 3 + c] + (1 - alpha) * soft[p * 3 + c];
          if (!take) continue;
          out[p * 3] = ex.rgb[s * 3];
          out[p * 3 + 1] = ex.rgb[s * 3 + 1];
          out[p * 3 + 2] = ex.rgb[s * 3 + 2];
          outS[p] = ex.struct[s];
          filled[p] = 1;
        }
    }

  // Keep the hard cut's grain but take the cross-fade's low frequencies. Where two
  // patches sit a shade apart, a cut through flat ground has nothing to hide behind and
  // shows as a straight step; this turns the step into a ramp without blurring grain.
  for (let c = 0; c < 3; c++) {
    const d = new Float32Array(W * H);
    for (let p = 0; p < W * H; p++) d[p] = soft[p * 3 + c] - out[p * 3 + c];
    const bd = blurWrap(d, W, H, SEAM_SIGMA);
    for (let p = 0; p < W * H; p++) out[p * 3 + c] += bd[p];
  }
  return out;
}

async function build(sheet, outDir) {
  const t0 = Date.now();
  const rnd = mulberry32(sheet.seed);
  const exemplars = [];
  for (const spec of sheet.exemplars) exemplars.push(await loadExemplar(spec));
  matchMeans(exemplars);
  const W = sheet.tilePx * sheet.tiles;
  const H = W;
  const rgb = quilt(exemplars, W, H, rnd);

  const light = toneField(W, H, sheet.tiles, rnd);
  const warm = toneField(W, H, sheet.tiles, rnd);
  const toneScale = process.env.TONE === undefined ? 1 : Number(process.env.TONE);
  const buf = Buffer.alloc(W * H * 3);
  for (let p = 0; p < W * H; p++) {
    const l = 1 + toneScale * sheet.tone.light * light[p];
    const h = toneScale * sheet.tone.hue * warm[p];
    // warm = a touch more red, a touch less blue; cool the reverse. Green carries it.
    const mul = [l * (1 + h), l, l * (1 - h)];
    for (let c = 0; c < 3; c++) buf[p * 3 + c] = Math.max(0, Math.min(255, Math.round(rgb[p * 3 + c] * mul[c])));
  }
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, sheet.out);
  const img = sharp(buf, { raw: { width: W, height: H, channels: 3 } });
  // WebP q90 keeps all of the grain energy (measured against the lossless render) at a
  // tenth of the PNG's size: noise is the worst case for PNG, ~1-1.6MB per sheet.
  await img.clone().webp({ quality: 90, smartSubsample: true }).toFile(`${base}.webp`);
  if (process.env.PNG) await img.clone().png({ compressionLevel: 9 }).toFile(`${base}.png`);
  const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0);
  console.log(
    `${sheet.out}: ${W}x${H} (${sheet.tiles}x${sheet.tiles} tiles) webp ${kb(`${base}.webp`)}KB in ${Date.now() - t0}ms`
  );
}

const outDir = path.resolve(process.argv[2] ?? path.join(FLOOR_DIR, "generated"));
for (const sheet of SHEETS) await build(sheet, outDir);
