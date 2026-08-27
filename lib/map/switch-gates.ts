// Injecting a switch-and-spike gate into a PROCEDURALLY GENERATED daily floor.
//
// The shipped mechanic (PRESSURE_PLATE / SPIKES / SPIKE_HOLES, wired through
// GameState.gateGroups — see pressPlate in game-state.ts) only ever appears in the
// hand-authored Quarrymaster arena, where `assertLayout` can verify by hand that every
// switch is reachable and the boss is caged until all three are thrown. A generated floor
// has no such author, so this module has to earn the same guarantee from the map itself.
//
// THE GATE IS A SHORTCUT, NEVER A LOCK. The bed is only ever placed on a corridor that has
// an alternate route around it, and the plate is only ever placed somewhere still reachable
// on foot. So a floor with an untouched switch is exactly as winnable as a floor with no
// switch at all, and a placement failure degrades to "no gate this floor" rather than to a
// dead run. This is the deliberate opposite of a key: a key gates progress, this gates a
// route you did not need but may badly want later.
//
// WHY THAT IS WORTH ANYTHING, given the game already has keys: the plate sits on the FAR
// side of the bed it retracts, within rock-throw reach. SPIKES is a floor overlay rather
// than a wall, so the throw scan in performThrowRockCore sails a rock straight over the bed
// and a rock landing on an unthrown plate holds it down (game-state.ts:913). That gives the
// player two real answers — spend a rock now, or walk the long way around and press it by
// boot — which is a decision a key can never produce, because you always just take the key.
//
// Rock throws travel 4 tiles (performThrowRockCore), so the bed depth plus one is capped at
// 4 and the "throw it open" answer is always physically available.
import { FLOOR, FLOWERS, TileSubtype } from "./constants";
import type { GateGroup, MapData } from "./types";

/**
 * Where the plate ends up relative to the bed it opens.
 *  - "behind-bed" the real design: far side of the spikes, inside rock-throw range.
 *  - "open"       control case: an ordinary tile on the walking route, i.e. a second key
 *                 with extra steps. Only produced when explicitly asked for, so the two
 *                 can be felt side by side.
 */
export type PlateAccess = "behind-bed" | "open";

/**
 * The day's gate, recorded on the game state so the end-of-run report can say what the day
 * offered and what the player did about it.
 *
 * `plate` is here so pressPlate can tell THE DAY'S switch from an arena's: a daily run that
 * finds the floor-3 boss door presses up to four Quarrymaster plates, and counting those as
 * engagement with this feature would quietly inflate every number.
 */
export interface DailySwitchGate {
  floor: number;
  access: PlateAccess;
  plate: [number, number];
  /**
   * How the switch was thrown, if it was. "rock" = thrown across the bed, "boot" = the hero
   * walked onto it, "enemy" = an enemy blundered across it (see maybeEnemiesPressSwitchGate).
   * The enemy case is NOT player engagement, so analytics must not count it as "solved".
   */
  thrownBy?: "rock" | "boot" | "enemy";
  /**
   * What the bed stands between the hero and (daily tuning v2 only; absent on earlier days).
   * "chest" = the detour was scored against treasure, so the spikes guard loot; "corridor" =
   * the classic longest-walk shortcut.
   */
  target?: "chest" | "corridor";
}

export interface SwitchGatePlan {
  /** The spike bed, in travel order (nearest the hero first). */
  bed: Array<[number, number]>;
  plate: [number, number];
  access: PlateAccess;
  /**
   * Extra steps the CLOSED bed adds to the longest essential route (exit key, exit, any
   * chest). This is the whole measure of whether the gate is worth opening: 0 means the
   * spikes block nothing anyone cared about, high means the retracted bed is a real
   * short cut. Candidates are ranked on it.
   */
  detour: number;
  /** Straight-line rock-throw distance from the near side to the plate; 0 when "open". */
  throwDistance: number;
}

