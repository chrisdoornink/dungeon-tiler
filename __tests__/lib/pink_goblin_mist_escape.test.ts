import { Enemy, updateEnemies } from "../../lib/enemy";

// 9x9 fully-open floor; subtypes all empty.
const openGrid = () => Array.from({ length: 9 }, () => Array(9).fill(0));
const emptySubs = () =>
  Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => [] as number[]));

function ninjaPinkGoblin(y: number, x: number): Enemy {
  const e = new Enemy({ y, x });
  e.kind = "pink-goblin";
  (e.behaviorMemory as Record<string, unknown>).ninja = true;
  (e.behaviorMemory as Record<string, unknown>).aware = true;
  return e;
}

const man = (e: Enemy, y: number, x: number) => Math.abs(e.y - y) + Math.abs(e.x - x);
const inMist = (mist: Array<[number, number]>, y: number, x: number) =>
  mist.some(([my, mx]) => my === y && mx === x);

describe("pink goblin in pink mist", () => {
  test("standing in mist: shuffles exactly one tile onto a clear tile, deals no damage — even adjacent to the player", () => {
    const grid = openGrid();
    const subs = emptySubs();
    const e = ninjaPinkGoblin(4, 4);
    const player = { y: 4, x: 5 }; // adjacent — a non-mist ninja would strike here
    const mist: Array<[number, number]> = [[4, 4], [3, 4], [5, 4]]; // vertical strip over the goblin

    const res = updateEnemies(grid, subs, [e], player, { mist }) as { damage: number };

    expect(res.damage).toBe(0); // disoriented: never attacks while in the mist
    expect(man(e, 4, 4)).toBe(1); // moved exactly one tile
    expect(inMist(mist, e.y, e.x)).toBe(false); // stepped onto a clear tile
    expect(e.y === player.y && e.x === player.x).toBe(false); // never onto the player
  });

  test("NOT in mist and adjacent: attacks normally (mist only gates it while inside)", () => {
    const grid = openGrid();
    const subs = emptySubs();
    const e = ninjaPinkGoblin(4, 4);
    const player = { y: 4, x: 5 };
    const mist: Array<[number, number]> = [[0, 0], [0, 1]]; // mist elsewhere; goblin is clear

    const res = updateEnemies(grid, subs, [e], player, { mist }) as { damage: number };

    expect(res.damage).toBeGreaterThan(0); // strikes as usual
  });

  test("deep in a mist strip: still moves only one tile, toward a clear tile, no attack", () => {
    const grid = openGrid();
    const subs = emptySubs();
    const e = ninjaPinkGoblin(4, 5);
    const player = { y: 8, x: 8 }; // far away
    const mist: Array<[number, number]> = [[4, 4], [4, 5], [4, 6]]; // horizontal strip; goblin in middle

    const res = updateEnemies(grid, subs, [e], player, { mist }) as { damage: number };

    expect(res.damage).toBe(0);
    expect(man(e, 4, 5)).toBe(1); // one step (up or down out of the strip)
    expect(inMist(mist, e.y, e.x)).toBe(false);
  });

  test("no mist context: pink goblin behaves normally (regression — escape branch is inert)", () => {
    const grid = openGrid();
    const subs = emptySubs();
    const e = ninjaPinkGoblin(4, 4);
    const player = { y: 4, x: 5 };

    const res = updateEnemies(grid, subs, [e], player, {}) as { damage: number };

    expect(res.damage).toBeGreaterThan(0); // adjacent strike, no mist to disorient it
  });
});
