// Generated floor sheets: an alternative to the single repeating floor tile.
//
// A sheet is one seamless texture N x N tiles in size, synthesised from the hand-made
// floor tiles by scripts/gen-floor-sheets.mjs (see its header for how and why). Each
// floor tile shows the cell of the sheet at its map position modulo N, so neighbouring
// tiles show neighbouring pieces of one continuous image: no seam at the tile edge, no
// motif stamped on every tile, and the sheet itself only repeats every N tiles.
//
// Because the sheet is shared by every tile, wall shading can no longer come from
// swapping in a pre-shaded variant (floor-1000 and friends). It is drawn here instead:
// gradient layers over the sheet, chosen from which neighbours are walls, with falloff
// and tint measured from those hand-painted variants.

import type React from "react";
import { assetUrl } from "./asset_url";
import type { EnvironmentId } from "./environment";
import { FLOOR, FLOWERS, TREE } from "./map/constants";

export type FloorStyle = "classic" | "generated";

/** Parse the `?floor=` URL flag; null when it names neither style (keep the default). */
export function parseFloorStyle(value: string | null | undefined): FloorStyle | null {
  if (value === "generated" || value === "gen") return "generated";
  if (value === "classic") return "classic";
  return null;
}

// --- wall-shade mask -------------------------------------------------------------

export const SHADE_N = 1;
export const SHADE_E = 2;
export const SHADE_W = 4;
export const SHADE_NW = 8;
export const SHADE_NE = 16;

const KEY_TILE = 3;

// Anything that isn't open ground stands above the floor and darkens it: walls, doors,
// roofs, and the void past the map edge. This is the same test the classic north-edge
// tile uses, minus flowers/trees, which sit ON the ground.
function castsShade(tile: number | null): boolean {
  return !(tile === FLOOR || tile === FLOWERS || tile === TREE || tile === KEY_TILE);
}

/**
 * Which sides of the tile at (row, col) meet a wall. South is left out on purpose: a
 * wall below draws its top face over the bottom of this tile, so there is no floor
 * there to shade. The two northern diagonals only matter where the side itself is open,
 * i.e. at the end of a wall run, where they let the shadow round the corner instead of
 * stopping dead at the tile edge.
 */
export function floorShadeMask(
  tileAt: (row: number, col: number) => number | null,
  row: number,
  col: number
): number {
  let mask = 0;
  const n = castsShade(tileAt(row - 1, col));
  const e = castsShade(tileAt(row, col + 1));
  const w = castsShade(tileAt(row, col - 1));
  if (n) mask |= SHADE_N;
  if (e) mask |= SHADE_E;
  if (w) mask |= SHADE_W;
  if (!n && !w && castsShade(tileAt(row - 1, col - 1))) mask |= SHADE_NW;
  if (!n && !e && castsShade(tileAt(row - 1, col + 1))) mask |= SHADE_NE;
  return mask;
}

/** Fallback when only the four direct neighbours are known (no corner rounding). */
export function floorShadeMaskFromNeighbors(neighbors: {
  top: number | null;
  right: number | null;
  left: number | null;
}): number {
  return (
    (castsShade(neighbors.top) ? SHADE_N : 0) |
    (castsShade(neighbors.right) ? SHADE_E : 0) |
    (castsShade(neighbors.left) ? SHADE_W : 0)
  );
}

// --- shading --------------------------------------------------------------------

interface ShadeProfile {
  /** rgb triple of the shadow colour, "r, g, b" */
  rgb: string;
  /** [position %, alpha] from the wall edge inward, for a wall to the north */
  north: Array<[number, number]>;
  /** same for a wall to the east or west */
  side: Array<[number, number]>;
}

// Measured from floor-1000.png against its own lit half: an alpha overlay of one dark
// green, rgb(0, 12, 4), which is why the shadow keeps the floor's green instead of going
// grey. The north band is that tile's falloff exactly, so a wall's base looks as it
// always has. The side band is new (floor-0001 was painted but never used): its measured
// falloff was nearly as heavy as the north one (0.52 over 40%), which on real dailies,
// full of one-wide corridors, darkened the floor ~7% overall. Walls are lit from the
// north, so a side wall only needs contact shadow; this is ~65% as strong, 80% as wide.
const CAVE_SHADE: ShadeProfile = {
  rgb: "0, 12, 4",
  north: [
    [0, 0.58],
    [10, 0.47],
    [20, 0.34],
    [30, 0.17],
    [40, 0.07],
    [50, 0],
  ],
  side: [
    [0, 0.34],
    [8, 0.24],
    [16, 0.15],
    [24, 0.07],
    [32, 0],
  ],
};