export interface PlanSwitchGateOptions {
  /** Default "behind-bed". */
  access?: PlateAccess;
  /** Reject candidates that shorten the longest essential route by less than this. */
  minDetour?: number;
  /**
   * Tiles (`"y,x"`) that must not be built on even though they look blank.
   *
   * Needed because ENEMIES DO NOT LIVE IN `subtypes` — they are a separate array on the game
   * state, so a tile with a goblin standing on it is indistinguishable from bare floor here.
   * The daily runs this placement last in the floor's RNG stream, which is after enemies and
   * snakes exist, so without this a spike bed can be built directly on top of one.
   */
  avoid?: ReadonlySet<string>;
  /**
   * Daily tuning v2: restrict candidate beds by walking distance from the hero's start.
   * "near" = within NEAR_SPAWN_BED_STEPS, "far" = beyond it. Absent = any bed (the v1
   * behavior). The near/far split is rolled per day in maybePlaceSwitchGate so gates stop
   * defaulting to the hero's doorstep — see SWITCH_GATE_NEAR_SPAWN_SHARE.
   */
  bedPool?: "near" | "far";
  /**
   * Daily tuning v2: score the detour against CHESTS only, so the chosen bed specifically
   * stands between the hero and treasure rather than just the longest corridor. The
   * no-soft-lock severing check still covers every essential tile either way. Returns null
   * when the floor has no reachable chest — callers fall back to corridor mode.
   */
  targetMode?: "chest";
  /**
   * Detour bars to walk down when the caller wants a different quality/coverage trade than
   * the default DETOUR_LADDER (only planSwitchGateBestEffort reads this).
   */
  detourLadder?: readonly number[];
}

const ROCK_THROW_RANGE = 4;

/**
 * Widest passage a bed will span. A gate has to read as a doorway filled with spikes; span
 * much more than this and it is a wall across a room, which looks like level geometry the
 * player is meant to accept rather than something that can open.
 */
const MAX_BED_WIDTH = 3;

/**
 * Subtypes that stop a walking hero, or that a dry route must not depend on crossing.
 *
 * LAVA and DEEP_WATER are counted as blocking even though the hero CAN enter them (lava
 * kills, deep water snuffs the torch and is swimmable) for the same reason
 * canPlaceFaultyFloorSafely does it: the guarantee being made here is about a safe route,
 * and a safe route must never require paying a toll. FAULTY_FLOOR is blocking because the
 * hero is meant to walk around cracks, not through them.
 */
const BLOCKING_SUBTYPES: readonly TileSubtype[] = [
  TileSubtype.SPIKES,
  TileSubtype.LAVA,
  TileSubtype.DEEP_WATER,
  TileSubtype.FAULTY_FLOOR,
  TileSubtype.WALL_TORCH,
  TileSubtype.CHECKPOINT,
  TileSubtype.TOWN_SIGN,
  TileSubtype.BOOKSHELF,
];

const STEPS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function inBounds(mapData: MapData, y: number, x: number): boolean {
  return (
    y >= 0 && y < mapData.tiles.length && x >= 0 && x < (mapData.tiles[y]?.length ?? 0)
  );
}

/** Can the hero walk here without taking damage or a detour through a hazard? */
function isDryWalkable(mapData: MapData, y: number, x: number): boolean {
  if (!inBounds(mapData, y, x)) return false;
  const tile = mapData.tiles[y][x];
  if (tile !== FLOOR && tile !== FLOWERS) return false;
  const subs = mapData.subtypes[y]?.[x] ?? [];
  return !subs.some((s) => BLOCKING_SUBTYPES.includes(s as TileSubtype));
}

/**
 * Is this tile free for us to write a spike bed or a plate onto?
 *
 * Requires an EMPTY subtype array, the same bar every other placer in map-features uses.
 * That is what keeps this off the exit, the keys, chests, pots, rocks and the player,
 * without having to enumerate them.
 */
function isBlankFloor(
  mapData: MapData,
  y: number,
  x: number,
  avoid?: ReadonlySet<string>
): boolean {
  if (!isDryWalkable(mapData, y, x)) return false;
  if (avoid?.has(`${y},${x}`)) return false;
  return (mapData.subtypes[y]?.[x] ?? []).length === 0;
}

