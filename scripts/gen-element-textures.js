// 32x32 pixel-art crust textures emitted as tiny PNG data-URIs (SVG rects at this
// resolution would bloat the CSS by ~100KB per texture; a paletted mottle PNG is <1KB).
const zlib = require("zlib");

// --- minimal PNG encoder (truecolor, no alpha) ---
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(pixels /* [[ '#rrggbb', ...] rows] */) {
  const h = pixels.length, w = pixels[0].length;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  const raw = Buffer.alloc(h * (1 + w * 3));
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0; // filter none
    for (let x = 0; x < w; x++) {
      const hex = pixels[y][x];
      raw[o++] = parseInt(hex.slice(1, 3), 16);
      raw[o++] = parseInt(hex.slice(3, 5), 16);
      raw[o++] = parseInt(hex.slice(5, 7), 16);
    }
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return `url("data:image/png;base64,${png.toString("base64")}")`;
}

// --- mottle generator (same hash family as before, finer grid) ---
const N = 32;
function mottle(pal, weights) {
  const rows = [];
  for (let y = 0; y < N; y++) {
    const row = [];
    for (let x = 0; x < N; x++) {
      const h = ((x * 31 + y * 17) ^ (x * y + 7)) % 16;
      let idx = 0, acc = 0;
      for (let i = 0; i < weights.length; i++) { acc += weights[i]; if (h < acc) { idx = i; break; } idx = i; }
      row.push(pal[idx]);
    }
    rows.push(row);
  }
  return rows;
}


// Calm variant for water: the per-pixel hash reads as TV static, so water uses
// LOW-FREQUENCY blotches instead — 2x2 blocks, ~85% flat base, sparse low-contrast
// flecks. (Lava/obsidian/stone keep the busier per-pixel mottle; molten rock and
// speckled stone want the grain.)
function calmMottle(base, flecks /* [color, ...] */) {
  const rows = [];
  for (let y = 0; y < N; y++) {
    const row = [];
    for (let x = 0; x < N; x++) {
      const bx = x >> 1, by = y >> 1; // 2x2 blocks
      const h = ((bx * 37 + by * 23) ^ (bx * by + 11)) % 20;
      row.push(h < flecks.length ? flecks[h] : base);
    }
    rows.push(row);
  }
  return rows;
}

// Lava crust: dark molten rock, sparse embers (colors unchanged from the 8x8 version,
// just 4x finer).
const lavaPal = ["#5a1e08", "#6e2a0c", "#8a3410", "#a8431a", "#7a2c0c", "#c8541e"];
const lava = mottle(lavaPal, [5, 4, 2, 2, 2, 1]);
// Obsidian: dark volcanic glass with faint warm cracks.
const obsPal = ["#141014", "#241a18", "#1b1416", "#3a221c", "#181114", "#5a2410"];
const obsidian = mottle(obsPal, [6, 3, 3, 1, 2, 1]);
// Shallow water: colors SWAPPED per Chris — dark slate-blue base (the old wave-shadow
// family), with the LIGHT wave lines now living in SHALLOW_WATER_FRAMES.
const shallow = calmMottle("#2C5B7E", ["#35688C", "#24506F", "#2F6184"]);
// Deep water: same dark navy, calmed.
const deep = calmMottle("#173F66", ["#1D4A75", "#122F52", "#1A4570"]);
// Stepping stone slab.
const stone = mottle(["#8a8f94", "#767b80", "#9aa0a5", "#63686d"], [6, 5, 3, 2]);

console.log("LAVA=" + encodePNG(lava));
console.log("OBSIDIAN=" + encodePNG(obsidian));
console.log("SHALLOW=" + encodePNG(shallow));
console.log("DEEP=" + encodePNG(deep));
console.log("STONE=" + encodePNG(stone));

// Usage: node scripts/gen-element-textures.js
// Paste the emitted url("data:image/png;base64,...") values into the matching
// background-image lines in components/Tile.module.css (.lava/.obsidian/
// .shallowWater/.deepWater/.steppingStone). Palettes are the arrays above.
