import React from 'react';
import { render } from '@testing-library/react';
import { heroLocationTitle } from '../../components/GameView';
import { TilemapGrid } from '../../components/TilemapGrid';
import { TileSubtype, GameState, Direction } from '../../lib/map';
import '@testing-library/jest-dom';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

describe('heroLocationTitle', () => {
  const daily = { maxFloors: 3, isEndless: false };

  it('shows the floor out of the total in the multi-floor daily', () => {
    expect(heroLocationTitle({ ...daily, floor: 3 })).toBe('Torch Boy — Floor 3/3');
  });

  it('adds a skull to the floor while the hero is in a boss arena', () => {
    expect(heroLocationTitle({ ...daily, floor: 3, inBossRoom: true })).toBe(
      'Torch Boy — Floor 3/3 💀'
    );
  });

  it('never names the boss (internal names stay internal)', () => {
    const title = heroLocationTitle({ ...daily, floor: 3, inBossRoom: true });
    for (const name of ['Shaper', 'Fisher', 'Quarrymaster', 'Coilwyrm']) {
      expect(title).not.toContain(name);
    }
  });

  it('drops the skull again once the hero walks back out of the arena', () => {
    expect(heroLocationTitle({ ...daily, floor: 3, inBossRoom: false })).toBe(
      'Torch Boy — Floor 3/3'
    );
  });

  it('keeps the skull in endless, which has no floor cap to show', () => {
    expect(
      heroLocationTitle({ maxFloors: 999, isEndless: true, floor: 7, inBossRoom: true })
    ).toBe('Torch Boy — Floor 7 💀');
  });

  it('prefers the boss skull over the pink realm word', () => {
    expect(
      heroLocationTitle({ ...daily, floor: 3, inPinkRealm: true, inBossRoom: true })
    ).toBe('Torch Boy — Floor 3/3 💀');
    expect(heroLocationTitle({ ...daily, floor: 3, inPinkRealm: true })).toBe(
      'Torch Boy — Pink Realm 3/3'
    );
  });

  it('stays plain on single-floor maps', () => {
    expect(heroLocationTitle({ maxFloors: 1, isEndless: false, floor: 1 })).toBe('Torch Boy');
  });
});

describe('TilemapGrid location reporting', () => {
  const tileTypes = {
    0: { id: 0, name: 'floor', color: '#ccc', walkable: true },
    1: { id: 1, name: 'wall', color: '#333', walkable: false },
  };

  const stateWith = (extra: Partial<GameState>): GameState => {
    const size = 25;
    const tiles = Array(size).fill(0).map(() => Array(size).fill(0));
    const subtypes = Array(size)
      .fill(0)
      .map(() => Array(size).fill(0).map(() => [] as number[]));
    const c = Math.floor(size / 2);
    subtypes[c][c] = [TileSubtype.PLAYER];
    return {
      hasKey: false,
      hasExitKey: false,
      mapData: { tiles, subtypes },
      showFullMap: false,
      win: false,
      playerDirection: Direction.DOWN,
      heroHealth: 5,
      heroAttack: 1,
      heroTorchLit: true,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      currentFloor: 3,
      maxFloors: 3,
      ...extra,
    };
  };

  const renderWith = (extra: Partial<GameState>) => {
    const onLocationChange = jest.fn();
    const state = stateWith(extra);
    render(
      <TilemapGrid
        tilemap={state.mapData.tiles}
        tileTypes={tileTypes}
        subtypes={state.mapData.subtypes}
        initialGameState={state}
        onLocationChange={onLocationChange}
      />
    );
    return onLocationChange;
  };

  it('reports the boss arena so the header can show the skull', () => {
    expect(renderWith({ inBossRoom: true })).toHaveBeenCalledWith(
      expect.objectContaining({ floor: 3, inBossRoom: true })
    );
  });

  it('reports a plain dungeon floor as not in a boss arena', () => {
    expect(renderWith({})).toHaveBeenCalledWith(
      expect.objectContaining({ floor: 3, inBossRoom: false })
    );
  });
});