/** Step distance from `start` to every dry tile, treating `blocked` as impassable. */
function bfsDistances(
  mapData: MapData,
  start: [number, number],
  blocked: ReadonlySet<string>
): Map<string, number> {
  const dist = new Map<string, number>();
  const [sy, sx] = start;
  const startKey = `${sy},${sx}`;
  if (blocked.has(startKey)) return dist;
  dist.set(startKey, 0);
  let frontier: Array<[number, number]> = [[sy, sx]];
  while (frontier.length > 0) {
    const next: Array<[number, number]> = [];
    for (const [y, x] of frontier) {
      const d = dist.get(`${y},${x}`) ?? 0;
      for (const [dy, dx] of STEPS) {
        const ny = y + dy;
        const nx = x + dx;
        const key = `${ny},${nx}`;
        if (dist.has(key) || blocked.has(key)) continue;
        if (!isDryWalkable(mapData, ny, nx)) continue;
        dist.set(key, d + 1);
        next.push([ny, nx]);
      }
    }
    frontier = next;
  }
  return dist;
}

/** Every tile carrying `sub`. */
function findSubtype(mapData: MapData, sub: TileSubtype): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < mapData.subtypes.length; y++) {
    for (let x = 0; x < mapData.subtypes[y].length; x++) {
      if (mapData.subtypes[y][x].includes(sub)) out.push([y, x]);
    }
  }
  return out;
}

/**
 * The tiles whose reachability the run depends on: both keys, the exit, and every chest.
 *
 * A candidate bed that pushes any of these out of reach is discarded outright — that is
 * the no-soft-lock guarantee, and it is why this can be dropped into generated floors
 * without a hand-authored `assertLayout` behind it.
 */
function essentialTargets(mapData: MapData): Array<[number, number]> {
  return [
    ...findSubtype(mapData, TileSubtype.EXIT),
    ...findSubtype(mapData, TileSubtype.EXITKEY),
    ...findSubtype(mapData, TileSubtype.KEY),
    ...findSubtype(mapData, TileSubtype.CHEST),
  ];
}

interface PassageBed {
  /** One tile deep, spanning the passage across the direction of travel. */
  bed: Array<[number, number]>;
  /** Travel direction through the passage: the bed's near side is -axis, far side is +axis. */
  axis: readonly [number, number];
}

/**
 * The bed that would seal the passage running through (y,x) along `axis`, or null if there
 * is no passage there.
 *
 * The bed is ONE TILE DEEP and spans the passage's full width across the direction of
 * travel — the Quarrymaster's beds are shaped the same way, three tiles filling a chamber
 * mouth. Depth was the first thing tried instead and it was wrong twice over: a two-deep
 * one-wide corridor is rare in generated maps (roughly a fifth as common as one-deep), and
 * a bed running lengthwise down a hallway reads as floor decoration rather than a door.
 *
 * Rejects anything that is not really a doorway:
 *  - the span must be blank floor end to end (so nothing is written over),
 *  - it must be capped by non-walkable tiles on both flanks (a bed you can side-step gates
 *    nothing),
 *  - it must be at most MAX_BED_WIDTH wide (wider is a room, not a door), and
 *  - every tile in it must have walkable floor on both the near and far side, which is what
 *    makes it a passage rather than the lip of a dead end.
 */
function passageBed(
  mapData: MapData,
  y: number,
  x: number,
  axis: readonly [number, number],
  avoid?: ReadonlySet<string>
): PassageBed | null {
  const [ay, ax] = axis;
  const perp: readonly [number, number] = [ax, ay];

  // Grow across the passage from (y,x) in both perpendicular directions.
  const span: Array<[number, number]> = [[y, x]];
  for (const sign of [1, -1]) {
    for (let i = 1; i <= MAX_BED_WIDTH; i++) {
      const sy = y + perp[0] * sign * i;
      const sx = x + perp[1] * sign * i;
      if (!isDryWalkable(mapData, sy, sx)) break;
      // Walkable but not blank (an item or an enemy sits there), or the passage is wider than
      // a door: either way this is not a gate site.
      if (!isBlankFloor(mapData, sy, sx, avoid)) return null;
      if (span.length >= MAX_BED_WIDTH) return null;
      span.push([sy, sx]);
    }
  }
  if (!isBlankFloor(mapData, y, x, avoid)) return null;

  // Every tile must have floor ahead and behind — that is what makes this a passage.
  for (const [by, bx] of span) {
    if (!isDryWalkable(mapData, by - ay, bx - ax)) return null;
    if (!isDryWalkable(mapData, by + ay, bx + ax)) return null;
  }

  // Order along the perpendicular so the bed is contiguous rather than growth-ordered.
  span.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { bed: span, axis };
}

