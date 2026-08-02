import React from "react";
import { render, screen, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { TilemapGrid } from "../../components/TilemapGrid";
import { Direction, TileSubtype, movePlayer, type GameState } from "../../lib/map";
import { findPlayerPosition } from "../../lib/map/player";
import { CurrentGameStorage } from "../../lib/current_game_storage";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

/**
 * The Amber Moth's UI: the manual rewind preview and the automatic on-death save.
 * See .claude/features/amber-moth-rewind/index.md.
 */

const SIZE = 25;

function makeState(overrides: Partial<GameState> = {}): GameState {
  const tiles = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  const subtypes = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => [] as number[])
  );
  subtypes[1][1] = [TileSubtype.PLAYER];
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
    currentFloor: 2,
    stats: { damageDealt: 0, damageTaken: 0, enemiesDefeated: 0, steps: 0 },
    ...overrides,
  } as GameState;
}

/** Walk right `n` times so the ring buffer has something in it. */
function walkRight(n: number) {
  for (let i = 0; i < n; i++) {
    act(() => {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    });
  }
}

/** Same walk, but through the engine — for building a starting state directly. */
function walkRightInEngine(state: GameState, n: number): GameState {
  let cur = state;
  for (let i = 0; i < n; i++) cur = movePlayer(cur, Direction.RIGHT);
  return cur;
}

/** The hero's column in a state's map. */
function heroColumn(state: GameState): number | null {
  const pos = findPlayerPosition(state.mapData);
  return pos ? pos[1] : null;
}

/**
 * TilemapGrid has no state-observation prop, so watch the save it performs on every
 * committed turn instead — that IS the state the game persisted.
 */
function watchSaves() {
  const spy = jest.spyOn(CurrentGameStorage, "saveCurrentGame");
  return {
    spy,
    /** The most recently saved state, or null if nothing has been saved. */
    latest(): GameState | null {
      const call = spy.mock.calls.at(-1);
      return call ? (call[0] as GameState) : null;
    },
  };
}

afterEach(() => {
  jest.restoreAllMocks();
  window.localStorage.clear();
});

describe("Amber Moth — inventory button", () => {
  it("is absent without a charge", () => {
    render(<TilemapGrid tileTypes={{}} initialGameState={makeState()} />);
    expect(screen.queryByTestId("amber-moth-button")).toBeNull();
  });

  it("appears once a charge is held, disabled until there is history", () => {
    render(
      <TilemapGrid tileTypes={{}} initialGameState={makeState({ rewindCharges: 1 })} />
    );
    const button = screen.getByTestId("amber-moth-button");
    expect(button).toBeInTheDocument();
    // Nothing recorded yet — no steps taken this floor.
    expect(button).toBeDisabled();

    walkRight(2);
    expect(screen.getByTestId("amber-moth-button")).toBeEnabled();
  });
});

