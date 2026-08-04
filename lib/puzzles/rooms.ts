// Hand-authored puzzle rooms, for finding out whether toggle switches and moving platforms are
// worth building a floor archetype around.
//
// AUTHORED, NOT GENERATED, AND THAT IS THE POINT AT THIS STAGE. Generating a puzzle is a
// fundamentally different problem from generating the shortcut gates in switch-gates.ts: that
// planner works by REJECTING placements that break connectivity, a "never make it worse" filter,
// which can only ever produce optional detours. A puzzle needs the opposite — the solution has to
// be REQUIRED, and the generator has to prove one exists. The standard way to get that is to build
// backwards from a known solution rather than to place obstacles and test afterwards. None of that
// is worth writing until the pieces themselves feel good, which is what these rooms are for.
//
// Each room isolates one question. Read the `asks` field before playing it.
import { FLOOR, TileSubtype, WALL } from "../map/constants";
import type { MapData, Platform, ToggleGroup } from "../map/types";
import { stampPlatform } from "../map/machinery";

/**
 * Map legend — one character per tile, rectangular, fully walled.
 *
 *   `#` wall              `.` floor             `H` hero start        `E` exit
 *   `~` deep water        `L` lava              `^` spike bed (up)    `v` spike bed (retracted)
 *   `T` toggle switch     `r` a rock to pick up `k` exit key          `p` pot
 *   `1`-`9` platform track tiles; the DIGIT is the platform id, and the slab starts on the first
 *           tile of its own track reading left-to-right then top-to-bottom.
 *
 * A track tile also carries the room's `trackOver` hazard. That is not a convenience — the first
 * version of this parser wrote track tiles as plain floor, which quietly made every crossing
 * pointless: the track column was dry, so the hero could simply walk over the "lava" the platform
 * was supposed to ferry them across. A rail always sits ON the hazard.
 *
 * A room's `toggles` wire switches to beds and platforms by coordinate. Coordinates are [y,x] and
 * y counts down from the top, which is easy to get wrong — `describeRoom` prints the parsed result
 * so an authoring mistake shows up as a readable diff rather than as a room that quietly cannot be
 * solved.
 */
export interface PuzzleRoomSpec {
  name: string;
  /** The single question this room is meant to answer. */
  asks: string;
  map: readonly string[];
  /**
   * What every track tile in this room sits on. Lava and deep water are NOT equivalent: lava makes
   * the slab the only way across, while deep water is swimmable, so there the slab is a way to
   * cross without the torch going out. Both are worth testing and they ask different questions.
   */
  trackOver: "lava" | "water";
  /**
   * Switch wiring. `gates` retract while the switch is on, `invertedGates` raise while it is on,
   * and `platforms` are the ids it parks. Coordinates must land on beds that exist in the map.
   */
  toggles?: Array<{
    switchAt: [number, number];
    gates?: Array<[number, number]>;
    invertedGates?: Array<[number, number]>;
    platforms?: string[];
    /** Starting state. Default false (off). */
    on?: boolean;
  }>;
  /** Platform ids that start PARKED. Everything else runs from turn one. */
  parked?: string[];
  /**
   * Deck length per platform id, in track tiles. Default 1.
   *
   * A deck must be SHORTER than its track or it fills the rail and cannot move, so a room with a
   * 3-tile rail can carry a deck of at most 2. parsePuzzleRoom rejects the mistake rather than
   * shipping a raft that sits still.
   */
  lengths?: Record<string, number>;
  /**
   * Track tiles that stay DRY — a rail that runs up onto the bank instead of stopping at the water's
   * edge. Given as [y,x]; each must be a track tile.
   *
   * This is what makes a multi-tile deck usable at all. A deck reverses the moment it reaches the
   * end of its rail, which is the same turn its far edge arrives — so with the rail ending at the
   * water's edge the rider is dragged back before they ever get a turn to step off. Docking the rail
   * on land gives the deck a resting position flush with dry ground at each end, so boarding and
   * disembarking need no timing whatsoever.
   */
  dryRail?: Array<[number, number]>;
  /** Rocks the hero walks in with. Puzzle rooms hand these out rather than scattering them. */
  rocks?: number;
}

