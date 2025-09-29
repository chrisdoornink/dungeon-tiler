import { FLOOR, WALL, TileSubtype, Direction, type RoomId } from "../../../map";
import { NPC } from "../../../npc";
import type { StoryRoom } from "../types";

export function buildOutdoorClearing(): StoryRoom {
  const OUTER_WIDTH = 12;
  const OUTER_HEIGHT = 20;
  const width = OUTER_WIDTH + 2;
  const height = OUTER_HEIGHT + 2;

  const tiles: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => [] as number[])
  );

  // Helper to ensure a subtype array exists and add unique subtypes
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

  // Mark a tile as part of a road with shape + optional rotation flags
  const markRoad = (
    y: number,
    x: number,
    shape: TileSubtype,
    rotation: 0 | 90 | 180 | 270 = 0
  ) => {
    tiles[y][x] = FLOOR;
    ensureSubtype(y, x); // ensure the cell exists before filtering rotations
    // Remove previous rotation flags so only one rotation applies
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

  for (let y = 1; y <= OUTER_HEIGHT; y++) {
    for (let x = 1; x <= OUTER_WIDTH; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  const entryX = 1 + Math.floor((OUTER_WIDTH - 1) / 2);
  const entryY = height - 4;
  const bottomOpeningY = height - 1;
  tiles[bottomOpeningY][entryX] = FLOOR;
  subtypes[bottomOpeningY][entryX] = [TileSubtype.ROOM_TRANSITION];

  const entryPoint: [number, number] = [bottomOpeningY - 1, entryX];
  const transitionToPrevious: [number, number] = [bottomOpeningY, entryX];

  const checkpointY = Math.max(1, entryPoint[0] - 7);
  const checkpointX = entryPoint[1];
  if (tiles[checkpointY]?.[checkpointX] === FLOOR) {
    subtypes[checkpointY][checkpointX] = [TileSubtype.CHECKPOINT];
  }

  // Add small clusters of rocks to give the outdoor space some structure
  const featureSpots: Array<[number, number, number[]]> = [
    [entryY - 4, entryX - 4, [TileSubtype.ROCK]],
    [entryY - 6, entryX + 3, [TileSubtype.ROCK]],
    [entryY + 2, entryX - 3, [TileSubtype.ROCK]],
  ];
  for (const [fy, fx, values] of featureSpots) {
    if (tiles[fy]?.[fx] === FLOOR && subtypes[fy][fx].length === 0) {
      subtypes[fy][fx] = values.slice();
    }
  }

  // Add ~5 more rocks randomly on empty floor tiles (non-blocking variety)
  {
    const want = 5;
    let placed = 0;
    const rand = (min: number, max: number) =>
      Math.floor(Math.random() * (max - min + 1)) + min;
    for (let attempts = 0; attempts < 500 && placed < want; attempts++) {
      const y = rand(1, height - 2);
      const x = rand(1, width - 2);
      if (tiles[y][x] !== FLOOR) continue;
      if (subtypes[y][x].length > 0) continue; // keep clear of other features/NPCs/etc
      subtypes[y][x] = [TileSubtype.ROCK];
      placed++;
    }
  }

  const houseTopY = entryY - 12;
  const houseHeight = 3;
  const houseLeftX = OUTER_WIDTH - 4;

  for (let y = 0; y < houseHeight; y++) {
    const row = houseTopY + y;
    for (let x = 0; x < 3; x++) {
      const col = houseLeftX + x;
      if (tiles[row]?.[col] !== undefined) {
        tiles[row][col] = WALL;
        subtypes[row][col] = [];
      }
    }
  }

  const doorY = houseTopY + houseHeight - 1;
  const doorX = houseLeftX + 1;
  tiles[doorY][doorX] = WALL;
  subtypes[doorY][doorX] = [TileSubtype.DOOR, TileSubtype.ROOM_TRANSITION];

  const exteriorDoorY = doorY + 1;
  if (tiles[exteriorDoorY]?.[doorX] === WALL) {
    tiles[exteriorDoorY][doorX] = FLOOR;
    subtypes[exteriorDoorY][doorX] = [];
  }

  const torchTownTransition: [number, number] = [0, width - 2];
  tiles[torchTownTransition[0]][torchTownTransition[1]] = FLOOR;
  subtypes[torchTownTransition[0]][torchTownTransition[1]] = [
    TileSubtype.ROOM_TRANSITION,
  ];
  const torchTownReturn: [number, number] = [
    Math.min(height - 2, torchTownTransition[0] + 1),
    torchTownTransition[1],
  ];
  if (tiles[torchTownReturn[0]]?.[torchTownReturn[1]] === WALL) {
    tiles[torchTownReturn[0]][torchTownReturn[1]] = FLOOR;
    subtypes[torchTownReturn[0]][torchTownReturn[1]] = [];
  }

  // Place Elder Rowan just outside the cave entrance: 3 tiles up and 3 to the right of the mouth
  const elderY = Math.max(1, entryPoint[0] - 3);
  const elderX = Math.min(width - 2, entryPoint[1] + 3);
  const elder = new NPC({
    id: "npc-elder-rowan",
    name: "Elder Rowan",
    sprite: "/images/npcs/boy-1.png",
    y: elderY,
    x: elderX,
    facing: Direction.DOWN,
    canMove: false,
    memory: {
      metHero: false,
    },
    interactionHooks: [
      {
        id: "elder-rowan-greet",
        type: "dialogue",
        description: "Greet the elder",
        payload: {
          dialogueId: "elder-rowan-intro",
        },
      },
    ],
    actions: ["greet"],
    metadata: {
      archetype: "mentor",
    },
  });

  // Add Kalen outside the sanctum when he's been rescued
  const kalenY = Math.max(1, entryPoint[0] - 5);
  const kalenX = Math.max(1, entryPoint[1] - 2);
  const kalen = new NPC({
    id: "npc-sanctum-boy",
    name: "Kalen",
    sprite: "/images/npcs/boy-3.png",
    y: kalenY,
    x: kalenX,
    facing: Direction.DOWN,
    canMove: false,
    interactionHooks: [
      {
        id: "kalen-sanctum-greet",
        type: "dialogue",
        description: "Talk to Kalen",
        payload: { dialogueId: "kalen-sanctum-default" },
      },
    ],
    actions: ["talk"],
    metadata: { archetype: "rescued-boy" },
  });

  const npcs: NPC[] = [elder, kalen];

  // Carve an opening at the left wall ~3 tiles down from top to lead to the bluff passageway
  if (tiles[3]?.[0] !== undefined) {
    tiles[3][0] = FLOOR;
    subtypes[3][0] = [TileSubtype.ROOM_TRANSITION];
  }

  // Build sensible dirt roads connecting key points:
  // - From southern entrance to a central hub near the checkpoint
  // - From hub to caretaker's house exterior door
  // - From hub to Torch Town exit (top-right)
  // - From hub to Bluff exit (top-left)

  // Central hub at or near the checkpoint
  const hubY = checkpointY;
  const hubX = checkpointX;

  // 1) Entrance to hub: vertical path up from entryPoint to hub
  // End cap at entrance pointing south
  markRoad(entryPoint[0], entryPoint[1], TileSubtype.ROAD_END, 180);
  // Also mark the bottom opening tile itself (row 21, col 6) as an end cap rotated 180
  // so it visually terminates at the border doorway per spec
  markRoad(bottomOpeningY, entryX, TileSubtype.ROAD_END, 180);
  for (let y = entryPoint[0] - 1; y > hubY; y--) {
    markRoad(y, entryPoint[1], TileSubtype.ROAD_STRAIGHT, 90);
  }
  // Corner if hubX differs, otherwise straight into hub
  if (entryPoint[1] !== hubX) {
    // turn at (hubY+1, entryX) toward hubX horizontally
    const cornerY = hubY + 1;
    const cornerX = entryPoint[1];
    // north -> east uses 90, north -> west uses 180
    const turnRight = hubX > cornerX;
    markRoad(cornerY, cornerX, TileSubtype.ROAD_CORNER, turnRight ? 90 : 180);
    const xStart = turnRight ? cornerX + 1 : hubX;
    const xEnd = turnRight ? hubX : cornerX - 1;
    for (let x = xStart; turnRight ? x < xEnd : x <= xEnd; x++) {
      markRoad(cornerY, x, TileSubtype.ROAD_STRAIGHT, 0);
    }
  }
  // Hub tile: make T junction; default orientation works for our renderer
  markRoad(hubY, hubX, TileSubtype.ROAD_T, 0);

  // Helper to lay an L-shaped road between two points with controlled turn order
  const layRoadL = (
    y1: number,
    x1: number,
    y2: number,
    x2: number,
    first: 'vertical' | 'horizontal'
  ) => {
    if (y1 === y2 && x1 === x2) return;
    if (first === 'vertical') {
      // Draw vertical segment toward y2
      if (y2 < y1) {
        for (let y = y1 - 1; y > y2; y--) markRoad(y, x1, TileSubtype.ROAD_STRAIGHT, 90);
        // corner at (y2, x1) then horizontal to x2
        const turnRight = x2 > x1;
        markRoad(y2, x1, TileSubtype.ROAD_CORNER, turnRight ? 90 : 180);
        if (turnRight) {
          for (let x = x1 + 1; x < x2; x++) markRoad(y2, x, TileSubtype.ROAD_STRAIGHT, 0);
        } else {
          for (let x = x1 - 1; x > x2; x--) markRoad(y2, x, TileSubtype.ROAD_STRAIGHT, 0);
        }
      } else {
        for (let y = y1 + 1; y < y2; y++) markRoad(y, x1, TileSubtype.ROAD_STRAIGHT, 90);
        const turnRight = x2 > x1;
        // south -> east uses 0, south -> west uses 270 relative to asset; approximate with 0 for straight, 270 corner
        markRoad(y2, x1, TileSubtype.ROAD_CORNER, turnRight ? 0 : 270);
        if (turnRight) {
          for (let x = x1 + 1; x < x2; x++) markRoad(y2, x, TileSubtype.ROAD_STRAIGHT, 0);
        } else {
          for (let x = x1 - 1; x > x2; x--) markRoad(y2, x, TileSubtype.ROAD_STRAIGHT, 0);
        }
      }
    } else {
      // Draw horizontal first toward x2
      if (x2 > x1) {
        for (let x = x1 + 1; x > x1 && x < x2; x++) markRoad(y1, x, TileSubtype.ROAD_STRAIGHT, 0);
        // corner at (y1, x2) then vertical toward y2
        const goingNorth = y2 < y1;
        // east -> north uses 270, east -> south uses 0
        markRoad(y1, x2, TileSubtype.ROAD_CORNER, goingNorth ? 270 : 0);
        if (goingNorth) {
          for (let y = y1 - 1; y > y2; y--) markRoad(y, x2, TileSubtype.ROAD_STRAIGHT, 90);
        } else {
          for (let y = y1 + 1; y < y2; y++) markRoad(y, x2, TileSubtype.ROAD_STRAIGHT, 90);
        }
      } else {
        for (let x = x1 - 1; x < x1 && x > x2; x--) markRoad(y1, x, TileSubtype.ROAD_STRAIGHT, 0);
        const goingNorth = y2 < y1;
        // west -> north uses 0, west -> south uses 270
        markRoad(y1, x2, TileSubtype.ROAD_CORNER, goingNorth ? 0 : 270);
        if (goingNorth) {
          for (let y = y1 - 1; y > y2; y--) markRoad(y, x2, TileSubtype.ROAD_STRAIGHT, 90);
        } else {
          for (let y = y1 + 1; y < y2; y++) markRoad(y, x2, TileSubtype.ROAD_STRAIGHT, 90);
        }
      }
    }
  };

  // 2) Hub to caretaker's exterior door
  // Prefer horizontal-first toward the door's column, then vertical toward the door row
  layRoadL(hubY, hubX, exteriorDoorY, doorX, 'horizontal');
  // End cap at the door tile pointing north (into the house)
  markRoad(exteriorDoorY, doorX, TileSubtype.ROAD_END, 0);

  // 3) Hub to Torch Town exit (top-right)
  // Keep the top wall intact: target the tile just inside the map below the transition
  const torchTownInside: [number, number] = [Math.min(height - 2, torchTownTransition[0] + 1), torchTownTransition[1]];
  // Go vertically toward top then horizontally to the inside tile column
  layRoadL(hubY, hubX, torchTownInside[0], torchTownInside[1], 'vertical');
  // End cap at the inside tile pointing north toward the doorway
  markRoad(torchTownInside[0], torchTownInside[1], TileSubtype.ROAD_END, 0);

  // 4) Hub to Bluff exit (top-left opening at [3,0])
  // Keep the left wall intact: target the tile just inside the map to the right of the opening
  const bluffInside: [number, number] = [3, 1];
  layRoadL(hubY, hubX, bluffInside[0], bluffInside[1], 'vertical');
  // End cap at the inside tile pointing west toward the passage
  markRoad(bluffInside[0], bluffInside[1], TileSubtype.ROAD_END, 270);

  // Post-process: derive road shapes and rotations from connectivity so corners/T's orient correctly
  const isRoadish = (arr: number[] | undefined): boolean => {
    if (!arr) return false;
    return (
      arr.includes(TileSubtype.ROAD) ||
      arr.includes(TileSubtype.ROAD_STRAIGHT) ||
      arr.includes(TileSubtype.ROAD_CORNER) ||
      arr.includes(TileSubtype.ROAD_T) ||
      arr.includes(TileSubtype.ROAD_END)
    );
  };

  const isNeighborForRoad = (arr: number[] | undefined): boolean => {
    if (!arr) return false;
    // Consider doors/transitions as valid neighbors to orient end caps toward
    return (
      isRoadish(arr) ||
      arr.includes(TileSubtype.DOOR) ||
      arr.includes(TileSubtype.ROOM_TRANSITION)
    );
  };

  const setShapeRotation = (y: number, x: number, shape: TileSubtype, rot: 0 | 90 | 180 | 270) => {
    // clear previous road shape/rotation, keep ROAD tag
    let cell = subtypes[y][x] ?? [];
    cell = cell.filter((t) =>
      t !== TileSubtype.ROAD_STRAIGHT &&
      t !== TileSubtype.ROAD_CORNER &&
      t !== TileSubtype.ROAD_T &&
      t !== TileSubtype.ROAD_END &&
      t !== TileSubtype.ROAD_ROTATE_90 &&
      t !== TileSubtype.ROAD_ROTATE_180 &&
      t !== TileSubtype.ROAD_ROTATE_270
    );
    if (!cell.includes(TileSubtype.ROAD)) cell.push(TileSubtype.ROAD);
    cell.push(shape);
    if (rot === 90) cell.push(TileSubtype.ROAD_ROTATE_90);
    else if (rot === 180) cell.push(TileSubtype.ROAD_ROTATE_180);
    else if (rot === 270) cell.push(TileSubtype.ROAD_ROTATE_270);
    subtypes[y][x] = cell;
  };

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const cell = subtypes[y][x];
      if (!isRoadish(cell)) continue;
      const n = isNeighborForRoad(subtypes[y - 1]?.[x]);
      const e = isNeighborForRoad(subtypes[y]?.[x + 1]);
      const s = isNeighborForRoad(subtypes[y + 1]?.[x]);
      const w = isNeighborForRoad(subtypes[y]?.[x - 1]);
      const deg = (n?1:0) + (e?1:0) + (s?1:0) + (w?1:0);
      if (deg === 0) {
        // No neighbors: preserve whatever shape/rotation was explicitly placed
        continue;
      } else if (deg === 1) {
        // End cap rotation mapping (aligned with torch_town usage):
        // neighbor N -> 180, E -> 270, S -> 0, W -> 90
        const rot = (n ? 180 : e ? 270 : s ? 0 : 90) as 0 | 90 | 180 | 270;
        setShapeRotation(y, x, TileSubtype.ROAD_END, rot);
      } else if (deg === 2) {
        if ((n && s) || (e && w)) {
          // Straight
          const rot: 0 | 90 = n && s ? 90 : 0; // 90 = vertical, 0 = horizontal
          setShapeRotation(y, x, TileSubtype.ROAD_STRAIGHT, rot);
        } else {
          // Corner: choose rotation so the open corner points into the intersection
          // Mapping uses rotation degrees matching Tile.tsx renderer
          // Corner rotation mapping aligned with torch_town examples:
          // N+E -> 270, E+S -> 90, S+W -> 180, W+N -> 0
          let rot: 0 | 90 | 180 | 270 = 0;
          if (n && e) rot = 270;
          else if (e && s) rot = 90;
          else if (s && w) rot = 180;
          else if (w && n) rot = 0;
          setShapeRotation(y, x, TileSubtype.ROAD_CORNER, rot);
        }
      } else if (deg === 3) {
        // T base orientation: paths W,E,S (missing N) at rotation 0
        // Current visuals appear 180° off; apply a 180° correction.
        let rot: 0 | 90 | 180 | 270 = 0;
        if (!n) rot = 0;        // missing north => 0
        else if (!e) rot = 270; // missing east  => 270
        else if (!s) rot = 180; // missing south => 180
        else if (!w) rot = 90;  // missing west  => 90
        const rot180 = ((rot + 180) % 360) as 0 | 90 | 180 | 270;
        setShapeRotation(y, x, TileSubtype.ROAD_T, rot180);
      } else {
        // Crossroad (deg=4) – approximate with T oriented upward; adjust later if we add a cross asset
        setShapeRotation(y, x, TileSubtype.ROAD_T, 0);
      }
    }
  }

  return {
    id: "story-outdoor-clearing",
    mapData: { tiles, subtypes, environment: "outdoor" },
    entryPoint,
    transitionToPrevious,
    entryFromNext: [exteriorDoorY, doorX],
    transitionToNext: [doorY, doorX],
    otherTransitions: [
      {
        roomId: "story-torch-town" as RoomId,
        position: torchTownTransition,
        returnEntryPoint: torchTownReturn,
      },
      // Opening on the left wall near the top leading to the bluff passageway
      {
        roomId: "story-bluff-passage" as RoomId,
        position: [3, 0],
        returnEntryPoint: [4, 1],
      },
    ],
    npcs,
    metadata: {
      conditionalNpcs: {
        "npc-sanctum-boy": {
          showWhen: [{ eventId: "entered-bluff-cave", value: true }]
        }
      }
    },
  };
}

