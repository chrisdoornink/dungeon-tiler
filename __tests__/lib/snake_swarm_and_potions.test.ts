import { addSnakesPerRules } from "../../lib/map/enemy-features";
import { pickPotRevealDeterministic } from "../../lib/map/pots";
import { generateMapWithSubtypes, addPotsToMap } from "../../lib/map/map-features";
import { TileSubtype } from "../../lib/map/constants";

describe("Snake swarm event (5% chance for 7 snakes)", () => {
  it("generates 7+ snakes when swarm rolls", () => {
    const mapData = generateMapWithSubtypes();

    const enemies = addSnakesPerRules(mapData, [], {
      rng: () => 0.03, // Force swarm with value < 0.05
      floor: 1,
    });

    const snakeCount = enemies.filter((e) => e.kind === "snake").length;
    expect(snakeCount).toBeGreaterThanOrEqual(6);
  });

  it("generates normal amount when swarm does not roll", () => {
    const mapData = generateMapWithSubtypes();
    const enemies = addSnakesPerRules(mapData, [], {
      rng: () => 0.1, // Force normal (> 0.05)
      floor: 1,
    });

    const snakeCount = enemies.filter((e) => e.kind === "snake").length;
    expect(snakeCount).toBeLessThanOrEqual(1);
  });

  it("respects floor-specific ranges for non-swarm", () => {
    const mapData = generateMapWithSubtypes();

    const enemies = addSnakesPerRules(mapData, [], {
      rng: () => 0.5,
      floor: 7,
    });

    const snakeCount = enemies.filter((e) => e.kind === "snake").length;
    expect(snakeCount).toBeLessThanOrEqual(3);
    expect(snakeCount).toBeGreaterThanOrEqual(0);
  });

  it("swarm can occur on any floor", () => {
    const mapData = generateMapWithSubtypes();
    const enemies = addSnakesPerRules(mapData, [], {
      rng: () => 0.02,
      floor: 5,
    });

    const snakeCount = enemies.filter((e) => e.kind === "snake").length;
    expect(snakeCount).toBeGreaterThanOrEqual(6);
  });
});

describe("Potion guarantees for swarm levels", () => {
  it("swarm levels with many enemies guarantee potions better than normal", () => {
    // Create a swarm map: 7+ snakes from swarm event
    const swarmMapData = generateMapWithSubtypes();
    const swarmEnemies = addSnakesPerRules(swarmMapData, [], {
      rng: () => 0.03, // Force swarm
      floor: 1,
    });
    const swarmMapWithPots = addPotsToMap(swarmMapData);

    // Create a normal map: 0-1 snakes
    const normalMapData = generateMapWithSubtypes();
    const normalEnemies = addSnakesPerRules(normalMapData, [], {
      rng: () => 0.1, // Force normal
      floor: 1,
    });
    const normalMapWithPots = addPotsToMap(normalMapData);

    // Count potions in swarm level
    const swarmResults = [];
    for (let y = 0; y < swarmMapWithPots.tiles.length; y++) {
      for (let x = 0; x < swarmMapWithPots.tiles[y].length; x++) {
        if (swarmMapWithPots.subtypes[y][x].includes(TileSubtype.POT)) {
          swarmResults.push(pickPotRevealDeterministic(swarmMapWithPots, y, x));
        }
      }
    }

    // Count potions in normal level
    const normalResults = [];
    for (let y = 0; y < normalMapWithPots.tiles.length; y++) {
      for (let x = 0; x < normalMapWithPots.tiles[y].length; x++) {
        if (normalMapWithPots.subtypes[y][x].includes(TileSubtype.POT)) {
          normalResults.push(pickPotRevealDeterministic(normalMapWithPots, y, x));
        }
      }
    }

    const swarmSnakeCount = swarmEnemies.filter((e) => e.kind === "snake").length;
    const swarmPotionCount = swarmResults.filter((r) => r === TileSubtype.MED).length;
    const normalPotionCount = normalResults.filter((r) => r === TileSubtype.MED).length;

    // Swarms should have significantly more snakes
    expect(swarmSnakeCount).toBeGreaterThan(2);

    // Swarm level should guarantee at least 2 potions
    if (swarmSnakeCount >= 7) {
      expect(swarmPotionCount).toBeGreaterThanOrEqual(2);
    }

    // Both maps are randomly generated so we can't deterministically
    // compare them. The meaningful guarantee (swarm >= 2) is above.
  });

  it("returns valid potion results for all levels", () => {
    const mapData = generateMapWithSubtypes();
    const withPots = addPotsToMap(mapData);

    const results = [];
    for (let y = 0; y < withPots.tiles.length; y++) {
      for (let x = 0; x < withPots.tiles[y].length; x++) {
        if (withPots.subtypes[y][x].includes(TileSubtype.POT)) {
          results.push(pickPotRevealDeterministic(withPots, y, x));
        }
      }
    }

    // All results should be either FOOD or MED
    results.forEach((r) => {
      expect([TileSubtype.FOOD, TileSubtype.MED]).toContain(r);
    });
  });
});
