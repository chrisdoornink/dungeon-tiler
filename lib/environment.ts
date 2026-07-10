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

export function getWallAsset(
  environment: EnvironmentId | undefined,
  pattern: string
): string {
  const config = getEnvironmentConfig(environment);
  return `${config.wallPrefix}${pattern}.png`;
}
