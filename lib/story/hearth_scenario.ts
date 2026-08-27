/**
 * Hearth & Home — the intro scenario (Chris's script):
 *
 *   Whoever comes home, we discover chests in our rooms. Then Opal leads us
 *   to keys hidden in a bookshelf. We find swords, and while we're wondering
 *   why, goblins bust into our house — and the adventure begins.
 *
 * Runs once per world tick (from updateNPCBehaviors) and no-ops outside party
 * scenes. Progress lives in GameState.scenarioFlags:
 *   hearthKeysFound   — the bookshelf gave up the chest keys
 *   hearthBreached    — the goblins burst through the front door
 *   hearthDefended    — every goblin is down; the house is safe
 *
 * Type-only game-state import: game-state itself calls into this module, so
 * a runtime import back at it would be a cycle.
 */

import { Direction, FLOOR, TileSubtype } from "../map/constants";
import { Enemy } from "../enemy";
import { getFamilyMember, type FamilyMemberId } from "./rooms/home";
import type { GameState } from "../map/game-state";

/** Where Opal waits: beside the living-room bookshelf. */
const OPAL_LEAD_TARGET = { y: 14, x: 1 };

/**
 * The two doors goblins pour through — the front door (bottom wall) and the
 * back door (top wall). Each has an inner floor tile they step onto. Goblins
 * arrive ONE AT A TIME, alternating doors.
 */
const DOORS: Array<{ door: [number, number]; inner: [number, number] }> = [
  { door: [16, 4], inner: [15, 4] }, // front
  { door: [0, 5], inner: [1, 5] }, // back
];

/** Total goblins in the break-in, and how many turns between each arrival. */
const BREACH_TOTAL = 6;
const BREACH_CADENCE = 1; // one new goblin per player move

/** If a rally somehow can't complete, force it after this many ticks so the
 * scenario can never stall (the monsters must always come). */
const RALLY_STALL_CAP = 60;

/** Likewise for arming: if a chest is never opened (e.g. a kid hero never opens
 * their own room chest, or an NPC can't reach one), force the rest open after
 * this many post-keys ticks so the intro can never dead-end. Generous — normal
 * play finishes arming in ~20 moves, so this only rescues a genuinely stuck or
 * idle player. */
const ARMING_STALL_CAP = 120;

/** Queue one scripted dialogue line to auto-open after the move resolves. */
function pushDialogue(
  state: GameState,
  npcId: string,
  npcName: string,
  dialogueId: string,
  timestamp: number
): void {
  state.npcInteractionQueue = [
    ...(state.npcInteractionQueue ?? []),
    {
      npcId,
      npcName,
      type: "dialogue",
      hookId: dialogueId,
      availableHooks: [
        { id: dialogueId, type: "dialogue", payload: { dialogueId } },
      ],
      trigger: "script",
      timestamp,
    },
  ];
}

/**
 * Called from movePlayer the instant the hero bumps a bookshelf in a party
 * scene. Returns true when the scenario owns the interaction (always, at
 * home — there is no library to read here), so the caller skips the library
 * reader. The first bump reveals the chest keys with an on-screen line.
 */
export function handleHearthBookshelf(state: GameState): boolean {
  if (!state.party) return false;
  const flags = (state.scenarioFlags ??= {});
  if (!flags.hearthKeysFound) {
    flags.hearthKeysFound = true;
    state.hasKey = true;
    pushDialogue(
      state,
      "npc-bookshelf",
      "",
      "home-bookshelf-keys",
      700000 + (state.stats.steps ?? 0)
    );
  }
  return true;
}

