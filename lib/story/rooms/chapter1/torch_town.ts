import { FLOOR, WALL, TileSubtype, Direction } from "../../../map";
import {
  placeCorner,
  placeT,
  placeEnd,
  layStraightBetween,
  layCircularHubIntersection,
} from "../../../map/roads";
import { NPC } from "../../../npc";
import type { StoryRoom } from "../types";

// House labels - defined once and reused
export const HOUSE_LABELS = {
  HOUSE_1: "Eldra's Cottage",
  HOUSE_2: "Maro & Kira's Cottage",
  HOUSE_3: "Jorin & Yanna's Cottage",
  HOUSE_4: "Serin's Clinic",
  HOUSE_5: "Rhett & Mira's Cottage",
  HOUSE_6: "Haro & Len's Cottage",
  HOUSE_7: "Fenna, Tavi & Arin's Cottage",
  HOUSE_8: "Dara's Cottage",
} as const;

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
        subtypes[y][x] = [TileSubtype.CHECKPOINT];
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
    { top: 20, left: 18, label: HOUSE_LABELS.HOUSE_1 },
    { top: 23, left: 19, label: HOUSE_LABELS.HOUSE_2 },
    { top: 19, left: 24, label: HOUSE_LABELS.HOUSE_3 },
    { top: 22, left: 25, label: HOUSE_LABELS.HOUSE_4 },
    { top: 24, left: 22, label: HOUSE_LABELS.HOUSE_5 },
    { top: 26, left: 25, label: HOUSE_LABELS.HOUSE_6 },
    { top: 27, left: 22, label: HOUSE_LABELS.HOUSE_7 },
    { top: 26, left: 18, label: HOUSE_LABELS.HOUSE_8 },
  ];

  for (const house of houses) {
    const door = buildStructure(house.top, house.left, homeWidth, homeHeight);
    homeAssignments[`${door[0]},${door[1]}`] = house.label;
  }

  // Build a welcoming dirt road from the southern gate toward the central plaza
  const roadStartRow = spawnRow;
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

  // Curve east toward the plaza center and west to the store
  layStraightBetween(tiles, subtypes, centerY, 9, centerY, centerX-3);
  placeT(tiles, subtypes, centerY, middlePathCol, ["S", "E", "W"]);
  placeEnd(tiles, subtypes, centerY, 8, "E");
  

  // A circlualr 4 road intersection around the central checkpoint hub
  layCircularHubIntersection(tiles, subtypes, centerY, centerX);
  

  // From the plaza intersection to the library
  layStraightBetween(tiles, subtypes, centerY -3, centerX, centerY - 6, centerX);
  placeT(tiles, subtypes, 12, 17, ["N", "E", "S"]);
  // straightwaway from 12,18, to 12, 25
  layStraightBetween(tiles, subtypes, 12, 18, 12, 25);
  placeCorner(tiles, subtypes, 12, 26, ["W", "N"]);
  layStraightBetween(tiles, subtypes, 11, 26, 9, 26);

  // From the plaza intersection to the store
  layStraightBetween(tiles, subtypes, centerY, centerX + 3, centerY, centerX + 7);
  placeCorner(tiles, subtypes, 17, 25, ["W", "N"]);

  // From the plaza intersection to house area
  layStraightBetween(tiles, subtypes, centerY +3, centerX, centerY + 5, centerX);
  placeEnd(tiles, subtypes, 22, 17, "N");
  

  // Final approach into the plaza with a T-intersection hub
  // placeStraight(tiles, subtypes, centerY + 1, middlePathCol, 90);
  // placeT(tiles, subtypes, centerY, centerX, ["W", "E", "S"]);
  // placeStraight(tiles, subtypes, centerY, centerX - 1, 0);
  // placeStraight(tiles, subtypes, centerY, centerX + 1, 0);
  // Turn east toward the plaza with a corner at (roadCornerRow, entryColumn)
  
  // NPCs - Day and Night positions
  const npcs: NPC[] = [];

  // 1. Eldra (Librarian) - Day: Library, Night: House 1
  npcs.push(new NPC({
    id: "npc-eldra",
    name: "Eldra",
    sprite: "/images/npcs/torch-town/eldra.png",
    y: libraryDoor[0] - 1,
    x: libraryDoor[1],
    facing: Direction.DOWN,
    canMove: false,
    metadata: { dayLocation: "library", nightLocation: "house1", house: HOUSE_LABELS.HOUSE_1 },
  }));

  // 2. Maro (Storekeeper) - Day: Store, Night: House 2
  npcs.push(new NPC({
    id: "npc-maro",
    name: "Maro",
    sprite: "/images/npcs/torch-town/maro.png",
    y: storeDoor[0] - 1,
    x: storeDoor[1],
    facing: Direction.DOWN,
    canMove: false,
    metadata: { dayLocation: "store", nightLocation: "house2", house: HOUSE_LABELS.HOUSE_2 },
  }));

  // 3. Captain Bren (Guard Captain) - Day: Patrol (plaza), Night: Guard Tower
  npcs.push(new NPC({
    id: "npc-captain-bren",
    name: "Captain Bren",
    sprite: "/images/npcs/torch-town/captain-bren.png",
    y: centerY - 2,
    x: centerX + 2,
    facing: Direction.DOWN,
    canMove: false,
    metadata: { dayLocation: "patrol", nightLocation: "guardTower" },
  }));

  // 4. Jorin (Blacksmith) - Day: Smithy, Night: House 3
  npcs.push(new NPC({
    id: "npc-jorin",
    name: "Jorin",
    sprite: "/images/npcs/torch-town/jorin.png",
    y: smithyDoor[0] - 1,
    x: smithyDoor[1],
    facing: Direction.DOWN,
    canMove: false,
    metadata: { dayLocation: "smithy", nightLocation: "house3", house: HOUSE_LABELS.HOUSE_3 },
  }));

  // 5. Yanna (Herbalist) - Day: Forest edge (near gate), Night: House 3
  npcs.push(new NPC({
    id: "npc-yanna",
    name: "Yanna",
    sprite: "/images/npcs/torch-town/yanna.png",
    y: spawnRow - 2,
    x: entryColumn + 2,
    facing: Direction.LEFT,
    canMove: false,
    metadata: { dayLocation: "forestEdge", nightLocation: "house3", house: HOUSE_LABELS.HOUSE_3 },
  }));

  // 6. Serin (Healer) - Day: House 4 (clinic), Night: House 4
  npcs.push(new NPC({
    id: "npc-serin",
    name: "Serin",
    sprite: "/images/npcs/torch-town/serin.png",
    y: houses[3].top + homeHeight,
    x: houses[3].left + 1,
    facing: Direction.DOWN,
    canMove: false,
    metadata: { dayLocation: "house4", nightLocation: "house4", house: HOUSE_LABELS.HOUSE_4 },
  }));

  // 7. Rhett (Farmer) - Day: Fields (near gate), Night: House 5
  npcs.push(new NPC({
    id: "npc-rhett",
    name: "Rhett",
    sprite: "/images/npcs/torch-town/rhett.png",
    y: spawnRow - 4,
    x: entryColumn - 2,
    facing: Direction.DOWN,
    canMove: false,
    metadata: { dayLocation: "fields", nightLocation: "house5", house: HOUSE_LABELS.HOUSE_5 },
  }));

  // 8. Mira (Weaver) - Day: Near house 5 (weaving), Night: House 5
  npcs.push(new NPC({
    id: "npc-mira",
    name: "Mira",
    sprite: "/images/npcs/torch-town/mira.png",
    y: houses[4].top + homeHeight,
    x: houses[4].left + 2,
    facing: Direction.LEFT,
    canMove: false,
    metadata: { dayLocation: "weaving", nightLocation: "house5", house: HOUSE_LABELS.HOUSE_5 },
  }));

  // 9. Kira (Teen) - Day: Wandering (plaza), Night: House 2
  npcs.push(new NPC({
    id: "npc-kira",
    name: "Kira",
    sprite: "/images/npcs/torch-town/kira.png",
    y: centerY + 1,
    x: centerX - 2,
    facing: Direction.RIGHT,
    canMove: false,
    metadata: { dayLocation: "plaza", nightLocation: "house2", house: HOUSE_LABELS.HOUSE_2 },
  }));

  // 10. Lio (Hunter) - Day: Near gate, Night: Wandering
  npcs.push(new NPC({
    id: "npc-lio",
    name: "Lio",
    sprite: "/images/npcs/torch-town/lio.png",
    y: spawnRow - 3,
    x: entryColumn + 3,
    facing: Direction.DOWN,
    canMove: false,
    metadata: { dayLocation: "gate", nightLocation: "gate" },
  }));

  // 11. Dara (Outsider) - Day: Town outskirts, Night: House 8
  npcs.push(new NPC({
    id: "npc-dara",
    name: "Dara",
    sprite: "/images/npcs/torch-town/dara.png",
    y: centerY + 4,
    x: centerX - 4,
    facing: Direction.DOWN,
    canMove: false,
    metadata: { dayLocation: "outskirts", nightLocation: "house8", house: HOUSE_LABELS.HOUSE_8 },
  }));

  // 12. Sela (Night Guard) - Day: Training yard, Night: Guard Tower
  npcs.push(new NPC({
    id: "npc-sela",
    name: "Sela",
    sprite: "/images/npcs/torch-town/sela.png",
    y: guardTowerDoor[0] + 1,
    x: guardTowerDoor[1] + 1,
    facing: Direction.LEFT,
    canMove: false,
    metadata: { dayLocation: "trainingYard", nightLocation: "guardTower" },
  }));

  // 13. Thane (Guard) - Day: Training yard, Night: Guard Tower
  npcs.push(new NPC({
    id: "npc-thane",
    name: "Thane",
    sprite: "/images/npcs/torch-town/thane.png",
    y: guardTowerDoor[0] + 1,
    x: guardTowerDoor[1] - 1,
    facing: Direction.RIGHT,
    canMove: false,
    metadata: { dayLocation: "trainingYard", nightLocation: "guardTower" },
  }));

  // 14. Old Fenna (Flame Caretaker) - Day: Central fire, Night: House 7
  npcs.push(new NPC({
    id: "npc-fenna",
    name: "Old Fenna",
    sprite: "/images/npcs/torch-town/old-fenna.png",
    y: centerY,
    x: centerX,
    facing: Direction.DOWN,
    canMove: false,
    metadata: { dayLocation: "centralFire", nightLocation: "house7", house: HOUSE_LABELS.HOUSE_7 },
  }));

  // 15. Arin (Carpenter) - Day: Work site (near houses), Night: House 7
  npcs.push(new NPC({
    id: "npc-arin",
    name: "Arin",
    sprite: "/images/npcs/torch-town/arin.png",
    y: centerY + 3,
    x: centerX + 3,
    facing: Direction.LEFT,
    canMove: false,
    metadata: { dayLocation: "workSite", nightLocation: "house7", house: HOUSE_LABELS.HOUSE_7 },
  }));

  // 16. Haro (Fisher) - Day: Fishing area, Night: House 6
  npcs.push(new NPC({
    id: "npc-haro",
    name: "Haro",
    sprite: "/images/npcs/torch-town/haro.png",
    y: spawnRow - 5,
    x: entryColumn - 3,
    facing: Direction.DOWN,
    canMove: false,
    metadata: { dayLocation: "fishing", nightLocation: "house6", house: HOUSE_LABELS.HOUSE_6 },
  }));

  // 17. Len (Fisher) - Day: Fishing area, Night: House 6
  npcs.push(new NPC({
    id: "npc-len",
    name: "Len",
    sprite: "/images/npcs/torch-town/len.png",
    y: spawnRow - 5,
    x: entryColumn - 4,
    facing: Direction.RIGHT,
    canMove: false,
    metadata: { dayLocation: "fishing", nightLocation: "house6", house: HOUSE_LABELS.HOUSE_6 },
  }));

  // 18. Tavi (Child) - Day: Playing in plaza, Night: House 7
  npcs.push(new NPC({
    id: "npc-tavi",
    name: "Tavi",
    sprite: "/images/npcs/torch-town/tavi.png",
    y: centerY + 2,
    x: centerX + 1,
    facing: Direction.UP,
    canMove: false,
    metadata: { dayLocation: "plaza", nightLocation: "house7", house: HOUSE_LABELS.HOUSE_7 },
  }));

  return {
    id: "story-torch-town",
    mapData: { tiles, subtypes, environment: "outdoor" },
    entryPoint,
    entryFromNext,
    transitionToPrevious,
    npcs,
    metadata: {
      displayLabel: "Torch Town",
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
