import { Enemy, updateEnemies } from "../../lib/enemy";

const open = () => Array.from({ length: 7 }, () => Array(7).fill(0));

function makeExciter(y: number, x: number) {
  const e = new Enemy({ y, x });
  e.kind = 'stone-exciter';
  return e;
}

describe('stone-exciter contact damage', () => {
  test('deals damage when stepping into player tile during hunt', () => {
    const grid = open();
    const player = { y: 3, x: 3 };
    // Place exciter at (3,5) so primary step is left into player.
    const exciter = makeExciter(3, 4); // one tile right of player for deterministic path
    // Ensure hunt triggers: within range

    const damage = updateEnemies(grid, [exciter], player, { rng: () => 0.9 });
    // Base attack 5, variance with rng 0.9 gives +2 per our variance rule, but defense default 0.
    // However, updateEnemies applies variance only if base > 0. We just need to assert > 0.
    expect(damage).toBeGreaterThan(0);
  });

  test('does not deal damage when blocked from reaching player this tick', () => {
    const grid = open();
    const player = { y: 3, x: 3 };
    const exciter = makeExciter(3, 5); // two to the right
    // Put a blocker between player and exciter to avoid contact this tick
    const blocker = new Enemy({ y: 3, x: 4 });
    blocker.kind = 'fire-goblin';

    const damage = updateEnemies(grid, [exciter, blocker], player, {
      rng: () => 0.9,
      // Suppress goblin damage so we only measure exciter's contact
      suppress: (e) => e.kind !== 'stone-exciter',
    });
    expect(damage).toBe(0);
  });
});
