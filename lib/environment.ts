import { assetUrl } from "./asset_url";

export type EnvironmentId = "cave" | "outdoor" | "house" | "pink_realm";

export const DEFAULT_ENVIRONMENT: EnvironmentId = "cave";

interface EnvironmentConfig {
  id: EnvironmentId;
  floorDefault: string;
  floorNorthEdge: string;
  wallPrefix: string;
  daylight: boolean;
}

const ENVIRONMENT_CONFIGS: Record<EnvironmentId, EnvironmentConfig> = {
  cave: {
    id: "cave",
    floorDefault: assetUrl("/images/floor/floor-try-1.png"),
    floorNorthEdge: assetUrl("/images/floor/floor-1000.png"),
    wallPrefix: assetUrl("/images/wall/wall-"),
    daylight: false,
  },
  outdoor: {
    id: "outdoor",
    floorDefault: assetUrl("/images/floor/outdoor-floor-0000.png"),
    floorNorthEdge: assetUrl("/images/floor/outdoor-floor-0000.png"), // leave this alone please.
    wallPrefix: assetUrl("/images/wall/outdoor-wall-"),
    daylight: true,
  },
  house: {
    id: "house",
    floorDefault: assetUrl("/images/floor/in-house-floor-0000.png"),
    floorNorthEdge: assetUrl("/images/floor/in-house-floor-1000.png"),
    wallPrefix: assetUrl("/images/wall/outdoor-wall-"),
    daylight: true,
  },
  pink_realm: {
    id: "pink_realm",
    floorDefault: assetUrl("/images/floor/pink-realm-floor.png"),
    floorNorthEdge: assetUrl("/images/floor/pink-realm-floor-1000.png"),
    wallPrefix: assetUrl("/images/wall/pink-realm-wall-"),
    daylight: false,
  },
};

export function getEnvironmentConfig(
  environment?: EnvironmentId | null
): EnvironmentConfig {
  if (!environment) return ENVIRONMENT_CONFIGS[DEFAULT_ENVIRONMENT];
  return (
    ENVIRONMENT_CONFIGS[environment] ?? ENVIRONMENT_CONFIGS[DEFAULT_ENVIRONMENT]
  );
}

export function getFloorAsset(
  environment: EnvironmentId | undefined,
  options: { hasNorthNeighbor: boolean }
): string {
  const config = getEnvironmentConfig(environment);
  if (!options.hasNorthNeighbor) {
    return config.floorNorthEdge || config.floorDefault;
  }
  return config.floorDefault;
}

// Wall pieces whose art was corrected after the fact. A changed sprite needs a new filename
// or cached clients keep the old one (see Art assets in CLAUDE.md), and wall files are named
// by pattern, so the corrected ones are mapped here.
const WALL_FILE_OVERRIDES: Partial<Record<EnvironmentId, Record<string, string>>> = {
  // The right end of a wall run. Its dark edge was 9px wide where every other piece's is 4,
  // so the wall's edge jogged sideways where this piece met the tile above it.
  cave: { "0001": "0001-thin-edge" },
};

export function getWallAsset(
  environment: EnvironmentId | undefined,
  pattern: string
): string {
  const config = getEnvironmentConfig(environment);
  const file = WALL_FILE_OVERRIDES[config.id]?.[pattern] ?? pattern;
  return `${config.wallPrefix}${file}.png`;
}

/**
 * Which wall piece's top to draw over the bottom third of a tile that has a wall below it.
 * It is the top face OF that wall, so it follows the wall's own side neighbours: a run gets
 * one continuous top face, and only its ends draw an edge, lined up with the edge on the
 * piece beneath. (It used to follow the upper tile's side neighbours, which above a run
 * are floor, so every top face drew both edges and a run's top was seamed at every tile.)
 * Without the diagonal neighbours, the tile's own sides stand in for the wall's.
 */
export function wallTopPattern(neighbors: {
  left: number | null;
  right: number | null;
  bottomLeft?: number | null;
  bottomRight?: number | null;
}): string {
  const WALL = 1;
  const wallLeft = (neighbors.bottomLeft !== undefined ? neighbors.bottomLeft : neighbors.left) === WALL;
  const wallRight = (neighbors.bottomRight !== undefined ? neighbors.bottomRight : neighbors.right) === WALL;
  if (wallLeft && wallRight) return "0111"; // mid-run: no edge
  if (wallLeft) return "0011"; // right end: right edge only
  if (wallRight) return "0110"; // left end: left edge only
  return "0010"; // lone column: both edges
}
