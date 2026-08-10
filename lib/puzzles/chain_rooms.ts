// Hand-authored MULTI-ELEMENT rooms — the calibration set for chaining elements into real puzzles.
//
// These exist for the feedback loop: they combine several mechanics so their INTERACTION creates
// logic (ordering, gating, mutual exclusion) rather than three unrelated things in one room. A human
// plays them and rates the real difficulty; the solver only sanity-checks that a path exists. As
// patterns prove fun, they graduate into the generator's idiom library.
import type { PuzzleRoomSpec } from "./rooms";

export const CHAIN_ROOMS: PuzzleRoomSpec[] = [
  {
    name: "The Interlock (switch · ferry · gate)",
    asks:
      "THREE ELEMENTS, ONE ORDER. The ferry is the only way over the lava, but it is parked until " +
      "the switch is ON — and turning it ON also seals the exit (the bed rises). The key is across " +
      "the lava. So you can never be crossing AND have the exit open at once: run the ferry, cross " +
      "for the key, ride back, then switch OFF to drop the bed and leave. Does the order click, or " +
      "is it fiddly?",
    // switch T(1,4) runs the ferry '1' and, in opposite polarity, raises bed B(1,8) that seals exit
    // E(1,9). Ferry starts parked (switch off); bed starts DOWN (exit reachable, but the key is not).
    map: [
      "###########",
      "#H..T...vE#",
      "#........##",
      "#....1....#",
      "#LLLL1LLLL#",
      "#LLLL1LLLL#",
      "#....1....#",
      "#..k......#",
      "###########",
    ],
    trackOver: "lava",
    toggles: [
      {
        switchAt: [1, 4],
        platforms: ["1"],
        // Inverted: the bed RISES when the switch turns the ferry on, so the crossing and the open
        // exit are mutually exclusive.
        invertedGates: [[1, 8]],
        on: false,
      },
    ],
    parked: ["1"], // matches switch-off: the ferry sits still until you start it
    dryRail: [
      [3, 5],
      [6, 5],
    ],
    lengths: { "1": 2 },
  },
];