export const PUZZLE_ROOMS: PuzzleRoomSpec[] = [
  {
    name: "The Ferry",
    asks:
      "Does riding a slab across lava feel like a crossing, or like standing still? This is the " +
      "bare mechanic with nothing else in the room. If it is dull here, no puzzle built on it " +
      "will rescue it. Board from the bank when the slab is next to you, then wait.",
    // The rail spans the WHOLE lava band, which is the geometry that makes it a crossing. An
    // earlier version put a single-row rail through a three-row band, so the slab could not
    // actually get you to the other side.
    map: [
      "###########",
      "#H.......k#",
      "#....1....#",
      "#LLLL1LLLL#",
      "#LLLL1LLLL#",
      "#LLLL1LLLL#",
      "#....1....#",
      "#........E#",
      "###########",
    ],
    trackOver: "lava",
    // The rail runs up onto both banks. Without that the deck reverses on the very turn its far
    // edge arrives and yanks the rider back before they get a turn to step off — see `dryRail`.
    dryRail: [
      [2, 5],
      [6, 5],
    ],
    // Two tiles of deck on a three-tile rail. Boarding lands you on an edge with deck still ahead,
    // which is the whole point: a one-tile slab looks like a stepping stone and teaches players to
    // keep walking, which over lava kills them.
    lengths: { "1": 2 },
  },
  {
    name: "The Trade",
    asks:
      "Is a toggle that closes one route as it opens another an interesting decision, or just an " +
      "extra walk? The key and the exit sit behind beds of opposite polarity, so the switch has " +
      "to be thrown twice and the ORDER is the whole puzzle.",
    map: [
      "#############",
      "#H..T.......#",
      "#...........#",
      "##^#######v##",
      "#.k.#####.E.#",
      "#############",
    ],
    trackOver: "lava",
    toggles: [
      {
        switchAt: [1, 4],
        // Left bed retracts when the switch goes on; right bed rises at the same moment. Throw it
        // to fetch the key, walk back, throw it again to open the exit.
        gates: [[3, 2]],
        invertedGates: [[3, 10]],
      },
    ],
  },
  {
    name: "The Raft (teaching)",
    asks:
      "THE TEACHING ROOM. Widest deck, gentlest hazard: a 3-tile raft over water, where a mistimed " +
      "step costs a torch rather than the run. Watch whether the deck ahead of you makes waiting " +
      "feel obvious without being told. You can still swim it — the raft is the way to arrive dry.",
    // A five-tile rail so a three-tile deck has somewhere to go. The far two rails sit on the banks
    // rather than the water, which is deliberate: the raft docks flush with dry land at each end, so
    // boarding never needs timing at all in the room that is meant to teach the idea.
    map: [
      "##############",
      "#H..........k#",
      "#....4.......#",
      "#~~~~4~~~~~~~#",
      "#~~~~4~~~~~~~#",
      "#~~~~4~~~~~~~#",
      "#....4.......#",
      "#...........E#",
      "##############",
    ],
    trackOver: "water",
    lengths: { "4": 3 },
    dryRail: [
      [2, 5],
      [6, 5],
    ],
  },
  {
    name: "The Parked Raft",
    asks:
      "Is parking a platform with a switch a real 'aha' or just fiddly? The switch is across the " +
      "water from the start, so the only way to throw it is with a rock — and the raft only " +
      "reaches the far bank's gap while it is stopped there. Watch whether you reach for the rock " +
      "on your own.",
    map: [
      "##############",
      "#H...........#",
      "#............#",
      "#~~2222222~~~#",
      "#####.####T###",
      "#....k......E#",
      "##############",
    ],
    trackOver: "water",
    toggles: [{ switchAt: [4, 10], platforms: ["2"], on: true }],
    // A long deck running ALONG the channel rather than across it. Chris's note stands: parking is
    // still weakly motivated here because the switch sits past the obstacle, so this room is about
    // whether a long deck reads as one object in motion, not about whether parking is fun yet.
    lengths: { "2": 3 },
    rocks: 3,
  },
];

export interface ParsedPuzzleRoom {
  spec: PuzzleRoomSpec;
  mapData: MapData;
  hero: [number, number];
  toggleGroups: ToggleGroup[];
  platforms: Platform[];
  rocks: number;
}

/**
 * Turn a spec into a playable map.
 *
 * Throws on an inconsistent room rather than returning something subtly broken — a switch wired to
 * a coordinate with no bed on it, or a platform track with fewer than two tiles, is an authoring
 * mistake that would otherwise present as an unsolvable room with no error anywhere.
 */
