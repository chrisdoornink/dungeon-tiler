import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Tile, ENEMY_LAVA_SUBMERSION_CLIP } from '../../components/Tile';
import { TileSubtype } from '../../lib/map';

/**
 * Stone goblins are the only enemy that crosses lava. Standing on a lava tile
 * they sink knee-deep into it (the sprite's bottom is clipped) instead of
 * floating on top. Cooled OBSIDIAN crossings drop the LAVA subtype, so an
 * enemy on obsidian is not clipped.
 */

const mockFloor = { id: 0, name: 'floor', color: '#ccc', walkable: true };

function renderEnemyOn(subtype: number[]): HTMLElement {
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
      enemyKind="stone-goblin"
      row={2}
      col={2}
    />
  );
  return screen.getByTestId('enemy-sprite');
}

describe('Enemy lava submersion clipping', () => {
  it('clips a stone goblin knee-deep when standing on lava', () => {
    const sprite = renderEnemyOn([TileSubtype.LAVA]);
    expect(sprite.style.clipPath).toBe(ENEMY_LAVA_SUBMERSION_CLIP);
  });

  it('does not clip an enemy on a cooled obsidian crossing', () => {
    const sprite = renderEnemyOn([TileSubtype.OBSIDIAN]);
    expect(sprite.style.clipPath).toBe('');
  });

  it('does not clip an enemy on dry floor', () => {
    const sprite = renderEnemyOn([]);
    expect(sprite.style.clipPath).toBe('');
  });
});
