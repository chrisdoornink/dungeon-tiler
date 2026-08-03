import React from "react";
import { render, screen, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { TilemapGrid } from "../../components/TilemapGrid";
import { Direction, TileSubtype, type GameState } from "../../lib/map";
import { CurrentGameStorage } from "../../lib/current_game_storage";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

/**
 * Death locks out every player action.
 *
 * Reported by a player: spam the rock button while the death animation plays and the run
 * comes back from the results screen as an unplayable board — a dead hero who cannot move
 * but can still throw. The item buttons ran their handlers with no death gate (only
 * movement and the keydown listener had one), and each handler's `saveCurrentGame` wrote
 * the dead run back into the slot AFTER the death path had cleared it.
 */

const SIZE = 25;

/** Hero at [1][1] facing a faulty floor at [1][2] — stepping right is an instant death. */
function makeState(overrides: Partial<GameState> = {}): GameState {
  const tiles = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  const subtypes = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => [] as number[])
  );
  subtypes[1][1] = [TileSubtype.PLAYER];
  subtypes[1][2] = [TileSubtype.FAULTY_FLOOR];
  return {
    hasKey: false,
    hasExitKey: false,
    mapData: { tiles, subtypes },
    showFullMap: true,
    win: false,
    playerDirection: Direction.RIGHT,
    enemies: [],
    npcs: [],
    heroHealth: 5,
    heroMaxHealth: 5,
    heroAttack: 1,
    currentFloor: 3,
    rockCount: 3,
    runeCount: 1,
    bombCount: 1,
    foodCount: 1,
    potionCount: 1,
    berryCount: 1,
    pinkHeartCount: 1,
    hasSnakeMedallion: true,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    ...overrides,
  } as GameState;
}

/** The abyss death cinematic: sinking -> spirit (1000ms) -> complete (1900ms). */
const DEATH_ANIM_MS = 1900;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  window.localStorage.clear();
});

describe("death locks out the item buttons", () => {
  /**
   * Renders a daily run, walks the hero into the faulty floor, and hands back a spy that
   * has been cleared of the killing turn's own save.
   */
  function killTheHero(onDailyComplete = jest.fn()) {
    const save = jest.spyOn(CurrentGameStorage, "saveCurrentGame");
    const clear = jest.spyOn(CurrentGameStorage, "clearCurrentGame");
    render(
      <TilemapGrid
        tileTypes={{}}
        initialGameState={makeState()}
        isDailyChallenge
        storageSlot="daily-new"
        onDailyComplete={onDailyComplete}
      />
    );
    act(() => {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    });
    save.mockClear();
    return { save, clear, onDailyComplete };
  }

  it("ignores rock spam during the death animation", () => {
    const { save } = killTheHero();

    // The button is still on screen — the fade-to-black over it is pointer-events-none,
    // which is exactly why this was tappable in the first place.
    const rock = screen.getByTestId("mobile-action-rock");
    expect(rock).toBeInTheDocument();

    act(() => {
      for (let i = 0; i < 10; i++) fireEvent.click(rock);
    });
    // A throw commits its state on a timer as the rock lands, so the save only shows up
    // once the flight has played out — assert after, or the test passes for free.
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(save).not.toHaveBeenCalled();
    // No turn ran, so the count never moved.
    expect(screen.getByTestId("mobile-action-rock")).toHaveAttribute(
      "title",
      "Throw rock (3)"
    );
  });

  it("ignores rock spam AFTER the run has been recorded and the slot cleared", () => {
    const { save, clear, onDailyComplete } = killTheHero();

    act(() => {
      jest.advanceTimersByTime(DEATH_ANIM_MS);
    });
    expect(onDailyComplete).toHaveBeenCalledWith("lost");
    expect(clear).toHaveBeenCalled();

    // This is the resurrect: a save here re-writes the dead run into the slot the
    // completion just cleared, and the next resume loads a frozen board.
    const rock = screen.queryByTestId("mobile-action-rock");
    if (rock) {
      act(() => {
        for (let i = 0; i < 10; i++) fireEvent.click(rock);
      });
    }
    act(() => {
      jest.advanceTimersByTime(2000); // let any queued projectile flight land
    });

    expect(save).not.toHaveBeenCalled();
  });

  it("ignores every other item button during the death animation", () => {
    const { save } = killTheHero();

    for (const testId of [
      "mobile-action-rune",
      "mobile-action-bomb",
      "mobile-inventory-item-food",
      "mobile-inventory-item-potion",
      "mobile-inventory-item-berry",
      "mobile-inventory-item-pink-heart",
      "mobile-inventory-item-medallion",
    ]) {
      const button = screen.queryByTestId(testId);
      if (!button) continue;
      act(() => {
        fireEvent.click(button);
      });
    }
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(save).not.toHaveBeenCalled();
  });

  it("ignores every item key during the death animation", () => {
    const { save } = killTheHero();

    act(() => {
      for (const key of ["r", "t", "b", "f", "p", "h", "g", "z", "m", "e"]) {
        fireEvent.keyDown(window, { key });
      }
    });
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(save).not.toHaveBeenCalled();
  });
});

describe("a run that mounts already dead", () => {
  it("resolves to its results screen instead of freezing on the board", () => {
    const onDailyComplete = jest.fn();
    render(
      <TilemapGrid
        tileTypes={{}}
        initialGameState={makeState({
          heroHealth: 0,
          deathCause: { type: "enemy", enemyKind: "goblin" },
        })}
        isDailyChallenge
        storageSlot="daily-new"
        onDailyComplete={onDailyComplete}
      />
    );

    // No >0 -> 0 transition happens here, so the death cinematic never starts. Before the
    // fix the completion effect sat waiting on a phase that would never arrive.
    expect(onDailyComplete).toHaveBeenCalledWith("lost");
  });
});

describe("CurrentGameStorage rejects a dead save", () => {
  it.each(["daily-new", "endless"] as const)(
    "drops a %s save whose hero is dead",
    (slot) => {
      CurrentGameStorage.saveCurrentGame(makeState({ heroHealth: 0 }), slot);
      expect(CurrentGameStorage.hasCurrentGame(slot)).toBe(false);
      expect(CurrentGameStorage.loadCurrentGame(slot)).toBeNull();
    }
  );

  it("keeps a story save whose hero is dead, so the checkpoint restart survives", () => {
    CurrentGameStorage.saveCurrentGame(makeState({ heroHealth: 0 }), "story");
    expect(CurrentGameStorage.loadCurrentGame("story")).not.toBeNull();
  });

  it("still loads a living daily save", () => {
    CurrentGameStorage.saveCurrentGame(makeState(), "daily-new");
    expect(CurrentGameStorage.loadCurrentGame("daily-new")).not.toBeNull();
  });
});
