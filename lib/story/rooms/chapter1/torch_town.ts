import { FLOOR, WALL, TileSubtype } from "../../../map";
import {
  placeStraight,
  placeCorner,
  placeT,
  placeEnd,
  layStraightBetween,
  layManhattan,
  layCircularHubIntersection,
} from "../../../map/roads";
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

  // Roads are placed using helpers from lib/map/roads.ts

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
  const roadCornerRow = 28;

  const middlePathCol = centerX - 5;


  // Vertical segment from
  layStraightBetween(tiles, subtypes, roadStartRow +1, entryColumn, roadCornerRow, entryColumn);
  placeCorner(tiles, subtypes, 28, 3, ["S", "E"]);
  
  // Horizontal run to just before centerX
  layStraightBetween(tiles, subtypes, roadCornerRow, entryColumn + 1, roadCornerRow, middlePathCol-1);

  // Curve north toward the plaza center with corner at (roadCornerRow, centerX)
  placeCorner(tiles, subtypes, roadCornerRow, middlePathCol, ["W", "N"]);
  // Vertical run up to one below centerY
  layStraightBetween(tiles, subtypes, roadCornerRow - 1, middlePathCol, centerY + 1, middlePathCol);

  // Curve east toward the plaza center
  placeCorner(tiles, subtypes, centerY, middlePathCol, ["S", "E"]);
  layStraightBetween(tiles, subtypes, centerY, middlePathCol + 1, centerY, centerX-3);
  

  // A circlualr 4 road intersection around the central checkpoint hub
  layCircularHubIntersection(tiles, subtypes, centerY, centerX);
  

  // From the plaza intersection to the library
  layStraightBetween(tiles, subtypes, centerY, centerX + 3, centerY, centerX + 5);

  // Final approach into the plaza with a T-intersection hub
  // placeStraight(tiles, subtypes, centerY + 1, middlePathCol, 90);
  // placeT(tiles, subtypes, centerY, centerX, ["W", "E", "S"]);
  // placeStraight(tiles, subtypes, centerY, centerX - 1, 0);
  // placeStraight(tiles, subtypes, centerY, centerX + 1, 0);
  // Turn east toward the plaza with a corner at (roadCornerRow, entryColumn)
  

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
