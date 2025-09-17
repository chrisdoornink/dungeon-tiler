import { type GameState, MapData, TileSubtype } from "../../lib/map";
import { Enemy } from "../../lib/enemy";
import { addSnakePots } from "../../lib/map";

function makeMapWithPlayerAt(y: number, x: number): MapData {
  const size = 25;
  const tiles = Array.from({ length: size }, () => Array(size).fill(0));
  const subtypes = Array.from({ length: size }, () => Array.from({ length: size }, () => [] as number[]));
  subtypes[y][x] = [TileSubtype.PLAYER];
  return { tiles, subtypes };
}

describe("addSnakePots", () => {
  test("with rng<0.5 converts snake into [POT,SNAKE] and removes enemy", () => {
    const map = makeMapWithPlayerAt(12, 12);
    const enemies = [new Enemy({ y: 10, x: 10 })];
    enemies[0].kind = 'snake';

    const out = addSnakePots(map, enemies, { rng: () => 0.25 });

    // enemy removed
    expect(out.enemies.find(e => e.kind === 'snake' && e.y === 10 && e.x === 10)).toBeUndefined();
    // pot placed
    expect(out.mapData.subtypes[10][10]).toEqual(expect.arrayContaining([TileSubtype.POT, TileSubtype.SNAKE]));
  });

  test("with rng>=0.5 leaves snake as enemy and no pot added", () => {
    const map = makeMapWithPlayerAt(12, 12);
    const enemies = [new Enemy({ y: 10, x: 10 })];
    enemies[0].kind = 'snake';

    const out = addSnakePots(map, enemies, { rng: () => 0.9 });

    // enemy remains
    expect(out.enemies.find(e => e.kind === 'snake' && e.y === 10 && e.x === 10)).toBeTruthy();
    // no pot
    expect(out.mapData.subtypes[10][10]).toEqual([]);
  });
});
