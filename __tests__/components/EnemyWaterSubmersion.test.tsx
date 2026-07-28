import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Tile, ENEMY_WATER_SUBMERSION_CLIP } from '../../components/Tile';
import { TileSubtype } from '../../lib/map';

/**
 * Enemies standing in water get the same submersion treatment as the hero:
 * waist-deep in shallow water, head-deep in deep water — and snakes ride lower,
 * showing only the top half of their body even in the shallows.
 */

const mockFloor = { id: 0, name: 'floor', color: '#ccc', walkable: true };

function renderEnemyOn(
  subtype: number[],
  enemyKind: 'snake' | 'water-goblin' | 'stone-goblin' | 'earth-goblin'
): HTMLElement {
  render(
    <Tile
      tileId={0}
      tileType={mockFloor}
      isVisible={true}
      neighbors={{ top: 0, right: 0, bottom: 0, left: 0 }}
      subtype={subtype}
      hasEnemy={true}
      enemyVisible={true}
      enemyFacing="DOWN"
      enemyKind={enemyKind}
      row={2}
      col={2}
    />
  );
  return screen.getByTestId('enemy-sprite');
}

describe('Enemy water submersion clipping', () => {
  it('clips a wading goblin to the waist in shallow water', () => {
    const sprite = renderEnemyOn([TileSubtype.SHALLOW_WATER], 'stone-goblin');
    expect(sprite.style.clipPath).toBe(ENEMY_WATER_SUBMERSION_CLIP.shallow);
  });

  it('clips a snake to the top half of its body in shallow water', () => {
    const sprite = renderEnemyOn([TileSubtype.SHALLOW_WATER], 'snake');
    expect(sprite.style.clipPath).toBe(ENEMY_WATER_SUBMERSION_CLIP.shallowSnake);
  });

  it('clips a swimming water goblin to the head in deep water', () => {
    const sprite = renderEnemyOn([TileSubtype.DEEP_WATER], 'water-goblin');
    expect(sprite.style.clipPath).toBe(ENEMY_WATER_SUBMERSION_CLIP.deep);
  });

  it('does not clip enemies on dry land or stepping stones', () => {
    const dry = renderEnemyOn([], 'earth-goblin');
    expect(dry.style.clipPath).toBe('');
  });
});