/**
 * Pick a spike bed and the switch that retracts it, or null if this floor has nowhere
 * that satisfies the rules.
 *
 * Ranking is by `detour`: the bed that costs the player the most walking while it is shut
 * is the bed most worth a rock. Base tie-break is toward the bed nearest the hero's start
 * ("met early and remembered") — the census showed that stacked 40% of all beds within six
 * steps of spawn, where they read as furniture, so daily tuning v2 flips the tie toward the
 * FAR bed whenever opts.bedPool is "far" (the 70% case; see SWITCH_GATE_NEAR_SPAWN_SHARE).
 *
 * opts.targetMode === "chest" scores the detour against chests only, so the winning bed is
 * the one most in the way of treasure. The severing check is unchanged — every essential
 * tile (keys, exit, chests) must survive the bed being shut, whatever is being scored.
 */
export function planSwitchGate(
  mapData: MapData,
  hero: [number, number],
  opts: PlanSwitchGateOptions = {}
): SwitchGatePlan | null {
  const access = opts.access ?? "behind-bed";
  const minDetour = opts.minDetour ?? 4;
  const avoid = opts.avoid;
  const preferFar = opts.bedPool === "far";

  const targets = essentialTargets(mapData);
  const baseline = bfsDistances(mapData, hero, new Set());
  // Only score targets the hero can already reach; an unreachable-at-baseline target is a
  // pre-existing property of the floor and not something this gate should be blamed for.
  const scored = targets.filter((t) => baseline.has(`${t[0]},${t[1]}`));
  const detourTargets =
    opts.targetMode === "chest"
      ? findSubtype(mapData, TileSubtype.CHEST).filter((t) => baseline.has(`${t[0]},${t[1]}`))
      : scored;
  // Nothing to score a detour against (chest mode on a chestless floor, or a floor whose
  // essentials are all unreachable) — no gate is better than a meaningless one.
  if (detourTargets.length === 0) return null;

  let best: SwitchGatePlan | null = null;
  let bestRank: [number, number] = [-1, preferFar ? -1 : Number.MAX_SAFE_INTEGER];

  for (let y = 0; y < mapData.tiles.length; y++) {
    for (let x = 0; x < mapData.tiles[y].length; x++) {
      if (!isBlankFloor(mapData, y, x, avoid)) continue;
      for (const axis of [[1, 0] as const, [0, 1] as const]) {
        const run = passageBed(mapData, y, x, axis, avoid);
        if (!run) continue;

        // Pool screen (v2): the bed's walking distance from the start, before paying for a
        // closed-bed BFS. An unreachable bed (isolated pocket) can never be "near".
        if (opts.bedPool) {
          const bedDist = run.bed.reduce(
            (m, [by, bx]) => Math.min(m, baseline.get(`${by},${bx}`) ?? Number.MAX_SAFE_INTEGER),
            Number.MAX_SAFE_INTEGER
          );
          const isNear = bedDist <= NEAR_SPAWN_BED_STEPS;
          if (opts.bedPool === "near" ? !isNear : isNear) continue;
        }

        const blocked = new Set(run.bed.map(([by, bx]) => `${by},${bx}`));
        const closed = bfsDistances(mapData, hero, blocked);

        // Hard reject: anything the run needs must survive the bed being shut.
        let severed = false;
        for (const [ty, tx] of scored) {
          if (closed.get(`${ty},${tx}`) === undefined) {
            severed = true;
            break;
          }
        }
        if (severed) continue;
        let detour = 0;
        for (const [ty, tx] of detourTargets) {
          const key = `${ty},${tx}`;
          const after = closed.get(key);
          if (after === undefined) {
            severed = true;
            break;
          }
          detour = Math.max(detour, after - (baseline.get(key) ?? 0));
        }
        if (severed || detour < minDetour) continue;

        // The plate must also be reachable on foot with the bed shut — that is the second
        // answer to the gate, and without it this is a rock-or-nothing lock.
        const plate = choosePlate(mapData, run, closed, access, hero, avoid);
        if (!plate) continue;

        const prox = Math.abs(run.bed[0][0] - hero[0]) + Math.abs(run.bed[0][1] - hero[1]);
        const tieBetter = preferFar ? prox > bestRank[1] : prox < bestRank[1];
        if (detour > bestRank[0] || (detour === bestRank[0] && tieBetter)) {
          bestRank = [detour, prox];
          best = {
            bed: run.bed,
            plate: plate.pos,
            access,
            detour,
            throwDistance: plate.throwDistance,
          };
        }
      }
    }
  }

  return best;
}

