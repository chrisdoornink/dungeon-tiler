import { advanceToNextFloor } from "../../lib/map/game-state";
import type { GameState } from "../../lib/map/game-state";

function makeFloor2State(): GameState {
  return {
    currentFloor: 2,
    maxFloors: 3,
    floorChestAllocation: {
      1: { chests: 2, keys: 2, chestContents: [] },
      2: { chests: 2, keys: 2, chestContents: [] },
      3: { chests: 0, keys: 0, chestContents: [] },
    },
    enemies: [],
    mode: "daily",
  } as unknown as GameState;
}

describe("daily floors no longer randomly generate outdoors", () => {
  test("advancing into floor 3 never yields the outdoor environment across many seeds", () => {
    for (let s = 1; s <= 300; s++) {
      const state = advanceToNextFloor(makeFloor2State(), s * 101 + 7);
      expect(state.currentFloor).toBe(3);
      expect(state.mapData.environment).not.toBe("outdoor");
    }
  });
});
