import { initializeGameState, movePlayer, Direction, TileSubtype } from '../../lib/map';

function findAll(map: any, predicate: (subs: number[]) => boolean): Array<[number, number]> {
  const res: Array<[number, number]> = [];
  const h = map.subtypes.length;
  const w = map.subtypes[0].length;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (predicate(map.subtypes[y][x])) res.push([y, x]);
    }
  }
  return res;
}

function setPlayer(map: any, y: number, x: number) {
  // remove old player
  for (let yy = 0; yy < map.subtypes.length; yy++) {
    for (let xx = 0; xx < map.subtypes[0].length; xx++) {
      map.subtypes[yy][xx] = map.subtypes[yy][xx].filter((t: number) => t !== TileSubtype.PLAYER);
    }
  }
  if (!map.subtypes[y][x].includes(TileSubtype.PLAYER)) map.subtypes[y][x].push(TileSubtype.PLAYER);
}

function findPlayer(map: any): [number, number] | null {
  const h = map.subtypes.length;
  const w = map.subtypes[0].length;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (map.subtypes[y][x].includes(TileSubtype.PLAYER)) return [y, x];
    }
  }
  return null;
}

function neighbors(y: number, x: number): Array<[number, number, Direction]> {
  return [
    [y, x - 1, Direction.RIGHT], // move RIGHT into (y,x)
    [y, x + 1, Direction.LEFT],
    [y - 1, x, Direction.DOWN],
    [y + 1, x, Direction.UP],
  ];
}

describe('Chests and Keys invariants', () => {
  test('exactly two chests exist: one SWORD and one SHIELD', () => {
    const gs = initializeGameState();
    const chests = findAll(gs.mapData, (s) => s.includes(TileSubtype.CHEST));
    expect(chests.length).toBe(2);
    const contents = chests.map(([y, x]) => gs.mapData.subtypes[y][x]);
    const hasSword = contents.some((s) => s.includes(TileSubtype.SWORD));
    const hasShield = contents.some((s) => s.includes(TileSubtype.SHIELD));
    expect(hasSword).toBe(true);
    expect(hasShield).toBe(true);
  });

  test('one generic key is placed per level (universal)', () => {
    const gs = initializeGameState();
    const keys = findAll(gs.mapData, (s) => s.length === 1 && s[0] === TileSubtype.KEY);
    expect(keys.length).toBe(1);
  });

  test('universal key opens any number of generic locks', () => {
    let gs = initializeGameState();
    let locked = findAll(gs.mapData, (s) => s.includes(TileSubtype.CHEST) && s.includes(TileSubtype.LOCK));
    const allChests = findAll(gs.mapData, (s) => s.includes(TileSubtype.CHEST));

    // Ensure at least one locked chest exists for the test; if none, lock the first chest manually.
    if (locked.length === 0 && allChests.length > 0) {
      const [cy, cx] = allChests[0];
      if (!gs.mapData.subtypes[cy][cx].includes(TileSubtype.LOCK)) {
        gs.mapData.subtypes[cy][cx].push(TileSubtype.LOCK);
      }
      locked = findAll(gs.mapData, (s) => s.includes(TileSubtype.CHEST) && s.includes(TileSubtype.LOCK));
      // Place a key somewhere empty near the player
      const p = findPlayer(gs.mapData)!;
      const [py, px] = p;
      const keySpot = [py, Math.max(0, px - 1)];
      gs.mapData.subtypes[keySpot[0]][keySpot[1]] = [TileSubtype.KEY];
    }

    expect(locked.length).toBeGreaterThanOrEqual(1);

    // Pick up one key
    const keyPos = findAll(gs.mapData, (s) => s.length === 1 && s[0] === TileSubtype.KEY)[0];
    expect(keyPos).toBeDefined();
    const [ky, kx] = keyPos;
    // Move player adjacent then onto key (pick direction accordingly)
    setPlayer(gs.mapData, ky, kx - 1);
    gs = movePlayer(gs, Direction.RIGHT);
    expect(gs.hasKey).toBe(true);

    // Open one locked chest
    const [ly, lx] = locked[0];
    // Move player adjacent to the chest; pick a neighbor floor spot if possible, else just force set
    const nbs = neighbors(ly, lx);
    const [ny, nx, dir] = nbs[0];
    setPlayer(gs.mapData, ny, nx);
    const after = movePlayer(gs, dir);
    // Universal key is not consumed
    expect(after.hasKey).toBe(true);
    // Chest opened
    expect(after.mapData.subtypes[ly][lx].includes(TileSubtype.OPEN_CHEST)).toBe(true);

    // If another locked chest exists, we can still open it with the universal key
    const others = findAll(after.mapData, (s) => s.includes(TileSubtype.CHEST) && s.includes(TileSubtype.LOCK));
    if (others.length > 0) {
      const [ly2, lx2] = others[0];
      const [ny2, nx2, dir2] = neighbors(ly2, lx2)[0];
      setPlayer(after.mapData, ny2, nx2);
      const after2 = movePlayer(after, dir2);
      expect(after2.hasKey).toBe(true);
      expect(after2.mapData.subtypes[ly2][lx2].includes(TileSubtype.OPEN_CHEST)).toBe(true);
    }
  });
});
