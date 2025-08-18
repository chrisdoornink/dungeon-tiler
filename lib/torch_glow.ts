export const ADJACENT_GLOW = 0.12;
export const DIAGONAL_GLOW = 0.06;

/**
 * Compute faint glow intensities around a torch at (y, x).
 * Returns a map keyed as "y,x" with intensity values for adjacent and diagonal tiles.
 * - Adjacent N/E/S/W: ADJACENT_GLOW
 * - Diagonals: DIAGONAL_GLOW
 * - Others: omitted
 */
export function computeTorchGlow(
  y: number,
  x: number,
  grid: number[][]
): Map<string, number> {
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  const res = new Map<string, number>();

  const inBounds = (yy: number, xx: number) => yy >= 0 && yy < h && xx >= 0 && xx < w;

  // Adjacent (N,E,S,W)
  const adj: Array<[number, number]> = [
    [y - 1, x],
    [y + 1, x],
    [y, x - 1],
    [y, x + 1],
  ];
  for (const [yy, xx] of adj) {
    if (inBounds(yy, xx)) res.set(`${yy},${xx}`, ADJACENT_GLOW);
  }

  // Diagonals
  const diag: Array<[number, number]> = [
    [y - 1, x - 1],
    [y - 1, x + 1],
    [y + 1, x - 1],
    [y + 1, x + 1],
  ];
  for (const [yy, xx] of diag) {
    if (inBounds(yy, xx)) res.set(`${yy},${xx}`, DIAGONAL_GLOW);
  }

  return res;
}