/**
 * Place the switch for a candidate bed.
 *
 * "behind-bed" puts it one tile past the bed on the FAR side — where "far" is decided by
 * which flank costs more walking to reach once the bed is shut, not by which way the axis
 * happens to point. Both flanks stay reachable (the bed only ever gates a passage with a way
 * around), so this is the whole tradeoff in one placement: throw a rock across the spikes
 * from the side you arrive on, or walk the detour and press it with a boot. A plate on the
 * near flank would be neither — you would already be standing next to it.
 *
 * The throw is 2 steps (over the one-deep bed, onto the plate), comfortably inside
 * ROCK_THROW_RANGE, and every tile in between is FLOOR because spikes are an overlay.
 *
 * "open" puts it on the walking route instead, roughly where the hero already goes.
 */
function choosePlate(
  mapData: MapData,
  run: PassageBed,
  closed: Map<string, number>,
  access: PlateAccess,
  hero: [number, number],
  avoid?: ReadonlySet<string>
): { pos: [number, number]; throwDistance: number } | null {
  const [ay, ax] = run.axis;

  if (access === "behind-bed") {
    // Which flank is the long way round? Compare walking cost to each side with the bed shut.
    const sideCost = (sign: number): number => {
      let best = Number.MAX_SAFE_INTEGER;
      for (const [by, bx] of run.bed) {
        const d = closed.get(`${by + ay * sign},${bx + ax * sign}`);
        if (d !== undefined) best = Math.min(best, d);
      }
      return best;
    };
    const forward = sideCost(1);
    const backward = sideCost(-1);
    // Both flanks must be walkable-to with the bed shut, or this is a lock, not a shortcut.
    if (forward === Number.MAX_SAFE_INTEGER || backward === Number.MAX_SAFE_INTEGER) {
      return null;
    }
    const sign = forward >= backward ? 1 : -1;

    // First blank tile out along the far flank. Offset 1 is the tidiest read (spikes, then
    // the switch right behind them); offset 2 is the fallback for when something already
    // occupies that tile. Throw cost is offset + 1 — the extra step is the bed itself.
    for (let offset = 1; offset <= 2; offset++) {
      for (const [by, bx] of run.bed) {
        const py = by + ay * sign * offset;
        const px = bx + ax * sign * offset;
        if (!isBlankFloor(mapData, py, px, avoid)) continue;
        if (!closed.has(`${py},${px}`)) continue; // unreachable on foot -> would be a lock
        const throwDistance = offset + 1;
        if (throwDistance > ROCK_THROW_RANGE) continue;
        // The hero needs somewhere to stand in line on the near flank to make the throw.
        if (!isDryWalkable(mapData, by - ay * sign, bx - ax * sign)) continue;
        return { pos: [py, px], throwDistance };
      }
    }
    return null;
  }

  // Control case: the dullest possible switch — a blank tile the hero passes anyway,
  // about a third of the way along the route, well clear of the bed.
  let bestPos: [number, number] | null = null;
  let bestScore = Number.MAX_SAFE_INTEGER;
  const bedKeys = new Set(run.bed.map(([by, bx]) => `${by},${bx}`));
  const reach = [...closed.entries()].filter(([, d]) => d >= 4);
  const target = Math.max(...reach.map(([, d]) => d), 0) / 3;
  for (const [key, d] of reach) {
    const [y, x] = key.split(",").map(Number) as [number, number];
    if (bedKeys.has(key)) continue;
    if (!isBlankFloor(mapData, y, x, avoid)) continue;
    if (Math.abs(y - hero[0]) + Math.abs(x - hero[1]) < 3) continue;
    const score = Math.abs(d - target);
    if (score < bestScore) {
      bestScore = score;
      bestPos = [y, x];
    }
  }
  return bestPos ? { pos: bestPos, throwDistance: 0 } : null;
}

/**
 * Write a planned gate into the map and wire it up.
 *
 * Mutates `mapData.subtypes` and sets `state.gateGroups`; APPENDS to any existing groups so
 * a floor could carry more than one gate. From here the shipped machinery does the rest —
 * movePlayer presses a plate the hero stands on (game-state.ts:4517), performThrowRockCore
 * presses one a rock lands on (913), and pressPlate turns the wired SPIKES into walkable
 * SPIKE_HOLES for good.
 */
