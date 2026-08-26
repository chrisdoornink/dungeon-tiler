/**
 * Builds the Hearth & Home family variants from the root town NPCs:
 *
 *   boy-3.png   -> emerson-boy3-back.png            (back view)
 *   girl-1.png  -> annie-girl1-back.png             (back view)
 *   girl-2.png  -> claire-girl2-front.png           (recolored: Claire's hair,
 *                                                    dark shirt, blue shorts)
 *               -> claire-girl2-back.png            (back view of the recolor)
 *
 * Back views: mirror the sprite horizontally (so swept fringes / ponytails
 * land on the anatomically correct side from behind) and fill the face with
 * the surrounding hair, row by row, so the hair's shading bands extend
 * naturally. Eyes and mouth disappear as part of the face fill; arms,
 * clothing, and shoes stay.
 *
 * Requires ImageMagick. Run: node scripts/make-family-npc-variants.mjs
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NPC_DIR = join(ROOT, "public/images/npcs");
const OUT_DIR = join(ROOT, "public/images/family");

function identify(file) {
  const out = execFileSync("magick", ["identify", "-format", "%w %h", file], {
    encoding: "utf8",
  });
  const [w, h] = out.trim().split(" ").map(Number);
  return { w, h };
}
function decode(file, w, h, tmp) {
  const raw = join(tmp, "in.raw");
  execFileSync("magick", [file, "-depth", "8", `rgba:${raw}`]);
  const buf = readFileSync(raw);
  if (buf.length !== w * h * 4) throw new Error(`${file}: bad decode`);
  return buf;
}
function encode(buf, w, h, outFile, tmp) {
  const raw = join(tmp, "out.raw");
  writeFileSync(raw, buf);
  execFileSync("magick", ["-size", `${w}x${h}`, "-depth", "8", `rgba:${raw}`, outFile]);
}

const px = (buf, w, y, x) => {
  const i = (y * w + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
};
const setPx = (buf, w, y, x, [r, g, b]) => {
  const i = (y * w + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = 255;
};
const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Face/hand skin on these town sprites: bright warm tones, mildly saturated.
 * The 0.55 cutoff keeps blonde/tawny hair (spread ~0.64 of r) out while still
 * catching girl-1's more saturated skin (~0.47). */
function isSkin([r, g, b, a]) {
  if (a < 200) return false;
  if (r < 170 || g < 110) return false;
  if (!(r > g && g > b)) return false;
  const spread = r - b;
  return spread > 40 && spread < 0.6 * r;
}

function bbox(buf, w, h) {
  let x0 = w, x1 = 0, y0 = h, y1 = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (buf[(y * w + x) * 4 + 3] > 30) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return { x0, x1, y0, y1 };
}

