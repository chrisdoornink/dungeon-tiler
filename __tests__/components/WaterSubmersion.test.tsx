import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Tile, WATER_SUBMERSION_CLIP } from '../../components/Tile';
import { TileSubtype } from '../../lib/map';

/**
 * Submersion: standing in water clips the bottom of the hero sprite —
 * waist-deep in shallow water, up to the head in deep water, untouched on land.
 * (The smooth-movement overlay hero in TilemapGrid shares WATER_SUBMERSION_CLIP.)
 */

const mockFloor = { id: 0, name: 'floor', color: '#ccc', walkable: true };

function renderHeroOn(subtype: number[]): HTMLElement {
  const { container } = render(
    <Tile
      tileId={0}
      tileType={mockFloor}
      isVisible={true}
      neighbors={{ top: 0, right: 0, bottom: 0, left: 0 }}
      subtype={subtype}
    />
  );
  const hero = container.querySelector('.heroImage');
  if (!hero) throw new Error('hero sprite not rendered');
  return hero as HTMLElement;
}

describe('Water submersion clipping', () => {
  it('clips the hero to the waist in shallow water', () => {
    const hero = renderHeroOn([TileSubtype.SHALLOW_WATER, TileSubtype.PLAYER]);
    expect(hero.style.clipPath).toBe(WATER_SUBMERSION_CLIP.shallow);
  });

  it('clips the hero to the head in deep water', () => {
    const hero = renderHeroOn([TileSubtype.DEEP_WATER, TileSubtype.PLAYER]);
    expect(hero.style.clipPath).toBe(WATER_SUBMERSION_CLIP.deep);
  });

  it('does not clip the hero on dry land or stepping stones', () => {
    const dry = renderHeroOn([TileSubtype.PLAYER]);
    expect(dry.style.clipPath).toBe('');

    const stone = renderHeroOn([TileSubtype.STEPPING_STONE, TileSubtype.PLAYER]);
    expect(stone.style.clipPath).toBe('');
  });
});
