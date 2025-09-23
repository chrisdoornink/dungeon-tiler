import { computeTorchGlow } from '../../lib/torch_glow';

// Helper to make an empty grid (all floors = 0)
function makeGrid(h: number, w: number, fill = 0): number[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
}

describe('computeTorchGlow', () => {
  test('adjacent tiles receive stronger glow than diagonals around the torch', () => {
    const grid = makeGrid(5, 5, 0);
    const ty = 2, tx = 2; // center

    const glow = computeTorchGlow(ty, tx, grid);

    // Adjacent
    const adj = [
      `${ty - 1},${tx}`, // N
      `${ty + 1},${tx}`, // S
      `${ty},${tx - 1}`, // W
      `${ty},${tx + 1}`, // E
    ].map((k) => glow.get(k));

    // Diagonals
    const diag = [
      `${ty - 1},${tx - 1}`,
      `${ty - 1},${tx + 1}`,
      `${ty + 1},${tx - 1}`,
      `${ty + 1},${tx + 1}`,
    ].map((k) => glow.get(k));

    // Expect presence
    adj.forEach((v) => expect(v).toBeDefined());
    diag.forEach((v) => expect(v).toBeDefined());

    // Expect strength: adjacent > diagonal
    const minAdj = Math.min(...(adj as number[]));
    const maxDiag = Math.max(...(diag as number[]));
    expect(minAdj).toBeGreaterThan(maxDiag);

    // Second ring tiles should exist but be weaker than diagonals
    const ring2Keys = [
      `${ty - 2},${tx}`,
      `${ty + 2},${tx}`,
      `${ty},${tx - 2}`,
      `${ty},${tx + 2}`,
      `${ty - 2},${tx - 2}`,
      `${ty - 2},${tx + 2}`,
      `${ty + 2},${tx - 2}`,
      `${ty + 2},${tx + 2}`,
    ];
    const ring2 = ring2Keys.map((k) => glow.get(k));
    ring2.forEach((v) => expect(v).toBeDefined());
    const maxRing2 = Math.max(...(ring2 as number[]));
    expect(maxDiag).toBeGreaterThan(maxRing2);
  });

  test('handles edge torch without out-of-bounds keys', () => {
    const grid = makeGrid(3, 3, 0);
    const ty = 0, tx = 0; // top-left corner

    const glow = computeTorchGlow(ty, tx, grid);

    // Valid neighbors only
    // Adjacent existing: (1,0) and (0,1)
    expect(glow.get('1,0')).toBeDefined();
    expect(glow.get('0,1')).toBeDefined();

    // Diagonal existing: (1,1)
    expect(glow.get('1,1')).toBeDefined();

    // Non-existent negatives should not be set
    expect(glow.get('-1,0')).toBeUndefined();
    expect(glow.get('0,-1')).toBeUndefined();
    expect(glow.get('-1,-1')).toBeUndefined();
  });
});