/** Largest connected skin component within the head region = the face. */
function faceMask(buf, w, h) {
  const box = bbox(buf, w, h);
  const headBottom = box.y0 + Math.round((box.y1 - box.y0) * 0.62);
  const headArea0 = (box.x1 - box.x0) * (headBottom - box.y0);
  let skin = new Uint8Array(w * h);
  let skinCount = 0;
  for (let y = box.y0; y <= headBottom; y++)
    for (let x = box.x0; x <= box.x1; x++)
      if (isSkin(px(buf, w, y, x))) {
        skin[y * w + x] = 1;
        skinCount++;
      }
  // Some sprites (girl-1) have skin MORE saturated than hair, so the strict
  // classifier finds nothing. Fallback: face = warm-bright pixels; on those
  // sprites the hair is dark, so brightness alone separates them.
  if (skinCount < headArea0 * 0.04) {
    skin = new Uint8Array(w * h);
    for (let y = box.y0; y <= headBottom; y++)
      for (let x = box.x0; x <= box.x1; x++) {
        const c = px(buf, w, y, x);
        if (c[3] >= 200 && c[0] > c[1] && c[1] > c[2] && lum(c) > 120)
          skin[y * w + x] = 1;
      }
  }

  // Connected components; keep the biggest (hands/ears are smaller blobs).
  const label = new Int32Array(w * h).fill(-1);
  let best = -1, bestSize = 0, next = 0;
  for (let p = 0; p < w * h; p++) {
    if (!skin[p] || label[p] !== -1) continue;
    const queue = [p];
    label[p] = next;
    let size = 0;
    while (queue.length) {
      const q = queue.pop();
      size++;
      const qy = (q / w) | 0, qx = q % w;
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = qy + dy, nx = qx + dx;
        if (ny < 0 || nx < 0 || ny >= h || nx >= w) continue;
        const n = ny * w + nx;
        if (skin[n] && label[n] === -1) {
          label[n] = next;
          queue.push(n);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = next;
    }
    next++;
  }

  // Fill each face row from its min to max column — this swallows the eyes,
  // mouth, and inner shading that sit between skin pixels.
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let lo = -1, hi = -1;
    for (let x = 0; x < w; x++)
      if (label[y * w + x] === best) {
        if (lo === -1) lo = x;
        hi = x;
      }
    if (lo === -1) continue;
    for (let x = lo; x <= hi; x++)
      if (buf[(y * w + x) * 4 + 3] > 30) mask[y * w + x] = 1;
  }

  // Swallow eyes/mouth that escaped the skin span (an eye at the hairline can
  // be separated from the face by bright hair). Any SMALL dark island in the
  // head region that never touches the sprite's silhouette is a facial
  // feature; the head outline always touches transparency, so it survives.
  const headBottom2 = box.y0 + Math.round((box.y1 - box.y0) * 0.62);
  const dark = new Uint8Array(w * h);
  for (let y = box.y0; y <= headBottom2; y++)
    for (let x = box.x0; x <= box.x1; x++) {
      const c = px(buf, w, y, x);
      if (c[3] >= 200 && lum(c) < 75) dark[y * w + x] = 1;
    }
  const seen = new Uint8Array(w * h);
  const headArea = (box.x1 - box.x0) * (headBottom2 - box.y0);
  for (let p = 0; p < w * h; p++) {
    if (!dark[p] || seen[p]) continue;
    const cluster = [p];
    seen[p] = 1;
    let touchesEdge = false;
    for (let i = 0; i < cluster.length; i++) {
      const q = cluster[i];
      const qy = (q / w) | 0;
      const qx = q % w;
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = qy + dy;
        const nx = qx + dx;
        if (ny < 0 || nx < 0 || ny >= h || nx >= w) {
          touchesEdge = true;
          continue;
        }
        const n = ny * w + nx;
        if (buf[n * 4 + 3] < 30) touchesEdge = true; // borders transparency
        if (dark[n] && !seen[n]) {
          seen[n] = 1;
          cluster.push(n);
        }
      }
    }
    if (!touchesEdge && cluster.length < headArea * 0.03) {
      for (const q of cluster) mask[q] = 1;
    }
  }
  return mask;
}

/** Replace the face with hair pulled in from outside the mask.
 * fillDir "vertical" copies hair DOWN from the crown (reads as strands —
 * best when hair frames or tops the face); "horizontal" pulls from the sides.
 * skinRejectLum: fill sources brighter than this AND low-saturation are the
 * skin-tinted anti-alias ring — never paint the face with them. */
function fillFaceWithHair(buf, w, h, opts = {}) {
  const { fillDir = "horizontal", skinRejectLum = 170 } = opts;
  const mask = faceMask(buf, w, h);
  const out = Buffer.from(buf); // read from the original, write to the copy
  const grab = (y, x) => {
    const c = px(buf, w, y, x);
    if (c[3] <= 200 || mask[y * w + x]) return null;
    if (lum(c) > skinRejectLum && c[0] - c[2] < 0.6 * c[0]) return null;
    return c;
  };
  const horizontal = (y, x) => {
    for (let d = 1; d < w; d++) {
      for (const nx of [x - d, x + d]) {
        if (nx < 0 || nx >= w || mask[y * w + nx]) continue;
        const beyond = nx < x ? nx - 2 : nx + 2;
        const source =
          (beyond >= 0 && beyond < w ? grab(y, beyond) : null) ?? grab(y, nx);
        if (source) return source;
      }
    }
    return null;
  };
  const vertical = (y, x) => {
    for (let d = 1; y - d >= 0; d++) {
      if (mask[(y - d) * w + x]) continue;
      const beyond = y - d - 2;
      return (beyond >= 0 ? grab(beyond, x) : null) ?? grab(y - d, x);
    }
    return null;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      const source =
        fillDir === "vertical"
          ? vertical(y, x) ?? horizontal(y, x)
          : horizontal(y, x) ?? vertical(y, x);
      if (source) setPx(out, w, y, x, source);
    }
  }
  return out;
}

function mirror(buf, w, h) {
  const out = Buffer.alloc(buf.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = (y * w + (w - 1 - x)) * 4;
      buf.copy(out, dst, src, src + 4);
    }
  return out;
}

