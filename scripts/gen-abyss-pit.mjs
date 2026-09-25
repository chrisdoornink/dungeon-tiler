// Open-abyss pit mask: the jagged hole a cracked (faulty) floor leaves once it gives way.
//
// The hole is drawn in CSS (.abyssPit in components/Tile.module.css) over the tile's own
// floor, so the generated floor sheet shows around it. This script makes the one asset that
// needs: the hole's silhouette, used as a mask-image. It is white where the floor is gone,
// transparent elsewhere.
//
// The shape comes from the crack itself (public/images/floor/crack3.png). On an open tile
// that crack is drawn at the full tile size, rotated the same way as the hole, so the two
// share one coordinate grid. The hole sits where the crack's branches meet, and it reaches
// a spike down each branch: up the spine, out the left arm, along both right prongs and
// down the tail. The tip of every branch lies outside the hole and stays a crack in the
// floor that is left. The result reads as the floor having broken along its cracks.
//
// Every vertex also stays within 19px of the tile centre. The tile rotates the hole to
// any angle, and at that radius no rotation can push it out of the tile.
//
// The mask is pixel-stepped at 1 CSS px (40 x 40 for the 40px tile), matching the crack's
// own chunky grid. It is stored at 8x with nearest-neighbour scaling so the steps stay
// crisp at any zoom.
//
// Usage:  node scripts/gen-abyss-pit.mjs
// Changing the shape means a new filename (bump the -v1 suffix; see Art assets in
// CLAUDE.md) and updating the url in Tile.module.css and the preload lists.

import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/images/floor/abyss-pit-mask-v1.png");

const GRID = 40; // CSS px per tile side
const SCALE = 8; // stored px per CSS px
const SUB = 16; // supersamples per cell side when rasterising

// Clockwise from the spine spike, in tile px (0..40, y down). A comment marks each branch
// spike; the vertices between spikes are the broken edge, notched so no side runs straight.
const HOLE = [
  [16.8, 11.2], // spine spike (the crack runs on up to the tile's top edge)
  [18.6, 15.5],
  [20.2, 17.2],
  [22.8, 17.6],
  [23.6, 19.8],
  [26.2, 20.6],
  [30.4, 23.2], // upper right prong
  [27.6, 25.4],
  [27.2, 26.8],
  [32.8, 29.3], // lower right prong
  [28.2, 30.8],
  [26.0, 32.6],
  [23.6, 32.0],
  [21.2, 33.4],
  [17.6, 35.8], // tail
  [17.8, 32.6],
  [15.4, 32.2],
  [13.2, 30.4],
  [11.2, 29.6],
  [10.2, 27.4],
  [6.2, 24.2], // left arm
  [10.4, 23.2],
  [12.4, 21.4],
  [13.4, 18.8],
  [15.2, 17.6],
  [15.4, 14.8],
];

function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const MAX_RADIUS = 19;
for (const [x, y] of HOLE) {
  const r = Math.hypot(x - GRID / 2, y - GRID / 2);
  if (r > MAX_RADIUS) throw new Error(`vertex ${x},${y} is ${r.toFixed(1)}px from centre`);
}

// A cell is hole when at least half of it is inside the outline.
const cells = new Uint8Array(GRID * GRID);
for (let cy = 0; cy < GRID; cy++) {
  for (let cx = 0; cx < GRID; cx++) {
    let n = 0;
    for (let sy = 0; sy < SUB; sy++) {
      for (let sx = 0; sx < SUB; sx++) {
        if (inside(HOLE, cx + (sx + 0.5) / SUB, cy + (sy + 0.5) / SUB)) n++;
      }
    }
    cells[cy * GRID + cx] = n * 2 >= SUB * SUB ? 1 : 0;
  }
}

const size = GRID * SCALE;
const rgba = Buffer.alloc(size * size * 4);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = 255;
    rgba[i + 3] = cells[Math.floor(y / SCALE) * GRID + Math.floor(x / SCALE)] ? 255 : 0;
  }
}

await sharp(rgba, { raw: { width: size, height: size, channels: 4 } })
  .png({ compressionLevel: 9, palette: true, colours: 2 })
  .toFile(OUT);

const holeCells = cells.reduce((a, b) => a + b, 0);
console.log(`${path.relative(ROOT, OUT)}: ${size}x${size}, hole covers ${holeCells} of ${GRID * GRID} px`);
