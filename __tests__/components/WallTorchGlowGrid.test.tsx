import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TilemapGrid } from '../../components/TilemapGrid';
import { tileTypes, TileSubtype, Direction, type GameState } from '../../lib/map';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

function makeGrid(h: number, w: number, fill = 0): number[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
}

function emptySubtypes(h: number, w: number): number[][][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => [] as number[]));
}

describe('Wall torch glow integration', () => {
  it('applies adjacent and diagonal glow classes around a wall torch', () => {
    const h = 5, w = 5;
    const tiles = makeGrid(h, w, 0);
    // make center a wall so we can place a torch on it
    tiles[2][2] = 1;
    const sub = emptySubtypes(h, w);
    sub[2][2] = [TileSubtype.WALL_TORCH];

    const initialGameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      mapData: { tiles, subtypes: sub },
      showFullMap: true,
      win: false,
      playerDirection: Direction.DOWN,
      heroHealth: 5,
      heroAttack: 1,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    };

    render(
      <TilemapGrid
        tileTypes={tileTypes}
        initialGameState={initialGameState}
      />
    );

    const getTile = (y: number, x: number) =>
      document.querySelector(`[data-row="${y}"][data-col="${x}"]`);

    // Adjacent tiles
    expect(getTile(1,2)).toHaveClass('torchGlowAdj');
    expect(getTile(3,2)).toHaveClass('torchGlowAdj');
    expect(getTile(2,1)).toHaveClass('torchGlowAdj');
    expect(getTile(2,3)).toHaveClass('torchGlowAdj');

    // Diagonals
    expect(getTile(1,1)).toHaveClass('torchGlowDiag');
    expect(getTile(1,3)).toHaveClass('torchGlowDiag');
    expect(getTile(3,1)).toHaveClass('torchGlowDiag');
    expect(getTile(3,3)).toHaveClass('torchGlowDiag');
  });
});
