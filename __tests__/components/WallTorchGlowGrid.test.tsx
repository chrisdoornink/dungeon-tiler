import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TilemapGrid } from '../../components/TilemapGrid';
import { tileTypes, TileSubtype, Direction, type GameState } from '../../lib/map';
import { Enemy } from '../../lib/enemy';

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

  // The per-tile torch tiers only run with the light pass off (`?light=0`); with it on (the
  // default) the light map replaces them — see the next test.
  it('casts a flickering torch falloff (bright arms, dimmer corners) instead of a hard cross with black corners when the hero torch is out (light pass off)', () => {
    const h = 11, w = 11;
    const tiles = makeGrid(h, w, 0);
    tiles[5][5] = 1;
    const sub = emptySubtypes(h, w);
    sub[5][5] = [TileSubtype.WALL_TORCH];
    // Player far from the torch so its own snuff ring can't overlap the corners.
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
      heroTorchLit: false, // torch snuffed
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    };

    render(
      <TilemapGrid tileTypes={tileTypes} initialGameState={initialGameState} lightPass={false} />
    );

    const getTile = (y: number, x: number) =>
      document.querySelector(`[data-row="${y}"][data-col="${x}"]`);
    const hasInnerClass = (y: number, x: number, cls: string) =>
      (getTile(y, x) as Element | null)?.querySelector(`.${cls}`);

    // Orthogonal arms get the bright flickering torch-arm class (not the plain
    // lit-mode tier-2, and not the near-black snuff ring).
    for (const [y, x] of [[4,5],[6,5],[5,4],[5,6]] as const) {
      expect(hasInnerClass(y, x, 'fov-tier-torch-adj')).toBeInTheDocument();
      expect(hasInnerClass(y, x, 'fov-tier-snuff-ring')).not.toBeInTheDocument();
    }

    // Diagonal corners get the dimmer flickering half-light class instead of the
    // near-black snuff ring.
    for (const [y, x] of [[4,4],[4,6],[6,4],[6,6]] as const) {
      expect(hasInnerClass(y, x, 'fov-tier-torch-diag')).toBeInTheDocument();
      expect(hasInnerClass(y, x, 'fov-tier-snuff-ring')).not.toBeInTheDocument();
    }
  });

  it('with the light pass on and the torch out, lights the room from the sconce instead of per-tile tiers, and only draws enemies the light reaches', () => {
    const h = 11, w = 11;
    const tiles = makeGrid(h, w, 0);
    tiles[5][5] = 1;
    const sub = emptySubtypes(h, w);
    sub[5][5] = [TileSubtype.WALL_TORCH];
    sub[0][0] = [TileSubtype.PLAYER];

    // One goblin in the sconce's pool, one out in the dark far from both lights.
    const lit = new Enemy({ y: 6, x: 5 });
    lit.kind = 'water-goblin';
    const hidden = new Enemy({ y: 10, x: 10 });
    hidden.kind = 'water-goblin';

    const initialGameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      mapData: { tiles, subtypes: sub },
      showFullMap: false,
      win: false,
      playerDirection: Direction.DOWN,
      heroHealth: 5,
      heroAttack: 1,
      heroTorchLit: false,
      enemies: [lit, hidden],
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    };

    render(
      <TilemapGrid tileTypes={tileTypes} initialGameState={initialGameState} lightPass />
    );

    const getTile = (y: number, x: number) =>
      document.querySelector(`[data-row="${y}"][data-col="${x}"]`) as Element | null;

    // The light map runs in its dark form...
    const layers = document.querySelector('[data-testid="light-pass-layers"]');
    expect(layers).toBeInTheDocument();
    expect(layers).toHaveAttribute('data-light-dark', '1');

    // ...so no tile carries the old tier classes, and the far corner renders as a real
    // tile (the light map darkens it) rather than the invisible placeholder.
    for (const cls of ['fov-tier-torch-adj', 'fov-tier-torch-diag', 'fov-tier-torch-far', 'fov-tier-snuff-ring', 'fov-tier-snuff-core']) {
      expect(document.querySelector(`.${cls}`)).not.toBeInTheDocument();
    }
    expect(getTile(10, 0)?.querySelector('.fov-tier-3')).toBeInTheDocument();

    // The goblin in the sconce's pool is drawn; the one in the dark is not.
    expect(getTile(6, 5)?.querySelector('[data-testid="enemy-sprite"]')).toBeInTheDocument();
    expect(getTile(10, 10)?.querySelector('[data-testid="enemy-sprite"]')).not.toBeInTheDocument();
  });
});