// Measured from pink-realm-floor-1000.png the same way: a dark magenta overlay, lighter
// and a little shallower than the cave's. There is no painted side variant, so the side
// band is the north one at the same ~65% strength and 80% depth the cave's uses.
const PINK_REALM_SHADE: ShadeProfile = {
  rgb: "40, 0, 22",
  north: [
    [0, 0.42],
    [10, 0.32],
    [20, 0.21],
    [30, 0.13],
    [40, 0.04],
    [45, 0],
  ],
  side: [
    [0, 0.27],
    [8, 0.21],
    [16, 0.14],
    [24, 0.08],
    [32, 0.03],
    [36, 0],
  ],
};

function stops(profile: ShadeProfile, points: Array<[number, number]>, scale = 1): string {
  return points
    .map(([pos, a]) => `rgba(${profile.rgb}, ${a}) ${Math.round(pos * scale)}%`)
    .join(", ");
}

function shadeLayers(profile: ShadeProfile, mask: number): string[] {
  const layers: string[] = [];
  if (mask & SHADE_N) layers.push(`linear-gradient(to bottom, ${stops(profile, profile.north)})`);
  if (mask & SHADE_W) layers.push(`linear-gradient(to right, ${stops(profile, profile.side)})`);
  if (mask & SHADE_E) layers.push(`linear-gradient(to left, ${stops(profile, profile.side)})`);
  // Corner: an ellipse as deep as the north band and as wide as a side band, carrying
  // the north falloff, so it continues the band of the tile beside it exactly.
  const northDepth = profile.north[profile.north.length - 1][0];
  const sideDepth = profile.side[profile.side.length - 1][0];
  const corner = (at: string) =>
    `radial-gradient(${sideDepth}% ${northDepth}% at ${at}, ${stops(profile, profile.north, 100 / northDepth)})`;
  if (mask & SHADE_NW) layers.push(corner("0% 0%"));
  if (mask & SHADE_NE) layers.push(corner("100% 0%"));
  return layers;
}

// --- sheets ---------------------------------------------------------------------

interface FloorSheet {
  url: string;
  /** the sheet is tiles x tiles map tiles */
  tiles: number;
  /** null = no wall shading in this environment */
  shade: ShadeProfile | null;
}

const SHEETS: Partial<Record<EnvironmentId, FloorSheet>> = {
  cave: {
    url: assetUrl("/images/floor/generated/cave-floor-sheet-v1.webp"),
    tiles: 8,
    shade: CAVE_SHADE,
  },
  outdoor: {
    url: assetUrl("/images/floor/generated/grass-floor-sheet-v1.webp"),
    tiles: 8,
    // Outdoors has never shaded its floor (environment.ts keeps the plain tile at wall
    // edges on purpose), so the generated grass doesn't either.
    shade: null,
  },
  pink_realm: {
    url: assetUrl("/images/floor/generated/pink-realm-floor-sheet-v1.webp"),
    tiles: 8,
    shade: PINK_REALM_SHADE,
  },
};

export function hasFloorSheet(environment: EnvironmentId | undefined): boolean {
  return !!environment && !!SHEETS[environment];
}

/**
 * Background style for a floor tile drawn from the environment's generated sheet, or
 * null when the environment has no sheet (the caller keeps the classic tile).
 */
export function generatedFloorBackground(
  environment: EnvironmentId | undefined,
  row: number,
  col: number,
  shadeMask: number
): Pick<
  React.CSSProperties,
  "backgroundImage" | "backgroundSize" | "backgroundPosition" | "backgroundRepeat"
> | null {
  const sheet = environment ? SHEETS[environment] : undefined;
  if (!sheet) return null;
  const n = sheet.tiles;
  const cx = ((col % n) + n) % n;
  const cy = ((row % n) + n) % n;
  // With the image n times the box, position p% puts the image's p% point on the box's
  // p% point, so cell k of n sits at k / (n - 1).
  const pos = (k: number) => `${(k / (n - 1)) * 100}%`;
  const shade = sheet.shade ? shadeLayers(sheet.shade, shadeMask) : [];
  return {
    backgroundImage: [...shade, `url(${sheet.url})`].join(", "),
    backgroundSize: [...shade.map(() => "100% 100%"), `${n * 100}% ${n * 100}%`].join(", "),
    backgroundPosition: [...shade.map(() => "0 0"), `${pos(cx)} ${pos(cy)}`].join(", "),
    backgroundRepeat: "no-repeat",
  };
}