export function applySwitchGate(
  state: { gateGroups?: GateGroup[] },
  mapData: MapData,
  plan: SwitchGatePlan
): void {
  for (const [by, bx] of plan.bed) {
    mapData.subtypes[by][bx] = [TileSubtype.SPIKES];
  }
  const [py, px] = plan.plate;
  mapData.subtypes[py][px] = [TileSubtype.PRESSURE_PLATE];
  state.gateGroups = [
    ...(state.gateGroups ?? []),
    { plate: plan.plate, gates: plan.bed, open: false },
  ];
}

/**
 * Detour bars tried in turn when a floor has to have a gate if one is possible at all.
 *
 * Roughly one floor in seven has no passage that both survives the safety rules and saves
 * a meaningful walk, and floor 3 is the worst of them — it is the smallest grid carrying the
 * most furniture (guard, seals, water, lava), so it has the fewest blank doorways left. The
 * ladder trades quality for coverage rather than loosening any safety rule: the no-soft-lock
 * and reachable-plate checks are identical at every rung, only the "is this worth opening"
 * bar moves. A gate found at the bottom rung genuinely is nearly pointless — 2 steps saved —
 * which is why `detour` is on the plan for callers to show rather than hide.
 */
const DETOUR_LADDER = [4, 2] as const;

/**
 * The v2 ladder (daily tuning v2): starts twice as high and never drops to the old
 * bottom rung. The census put the median shipped detour barely above the old floor —
 * "genuinely nearly pointless" gates were common enough to read as furniture. Raising
 * the bar costs some coverage on cramped floors (the near/far cascade in
 * maybePlaceSwitchGate already retries the other pool before giving up), which is the
 * intended trade: a missing gate beats a meaningless one.
 */
const DETOUR_LADDER_V2 = [8, 5, 3] as const;

/**
 * Chest-target gates get one extra, lower rung. A corridor gate saving 2 steps is
 * meaningless, but a spike bed sitting between the hero and a chest reads as "the spikes
 * guard the treasure" even at a 2-step detour — the value is the picture, not the walk.
 * Without this rung, chest beds (already rare: chests sit in open rooms) almost never
 * clear the corridor bars and the chest mode barely ships.
 */
const DETOUR_LADDER_V2_CHEST = [8, 5, 3, 2] as const;

/**
 * Plan a gate for a floor, relaxing the detour bar until one is found, or null if the floor
 * has nowhere legal at all. opts.detourLadder swaps in a different set of bars (v2).
 */
export function planSwitchGateBestEffort(
  mapData: MapData,
  hero: [number, number],
  opts: PlanSwitchGateOptions = {}
): SwitchGatePlan | null {
  const ladder = opts.detourLadder ?? DETOUR_LADDER;
  const bars = opts.minDetour === undefined ? ladder : [opts.minDetour, ...ladder];
  for (const minDetour of bars) {
    const plan = planSwitchGate(mapData, hero, { ...opts, minDetour });
    if (plan) return plan;
  }
  return null;
}

/**
 * Plan a gate for a floor and apply it in one step. Returns the plan, or null when the
 * floor offered nowhere legal — in which case nothing was written and the floor plays
 * exactly as it generated.
 */
export function injectSwitchGate(
  state: { mapData: MapData; gateGroups?: GateGroup[] },
  hero: [number, number],
  opts: PlanSwitchGateOptions = {}
): SwitchGatePlan | null {
  const plan = planSwitchGateBestEffort(state.mapData, hero, opts);
  if (plan) applySwitchGate(state, state.mapData, plan);
  return plan;
}

/**
 * First daily date (YYYY-MM-DD) whose maps carry a switch gate. Earlier dates generate exactly
 * as they always did.
 *
 * MUST be the day AFTER this ships, and re-checked at merge time — same rule and the same
 * reason as L2_POOL_V2_START_DATE in map-features.ts, which has already been bumped once when
 * a merge slipped a day. The daily map is built from the date seed at run start, so on the
 * deploy day itself some players hold a pre-deploy map and some a post-deploy one; naming
 * tomorrow keeps every already-played run correct.
 *
 * Unlike the chest pool, this gate does NOT shift the RNG stream — the placement is appended
 * after the last existing draw of each floor (see maybePlaceSwitchGate), so no historical
 * enemy, water, boss or chest roll moves whether it runs or not. The date gate is here for the
 * weaker but still real reason: a replayed past date should reconstruct the map that was
 * actually played, spike beds included. There is no way to test the "day after" invariant from
 * inside the repo, so it is a merge-time human check. See the pre-promote checklist.
 */