export function runHearthScenario(
  state: GameState,
  playerPos: [number, number]
): void {
  if (!state.party) return;
  const flags = (state.scenarioFlags ??= {});

  // Beat 2 (the bookshelf keys) is handled at the moment of the bump in
  // handleHearthBookshelf — deterministic and with an on-screen line — rather
  // than here on a later tick, which used to race the library reader.

  // Opal leads the way to the bookshelf until the keys are found, then falls
  // back in line with everyone else.
  const opal = (state.npcs ?? []).find(
    (npc) => npc.metadata?.partyId === "opal"
  );
  if (opal) {
    if (!flags.hearthKeysFound) {
      if (opal.metadata?.behavior !== "goto") {
        opal.metadata = {
          ...opal.metadata,
          behavior: "goto",
          gotoTarget: OPAL_LEAD_TARGET,
        };
      }
    } else {
      // Keys found: stop LEADING to the bookshelf — but only if she's still
      // headed there. A rally later gives her a different goto target, and
      // this must not clobber it every tick (that stranded her out of the
      // rally so it never completed naturally).
      const t = opal.metadata?.gotoTarget as
        | { y: number; x: number }
        | undefined;
      const stillLeading =
        opal.metadata?.behavior === "goto" &&
        t?.y === OPAL_LEAD_TARGET.y &&
        t?.x === OPAL_LEAD_TARGET.x;
      if (stillLeading) {
        opal.metadata = { ...opal.metadata, behavior: "idle" };
      }
    }
  }

  // Beat 3: once the keys are found, the family scatters to arm — each NPC
  // member walks to their own chest and opens it (the hero opens theirs by
  // hand). Opal has no chest, and Annie has none by design.
  if (flags.hearthKeysFound) {
    armFamily(state);
  }

  // Beat 4: the family regroups at a rally point — the fairest spot to meet in
  // the middle of wherever they all are — then has a moment: "...what do we do
  // with these?", the empty-handed one (Annie) saying so. Completing the rally
  // needs the NPC family gathered; the hero is NOT required to stand on it (a
  // wandering player must not stall the scene), and a tick cap forces it if
  // pathing ever fails, so the monsters always come.
  if (flags.hearthKeysFound && !flags.hearthWondered) {
    const counters = (state.scenarioCounters ??= {});
    counters.armTicks = (counters.armTicks ?? 0) + 1;
    if (!armingFinished(state)) {
      // Still arming — unless we've waited too long, in which case force the
      // rest open so the intro can never dead-end (see ARMING_STALL_CAP).
      if (counters.armTicks < ARMING_STALL_CAP) return;
      forceOpenChests(state);
    }
    if (!state.rallyPoint) startFamilyRally(state, playerPos);
    counters.rallyTicks = (counters.rallyTicks ?? 0) + 1;
    if (
      isFamilyRallied(state) ||
      counters.rallyTicks >= RALLY_STALL_CAP ||
      !state.rallyPoint
    ) {
      pushDialogue(
        state,
        "npc-family",
        "",
        "home-arsenal",
        600000 + (state.stats.steps ?? 0)
      );
      flags.hearthWondered = true;
      clearFamilyRally(state);
    }
    return;
  }

  // Beat 5: the reunion is cut short — goblins pour in ONE AT A TIME from both
  // doors, a fresh one every BREACH_CADENCE moves until BREACH_TOTAL have come.
  if (flags.hearthWondered && !flags.hearthBreached) {
    flags.hearthBreached = true;
    const counters = (state.scenarioCounters ??= {});
    counters.goblinsSpawned = 0;
    counters.lastSpawnStep = state.stats.steps ?? 0;
    openDoors(state);
    spawnNextGoblin(state, playerPos); // first one arrives immediately
    raiseAlarm(state, playerPos);
    return;
  }

  // Beat 5 (cont.): keep dripping goblins in until the wave is spent.
  if (flags.hearthBreached && !flags.hearthDefended) {
    const counters = (state.scenarioCounters ??= {});
    const spawned = counters.goblinsSpawned ?? 0;
    const step = state.stats.steps ?? 0;
    if (
      spawned < BREACH_TOTAL &&
      step - (counters.lastSpawnStep ?? 0) >= BREACH_CADENCE
    ) {
      spawnNextGoblin(state, playerPos);
    }
    // Beat 6: defended only once the whole wave has come AND been cleared.
    if (spawned >= BREACH_TOTAL && (state.enemies?.length ?? 0) === 0) {
      flags.hearthDefended = true;
    }
  }
}

/** The three sword chests on the map (kids' rooms + the master bedroom). */
const CHEST_TILES: Array<[number, number]> = [
  [15, 9], // Emerson's room
  [11, 9], // Claire's room
  [6, 10], // master bedroom (shared by the adults)
];

/**
 * Which chest, if any, an NPC family member should walk to and open. Kids own
 * their room chests. The master bedroom [6,10] is claimed by the non-hero
 * adult, preferring Chris — so it's always claimed by an NPC (never stranded
 * on the hero), and whichever adult doesn't claim it ends up empty-handed.
 */
