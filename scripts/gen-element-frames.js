// Effect frames for elemental terrain, drawn on 32x32 grids rendered at cell=1.25 in
// Tile.tsx (= exactly 40px, matching the game's apparent art density — the torch
// flame runs cell~1.4).
//
// Usage: node scripts/gen-element-frames.js
// Paste the emitted JSON arrays into LAVA_FRAMES / WATER_FRAMES /
// SHALLOW_WATER_FRAMES in components/PixelFlame.tsx.
const W = 32, H = 32;

// --- lava bubbles: BIG lazy domes (span ~5 art-pixels) that swell and pop. Few of
// them, phase-staggered, on a slow cycle (LAVA_CYCLE_S in Tile.tsx) — molten goop,
// not a rolling boil.
function drawBubble(grid, col, srow, stage) {
  const put = (y, x, c) => { if (y>=0 && y<H && x>=0 && x<W && grid[y][x] === ".") grid[y][x] = c; };
  const set = (y, x, c) => { if (y>=0 && y<H && x>=0 && x<W) grid[y][x] = c; };
  switch (stage) {
    case 0: // faint remnant ripple
      put(srow, col, "o");
      break;
    case 1: // small dome rising
      set(srow, col - 1, "o"); set(srow, col, "O"); set(srow, col + 1, "o");
      put(srow - 1, col, "O");
      break;
    case 2: // swollen dome, 5 wide
      set(srow - 2, col, "G");
      set(srow - 1, col - 1, "O"); set(srow - 1, col, "G"); set(srow - 1, col + 1, "O");
      set(srow, col - 2, "o"); set(srow, col - 1, "O"); set(srow, col, "G");
      set(srow, col + 1, "O"); set(srow, col + 2, "o");
      break;
    case 3: // pop: bright crown, ring collapsing outward
      set(srow - 3, col, "O");
      set(srow - 2, col - 1, "G"); set(srow - 2, col, "Y"); set(srow - 2, col + 1, "G");
      set(srow - 1, col - 2, "O"); set(srow - 1, col + 2, "O");
      set(srow, col - 1, "o"); set(srow, col + 1, "o");
      break;
  }
}
// 9 bubbles in three loose bands (fewer than before — a slow simmer, not a boil).
const bubbles = [
  [7, 7, 1], [18, 5, 3], [27, 9, 0],
  [5, 17, 2], [14, 15, 0], [24, 18, 1],
  [9, 26, 3], [19, 27, 2], [28, 25, 0],
];
const lavaFrames = [];
for (let f = 0; f < 4; f++) {
  const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => "."));
  for (const [col, srow, phase] of bubbles) drawBubble(grid, col, srow, (f + phase) % 4);
  lavaFrames.push(grid.map((r) => r.join("")));
}

// --- water waves: low-contrast drifting lines ---
function wave(grid, xStart, row, len, chars) {
  const dyPattern = [0, 0, -1, -1, 0, 0, 1, 1];
  for (let i = 0; i < len; i++) {
    const x = (xStart + i) % W;
    const y = row + dyPattern[i % dyPattern.length];
    if (y < 0 || y >= H) continue;
    const ch = i === 0 || i === len - 1 ? chars.tail : (i % 5 === 2 ? chars.crest : chars.body);
    grid[y][x] = ch;
  }
}
function waveFrames(waveRows, len, chars, sparkles, drift) {
  const out = [];
  for (let f = 0; f < 4; f++) {
    const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => "."));
    waveRows.forEach(([row, x0], i) => {
      const dir = i % 2 === 0 ? 1 : -1;
      wave(grid, (x0 + dir * drift * f + W * 4) % W, row, len, chars);
    });
    for (const [gy, gx, gf] of sparkles) if (gf === f) grid[gy][gx] = "Y";
    out.push(grid.map((r) => r.join("")));
  }
  return out;
}
// Deep: four wave lines, two single-pixel glints per cycle.
const deepFrames = waveFrames(
  [[6, 3], [14, 14], [22, 8], [28, 20]],
  13,
  { body: "O", crest: "G", tail: "o" },
  [[11, 21, 1], [24, 9, 3]],
  3
);
// Shallow: three shorter LIGHT wave lines on the (darker) shallow base — the wave
// color and background swapped per Chris. Tail 'o' fades toward the base. No glints.
const shallowFrames = waveFrames(
  [[9, 6], [19, 17], [27, 4]],
  9,
  { body: "O", crest: "G", tail: "o" },
  [],
  3
);

console.log("LAVA_FRAMES=" + JSON.stringify(lavaFrames));
console.log("WATER_FRAMES=" + JSON.stringify(deepFrames));
console.log("SHALLOW_FRAMES=" + JSON.stringify(shallowFrames));
