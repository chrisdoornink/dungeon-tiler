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
  {
    name: "The Deep End (everything at once)",
    asks:
      "THE BIG ONE — two colour switches, a binary toggle, two ferries, spike-gated chambers and " +
      "goblins, wired so each piece gates the next. Two lava bands to cross, and the exit is in a " +
      "sealed chamber under the far bank. Things to work out: the second colour switch is STRANDED " +
      "on the middle island (so the first crossing gates the second one), and the toggle that opens " +
      "the exit chamber SEALS the key chamber — and it lives back up on the island, so the key and " +
      "the exit cannot be collected on the same trip. Watch the goblins: they can ride the ferries " +
      "too. Is it a satisfying tangle, or just a lot of walking?",
    //  row 1     top bank: hero, one rock, colour switch A
    //  rows 3-4  lava band 1, ferry "1" (ALWAYS running — the one crossing you start with)
    //  rows 5-7  middle island: colour switch B (stranded), the toggle, two fire-goblins
    //  rows 8-9  lava band 2, ferry "2" (parked until the two colours agree)
    //  row 10    far bank
    //  row 11    gate row — solid except two spike beds of OPPOSITE polarity
    //  row 12    two sealed chambers: exit (west, behind the bed that opens when the toggle is ON),
    //            key (east, behind the bed that is open while the toggle is OFF)
    map: [
      "###############",
      "#H..r...C.....#",
      "#.....1.......#",
      "#LLLLL1LLLLLLL#",
      "#LLLLL1LLLLLLL#",
      "#.....1.......#",
      "#..g..C...g.T.#",
      "#.......2.....#",
      "#LLLLLLL2LLLLL#",
      "#LLLLLLL2LLLLL#",
      "#.......2.....#",
      "#####^#####v###",
      "#.E.....#....k#",
      "###############",
    ],
    trackOver: "lava",
    // Ferry 2 runs only while BOTH colour switches show the same colour. They start mismatched
    // (blue vs violet) and switch B is across band 1, so the first crossing gates the second — or
    // you notice you can turn switch A to violet BEFORE you cross, and save the trip back.
    colorLocks: [
      {
        switches: [
          [1, 8],
          [6, 6],
        ],
        colors: 4,
        initial: [0, 2],
        rule: "allEqual",
        platforms: ["2"],
      },
    ],
    // The toggle sits on the middle island, two lava bands away from the chambers it controls.
    // OFF (start): key chamber open, exit chamber sealed. ON: the reverse. So the run is
    // cross-cross-key, then all the way BACK up to the island to flip it, then down again to leave.
    toggles: [
      {
        switchAt: [6, 12],
        gates: [[11, 5]], // exit chamber — raised while OFF, opens when the toggle goes ON
        invertedGates: [[11, 11]], // key chamber — open while OFF, seals when the toggle goes ON
        on: false,
      },
    ],
    parked: ["2"],
    // Both rails dock on dry ground at each end, so boarding and stepping off need no timing; the
    // two lava rows in between are what make it a ride rather than a step.
    dryRail: [
      [2, 6],
      [5, 6],
      [7, 8],
      [10, 8],
    ],
    lengths: { "1": 2, "2": 2 },
    // One rock only. Enough for a ranged option against a goblin or a remote switch turn, but a
    // deliberate single: two would let you melt a two-tile obsidian bridge across a band and skip
    // the colour lock entirely.
    rocks: 1,
  },
];
