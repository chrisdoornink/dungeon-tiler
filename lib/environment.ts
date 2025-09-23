export type EnvironmentId = "cave" | "outdoor" | "house";

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
    floorDefault: "/images/floor/floor-try-1.png",
    floorNorthEdge: "/images/floor/floor-1000.png",
    wallPrefix: "/images/wall/wall-",
    daylight: false,
  },
  outdoor: {
    id: "outdoor",
    floorDefault: "/images/floor/outdoor-floor-0000.png",
    floorNorthEdge: "/images/floor/outdoor-floor-0000.png", // leave this alone please.
    wallPrefix: "/images/wall/outdoor-wall-",
    daylight: true,
  },
  house: {
    id: "house",
    floorDefault: "/images/floor/in-house-floor-0000.png",
    floorNorthEdge: "/images/floor/in-house-floor-1000.png",
    wallPrefix: "/images/wall/outdoor-wall-",
    daylight: true,
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
