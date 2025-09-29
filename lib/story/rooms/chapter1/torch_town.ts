import { FLOOR, WALL, TileSubtype } from "../../../map";
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

  const ensureSubtype = (y: number, x: number, ...types: TileSubtype[]) => {
    if (!subtypes[y][x]) subtypes[y][x] = [];
    if (types.length === 0) return;
    const cell = subtypes[y][x];
    for (const subtype of types) {
      if (!cell.includes(subtype)) {
        cell.push(subtype);
      }
    }
  };

  const markRoad = (
    y: number,
    x: number,
    shape: TileSubtype,
    rotation: 0 | 90 | 180 | 270 = 0
  ) => {
    tiles[y][x] = FLOOR;
    ensureSubtype(y, x); // ensure the cell exists before filtering rotations
    subtypes[y][x] = subtypes[y][x].filter(
      (value) =>
        value !== TileSubtype.ROAD_ROTATE_90 &&
        value !== TileSubtype.ROAD_ROTATE_180 &&
        value !== TileSubtype.ROAD_ROTATE_270
    );
    ensureSubtype(y, x, TileSubtype.ROAD, shape);
    if (rotation === 90) {
      ensureSubtype(y, x, TileSubtype.ROAD_ROTATE_90);
    } else if (rotation === 180) {
      ensureSubtype(y, x, TileSubtype.ROAD_ROTATE_180);
    } else if (rotation === 270) {
      ensureSubtype(y, x, TileSubtype.ROAD_ROTATE_270);
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
  for (let y = centerY - 1; y <= centerY + 1; y++) {
    for (let x = centerX - 1; x <= centerX + 1; x++) {
      if (y === centerY && x === centerX) {
        tiles[y][x] = FLOOR;
        subtypes[y][x] = [TileSubtype.CHECKPOINT, TileSubtype.WALL_TORCH];
      } else if (y === centerY || x === centerX) {
        tiles[y][x] = FLOOR;
        if (!subtypes[y][x]) subtypes[y][x] = [];
      } else {
        tiles[y][x] = WALL;
        subtypes[y][x] = [];
      }
    }
  }

  // Library anchors the north side of the plaza
  const libraryWidth = 5;
  const libraryHeight = 4;
  const libraryTop = innerMin + 3;
  const libraryLeft = centerX - Math.floor(libraryWidth / 2);
  const libraryDoor = buildStructure(
    libraryTop,
    libraryLeft,
    libraryWidth,
    libraryHeight
  );

  // Store sits to the west of the central plaza
  const storeWidth = 4;
  const storeHeight = 3;
  const storeTop = centerY - Math.floor(storeHeight / 2) - 2;
  const storeLeft = centerX - storeWidth - 6;
  const storeDoor = buildStructure(
    storeTop,
    storeLeft,
    storeWidth,
    storeHeight
  );

  // Workshop / smithy is mirrored to the east of the plaza
  const smithyWidth = 4;
  const smithyHeight = 3;
  const smithyTop = storeTop;
  const smithyLeft = centerX + 6;
  const smithyDoor = buildStructure(
    smithyTop,
    smithyLeft,
    smithyWidth,
    smithyHeight
  );

  // Guard tower watches from the north-east corner with a front-facing door
  const guardTowerWidth = 3;
  const guardTowerHeight = 4;
  const guardTowerTop = innerMin + 1;
  const guardTowerLeft = innerMax - guardTowerWidth - 2;
  const guardTowerDoor = buildStructure(
    guardTowerTop,
    guardTowerLeft,
    guardTowerWidth,
    guardTowerHeight
  );

  const homeAssignments: Record<string, string> = {};
  const homeWidth = 3;
  const homeHeight = 2;
  const houses: Array<{ top: number; left: number; label: string }> = [
    { top: 20, left: 18, label: "Eldra's Cottage" },
    { top: 23, left: 19, label: "Maro & Kira" },
    { top: 19, left: 24, label: "Guard Barracks" },
    { top: 22, left: 25, label: "Jorin & Yanna" },
    { top: 24, left: 22, label: "Serin" },
    { top: 26, left: 25, label: "Rhett & Mira" },
    { top: 27, left: 22, label: "Dara" },
    { top: 26, left: 18, label: "Fenna & Tavi" },
  ];

  for (const house of houses) {
    const door = buildStructure(house.top, house.left, homeWidth, homeHeight);
    homeAssignments[`${door[0]},${door[1]}`] = house.label;
  }

  // Build a welcoming dirt road from the southern gate toward the central plaza
  const roadStartRow = spawnRow;
  const desiredCornerRow = centerY + 5;
  const roadCornerRow = Math.max(
    Math.min(roadStartRow - 1, desiredCornerRow),
    centerY + 2
  );

  // Southern entry terminates the road with a cul-de-sac cap
  markRoad(roadStartRow, entryColumn, TileSubtype.ROAD_END, 180);

  for (let y = roadStartRow - 1; y > roadCornerRow; y--) {
    markRoad(y, entryColumn, TileSubtype.ROAD_STRAIGHT, 90);
  }

  // Turn east toward the plaza
  markRoad(roadCornerRow, entryColumn, TileSubtype.ROAD_CORNER, 90);
  for (let x = entryColumn + 1; x < centerX; x++) {
    markRoad(roadCornerRow, x, TileSubtype.ROAD_STRAIGHT);
  }

  // Curve north toward the plaza center
  markRoad(roadCornerRow, centerX, TileSubtype.ROAD_CORNER, 270);
  for (let y = roadCornerRow - 1; y > centerY + 1; y--) {
    markRoad(y, centerX, TileSubtype.ROAD_STRAIGHT, 90);
  }

  // Final approach into the plaza with a T-intersection hub
  markRoad(centerY + 1, centerX, TileSubtype.ROAD_STRAIGHT, 90);
  markRoad(centerY, centerX, TileSubtype.ROAD_T);
  markRoad(centerY, centerX - 1, TileSubtype.ROAD_STRAIGHT);
  markRoad(centerY, centerX + 1, TileSubtype.ROAD_STRAIGHT);

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
        smithyDoor,
        smithySize: [smithyWidth, smithyHeight],
        guardTowerDoor,
        guardTowerSize: [guardTowerWidth, guardTowerHeight],
        homeSize: [homeWidth, homeHeight],
      },
    },
  };
}
