import { FLOOR, WALL, TileSubtype, Direction, type RoomId } from "../../../map";
import { Enemy } from "../../../enemy";
import { NPC } from "../../../npc";
import type { StoryRoom } from "../types";

export function buildBluffPassageway(): StoryRoom {
  // Taller to reflect the tapered, multi-row shape
  const height = 20;
  const width = 40;
  const tiles: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => [] as number[])
  );

  // Carve tapered upper shape: widths per row from top (y=1) downward
  const taperWidths = [5,5,5,4,3,3,2,2,2,1,1,1,1,1,1];
  for (let i = 0; i < taperWidths.length; i++) {
    const y = 1 + i;
    if (y >= height - 6) break; // leave space for the wide base
    const w = taperWidths[i];
    for (let x = 1; x <= Math.min(width - 2, 1 + w); x++) {
      tiles[y][x] = FLOOR;
    }
  }

  // Carve wide base at the bottom: last 6 interior rows
  for (let y = height - 7; y <= height - 2; y++) {
    for (let x = 1; x <= width - 2; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  // Midpoints used for placements
  const midY = Math.floor(height / 2);
  // const midX = Math.floor(width / 2); // unused for now

  // Opening on right wall near bottom
  const openY = height - 3; // two tiles up from bottom
  tiles[openY][width - 1] = FLOOR;
  subtypes[openY][width - 1] = [TileSubtype.ROOM_TRANSITION];
  // Ensure entry tiles are walkable just inside
  tiles[openY][width - 2] = FLOOR;
  tiles[openY][width - 3] = FLOOR;

  // Opening at the top interior that leads deeper into the bluff (use exit-door asset)
  // Heuristic: pick the rightmost floor tile on the first few tapered rows
  let exitY = 2;
  let exitX = 3;
  outer: for (let y = 2; y < Math.min(12, height - 6); y++) {
    let lastFloorX = -1;
    for (let x = 1; x < width - 1; x++) {
      if (tiles[y][x] === FLOOR) lastFloorX = x;
    }
    if (lastFloorX >= 2) {
      exitY = y;
      exitX = lastFloorX;
      break outer;
    }
  }
  // Use CAVE_OPENING + ROOM_TRANSITION for story-mode cave entrances (renders exit-dark art)
  subtypes[exitY][exitX] = [TileSubtype.CAVE_OPENING, TileSubtype.ROOM_TRANSITION];

  const entryPoint: [number, number] = [openY, width - 2]; // step inside from right
  const entryFromNext: [number, number] = [openY, width - 3];
  const transitionToPrevious: [number, number] = [openY, width - 1];

  const enemies: Enemy[] = [];
  // NPC boy on the far left
  const boyY = midY;
  const boyX = 1; // far left inside wall
  const boy = new NPC({
    id: "npc-sanctum-boy",
    name: "Kalen",
    sprite: "/images/npcs/boy-3.png",
    y: boyY,
    x: boyX,
    facing: Direction.RIGHT,
    canMove: false,
    interactionHooks: [
      {
        id: "kalen-talk",
        type: "dialogue",
        description: "Talk to Kalen",
      },
    ],
    actions: ["talk"],
  });

  // Place a goblin ~5 tiles below the boy (clamped to room bounds and nearest FLOOR)
  {
    const gy = Math.min(height - 2, boyY + 5);
    const gx = Math.min(width - 3, boyX + 1);
    // Find nearest floor within a small search radius
    let placed = false;
    const search: Array<[number, number]> = [];
    for (let dy = 0; dy <= 3; dy++) {
      search.push([gy + dy, gx]);
      search.push([gy, gx + dy]);
      search.push([gy, gx - dy]);
    }
    for (const [yy, xx] of search) {
      if (yy > 0 && yy < height - 1 && xx > 0 && xx < width - 1 && tiles[yy][xx] === FLOOR) {
        const goblin = new Enemy({ y: yy, x: xx });
        goblin.kind = "fire-goblin";
        // Mark this as the special goblin that triggers Kalen's rescue
        goblin.behaviorMemory["isKalenThreat"] = true;
        enemies.push(goblin);
        placed = true;
        break;
      }
    }
    if (!placed && tiles[gy]?.[gx] === FLOOR) {
      const fallbackGoblin = new Enemy({ y: gy, x: gx });
      fallbackGoblin.kind = 'fire-goblin';
      fallbackGoblin.behaviorMemory["isKalenThreat"] = true;
      enemies.push(fallbackGoblin);
    }
  }

  // Random walls and four snakes in the bottom wide passage area
  function rand(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  const bottomYStart = height - 7;
  const bottomYEnd = height - 2;
  // Scatter some walls but avoid the immediate right-side entry corridor area
  let placedWalls = 0;
  for (let attempts = 0; attempts < 200 && placedWalls < 14; attempts++) {
    const y = rand(bottomYStart, bottomYEnd);
    const x = rand(2, width - 3);
    // Keep a clear lane near the right entry row
    if (y === height - 3 && x > width - 8) continue;
    if (tiles[y][x] === FLOOR) {
      tiles[y][x] = WALL;
      subtypes[y][x] = [];
      placedWalls++;
    }
  }

  // Place 4 snakes on FLOOR tiles in the bottom area
  let snakes = 0;
  for (let attempts = 0; attempts < 400 && snakes < 4; attempts++) {
    const y = rand(bottomYStart, bottomYEnd);
    const x = rand(2, width - 3);
    if (tiles[y][x] === FLOOR) {
      const s = new Enemy({ y, x });
      s.kind = 'snake';
      enemies.push(s);
      snakes++;
    }
  }

  // Scatter ~5 rocks on empty FLOOR tiles in the same bottom area
  {
    const want = 5;
    let placed = 0;
    for (let attempts = 0; attempts < 400 && placed < want; attempts++) {
      const y = rand(bottomYStart, bottomYEnd);
      const x = rand(2, width - 3);
      // Keep a clear lane near the right entry row
      if (y === height - 3 && x > width - 8) continue;
      if (tiles[y][x] !== FLOOR) continue;
      if (subtypes[y][x].length > 0) continue;
      subtypes[y][x] = [TileSubtype.ROCK];
      placed++;
    }
  }

  return {
    id: "story-bluff-passage" as RoomId,
    mapData: { tiles, subtypes, environment: "outdoor" },
    entryPoint,
    entryFromNext,
    transitionToPrevious,
    transitionToNext: [exitY, exitX],
    enemies,
    npcs: [boy],
    metadata: {
      conditionalNpcs: {
        "npc-sanctum-boy": {
          removeWhen: [{ eventId: "entered-bluff-cave", value: true }]
        }
      },
      onEnemyDefeat: {
        isKalenThreat: {
          effects: [
            { eventId: "rescued-kalen", value: true },
            { eventId: "kalen-rescued-at-bluff", value: true }
          ]
        }
      }
    },
  };

}