export const SWITCH_GATE_START_DATE = "2026-08-05";

/** Chance a candidate floor claims the day's gate, for floors that get a roll at all. */
export const SWITCH_GATE_FLOOR_CHANCE = 0.3;

/**
 * Chance the day's gate puts its switch ON THE WALKING PATH rather than behind the spikes.
 *
 * Both variants ship, because they fail and succeed in different places. Behind-the-spikes is
 * the better moment when it lands well — one way in, nothing much back there, throw a rock and
 * the lane opens — but it repeats, because the shape is always the same shape. On-the-path
 * varies more with the map, so it carries the frequency better. Hence the tilt toward it.
 *
 * A one-line knob: raise it if the bed-and-throw setup starts feeling samey, lower it if the
 * walk-over switch starts feeling like a second key.
 */
export const SWITCH_GATE_ON_PATH_CHANCE = 0.6;

/** Roll which variant a gate uses. Its own draw, so the tilt is tunable without touching the rest. */
export function rollPlateAccess(): PlateAccess {
  return Math.random() < SWITCH_GATE_ON_PATH_CHANCE ? "open" : "behind-bed";
}

/**
 * Daily tuning v2: the near/far split. A bed within NEAR_SPAWN_BED_STEPS walking steps of
 * the hero's start counts as "near"; this is the share of gate days that deliberately KEEP
 * the old met-early placement. The rest are pushed beyond it, where opening the lane is a
 * memory and a walk rather than a shrug.
 *
 * The knob is FAR lower than the 30%-within-8 target it aims for, because near beds are
 * mostly structural, not chosen: whenever a floor offers no far bed at all the far pool
 * falls back to near, and small floor-1 grids (a fifth of gates) plus cramped floors
 * supply near beds on ~20% of far-preferring days by themselves. The knob only adds the
 * last few deliberate points on top of that floor. Census fit: knob 0.30 → 41% within 8,
 * knob 0.15 → 37%, knob 0.05 → target. Re-fit against the census harness if the ladder,
 * pools, or floor-cascade change. Both pools fall back to the other when a floor only
 * offers one kind, so coverage does not pay for the split.
 */
export const SWITCH_GATE_NEAR_SPAWN_SHARE = 0.05;
export const NEAR_SPAWN_BED_STEPS = 8;

/**
 * Daily tuning v2: share of gate days that score the bed against CHESTS instead of the
 * longest corridor, so the spikes visibly guard treasure. The knob is intent, not outcome —
 * the effective rate is much lower: floor 3 (half of all gates) has no chests at all, and
 * even chest-bearing floors rarely offer a bed that detours a chest by much. Census: at
 * 0.35 only ~7% of shipped gates were chest gates; 0.5 plus the softer chest ladder below
 * lands the "occasionally" the design asks for (~1 gate in 8).
 */
export const SWITCH_GATE_CHEST_TARGET_CHANCE = 0.5;

/** The last floor, which takes the gate without rolling for it. */
const SWITCH_GATE_LAST_FLOOR = 3;

/**
 * Give a floor its shot at the day's ONE switch gate.
 *
 * The cascade, across a 3-floor daily: floor 1 rolls SWITCH_GATE_FLOOR_CHANCE, floor 2 rolls
 * the same but only if floor 1 did not end up with one, and floor 3 simply takes it if it is
 * still going spare. Failing the roll and failing to find a legal spot are treated the same —
 * either way the floor did not get it and the chance passes down. If floor 3 also comes up
 * empty the day has no gate, which is the intended fallback rather than a bug: roughly one day
 * in fifteen genuinely has no passage worth gating on any floor.
 *
 * That works out to a gate on ~94% of days and never more than one, given measured per-floor
 * placement rates of 95% / 100% / 88%.
 *
 * CALL THIS LAST IN THE FLOOR'S SEEDED STREAM. Every RNG draw it makes lands after the floor's
 * existing ones, so turning the feature on cannot move an enemy, a water pool, a boss door or
 * a chest on any date — which is what keeps lib/stats' replays of past days honest. Move it
 * earlier and that guarantee is silently gone.
 *
 * Consumes NO randomness once the gate is placed, so floor 3 does not draw on a day floor 1
 * already claimed it.
 *
 * `state.switchGate` is both the carry-forward flag and the analytics record; it is set here on
 * success and is what makes "the day already has its gate" and "what did the day offer" the
 * same question.
 */
