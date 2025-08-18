import React from 'react';
import { render } from '@testing-library/react';
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
  it('applies visibility tiers around a wall torch (adjacent vs diagonal)', () => {
    // Use a larger grid and place the player far so torch area is outside normal FOV
    const h = 11, w = 11;
    const tiles = makeGrid(h, w, 0);
    // Place a wall at center and mount a torch on it
    tiles[5][5] = 1;
    const sub = emptySubtypes(h, w);
    sub[5][5] = [TileSubtype.WALL_TORCH];
    // Place player at top-left corner to keep torch area outside FOV
    sub[0][0] = [TileSubtype.PLAYER];

    const initialGameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      mapData: { tiles, subtypes: sub },
      showFullMap: false,
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

    // Helper to assert inner tile has given class
    const hasInnerClass = (y: number, x: number, cls: string) =>
      (getTile(y, x) as Element | null)?.querySelector(`.${cls}`);

    // Adjacent tiles (around 5,5) should be tier-2 (inner div gets class)
    expect(hasInnerClass(4,5,'fov-tier-2')).toBeInTheDocument();
    expect(hasInnerClass(6,5,'fov-tier-2')).toBeInTheDocument();
    expect(hasInnerClass(5,4,'fov-tier-2')).toBeInTheDocument();
    expect(hasInnerClass(5,6,'fov-tier-2')).toBeInTheDocument();

    // Diagonals (around 5,5) should be tier-1
    expect(hasInnerClass(4,4,'fov-tier-1')).toBeInTheDocument();
    expect(hasInnerClass(4,6,'fov-tier-1')).toBeInTheDocument();
    expect(hasInnerClass(6,4,'fov-tier-1')).toBeInTheDocument();
    expect(hasInnerClass(6,6,'fov-tier-1')).toBeInTheDocument();
  });
});
