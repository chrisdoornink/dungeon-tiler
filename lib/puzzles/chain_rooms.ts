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
    // Armed. Bare-handed (attack 1, no defence) two goblins turned this from a logic problem into a
    // survival one; with a sword a goblin dies in one or two hits and the puzzle stays the puzzle.
    sword: true,
    shield: true,
  },
  {
    name: "The Combination (Deep End variation · pattern lock)",
    asks:
      "VARIATION: the lock is a COMBINATION, not just agreement. Three colour switches, and the " +
      "ferry across the second band runs only on one exact pattern: top switch BLUE, island-left " +
      "GREEN, island-right VIOLET. They start all wrong (violet / blue / green). Corner dots on each " +
      "switch show its colour, so count your turns. Is a specific combination more interesting than " +
      "'make them agree', or just more bookkeeping?",
    map: [
      "###############",
      "#H..C.....r...#",
      "#.....1.......#",
      "#LLLLL1LLLLLLL#",
      "#LLLLL1LLLLLLL#",
      "#.....1.......#",
      "#..C....g..C..#",
      "#.......2.....#",
      "#LLLLLLL2LLLLL#",
      "#LLLLLLL2LLLLL#",
      "#.......2.....#",
      "#.k.........E.#",
      "###############",
    ],
    trackOver: "lava",
    // Switch A is on the near bank, B and C are stranded across band 1 — so you can set A before or
    // after crossing, but the other two force the first crossing either way. Ferry 1 always runs.
    colorLocks: [
      {
        switches: [
          [1, 4], // A — top bank
          [6, 3], // B — island, left
          [6, 11], // C — island, right
        ],
        colors: 4,
        initial: [2, 0, 1],
        rule: "match",
        target: [0, 1, 2], // blue, green, violet
        platforms: ["2"],
      },
    ],
    parked: ["2"],
    dryRail: [
      [2, 6],
      [5, 6],
      [7, 8],
      [10, 8],
    ],
    lengths: { "1": 2, "2": 2 },
    rocks: 1,
    sword: true,
    shield: true,
  },
  {
    name: "Crossed Purposes (Deep End variation · matched vs mismatched)",
    asks:
      "VARIATION, AND THE MEANEST ONE. The two colour switches do THREE things at once: while their " +
      "colours AGREE the ferry runs and the exit chamber is open but the key chamber is sealed — and " +
      "while they DISAGREE it is exactly the reverse. The key needs disagreement, the exit needs " +
      "agreement, so you cannot have both, and the second switch is on the far bank with you. Cross " +
      "while they agree, break the match to take the key, then put it back to leave. Four colours " +
      "means breaking a match is cheap and restoring one costs you three turns.",
    map: [
      "#############",
      "#H....C.....#",
      "#.....1.....#",
      "#LLLLL1LLLLL#",
      "#LLLLL1LLLLL#",
      "#.....1.....#",
      "#..g....C...#",
      "###v#####^###",
      "#.E.....#..k#",
      "#############",
    ],
    trackOver: "lava",
    // One lock driving all three: the ferry (runs while matched), the exit chamber (gates — open
    // while matched) and the key chamber (invertedGates — sealed while matched). Starting matched,
    // so the crossing is available immediately and the trap is on the far side.
    colorLocks: [
      {
        switches: [
          [1, 6], // near bank
          [6, 8], // far bank — the one you will actually be reconfiguring
        ],
        colors: 4,
        initial: [1, 1],
        rule: "allEqual",
        platforms: ["1"],
        gates: [[7, 3]], // exit chamber: open while matched
        invertedGates: [[7, 9]], // key chamber: sealed while matched
      },
    ],
    dryRail: [
      [2, 6],
      [5, 6],
    ],
    lengths: { "1": 2 },
    sword: true,
    shield: true,
  },
  {
    name: "The Long Haul (Deep End variation · three bands)",
    asks:
      "VARIATION: the gauntlet. THREE lava bands, three ferries, a colour lock and two toggles, each " +
      "unlocking the next leg — colour lock opens band 2, the island toggle starts the band-3 ferry, " +
      "and the toggle on the bottom bank swaps the key chamber for the exit chamber. No backtracking " +
      "this time, just a long chained descent with goblins on both islands. Does the length earn " +
      "itself, or does a chain this long stop being a puzzle and start being a commute?",
    map: [
      "###############",
      "#H.......C....#",
      "#.....1.......#",
      "#LLLLL1LLLLLLL#",
      "#LLLLL1LLLLLLL#",
      "#.....1.......#",
      "#..g..C.......#",
      "#.......2.....#",
      "#LLLLLLL2LLLLL#",
      "#LLLLLLL2LLLLL#",
      "#.......2.....#",
      "#..r.....g..T.#",
      "#...3.........#",
      "#LLL3LLLLLLLLL#",
      "#LLL3LLLLLLLLL#",
      "#...3.......T.#",
      "###^#######v###",
      "#.E.....#....k#",
      "###############",
    ],
    trackOver: "lava",
    colorLocks: [
      {
        switches: [
          [1, 9], // top bank
          [6, 6], // island 1 — stranded behind band 1
        ],
        colors: 4,
        initial: [0, 2],
        rule: "allEqual",
        platforms: ["2"],
      },
    ],
    toggles: [
      // Island 2: starts the last ferry. Nothing turns it off from below, so descending is safe.
      { switchAt: [11, 12], platforms: ["3"], on: false },
      // Bottom bank: the chamber swap. OFF = key chamber open, exit sealed; ON = the reverse. Both
      // chambers are down here with the switch, so this leg needs no climb back.
      {
        switchAt: [15, 12],
        gates: [[16, 3]],
        invertedGates: [[16, 11]],
        on: false,
      },
    ],
    parked: ["2", "3"],
    dryRail: [
      [2, 6],
      [5, 6],
      [7, 8],
      [10, 8],
      [12, 4],
      [15, 4],
    ],
    lengths: { "1": 2, "2": 2, "3": 2 },
    rocks: 1,
    sword: true,
    shield: true,
  },
];