export function maybePlaceSwitchGate(
  state: {
    mapData: MapData;
    gateGroups?: GateGroup[];
    switchGate?: DailySwitchGate;
  },
  floor: number,
  hero: [number, number] | null,
  opts: PlanSwitchGateOptions & { tuningV2?: boolean } = {}
): SwitchGatePlan | null {
  if (state.switchGate) return null;
  if (!hero) return null;
  if (floor < SWITCH_GATE_LAST_FLOOR && Math.random() >= SWITCH_GATE_FLOOR_CHANCE) {
    return null;
  }
  // Variant is rolled here, not chosen by the caller, so the daily gets both shapes. Rolled
  // AFTER the floor check so a floor that never gets a gate draws only the one value — keeps
  // the stream cost of a skipped floor at exactly one draw.
  const access = opts.access ?? rollPlateAccess();

  if (!opts.tuningV2) {
    const plan = injectSwitchGate(state, hero, { ...opts, access });
    if (plan) state.switchGate = { floor, access, plate: plan.plate };
    return plan;
  }

  // Daily tuning v2. Exactly two more draws, made up front whatever happens next, so an
  // attempting floor always costs access + these two — planning itself draws nothing.
  const wantChest = Math.random() < SWITCH_GATE_CHEST_TARGET_CHANCE;
  const wantNear = Math.random() < SWITCH_GATE_NEAR_SPAWN_SHARE;

  // Preference cascade: POOL outranks MODE. The 30%-within-8-steps distance target is the
  // calibrated promise (SWITCH_GATE_NEAR_SPAWN_SHARE); chest-targeting is a flavor
  // preference within it — nesting the other way round leaks near beds onto far days
  // whenever the only chest-worthy beds sit near spawn, which measurably blows the
  // distance target. Pools are exhaustive (near ∪ far covers every bed), so trying the
  // preferred pool then the other preserves v1's coverage guarantee; chest mode degrades
  // to corridor mode inside each pool the same way.
  const pools: Array<"near" | "far"> = wantNear ? ["near", "far"] : ["far", "near"];
  const modes: Array<"chest" | undefined> = wantChest ? ["chest", undefined] : [undefined];
  for (const bedPool of pools) {
    for (const targetMode of modes) {
      const plan = planSwitchGateBestEffort(state.mapData, hero, {
        ...opts,
        access,
        targetMode,
        bedPool,
        detourLadder: targetMode === "chest" ? DETOUR_LADDER_V2_CHEST : DETOUR_LADDER_V2,
      });
      if (plan) {
        applySwitchGate(state, state.mapData, plan);
        state.switchGate = {
          floor,
          access,
          plate: plan.plate,
          target: targetMode === "chest" ? "chest" : "corridor",
        };
        return plan;
      }
    }
  }
  return null;
}

/**
 * Chance a CHASING enemy that ends its tick standing on the day's switch trips it.
 *
 * Enemies aren't aware enough to press a switch on purpose — they never path toward one. But
 * when the hero flees across the plate, a pursuer following the same lane can stomp it by
 * accident, which is exactly the moment the player is least able to stop them. This is that
 * accident's probability, rolled each tick the enemy occupies the plate.
 */
export const SWITCH_GATE_ENEMY_CHASE_PRESS_CHANCE = 0.35;

/**
 * Chance an idle / wandering enemy that ends its tick on the plate trips it. Much lower than
 * the chasing rate: a goblin milling around the room stepping on it is possible but should be
 * a rare surprise, not a reliable way for the gate to open itself.
 */
export const SWITCH_GATE_ENEMY_IDLE_PRESS_CHANCE = 0.08;

/** Tiles occupied by entities that do not appear in `subtypes`, for `avoid`. */
export function occupiedTiles(
  entities: ReadonlyArray<{ y: number; x: number }>
): Set<string> {
  return new Set(entities.map((e) => `${e.y},${e.x}`));
}
