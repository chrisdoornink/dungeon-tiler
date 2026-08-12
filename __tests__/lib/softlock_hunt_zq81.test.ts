// TEMP softlock hunt: exhaustive reachability over generated rooms (seeds 70..77).
//
// For each seed: generate the certified room, take the goblin-stripped spec (what certification
// proves), then BFS the ENTIRE reachable state graph from the start using the real engine
// transitions (movePlayer / performWait — rooms have rocks=0 so throws are impossible). Then
// backward-propagate "can still win" from every state that has a winning successor. Any reachable,
// alive, non-win state that cannot reach a win is a SOFTLOCK; we reconstruct the exact action path
// to it and describe the stranded state.
import * as crypto from "crypto";
import { generateCertifiedRoom } from "../../lib/puzzles/generate_room";
import { parsePuzzleRoom, puzzleRoomToGameState } from "../../lib/puzzles/rooms";
import { stateKey } from "../../lib/puzzles/solver";
import { Direction } from "../../lib/map/constants";
import { movePlayer, performWait, type GameState } from "../../lib/map/game-state";
import { findPlayerPosition } from "../../lib/map/player";

jest.setTimeout(600_000);

const MOVES: Direction[] = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT];
type Act = { kind: "move"; dir: Direction } | { kind: "wait" };
const ACTIONS: Act[] = [...MOVES.map((dir) => ({ kind: "move" as const, dir })), { kind: "wait" }];

const SOLVER_RNG = () => 0.5;

// Same clone the solver uses for the root (no enemies in stripped rooms).
function cloneRoot(s: GameState): GameState {
  const { combatRng, enemies, npcs, ...rest } = s;
  void combatRng;
  const cloned = JSON.parse(JSON.stringify(rest)) as GameState;
  cloned.combatRng = SOLVER_RNG;
  cloned.enemies = enemies;
  cloned.npcs = npcs;
  return cloned;
}

function apply(state: GameState, a: Act): GameState {
  return a.kind === "move" ? movePlayer(state, a.dir) : performWait(state);
}

// Full keys run 1-2KB; hash them so a few hundred thousand states fit in memory. SHA-1 collision
// probability at n=10^6 is ~n^2/2^161 ≈ 3e-37 — sound in practice.
function hkey(s: GameState): string {
  return crypto.createHash("sha1").update(stateKey(s)).digest("base64");
}

function fmtAct(a: Act): string {
  if (a.kind === "wait") return "wait";
  return a.dir === Direction.UP ? "U" : a.dir === Direction.DOWN ? "D" : a.dir === Direction.LEFT ? "L" : "R";
}

function describeState(s: GameState): string {
  const pos = findPlayerPosition(s.mapData);
  const plats = (s.platforms ?? [])
    .map((p) => `${p.id}@${p.index}dir${p.dir}${p.running ? "run" : "PARKED"}`)
    .join(" ");
  const toggles = (s.toggleGroups ?? []).map((g) => (g.on ? "on" : "off")).join(",");
  const locks = (s.colorLocks ?? []).map((l) => l.states.join("/")).join(" ");
  return `hero@${pos?.join(",")} key=${s.hasExitKey ? 1 : 0} plats[${plats}] toggle[${toggles}] lock[${locks}]`;
}

interface HuntResult {
  seed: number;
  nodes: number;
  edges: number;
  winAdj: number;
  capped: boolean;
  softlocks: Array<{ path: string; state: string; depth: number }>;
}

