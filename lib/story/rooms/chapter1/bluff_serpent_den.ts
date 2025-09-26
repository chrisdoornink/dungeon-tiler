import { FLOOR, WALL, TileSubtype, Direction, type RoomId } from "../../../map";
import { Enemy } from "../../../enemy";
import { NPC } from "../../../npc";
import type { StoryRoom } from "../types";

export function buildBluffSerpentDen(): StoryRoom {
  const size = 12;
  const tiles: number[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => [] as number[])
  );

  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      tiles[y][x] = FLOOR;
    }
  }

  const entryY = Math.floor(size / 2);
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
    if (ty > 0 && ty < size - 1) {
      subtypes[ty][tx] = [TileSubtype.WALL_TORCH];
    }
  }

  const npcY = entryY;
  const npcX = size - 2;
  const coiledSnake = new NPC({
    id: "npc-bluff-coiled-snake",
    name: "Coiled Snake",
    sprite: "/images/enemies/snake-coiled-right.png",
    y: npcY,
    x: npcX,
    facing: Direction.LEFT,
    canMove: false,
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
  const snakePositions: Array<[number, number]> = [];
  for (let y = 1; y < size - 1 && snakePositions.length < 30; y++) {
    for (let x = 1; x < size - 1 && snakePositions.length < 30; x++) {
      if (x <= 2) continue;
      if (
        (y === entryPoint[0] && x <= entryPoint[1] + 2) ||
        (y === npcY && x === npcX)
      ) {
        continue;
      }
      snakePositions.push([y, x]);
    }
  }

  for (let i = 0; i < 30 && i < snakePositions.length; i++) {
    const [y, x] = snakePositions[i];
    if (tiles[y]?.[x] === FLOOR) {
      const snake = new Enemy({ y, x });
      snake.kind = "snake";
      enemies.push(snake);
    }
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