function chestForMember(
  state: GameState,
  id: FamilyMemberId
): [number, number] | null {
  if (id === "emerson") return [15, 9];
  if (id === "claire") return [11, 9];
  const masterOwner: FamilyMemberId =
    state.activeHeroId === "chris" ? "annie" : "chris";
  if (id === masterOwner) return [6, 10];
  return null; // the other adult, and Opal
}

/** True once all three sword chests have been opened (by hero or NPCs) —
 * hero-agnostic, so it can't stall on who happens to own the master chest. */
function armingFinished(state: GameState): boolean {
  return CHEST_TILES.every(
    ([y, x]) => !(state.mapData.subtypes[y]?.[x]?.includes(TileSubtype.CHEST))
  );
}

/** Anti-softlock: pop open any still-closed chest and arm its NPC owner.
 * Called only when arming has stalled past ARMING_STALL_CAP — SWORD is kept on
 * the tile so a late hero can still pick theirs up. */
function forceOpenChests(state: GameState): void {
  const humans: FamilyMemberId[] = ["chris", "annie", "emerson", "claire"];
  for (const [y, x] of CHEST_TILES) {
    const subs = state.mapData.subtypes[y]?.[x] ?? [];
    if (!subs.includes(TileSubtype.CHEST)) continue;
    state.mapData.subtypes[y][x] = [
      ...subs.filter((t) => t !== TileSubtype.CHEST && t !== TileSubtype.LOCK),
      TileSubtype.OPEN_CHEST,
    ];
    const ownerId = humans.find((id) => {
      const c = chestForMember(state, id);
      return c && c[0] === y && c[1] === x;
    });
    if (!ownerId) continue;
    const entry = state.party?.find((p) => p.id === ownerId);
    if (entry) entry.hasSword = true;
    const npc = (state.npcs ?? []).find(
      (n) => n.metadata?.partyId === ownerId
    );
    if (npc) npc.metadata = { ...npc.metadata, armed: true, behavior: "idle" };
  }
}

// ---------------------------------------------------------------------------
// The rally system: "everyone, gather round." Reusable for any scenario beat.

/** How close everyone must be to the rally point to count as gathered. */
const RALLY_RADIUS = 2;

/** Walkable for rally purposes: floor with no furniture/fixtures on it. */
function rallyPassable(state: GameState, y: number, x: number): boolean {
  if (state.mapData.tiles[y]?.[x] !== FLOOR) return false;
  const subs = state.mapData.subtypes[y]?.[x] ?? [];
  return !subs.some(
    (t) =>
      t === TileSubtype.WALL_TORCH ||
      t === TileSubtype.TOWN_SIGN ||
      t === TileSubtype.CHECKPOINT ||
      t === TileSubtype.BOOKSHELF ||
      t === TileSubtype.CHEST ||
      t === TileSubtype.OPEN_CHEST
  );
}

/**
 * The fairest meeting tile: minimize everyone's TOTAL walking distance (the
 * graph 1-median over BFS distances — "the easiest room to meet in the
 * middle"), ties broken by the shortest worst-case walk. Returns null when no
 * tile is reachable by everybody.
 */
export function computeRallyPoint(
  state: GameState,
  playerPos: [number, number]
): [number, number] | null {
  const grid = state.mapData.tiles;
  const H = grid.length;
  const W = grid[0]?.length ?? 0;
  const sources: Array<[number, number]> = [
    playerPos,
    ...(state.npcs ?? [])
      .filter((n) => n.metadata?.partyId)
      .map((n) => [n.y, n.x] as [number, number]),
  ];
  if (sources.length === 0) return null;

  const total = new Float64Array(H * W);
  const maxDist = new Float64Array(H * W);
  const reached = new Uint8Array(H * W);

  for (const [sy, sx] of sources) {
    const dist = new Int32Array(H * W).fill(-1);
    const queue: number[] = [sy * W + sx];
    dist[sy * W + sx] = 0;
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      const py = (p / W) | 0;
      const pxx = p % W;
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = py + dy;
        const nx = pxx + dx;
        if (ny < 0 || nx < 0 || ny >= H || nx >= W) continue;
        const n = ny * W + nx;
        if (dist[n] !== -1 || !rallyPassable(state, ny, nx)) continue;
        dist[n] = dist[p] + 1;
        queue.push(n);
      }
    }
    for (let p = 0; p < H * W; p++) {
      if (dist[p] === -1) continue;
      total[p] += dist[p];
      if (dist[p] > maxDist[p]) maxDist[p] = dist[p];
      reached[p]++;
    }
  }

  let best: [number, number] | null = null;
  let bestTotal = Infinity;
  let bestMax = Infinity;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (reached[p] !== sources.length) continue;
      if (!rallyPassable(state, y, x)) continue;
      if (
        total[p] < bestTotal ||
        (total[p] === bestTotal && maxDist[p] < bestMax)
      ) {
        bestTotal = total[p];
        bestMax = maxDist[p];
        best = [y, x];
      }
    }
  }
  return best;
}