function hunt(seed: number, maxNodes: number): HuntResult {
  const gen = generateCertifiedRoom(seed);
  const parsed = parsePuzzleRoom(gen.strippedSpec);
  const start = cloneRoot(puzzleRoomToGameState(parsed));
  if ((start.enemies?.length ?? 0) > 0) throw new Error("stripped room has enemies");
  if ((start.rockCount ?? 0) > 0) throw new Error("room has rocks — throws not modeled");

  const idxByKey = new Map<string, number>();
  const succs: number[][] = [];
  const parentIdx: number[] = [];
  const parentAct: (Act | null)[] = [];
  const winAdj: boolean[] = [];
  const depth: number[] = [];

  const rootKey = hkey(start);
  idxByKey.set(rootKey, 0);
  succs.push([]);
  parentIdx.push(-1);
  parentAct.push(null);
  winAdj.push(false);
  depth.push(0);

  // Queue holds live GameStates only until expansion, then the slot is nulled to free memory.
  const queue: Array<GameState | null> = [start];
  const queueIdx: number[] = [0];
  let head = 0;
  let edges = 0;
  let capped = false;

  while (head < queue.length) {
    const state = queue[head]!;
    const i = queueIdx[head];
    queue[head] = null;
    head++;

    for (const a of ACTIONS) {
      const next = apply(state, a);
      if ((next.heroHealth ?? 0) <= 0) continue; // death, not a softlock — a dead branch
      if (next.win) {
        winAdj[i] = true; // this state can win in one action; win states are terminal
        continue;
      }
      const k = hkey(next);
      let j = idxByKey.get(k);
      if (j === undefined) {
        j = succs.length;
        if (j >= maxNodes) {
          capped = true;
          continue;
        }
        idxByKey.set(k, j);
        succs.push([]);
        parentIdx.push(i);
        parentAct.push(a);
        winAdj.push(false);
        depth.push(depth[i] + 1);
        queue.push(next);
        queueIdx.push(j);
      }
      succs[i].push(j);
      edges++;
    }
  }

  // Backward propagation: canWin[i] iff winAdj[i] or some successor canWin. Build predecessor
  // lists, then BFS backwards from every win-adjacent node.
  const n = succs.length;
  const preds: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) for (const j of succs[i]) preds[j].push(i);
  const canWin = new Array<boolean>(n).fill(false);
  const bq: number[] = [];
  let winAdjCount = 0;
  for (let i = 0; i < n; i++) {
    if (winAdj[i]) {
      winAdjCount++;
      canWin[i] = true;
      bq.push(i);
    }
  }
  for (let h = 0; h < bq.length; h++) {
    for (const p of preds[bq[h]]) {
      if (!canWin[p]) {
        canWin[p] = true;
        bq.push(p);
      }
    }
  }

  // Collect softlocks: reachable states that cannot reach a win. Reconstruct + replay the path to
  // describe the concrete stranded state (dedupe to the shallowest few for the report).
  const softlocks: HuntResult["softlocks"] = [];
  const stranded: number[] = [];
  for (let i = 0; i < n; i++) if (!canWin[i]) stranded.push(i);
  stranded.sort((a, b) => depth[a] - depth[b]);
  for (const i of stranded.slice(0, 5)) {
    const acts: Act[] = [];
    for (let c = i; c > 0; c = parentIdx[c]) acts.push(parentAct[c]!);
    acts.reverse();
    let s = cloneRoot(puzzleRoomToGameState(parsed));
    for (const a of acts) s = apply(s, a);
    softlocks.push({
      path: acts.map(fmtAct).join(","),
      state: describeState(s),
      depth: depth[i],
    });
  }
  if (stranded.length > 5) {
    softlocks.push({ path: `(+${stranded.length - 5} more stranded states)`, state: "", depth: -1 });
  }

  return { seed, nodes: n, edges, winAdj: winAdjCount, capped, softlocks };
}

describe("softlock hunt seeds 70..77", () => {
  for (const seed of [70, 71, 72, 73, 74, 75, 76, 77]) {
    test(`seed ${seed}`, () => {
      const t0 = Date.now();
      const r = hunt(seed, 1_500_000);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(
        `SEED ${seed}: nodes=${r.nodes} edges=${r.edges} winAdj=${r.winAdj} capped=${r.capped} ` +
          `softlocks=${r.softlocks.length} (${secs}s)`
      );
      for (const sl of r.softlocks) {
        console.log(`  STRANDED depth=${sl.depth} path=[${sl.path}] ${sl.state}`);
      }
      expect(r.capped).toBe(false);
      expect(r.softlocks).toEqual([]);
    });
  }
});