export function parsePuzzleRoom(spec: PuzzleRoomSpec): ParsedPuzzleRoom {
  const h = spec.map.length;
  const w = spec.map[0].length;
  for (const row of spec.map) {
    if (row.length !== w) {
      throw new Error(`${spec.name}: rows must all be ${w} wide, got ${row.length}`);
    }
  }

  const tiles: number[][] = Array.from({ length: h }, () => Array(w).fill(FLOOR));
  const subtypes: number[][][] = Array.from({ length: h }, () =>
    Array.from({ length: w }, () => [] as number[])
  );
  let hero: [number, number] | null = null;
  const tracks = new Map<string, Array<[number, number]>>();

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = spec.map[y][x];
      const put = (...subs: TileSubtype[]) => subtypes[y][x].push(...subs);
      switch (ch) {
        case "#":
          tiles[y][x] = WALL;
          break;
        case ".":
          break;
        case "H":
          hero = [y, x];
          put(TileSubtype.PLAYER);
          break;
        case "E":
          put(TileSubtype.EXIT);
          break;
        case "k":
          put(TileSubtype.EXITKEY);
          break;
        case "~":
          put(TileSubtype.DEEP_WATER);
          break;
        case "L":
          put(TileSubtype.LAVA);
          break;
        case "^":
          put(TileSubtype.SPIKES);
          break;
        case "v":
          put(TileSubtype.SPIKE_HOLES);
          break;
        case "T":
          put(TileSubtype.TOGGLE_SWITCH);
          break;
        case "r":
          put(TileSubtype.ROCK);
          break;
        case "p":
          put(TileSubtype.POT);
          break;
        default:
          if (/[1-9]/.test(ch)) {
            // A track tile. It carries the hazard (see `trackOver`) unless the room docked it on
            // land via `dryRail`.
            const dry = (spec.dryRail ?? []).some(([dy, dx]) => dy === y && dx === x);
            if (!dry) {
              put(
                spec.trackOver === "lava" ? TileSubtype.LAVA : TileSubtype.DEEP_WATER
              );
            }
            const list = tracks.get(ch) ?? [];
            list.push([y, x]);
            tracks.set(ch, list);
          } else {
            throw new Error(`${spec.name}: unknown map character ${JSON.stringify(ch)}`);
          }
      }
    }
  }

  if (!hero) throw new Error(`${spec.name}: no H (hero start) in the map`);

  const parked = new Set(spec.parked ?? []);
  const platforms: Platform[] = [];
  for (const [id, track] of tracks) {
    if (track.length < 2) {
      throw new Error(`${spec.name}: platform ${id} needs at least 2 track tiles`);
    }
    const length = spec.lengths?.[id] ?? 1;
    if (length >= track.length) {
      throw new Error(
        `${spec.name}: platform ${id} has a deck of ${length} on a ${track.length}-tile rail — ` +
          `it would fill the rail and never move`
      );
    }
    platforms.push({ id, track, index: 0, dir: 1, running: !parked.has(id), length });
  }

  const toggleGroups: ToggleGroup[] = (spec.toggles ?? []).map((t) => {
    const [sy, sx] = t.switchAt;
    if (!subtypes[sy]?.[sx]?.includes(TileSubtype.TOGGLE_SWITCH)) {
      throw new Error(`${spec.name}: no toggle switch at ${sy},${sx}`);
    }
    const beds = [...(t.gates ?? []), ...(t.invertedGates ?? [])];
    for (const [gy, gx] of beds) {
      const cell = subtypes[gy]?.[gx] ?? [];
      if (
        !cell.includes(TileSubtype.SPIKES) &&
        !cell.includes(TileSubtype.SPIKE_HOLES)
      ) {
        throw new Error(`${spec.name}: no spike bed at ${gy},${gx} to wire to the switch`);
      }
    }
    for (const id of t.platforms ?? []) {
      if (!tracks.has(id)) {
        throw new Error(`${spec.name}: switch wired to unknown platform ${id}`);
      }
    }
    return {
      switchAt: t.switchAt,
      gates: t.gates ?? [],
      invertedGates: t.invertedGates ?? [],
      platforms: t.platforms ?? [],
      on: t.on ?? false,
    };
  });

  // A switch authored as already ON has to have its beds and platforms in the matching state, or
  // the room starts inconsistent with its own wiring — the switch would read "on" while its beds
  // are still up.
  for (const g of toggleGroups) {
    if (!g.on) continue;
    for (const [gy, gx] of g.gates) {
      const cell = subtypes[gy][gx];
      const i = cell.indexOf(TileSubtype.SPIKES);
      if (i >= 0) cell[i] = TileSubtype.SPIKE_HOLES;
    }
    for (const [gy, gx] of g.invertedGates) {
      const cell = subtypes[gy][gx];
      const i = cell.indexOf(TileSubtype.SPIKE_HOLES);
      if (i >= 0) cell[i] = TileSubtype.SPIKES;
    }
    for (const p of platforms) {
      if (g.platforms.includes(p.id)) p.running = true;
    }
  }

  const mapData: MapData = { tiles, subtypes };
  for (const p of platforms) stampPlatform(mapData, p);

  return {
    spec,
    mapData,
    hero,
    toggleGroups,
    platforms,
    rocks: spec.rocks ?? 0,
  };
}

/** One-line summary per room, for the harness header and for eyeballing a parse. */
export function describeRoom(room: ParsedPuzzleRoom): string {
  const bits = [
    `${room.platforms.length} platform${room.platforms.length === 1 ? "" : "s"}`,
    `${room.toggleGroups.length} switch${room.toggleGroups.length === 1 ? "" : "es"}`,
  ];
  if (room.rocks > 0) bits.push(`${room.rocks} rocks`);
  return bits.join(" · ");
}