/** Send every family NPC walking to a freshly computed rally point. */
export function startFamilyRally(
  state: GameState,
  playerPos: [number, number]
): void {
  const point = computeRallyPoint(state, playerPos);
  if (!point) return;
  state.rallyPoint = point;
  for (const npc of state.npcs ?? []) {
    if (!npc.metadata?.partyId) continue;
    npc.metadata = {
      ...npc.metadata,
      behavior: "goto",
      gotoTarget: { y: point[0], x: point[1] },
    };
  }
}

/** True once every living family NPC has reached the rally. The hero is NOT
 * required to stand on it — a player wandering off must never stall the beat. */
export function isFamilyRallied(state: GameState): boolean {
  const point = state.rallyPoint;
  if (!point) return false;
  const [ry, rx] = point;
  // The dog isn't required to gather — she shouldn't be able to hold up the
  // beat, and she may be off doing dog things.
  const family = (state.npcs ?? []).filter(
    (n) => n.metadata?.partyId && !n.tags?.includes("dog")
  );
  if (family.length === 0) return true;
  return family.every(
    (n) => Math.abs(n.y - ry) + Math.abs(n.x - rx) <= RALLY_RADIUS
  );
}

/** End the rally: the family goes back to holding their own space. */
export function clearFamilyRally(state: GameState): void {
  state.rallyPoint = null;
  for (const npc of state.npcs ?? []) {
    if (!npc.metadata?.partyId) continue;
    if (npc.metadata.behavior !== "goto") continue;
    npc.metadata = { ...npc.metadata, behavior: "idle" };
  }
}

/**
 * Drive each NPC family member to arm themselves: walk to their own chest
 * (goto), and once adjacent, open it — strip the CHEST/LOCK, mark it opened,
 * and set their roster sword. Armed members drop back to idle. The controlled
 * hero is not in the NPC list, so they open their chest by hand.
 */
function armFamily(state: GameState): void {
  for (const npc of state.npcs ?? []) {
    const id = npc.metadata?.partyId as FamilyMemberId | undefined;
    if (!id) continue;
    const chest = chestForMember(state, id);
    if (!chest) continue; // the empty-handed adult, and Opal
    const entry = state.party?.find((p) => p.id === id);
    if (!entry) continue;

    const [cy, cx] = chest;
    const subs = state.mapData.subtypes[cy]?.[cx] ?? [];
    const stillClosed = subs.includes(TileSubtype.CHEST);

    if (entry.hasSword || !stillClosed) {
      // Already armed (or the chest is open) — take the sword and settle.
      if (!entry.hasSword) entry.hasSword = true;
      npc.metadata = {
        ...npc.metadata,
        armed: true,
        ...(npc.metadata?.behavior === "goto" ? { behavior: "idle" } : {}),
      };
      continue;
    }

    const adjacent = Math.abs(npc.y - cy) + Math.abs(npc.x - cx) === 1;
    if (adjacent) {
      // Open it: unlock, mark opened, arm the member.
      state.mapData.subtypes[cy][cx] = [
        ...subs.filter(
          (t) =>
            t !== TileSubtype.CHEST &&
            t !== TileSubtype.LOCK &&
            t !== TileSubtype.SWORD
        ),
        TileSubtype.OPEN_CHEST,
      ];
      entry.hasSword = true;
      npc.metadata = { ...npc.metadata, behavior: "idle", armed: true };
      npc.facing = facingTo(npc.y, npc.x, cy, cx);
    } else {
      // Head for the chest.
      const target = npc.metadata?.gotoTarget as { y: number; x: number } | undefined;
      if (npc.metadata?.behavior !== "goto" || target?.y !== cy || target?.x !== cx) {
        npc.metadata = {
          ...npc.metadata,
          behavior: "goto",
          gotoTarget: { y: cy, x: cx },
        };
      }
    }
  }
}

