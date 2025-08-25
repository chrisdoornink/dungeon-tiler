import { Enemy, updateEnemies } from "../../lib/enemy";

// Simple 5x5 floor grid
const makeOpenGrid = () => Array.from({ length: 5 }, () => Array(5).fill(0));

describe("Ghost onProximity torch-snuff behavior (EnemyRegistry)", () => {
  test("adjacent ghost snuffs the player's torch via onProximity hook", () => {
    const grid = makeOpenGrid();
    const player = { y: 2, x: 2 };
    const ghost = new Enemy({ y: 2, x: 3 }); // adjacent (right of player)
    ghost.kind = "ghost";

    let torchLit = true;
    const setPlayerTorchLit = (lit: boolean) => { torchLit = lit; };

    // Sanity: starts lit
    expect(torchLit).toBe(true);

    // Run one tick; updateEnemies resets torch to lit at start of tick,
    // then ghost onProximity should set it to false because it's adjacent.
    updateEnemies(grid, [ghost], player, {
      playerTorchLit: torchLit,
      setPlayerTorchLit,
    });

    expect(torchLit).toBe(false);
  });

  test("torch stays off on next tick when ghost is not adjacent (no auto-relight)", () => {
    const grid = makeOpenGrid();
    const player = { y: 2, x: 2 };
    const ghost = new Enemy({ y: 0, x: 0 }); // far from player
    ghost.kind = "ghost";

    let torchLit = false; // simulate previously snuffed state
    const setPlayerTorchLit = (lit: boolean) => { torchLit = lit; };

    // Run one tick with no adjacent ghost: no auto-relight expected.
    updateEnemies(grid, [ghost], player, {
      playerTorchLit: torchLit,
      setPlayerTorchLit,
    });

    expect(torchLit).toBe(false);
  });
});
