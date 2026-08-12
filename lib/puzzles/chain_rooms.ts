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
  {
    name: "The Relay (two switches · crossed wiring)",
    asks:
      "TWO SWITCHES, CROSSED. The near switch opens the KEY gate on the FAR bank; the far switch " +
      "opens the EXIT gate on the NEAR bank. Neither helps the side it sits on, so you flip the near " +
      "one, ride over, flip the far one and grab the key, then ride back to the (now-open) exit. Does " +
      "operating a switch on each side add real thinking, or is it just more walking?",
    // S1 T(1,4) opens far key-gate B2(7,10). S2 T(7,1) opens near exit-gate B1(1,10). Both beds start
    // UP. The ferry always runs (bidirectional), so nothing strands you mid-plan.
    map: [
      "#############",
      "#H..T.....^E#",
      "#..........##",
      "#.....1.....#",
      "#LLLLL1LLLLL#",
      "#LLLLL1LLLLL#",
      "#.....1....##",
      "#T........^k#",
      "#############",
    ],
    trackOver: "lava",
    toggles: [
      { switchAt: [1, 4], gates: [[7, 10]], on: false }, // near switch -> far key gate
      { switchAt: [7, 1], gates: [[1, 10]], on: false }, // far switch -> near exit gate
    ],
    dryRail: [
      [3, 6],
      [6, 6],
    ],
    lengths: { "1": 2 },
  },
  {
    name: "Colour Match (two colour switches · same colour runs the ferry)",
    asks:
      "COLOUR SWITCHES. Each C turns through four colours. The ferry runs ONLY while the two show the " +
      "SAME colour — mismatched, it is stuck. They start on different colours, so turn them to agree, " +
      "then ride across for the key and the exit. First room of the colour mechanic: does matching " +
      "colours read as a puzzle, or does it want more to it?",
    // Two colour switches C(1,3) and C(1,7). The lock runs ferry "1" while their colours are equal;
    // they start at 0 and 2, so the ferry begins stuck until you turn one to match the other.
    map: [
      "###########",
      "#H.C...C..#",
      "#.........#",
      "#....1....#",
      "#LLLL1LLLL#",
      "#LLLL1LLLL#",
      "#....1....#",
      "#..k.....E#",
      "###########",
    ],
    trackOver: "lava",
    colorLocks: [
      {
        switches: [
          [1, 3],
          [1, 7],
        ],
        colors: 4,
        initial: [0, 2],
        rule: "allEqual",
        platforms: ["1"],
      },
    ],
    dryRail: [
      [3, 5],
      [6, 5],
    ],
    lengths: { "1": 2 },
  },
];
