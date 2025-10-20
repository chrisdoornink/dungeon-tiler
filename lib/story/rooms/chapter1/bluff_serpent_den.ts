import { FLOOR, WALL, TileSubtype, Direction, type RoomId } from "../../../map";
import { Enemy } from "../../../enemy";
import { NPC } from "../../../npc";
import type { StoryRoom } from "../types";

export function buildBluffSerpentDen(): StoryRoom {
  const height = 12;
  const width = 30;
  const tiles: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => [] as number[])
  );

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  const entryY = Math.floor(height / 2);
  const entryPoint: [number, number] = [entryY, 1];
  const transitionToPrevious: [number, number] = [entryY, 0];
  tiles[entryY][0] = FLOOR;
  subtypes[entryY][0] = [TileSubtype.ROOM_TRANSITION];

  const entryFromNext: [number, number] = [entryY, 2];

  const entranceTorches: Array<[number, number]> = [
    [entryY - 1, 1],
    [entryY + 1, 1],
  ];
  for (const [ty, tx] of entranceTorches) {
    if (ty > 0 && ty < height - 1) {
      subtypes[ty][tx] = [TileSubtype.WALL_TORCH];
    }
  }

  // Add torch area at far right (columns 25-27)
  // Floor tiles at 2,25-27 and 3,25-27
  for (let y = 2; y <= 3; y++) {
    for (let x = 25; x <= 27; x++) {
      tiles[y][x] = FLOOR;
    }
  }
  // Torches at 2,25 and 2,27
  subtypes[2][25] = [TileSubtype.WALL_TORCH];
  subtypes[2][27] = [TileSubtype.WALL_TORCH];

  // Transition to dangerous snake room at 1,26
  tiles[1][26] = FLOOR;
  subtypes[1][26] = [TileSubtype.ROOM_TRANSITION];

  // Place coiled snake NPC at a specific tile
  const npcY = 3;
  const npcX = 8;
  const coiledSnake = new NPC({
    id: "npc-bluff-coiled-snake",
    name: "Coiled Snake",
    sprite: "/images/enemies/snake-coiled-right.png",
    y: npcY,
    x: npcX,
    facing: Direction.LEFT,
    canMove: false,
    // Match enemy sprite scale (enemies scale snakes to 0.5 in Tile.tsx)
    metadata: { scale: 0.5 },
    interactionHooks: [
      {
        id: "coiled-snake-greeting",
        type: "dialogue",
        description: "Speak with the coiled snake",
        payload: { dialogueId: "bluff-coiled-snake" },
      },
    ],
    actions: ["talk"],
  });

  const enemies: Enemy[] = [];
  // Build candidate floor tiles away from the left wall and actor entry/npc tiles
  const candidates: Array<[number, number]> = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (x <= 2) continue; // leave some breathing room near entrance
      if (x >= 25) continue; // avoid torch area
      if ((y === entryPoint[0] && x <= entryPoint[1] + 2) || (y === npcY && x === npcX)) continue;
      if (tiles[y][x] === FLOOR) candidates.push([y, x]);
    }
  }

  // Shuffle candidates (Fisher–Yates)
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  // Greedy blue-noise style selection with a minimum Manhattan spacing
  const chosen: Array<[number, number]> = [];
  const MIN_SPACING = 2; // increase to 3 for sparser placement
  const TARGET_COUNT = 15; // halve from 30 to 15
  for (const pos of candidates) {
    if (chosen.length >= TARGET_COUNT) break;
    const [py, px] = pos;
    let ok = true;
    for (const [cy, cx] of chosen) {
      const dist = Math.abs(py - cy) + Math.abs(px - cx);
      if (dist < MIN_SPACING) {
        ok = false;
        break;
      }
    }
    if (ok) chosen.push(pos);
  }

  for (const [y, x] of chosen) {
    const snake = new Enemy({ y, x });
    snake.kind = "snake";
    enemies.push(snake);
  }

  return {
    id: "story-bluff-serpent-den" as RoomId,
    mapData: { tiles, subtypes, environment: "cave" },
    entryPoint,
    entryFromNext,
    transitionToPrevious,
    enemies,
    npcs: [coiledSnake],
  };

}
