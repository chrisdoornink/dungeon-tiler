import { FLOOR, WALL, TileSubtype, Direction, type RoomId } from "../../../map";
import { Enemy } from "../../../enemy";
import { NPC } from "../../../npc";
import type { StoryRoom } from "../types";

export function buildBluffPassageway(): StoryRoom {
  const height = 10;
  const width = 40;
  const tiles: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => [] as number[])
  );

  // Carve interior floor
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  // Create a static interior pattern: a few wall bands and pillars
  const bands = [3, 6];
  for (const by of bands) {
    for (let x = 5; x < width - 5; x++) {
      if (x % 6 !== 0) continue; // sparse band posts
      tiles[by][x] = WALL;
      subtypes[by][x] = [];
    }
  }
  // Pillars near the middle
  const midY = Math.floor(height / 2);
  const midX = Math.floor(width / 2);
  const pillarSpots: Array<[number, number]> = [
    [midY - 1, midX - 4],
    [midY + 1, midX - 2],
    [midY, midX],
    [midY - 1, midX + 3],
    [midY + 1, midX + 6],
  ];
  for (const [py, px] of pillarSpots) {
    if (tiles[py]?.[px] !== undefined) {
      tiles[py][px] = WALL;
      subtypes[py][px] = [];
    }
  }

  // Opening on right wall near bottom
  const openY = height - 3; // two tiles up from bottom
  tiles[openY][width - 1] = FLOOR;
  subtypes[openY][width - 1] = [TileSubtype.ROOM_TRANSITION];

  // Opening at the top-left interior that leads deeper into the bluff
  const bluffCaveEntry: [number, number] = [1, 3];
  tiles[bluffCaveEntry[0]][bluffCaveEntry[1]] = FLOOR;
  subtypes[bluffCaveEntry[0]][bluffCaveEntry[1]] = [
    TileSubtype.ROOM_TRANSITION,
  ];

  const entryPoint: [number, number] = [openY, width - 2]; // step inside from right
  const entryFromNext: [number, number] = [openY, width - 3];
  const transitionToPrevious: [number, number] = [openY, width - 1];

  // Enemies: 5 snakes and 1 goblin near center
  const enemies: Enemy[] = [];
  const enemySpots: Array<[number, number, 'snake' | 'goblin']> = [
    [midY, midX - 2, 'snake'],
    [midY - 1, midX, 'snake'],
    [midY + 1, midX + 1, 'snake'],
    [midY, midX + 3, 'snake'],
    [midY + 2, midX - 1, 'snake'],
    [midY, midX, 'goblin'],
  ];
  for (const [y, x, kind] of enemySpots) {
    if (tiles[y]?.[x] === FLOOR) {
      const e = new Enemy({ y, x });
      e.kind = kind;
      enemies.push(e);
    }
  }

  // NPC boy on the far left, with a goblin near him
  const boyY = midY;
  const boyX = 1; // far left inside wall
  const boy = new NPC({
    id: "npc-sanctum-boy",
    name: "Sanctum Acolyte",
    sprite: "/images/npcs/boy-3.png",
    y: boyY,
    x: boyX,
    facing: Direction.RIGHT,
    canMove: false,
    interactionHooks: [
      {
        id: "boy-greet",
        type: "dialogue",
        description: "Check on the boy",
        payload: { dialogueId: "librarian-default" },
      },
    ],
    actions: ["talk"],
  });
  const guardGoblinPos: [number, number] = [Math.max(1, boyY - 1), Math.min(width - 3, boyX + 3)];
  if (tiles[guardGoblinPos[0]]?.[guardGoblinPos[1]] === FLOOR) {
    const guard = new Enemy({ y: guardGoblinPos[0], x: guardGoblinPos[1] });
    guard.kind = 'goblin';
    enemies.push(guard);
  }

  return {
    id: "story-bluff-passage" as RoomId,
    mapData: { tiles, subtypes, environment: "outdoor" },
    entryPoint,
    entryFromNext,
    transitionToPrevious,
    enemies,
    npcs: [boy],
  };

}
