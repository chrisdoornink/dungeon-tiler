// Post-build trim of standalone/dist/images for a lean, uploadable portal bundle.
//   1) Remove directories endless provably never renders (story/town art).
//   2) Downscale oversized PNGs to a 256px max dimension (sprites display at ~40-64px,
//      so 256px is lossless in practice). Keeps .png filenames, so no code changes.
// Paths are loaded on demand at runtime, so anything still referenced but missing would
// 404 — the verification step (serve from a subpath, play, check network) is the safety net.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES = path.resolve(dirname, "../dist/images");
const MAX_DIM = 256;

// Directories that are story/town/daily-only — never rendered in endless mode.
const REMOVE = [
  "npcs",
  "dog-golden",
  "hanging-signs",
  "roof",
  "items/beds",
  "enemies/bosses", // the Shaper puzzle boss is daily/test-only, not in endless
];

function dirSize(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += dirSize(p);
    else total += fs.statSync(p).size;
  }
  return total;
}

function walkPngs(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkPngs(p, out);
    else if (e.name.toLowerCase().endsWith(".png")) out.push(p);
  }
  return out;
}

if (!fs.existsSync(IMAGES)) {
  console.error("No dist/images — run `vite build` first.");
  process.exit(1);
}

const before = dirSize(IMAGES);

// 1) Remove story/town directories
for (const rel of REMOVE) {
  const p = path.join(IMAGES, rel);
  if (fs.existsSync(p)) {
    const sz = dirSize(p);
    fs.rmSync(p, { recursive: true, force: true });
    console.log(`removed ${rel}/ (${(sz / 1024 / 1024).toFixed(2)} MB)`);
  }
}

// 2) Downscale oversized PNGs with macOS sips (only when a dimension exceeds MAX_DIM)
let downscaled = 0;
for (const png of walkPngs(IMAGES)) {
  try {
    const info = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", png], {
      encoding: "utf8",
    });
    const w = Number(/pixelWidth: (\d+)/.exec(info)?.[1] || 0);
    const h = Number(/pixelHeight: (\d+)/.exec(info)?.[1] || 0);
    if (Math.max(w, h) > MAX_DIM) {
      execFileSync("sips", ["-Z", String(MAX_DIM), png], { stdio: "ignore" });
      downscaled++;
    }
  } catch {
    // leave the file as-is if sips can't read it
  }
}

const after = dirSize(IMAGES);
console.log(`downscaled ${downscaled} PNGs to <=${MAX_DIM}px`);
console.log(
  `dist/images: ${(before / 1024 / 1024).toFixed(2)} MB -> ${(after / 1024 / 1024).toFixed(2)} MB`
);
