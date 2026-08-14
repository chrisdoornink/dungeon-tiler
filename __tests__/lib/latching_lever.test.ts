import {
  parsePuzzleRoom,
  puzzleRoomToGameState,
  type PuzzleRoomSpec,
} from "../../lib/puzzles/rooms";
import { throwToggle } from "../../lib/map/machinery";
import { solvePuzzleRoom } from "../../lib/puzzles/solver";

/**
 * The one-shot (latching) lever — the irreversibility primitive. A normal toggle re-arms on every
 * throw, so nothing you do with it needs foresight; a latching lever, once thrown ON, can never be
 * thrown back, so a wrong pull is permanent. Tested at the throwToggle level (unambiguous): the
 * `latching` flag round-trips through the parser, and a second throw of a committed lever is a no-op.
 * This is the engine piece a future readable irreversible template will build on.
 */
function withLever(latching: boolean): ReturnType<typeof puzzleRoomToGameState> {
  const spec: PuzzleRoomSpec = {
    name: latching ? "one-shot" : "re-armable",
    asks: "",
    trackOver: "lava",
    map: ["######", "#HT^.#", "######"],
    toggles: [{ switchAt: [1, 2], gates: [[1, 3]], on: false, latching }],
  };
  return puzzleRoomToGameState(parsePuzzleRoom(spec));
}
const noOccupied = new Set<string>();
const isOn = (s: ReturnType<typeof puzzleRoomToGameState>) =>
  (s.toggleGroups ?? []).find((g) => g.switchAt[0] === 1 && g.switchAt[1] === 2)?.on ?? false;

describe("latching lever", () => {
  it("a re-armable toggle flips both ways", () => {
    const s = withLever(false);
    expect(isOn(s)).toBe(false);
    throwToggle(s, 1, 2, noOccupied);
    expect(isOn(s)).toBe(true);
    throwToggle(s, 1, 2, noOccupied); // second throw flips it back
    expect(isOn(s)).toBe(false);
  });

  it("a latching lever throws once and stays committed", () => {
    const s = withLever(true);
    expect(isOn(s)).toBe(false);
    throwToggle(s, 1, 2, noOccupied);
    expect(isOn(s)).toBe(true);
    throwToggle(s, 1, 2, noOccupied); // second throw is a no-op — the commitment holds
    expect(isOn(s)).toBe(true);
    throwToggle(s, 1, 2, noOccupied);
    expect(isOn(s)).toBe(true);
  });

  it("the solver models a latching gate room (it still solves)", () => {
    const spec: PuzzleRoomSpec = {
      name: "one-shot solve",
      asks: "",
      trackOver: "lava",
      map: ["#######", "#HT^kE#", "#######"],
      toggles: [{ switchAt: [1, 2], gates: [[1, 3]], on: false, latching: true }],
      sword: true,
      shield: true,
    };
    const solved = solvePuzzleRoom(parsePuzzleRoom(spec), { maxStates: 40_000, maxTurns: 80 });
    expect(solved.solvable).toBe(true);
  });
});