function facingTo(fromY: number, fromX: number, toY: number, toX: number) {
  if (Math.abs(toY - fromY) >= Math.abs(toX - fromX)) {
    return toY < fromY ? Direction.UP : Direction.DOWN;
  }
  return toX < fromX ? Direction.LEFT : Direction.RIGHT;
}

/** Burst both doors open (front and back) so goblins can come through. */
function openDoors(state: GameState): void {
  for (const { door } of DOORS) {
    const [dy, dx] = door;
    if (state.mapData.tiles[dy]?.[dx] !== undefined) {
      state.mapData.tiles[dy][dx] = FLOOR;
      state.mapData.subtypes[dy][dx] = [];
    }
  }
}

/**
 * Bring in the next goblin, alternating doors (front, back, front, ...). Steps
 * onto the door's inner tile; if that's occupied, tries the doorway itself,
 * then nudges along a couple of fallback tiles so a crowded threshold never
 * silently drops a spawn. Advances the counters.
 */
function spawnNextGoblin(state: GameState, playerPos: [number, number]): void {
  const counters = (state.scenarioCounters ??= {});
  const n = counters.goblinsSpawned ?? 0;
  if (n >= BREACH_TOTAL) return;

  const gate = DOORS[n % DOORS.length];
  const [py, px] = playerPos;
  const occupied = (y: number, x: number) =>
    state.mapData.tiles[y]?.[x] !== FLOOR ||
    (y === py && x === px) ||
    (state.mapData.subtypes[y]?.[x]?.includes(TileSubtype.PLAYER) ?? false) ||
    (state.npcs ?? []).some((npc) => npc.y === y && npc.x === x) ||
    (state.enemies ?? []).some((e) => e.y === y && e.x === x);

  const [iy, ix] = gate.inner;
  const candidates: Array<[number, number]> = [
    gate.inner,
    gate.door,
    [iy, ix - 1],
    [iy, ix + 1],
    [iy + (gate.door[0] === 0 ? 1 : -1), ix],
  ];
  const spot = candidates.find(([y, x]) => !occupied(y, x));
  if (!spot) return; // every threshold tile jammed this turn; try again next

  const goblin = new Enemy({ y: spot[0], x: spot[1] });
  goblin.kind = "fire-goblin";
  state.enemies = [...(state.enemies ?? []), goblin];
  counters.goblinsSpawned = n + 1;
  counters.lastSpawnStep = state.stats.steps ?? 0;
}

/**
 * Whoever is closest to the breach shouts first (Chris's beat: "while we're
 * wondering why, goblins bust in"). Fires one scripted line via the NPC
 * interaction queue — the controlled hero counts, attributed to their member.
 */
function raiseAlarm(state: GameState, playerPos: [number, number]): void {
  const [dy, dx] = DOORS[0].door; // front door, the first breach point
  const dist = (y: number, x: number) => Math.abs(y - dy) + Math.abs(x - dx);

  // Candidates: every living family member who can actually SHOUT — the human
  // allies as NPCs, plus the controlled hero (if human). Opal is a dog: she
  // can't yell "goblins!", and there is no home-opal-goblins line, so she is
  // never a spotter.
  type Spotter = { id: FamilyMemberId; npcId: string; y: number; x: number };
  const spotters: Spotter[] = [];
  for (const npc of state.npcs ?? []) {
    const id = npc.metadata?.partyId as FamilyMemberId | undefined;
    if (id && id !== "opal") spotters.push({ id, npcId: npc.id, y: npc.y, x: npc.x });
  }
  const heroId = state.activeHeroId as FamilyMemberId | undefined;
  if (heroId && heroId !== "opal") {
    const [py, px] = playerPos;
    spotters.push({ id: heroId, npcId: `npc-${heroId}`, y: py, x: px });
  }
  if (spotters.length === 0) return;

  spotters.sort((a, b) => dist(a.y, a.x) - dist(b.y, b.x));
  const first = spotters[0];
  const member = getFamilyMember(first.id);
  // Unique, deterministic within a run: the breach happens exactly once.
  pushDialogue(
    state,
    first.npcId,
    member.name,
    `home-${first.id}-goblins`,
    900000 + (state.stats.steps ?? 0)
  );
}
