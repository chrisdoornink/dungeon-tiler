import React from 'react';
import { render, screen } from '@testing-library/react';
const pushMock = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));
import '@testing-library/jest-dom';
import { TilemapGrid } from '../../components/TilemapGrid';
import { Direction, GameState, TileSubtype } from '../../lib/map';
import { Enemy } from '../../lib/enemy';

const makeOpen = (n = 25) => Array.from({ length: n }, () => Array(n).fill(0));
const makeSubs = (n = 25) => Array.from({ length: n }, () => Array.from({ length: n }, () => [] as number[]));

describe('HUD: Enemies in sight shows correct stone-exciter front sprite', () => {
  test('shows stone-exciter front icon and HP in list', () => {
    const tiles = makeOpen(25);
    const subtypes = makeSubs(25);
    // Place player near center
    const py = 12, px = 12;
    subtypes[py][px] = [TileSubtype.PLAYER];

    // Place a stone-exciter within LOS and <= 8 tiles (right by 3)
    const exciter = new Enemy({ y: py, x: px + 3 });
    exciter.kind = 'stone-exciter';

    const initialGameState: GameState = {
      hasKey: false,
      hasExitKey: false,
      hasSword: false,
      hasShield: false,
      mapData: { tiles, subtypes },
      showFullMap: false,
      win: false,
      playerDirection: Direction.RIGHT,
      enemies: [exciter],
      heroHealth: 5,
      heroAttack: 1,
      stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
      heroTorchLit: true,
      rockCount: 0,
    };

    render(
      <TilemapGrid tilemap={tiles} tileTypes={{0:{id:0,name:'floor',color:'#ccc',walkable:true},1:{id:1,name:'wall',color:'#333',walkable:false}}} subtypes={subtypes} initialGameState={initialGameState} />
    );

    // Find the HUD list
    const status = screen.getByText(/Enemies in sight/i);
    expect(status).toBeInTheDocument();

    // The icon span should have background image pointing to stone-exciter-front
    const iconSpans = status.parentElement!.querySelectorAll('span.inline-block');
    expect(iconSpans.length).toBeGreaterThan(0);
    const bg = (iconSpans[0] as HTMLElement).style.backgroundImage;
    expect(bg).toContain('stone-exciter-front.png');

    // Should show 8 heart icons for enemy health
    const hearts = screen.getAllByAltText('❤️');
    expect(hearts.length).toBeGreaterThanOrEqual(8);
  });
});