describe("Amber Moth — manual rewind", () => {
  it("opens a preview one step back and reports the depth", () => {
    render(
      <TilemapGrid tileTypes={{}} initialGameState={makeState({ rewindCharges: 1 })} />
    );
    walkRight(4);

    act(() => {
      fireEvent.click(screen.getByTestId("amber-moth-button"));
    });

    expect(screen.getByTestId("rewind-preview")).toBeInTheDocument();
    expect(screen.getByTestId("rewind-depth")).toHaveTextContent("1 step back");
  });

  it("steps further back on Z, up to what history holds", () => {
    render(
      <TilemapGrid tileTypes={{}} initialGameState={makeState({ rewindCharges: 1 })} />
    );
    walkRight(3);

    act(() => {
      fireEvent.keyDown(window, { key: "z" });
    });
    expect(screen.getByTestId("rewind-depth")).toHaveTextContent("1 step back");

    act(() => {
      fireEvent.keyDown(window, { key: "z" });
    });
    expect(screen.getByTestId("rewind-depth")).toHaveTextContent("2 steps back");

    act(() => {
      fireEvent.keyDown(window, { key: "z" });
    });
    expect(screen.getByTestId("rewind-depth")).toHaveTextContent("3 steps back");

    // Only 3 steps were taken, so "further" is now spent.
    expect(screen.getByTestId("rewind-further")).toBeDisabled();
    act(() => {
      fireEvent.keyDown(window, { key: "z" });
    });
    expect(screen.getByTestId("rewind-depth")).toHaveTextContent("3 steps back");
  });

  it("ignores movement while previewing — the past is not playable", () => {
    const saves = watchSaves();
    render(
      <TilemapGrid tileTypes={{}} initialGameState={makeState({ rewindCharges: 1 })} />
    );
    walkRight(3);

    act(() => {
      fireEvent.click(screen.getByTestId("amber-moth-button"));
    });
    saves.spy.mockClear();

    // Arrow keys other than the "further back" binding must not advance a turn.
    act(() => {
      fireEvent.keyDown(window, { key: "ArrowUp" });
      fireEvent.keyDown(window, { key: "ArrowRight" });
      fireEvent.keyDown(window, { key: "ArrowDown" });
    });
    expect(saves.spy).not.toHaveBeenCalled();
    expect(screen.getByTestId("rewind-preview")).toBeInTheDocument();
    expect(screen.getByTestId("rewind-depth")).toHaveTextContent("1 step back");
  });

  it("commits: the hero lands in the past and the charge is spent", () => {
    const saves = watchSaves();
    render(
      <TilemapGrid tileTypes={{}} initialGameState={makeState({ rewindCharges: 1 })} />
    );
    walkRight(5);
    const present = saves.latest()!;
    expect(heroColumn(present)).toBe(6); // started at column 1

    act(() => {
      fireEvent.click(screen.getByTestId("amber-moth-button"));
    });
    act(() => {
      fireEvent.keyDown(window, { key: "z" });
    });
    act(() => {
      fireEvent.keyDown(window, { key: "z" });
    });
    act(() => {
      fireEvent.click(screen.getByTestId("rewind-commit"));
    });

    const committed = saves.latest()!;
    expect(heroColumn(committed)).toBe(3); // 3 steps back from column 6
    expect(committed.rewindCharges).toBe(0);
    expect(screen.queryByTestId("rewind-preview")).toBeNull();
    // Spent: the button is gone.
    expect(screen.queryByTestId("amber-moth-button")).toBeNull();
  });

  it("cancels back to the present with the charge intact", () => {
    const saves = watchSaves();
    render(
      <TilemapGrid tileTypes={{}} initialGameState={makeState({ rewindCharges: 1 })} />
    );
    walkRight(4);
    const present = saves.latest()!;

    act(() => {
      fireEvent.click(screen.getByTestId("amber-moth-button"));
    });
    act(() => {
      fireEvent.keyDown(window, { key: "z" });
    });
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });

    const after = saves.latest()!;
    expect(heroColumn(after)).toBe(heroColumn(present));
    expect(after.rewindCharges).toBe(1);
    expect(screen.queryByTestId("rewind-preview")).toBeNull();
    expect(screen.getByTestId("amber-moth-button")).toBeInTheDocument();
  });

  it("does not persist a preview to storage — only commit and cancel do", () => {
    const saves = watchSaves();
    render(
      <TilemapGrid tileTypes={{}} initialGameState={makeState({ rewindCharges: 1 })} />
    );
    walkRight(3);

    saves.spy.mockClear();
    act(() => {
      fireEvent.click(screen.getByTestId("amber-moth-button"));
    });
    act(() => {
      fireEvent.keyDown(window, { key: "z" });
    });
    expect(saves.spy).not.toHaveBeenCalled();

    act(() => {
      fireEvent.click(screen.getByTestId("rewind-commit"));
    });
    expect(saves.spy).toHaveBeenCalled();
  });
});

describe("Amber Moth — automatic death save", () => {
  /** A hero who walked 6 steps carrying the charm, then took a lethal hit. */
  function doomedState(): GameState {
    const walked = walkRightInEngine(makeState({ rewindCharges: 1 }), 6);
    expect(walked.rewindHistory?.length).toBe(6);
    return {
      ...walked,
      heroHealth: 0,
      deathCause: { type: "enemy", enemyKind: "fire-goblin" },
    };
  }

  it("intercepts death, restores the hero, and never shows the death screen", () => {
    const saves = watchSaves();
    render(<TilemapGrid tileTypes={{}} initialGameState={doomedState()} />);

    // The charm catches the fall rather than the run ending.
    expect(screen.getByTestId("rewind-death-beat")).toBeInTheDocument();
    expect(screen.queryByText(/GAME OVER/i)).toBeNull();

    const saved = saves.latest()!;
    expect(saved.heroHealth).toBeGreaterThan(0);
    expect(saved.deathCause).toBeUndefined();
    expect(saved.rewindCharges).toBe(0);
  });

  it("winds back REWIND_DEATH_DEPTH steps, not all the way", () => {
    const saves = watchSaves();
    const doomed = doomedState();
    expect(heroColumn(doomed)).toBe(7); // started at column 1, walked 6

    render(<TilemapGrid tileTypes={{}} initialGameState={doomed} />);
    // Five steps back from column 7.
    expect(heroColumn(saves.latest()!)).toBe(2);
  });

  it("keeps cumulative steps monotonic through the save", () => {
    const saves = watchSaves();
    const doomed = doomedState();
    render(<TilemapGrid tileTypes={{}} initialGameState={doomed} />);
    expect(saves.latest()!.stats.steps).toBe(doomed.stats.steps);
  });

  it("does not fire a second time once the charm is spent", () => {
    const spent: GameState = { ...doomedState(), rewindCharges: 0 };
    render(<TilemapGrid tileTypes={{}} initialGameState={spent} />);
    expect(screen.queryByTestId("rewind-death-beat")).toBeNull();
  });

  it("does not fire when there is no history to wind back into", () => {
    // Died on the first step of a floor with the charm still unused: nothing recorded,
    // so the ordinary death path must take over rather than the charm silently vanishing.
    const state = makeState({
      rewindCharges: 1,
      heroHealth: 0,
      deathCause: { type: "enemy", enemyKind: "fire-goblin" },
    });
    render(<TilemapGrid tileTypes={{}} initialGameState={state} />);
    expect(screen.queryByTestId("rewind-death-beat")).toBeNull();
  });
});