const makeBack = (buf, w, h, opts) =>
  mirror(fillFaceWithHair(buf, w, h, opts), w, h);

// ---------------------------------------------------------------------------
// Claire recolor: girl-2's blonde -> Claire's brown, rust shirt -> dark shirt,
// brown pants -> blue shorts with bare legs (shoes stay). All region masks are
// computed from the ORIGINAL pixels (recoloring the shirt dark and then
// classifying "dark = pants" painted the shirt blue on the first attempt),
// and colors move by per-channel multiplication so the sprite's shading and
// grain carry through instead of flattening into noisy bands.
// Targets sampled from the existing family claire-front.png.

/** newChannel = channel * (targetMid / sourceMid), clamped. */
const applyTransfer = (out, w, y, x, c, mult) => {
  setPx(out, w, y, x, [
    Math.min(255, Math.round(c[0] * mult[0])),
    Math.min(255, Math.round(c[1] * mult[1])),
    Math.min(255, Math.round(c[2] * mult[2])),
  ]);
};

function recolorClaire(buf, w, h) {
  const out = Buffer.from(buf);
  const box = bbox(buf, w, h);

  // g > 0.52r separates blonde hair (g ~0.64r) from the rust shirt (g ~0.47r),
  // which otherwise passes every warm-and-saturated test blonde does.
  const isBlonde = ([r, g, b, a]) =>
    a >= 200 && r > 120 && r > g && g > b && r - b >= 0.5 * r && g > 0.52 * r;

  // Region bands MEASURED from girl-2.png's row profile (475px source):
  // shirt rows 240-330, shorts 331-380, bare legs 381-434, shoes below.
  const SHIRT_TOP = 240;
  const SHIRT_BOT = 330;
  const SHORTS_BOT = 380;
  const LEGS_BOT = 434;

  const HAIR_MULT = [156 / 208, 102 / 152, 53 / 72]; // blonde -> #9C6635 browns
  const SHIRT_MULT = [51 / 155, 44 / 90, 36 / 45]; // rust -> #332C24 darks
  const SHORTS_MULT = [70 / 90, 95 / 60, 120 / 22]; // dark brown -> blue
  const LEG_LIGHT = [232, 168, 104];
  const LEG_SHADE = [200, 136, 72];

  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const c = px(buf, w, y, x); // classify on the original, always
      if (c[3] < 200) continue;
      if (isBlonde(c)) {
        applyTransfer(out, w, y, x, c, HAIR_MULT);
        continue;
      }
      const l = lum(c);
      if (y >= SHIRT_TOP && y <= SHIRT_BOT) {
        // Shirt band: everything warm and non-outline that isn't her hands.
        if (l > 25 && !isSkin(c)) applyTransfer(out, w, y, x, c, SHIRT_MULT);
      } else if (y > SHIRT_BOT && y <= SHORTS_BOT) {
        if (l > 16) applyTransfer(out, w, y, x, c, SHORTS_MULT);
      } else if (y > SHORTS_BOT && y <= LEGS_BOT) {
        if (l >= 25) setPx(out, w, y, x, l < 70 ? LEG_SHADE : LEG_LIGHT);
      }
      // below LEGS_BOT: shoes — leave as-is
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), "family-variants-"));
try {
  const jobs = [
    {
      src: "boy-3.png",
      out: "emerson-boy3-back.png",
      fn: (b, w, h) => makeBack(b, w, h, { fillDir: "horizontal" }),
    },
    {
      src: "girl-1.png",
      out: "annie-girl1-back.png",
      fn: (b, w, h) => makeBack(b, w, h, { fillDir: "vertical" }),
    },
    {
      src: "girl-2.png",
      out: "claire-girl2-front.png",
      fn: (b, w, h) => recolorClaire(b, w, h),
    },
    {
      src: "girl-2.png",
      out: "claire-girl2-back.png",
      fn: (b, w, h) =>
        makeBack(recolorClaire(b, w, h), w, h, {
          fillDir: "vertical",
          skinRejectLum: 120,
        }),
    },
  ];
  for (const job of jobs) {
    const file = join(NPC_DIR, job.src);
    const { w, h } = identify(file);
    const buf = decode(file, w, h, tmp);
    const result = job.fn(buf, w, h);
    encode(result, w, h, join(OUT_DIR, job.out), tmp);
    console.log(`${job.out} (${w}x${h}) from ${job.src}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
