import { FLOOR, WALL, TileSubtype, type RoomId } from "../../../map";
import type { StoryRoom } from "../types";

export function buildTorchTown(): StoryRoom {
  const SIZE = 35;
  // Initialize as walls so nothing outside the city walls renders as grass
  const tiles: number[][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => [] as number[])
  );

  const ensureSubtype = (y: number, x: number, subtype: TileSubtype) => {
    const cell = subtypes[y][x] ?? [];
    if (!cell.includes(subtype)) {
      subtypes[y][x] = [...cell, subtype];
    }
  };

  const grassMargin = 2;
  const wallThickness = 2;
  const wallMin = grassMargin;
  const wallMax = SIZE - grassMargin - 1;

  for (let layer = 0; layer < wallThickness; layer++) {
    const top = wallMin + layer;
    const bottom = wallMax - layer;
    for (let x = wallMin; x <= wallMax; x++) {
      tiles[top][x] = WALL;
      subtypes[top][x] = [];
      tiles[bottom][x] = WALL;
      subtypes[bottom][x] = [];
    }
    for (let y = wallMin; y <= wallMax; y++) {
      const left = wallMin + layer;
      const right = wallMax - layer;
      tiles[y][left] = WALL;
      subtypes[y][left] = [];
      tiles[y][right] = WALL;
      subtypes[y][right] = [];
    }
  }

  // Carve interior floor inside the double walls
  for (let y = wallMin + wallThickness; y <= wallMax - wallThickness; y++) {
    for (let x = wallMin + wallThickness; x <= wallMax - wallThickness; x++) {
      tiles[y][x] = FLOOR;
      if (!subtypes[y][x]) subtypes[y][x] = [];
    }
  }

  // Bottom-left entrance opening with a short corridor
  const entryColumn = wallMin + 1;
  const transitionRow = SIZE - 1;
  const corridorRows = [
    wallMax - 2, // need one tile of space for the entrance into the town
    wallMax - 1,
    wallMax,
    transitionRow - 1,
    transitionRow,
  ];
  for (const row of corridorRows) {
    if (tiles[row]?.[entryColumn] !== undefined) {
      tiles[row][entryColumn] = FLOOR;
      subtypes[row][entryColumn] = [];
    }
  }
  const spawnRow = transitionRow - 1; // just inside the map at the bottom of the corridor
  ensureSubtype(transitionRow, entryColumn, TileSubtype.ROOM_TRANSITION);

  const entryPoint: [number, number] = [spawnRow, entryColumn];
  const transitionToPrevious: [number, number] = [transitionRow, entryColumn];
  const entryFromNext: [number, number] = [entryPoint[0], entryPoint[1]];

  const buildStructure = (
    top: number,
    left: number,
    width: number,
    height: number
  ): [number, number] => {
    for (let y = top; y < top + height; y++) {
      for (let x = left; x < left + width; x++) {
        tiles[y][x] = WALL;
        subtypes[y][x] = [];
      }
    }
    const doorRow = top + height - 1;
    const doorCol = left + Math.floor(width / 2);
    // Mark building door as both a door and a room transition entry point
    subtypes[doorRow][doorCol] = [
      TileSubtype.DOOR,
      TileSubtype.ROOM_TRANSITION,
    ];

    return [doorRow, doorCol];
  };

  const innerMin = wallMin + wallThickness;
  const innerMax = wallMax - wallThickness;

  // Central plaza checkpoint roughly in the middle of the inner area
  const centerY = Math.floor((innerMin + innerMax) / 2);
  const centerX = Math.floor((innerMin + innerMax) / 2);
  if (tiles[centerY]?.[centerX] === FLOOR) {
    subtypes[centerY][centerX] = [TileSubtype.CHECKPOINT];
  }

  // Library: taller building, placed near upper third
  const libraryWidth = 3;
  const libraryHeight = 5;
  const libraryTop =
    innerMin + Math.max(2, Math.floor((innerMax - innerMin) / 6));
  const libraryLeft =
    innerMin + Math.floor((innerMax - innerMin - libraryWidth) / 2);
  const libraryDoor = buildStructure(
    libraryTop,
    libraryLeft,
    libraryWidth,
    libraryHeight
  );

  // Store: shorter building, placed below library with more spacing
  const storeWidth = 3;
  const storeHeight = 3;
  const storeTop = Math.min(
    innerMax - storeHeight - 2,
    libraryTop + libraryHeight + 8
  );
  const storeLeft = libraryLeft;
  const storeDoor = buildStructure(
    storeTop,
    storeLeft,
    storeWidth,
    storeHeight
  );

  const homeLastNames = [
    "Ashwood",
    "Brightfield",
    "Cindercrest",
    "Dawnhollow",
    "Emberline",
    "Frostvale",
    "Glimmerstone",
    "Highridge",
    "Ironwood",
    "Juniperfell",
  ];
  const homeAssignments: Record<string, string> = {};
  const homeWidth = 3;
  const homeHeight = 2;
  // Helper: check if a rectangular area is clear floor (no overlaps)
  const isAreaFree = (top: number, left: number, w: number, h: number) => {
    for (let y = top; y < top + h; y++) {
      for (let x = left; x < left + w; x++) {
        if (y < innerMin || y > innerMax || x < innerMin || x > innerMax)
          return false;
        if (tiles[y]?.[x] !== FLOOR) return false; // something already occupies this spot
      }
    }
    return true;
  };
  // Base rows (structured), then apply small jitter so they aren't in straight lines
  const baseRows: number[] = [];
  for (let y = innerMin + 4; y <= innerMax - homeHeight - 4; y += 5)
    baseRows.push(y);
  const leftColBase = innerMin + 3;
  const rightColBase = innerMax - homeWidth - 3;

  const jitter = (range: number) =>
    Math.floor(Math.random() * (2 * range + 1)) - range;
  const candidates: Array<{ top: number; left: number }> = [];
  for (const baseTop of baseRows) {
    // Left column home
    candidates.push({ top: baseTop, left: leftColBase });
    // Right column home
    candidates.push({ top: baseTop, left: rightColBase });
  }

  const homesToPlace = Math.min(10, homeLastNames.length);
  let homesPlaced = 0;
  for (const base of candidates) {
    if (homesPlaced >= homesToPlace) break;
    // Apply small jitter (±2 tiles) and clamp inside bounds
    const dy = jitter(2);
    const dx = jitter(2);
    let top = Math.max(
      innerMin + 2,
      Math.min(innerMax - homeHeight - 2, base.top + dy)
    );
    let left = Math.max(
      innerMin + 2,
      Math.min(innerMax - homeWidth - 2, base.left + dx)
    );
    // Keep a little breathing room from the center plaza
    const tooCloseToCenter =
      Math.abs(top - centerY) <= 2 && Math.abs(left - centerX) <= 2;
    if (tooCloseToCenter) continue;
    if (!isAreaFree(top, left, homeWidth, homeHeight)) {
      // Try a couple nearby fallbacks without randomness explosion
      const fallbackSpots: Array<[number, number]> = [
        [top, left + 1],
        [top, left - 1],
        [top + 1, left],
        [top - 1, left],
      ];
      let placed = false;
      for (const [fy, fx] of fallbackSpots) {
        if (
          fy >= innerMin + 2 &&
          fy <= innerMax - homeHeight - 2 &&
          fx >= innerMin + 2 &&
          fx <= innerMax - homeWidth - 2 &&
          !(Math.abs(fy - centerY) <= 2 && Math.abs(fx - centerX) <= 2) &&
          isAreaFree(fy, fx, homeWidth, homeHeight)
        ) {
          top = fy;
          left = fx;
          placed = true;
          break;
        }
      }
      if (!placed) continue;
    }
    const door = buildStructure(top, left, homeWidth, homeHeight);
    homeAssignments[`${door[0]},${door[1]}`] =
      homeLastNames[homesPlaced] ?? `Family ${homesPlaced + 1}`;
    homesPlaced++;
  }

  return {
    id: "story-torch-town",
    mapData: { tiles, subtypes, environment: "outdoor" },
    entryPoint,
    entryFromNext,
    transitionToPrevious,
    metadata: {
      homes: homeAssignments,
      buildings: {
        libraryDoor,
        librarySize: [libraryWidth, libraryHeight],
        storeDoor,
        storeSize: [storeWidth, storeHeight],
        homeSize: [homeWidth, homeHeight],
      },
    },
  };
}
