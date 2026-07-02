"use client";

/**
 * Animation sandbox v2 (ideation only) — rewritten from scratch.
 *
 * Prototypes the movement/animation feel before we port it to the real
 * TilemapGrid. No game code is imported. What it demonstrates:
 *
 *   1. Smooth movement  - hero pinned at viewport center; the world slides
 *      underneath (rAF tween) instead of snapping a tile at a time.
 *   2. Variable speed    - chained taps / holding a direction breaks into a run
 *      (faster cadence, bigger bounce).
 *   3. Step animation    - procedural walk cycle (bob + weight-shift tilt +
 *      squash) for single-pose sprites; the dog cycles its real frames.
 *   4. TURN-BASED PARITY - enemies/NPCs move exactly one tile per hero step,
 *      tweened over the same duration, like the real game's turn loop.
 *      Bumping a wall turns in place and does NOT consume a turn.
 *
 * Visuals match the game's tile rules (lifted from components/Tile.tsx +
 * lib/environment.ts, cave environment):
 *   - floor default  : /images/floor/floor-try-1.png
 *   - floor w/ wall above: /images/floor/floor-1000.png (baked top shadow)
 *   - wall tiles     : /images/wall/wall-{ESW pattern}.png (autotiled),
 *                      8px #1f1f1f bottom border when floor is below
 *   - floor w/ wall below: 33%-height "wall top" strip (bg-size 100% 300%)
 *   - trees          : tile-sized, image drawn 115% anchored to tile bottom
 *
 * All motion is imperative (refs + one rAF loop). The hero sprite image is set
 * imperatively too — v1 drove it through React state captured in a stale
 * closure, which is why the front-facing sprite never came back after turning.
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TILE = 40; // px per tile (matches the game)
const VIEW_TILES = 15; // 15 * 40 = 600px viewport (matches the game)
const VIEW = TILE * VIEW_TILES;
const MAP = 33; // map is MAP x MAP tiles
const START = Math.floor(MAP / 2);
const PLAZA = 5; // clear radius around spawn

// Tile ids (loosely matching the game: 0 floor, 1 wall, 6 tree)
const FLOOR = 0;
const WALL = 1;
const TREE = 6;

// Cave environment assets (same paths the game uses)
const FLOOR_DEFAULT = "/images/floor/floor-try-1.png";
const FLOOR_NORTH_EDGE = "/images/floor/floor-1000.png";
const WALL_PREFIX = "/images/wall/wall-";
const TREE_ASSETS = [
  "/images/trees/tree-1.png",
  "/images/trees/tree-2.png",
  "/images/trees/tree-3.png",
  "/images/trees/tree-4.png",
];
const FLOWERS = [
  "/images/flowers/flower-1.png",
  "/images/flowers/flower-3.png",
  "/images/flowers/flower-5.png",
  "/images/flowers/flowers-2.png",
];
const ROCKS = ["/images/items/rock-1.png", "/images/items/rock-2.png"];

// Pink goblin: ring effect stays on the ground, ringless goblin floats above.
const PINK_TILE: [number, number] = [START + 4, START + 4];
const PINK_GOBLIN = "/images/enemies/fire-goblin/pink-goblin-ringless-front.png";
const PINK_RING = "/images/enemies/fire-goblin/pink-ring-no-sparkle.png";

// White-goblin pack: offsets (px from tile center) for 4 overlaid singles.
const CLUSTER_OFFSETS: Array<[number, number]> = [
  [-8, 2],
  [7, 3],
  [-2, -3],
  [9, -1],
];
const CLUSTER_SCALE = 0.68;

type Facing = "front" | "back" | "left" | "right";
type Dir = "up" | "down" | "left" | "right";

const DIRS: Record<Dir, { dr: number; dc: number; facing: Facing }> = {
  up: { dr: -1, dc: 0, facing: "back" },
  down: { dr: 1, dc: 0, facing: "front" },
  left: { dr: 0, dc: -1, facing: "left" },
  right: { dr: 0, dc: 1, facing: "right" },
};

const KEY_TO_DIR: Record<string, Dir> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  W: "up",
  S: "down",
  A: "left",
  D: "right",
};

type Equip = "none" | "sword" | "shield" | "both";
const EQUIP_SUFFIX: Record<Equip, string> = {
  none: "",
  sword: "-sword",
  shield: "-shield",
  both: "-shield-sword",
};

// ---------------------------------------------------------------------------
// Sprite paths
// ---------------------------------------------------------------------------

function heroSrc(facing: Facing, equip: Equip): string {
  const dir = facing === "left" ? "right" : facing; // left = mirrored right
  return `/images/hero/hero-${dir}${EQUIP_SUFFIX[equip]}-static.png`;
}

// Dog: front has 4 real frames, back has 2 (vertical patrol only).
function dogSrc(facing: Facing, frame: number): string {
  if (facing === "back") return `/images/dog-golden/dog-back-${(frame % 2) + 1}.png`;
  return `/images/dog-golden/dog-front-${(frame % 4) + 1}.png`;
}

// White goblins: -1 is a SINGLE goblin (-2/-3/-4 are baked packs; unused here).
function whiteGoblinSrc(facing: Facing): string {
  const dir = facing === "left" ? "right" : facing;
  return `/images/enemies/fire-goblin/white-goblins-${dir}-1.png`;
}

function goblinSrc(color: "green" | "blue", facing: Facing): string {
  const dir = facing === "left" ? "right" : facing;
  return `/images/enemies/fire-goblin/${color}-goblin-${dir}.png`;
}

function snakeSrc(moving: boolean): string {
  return moving
    ? "/images/enemies/snake-moving-left.png" // faces left
    : "/images/enemies/snake-coiled-right.png"; // faces right
}

// ---------------------------------------------------------------------------
// Map generation (seeded — SSR and client render identically)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Decor {
  r: number;
  c: number;
  src: string;
  scale: number;
}

interface MapData {
  grid: number[][]; // FLOOR | WALL | TREE
  decor: Decor[];
  blocked: boolean[][];
}

function buildMap(): MapData {
  const rng = mulberry32(20260701);
  const grid: number[][] = Array.from({ length: MAP }, () =>
    Array.from({ length: MAP }, () => FLOOR)
  );

  const inPlaza = (r: number, c: number) =>
    Math.abs(r - START) <= PLAZA && Math.abs(c - START) <= PLAZA;

  // Border ring of walls.
  for (let i = 0; i < MAP; i++) {
    grid[0][i] = grid[MAP - 1][i] = WALL;
    grid[i][0] = grid[i][MAP - 1] = WALL;
  }

  // Interior wall runs (seed + extend right/down) so the autotile variants show.
  for (let r = 3; r < MAP - 3; r++) {
    for (let c = 3; c < MAP - 3; c++) {
      if (inPlaza(r, c)) continue;
      if (rng() < 0.045) {
        grid[r][c] = WALL;
        let len = 1 + Math.floor(rng() * 3); // run of 1-3 extra tiles
        const horiz = rng() < 0.65;
        let rr = r;
        let cc = c;
        while (len-- > 0) {
          if (horiz) cc++;
          else rr++;
          if (rr >= MAP - 3 || cc >= MAP - 3 || inPlaza(rr, cc)) break;
          grid[rr][cc] = WALL;
        }
      }
    }
  }

  // Trees (tile-based, like the game) outside the plaza.
  for (let r = 2; r < MAP - 2; r++) {
    for (let c = 2; c < MAP - 2; c++) {
      if (grid[r][c] !== FLOOR || inPlaza(r, c)) continue;
      if (rng() < 0.03) grid[r][c] = TREE;
    }
  }

  // Small decor: flowers + rocks on open floor.
  const decor: Decor[] = [];
  for (let r = 1; r < MAP - 1; r++) {
    for (let c = 1; c < MAP - 1; c++) {
      if (grid[r][c] !== FLOOR) continue;
      if (r === PINK_TILE[0] && c === PINK_TILE[1]) continue;
      const roll = rng();
      if (roll < 0.04) {
        decor.push({ r, c, src: FLOWERS[Math.floor(rng() * FLOWERS.length)], scale: 0.4 });
      } else if (roll < 0.055) {
        decor.push({ r, c, src: ROCKS[Math.floor(rng() * ROCKS.length)], scale: 0.55 });
      }
    }
  }

  const blocked = grid.map((row) => row.map((t) => t !== FLOOR));
  blocked[PINK_TILE[0]][PINK_TILE[1]] = true; // don't stand inside the pink goblin

  return { grid, decor, blocked };
}

// --- Game-faithful tile asset selection (from Tile.tsx / environment.ts) ----

const at = (grid: number[][], r: number, c: number): number =>
  r < 0 || c < 0 || r >= MAP || c >= MAP ? WALL : grid[r][c];

// Wall pattern from E/S/W wall neighbors (N ignored), exactly like the game.
function wallPattern(grid: number[][], r: number, c: number): string {
  const e = at(grid, r, c + 1) === WALL;
  const s = at(grid, r + 1, c) === WALL;
  const w = at(grid, r, c - 1) === WALL;
  const mask = (e ? 4 : 0) | (s ? 2 : 0) | (w ? 1 : 0);
  const table: Record<number, string> = {
    0b000: "0000",
    0b001: "0001",
    0b010: "0010",
    0b011: "0011",
    0b100: "0100",
    0b101: "0101",
    0b110: "0110",
    0b111: "0111",
  };
  return table[mask];
}

// "Wall top" strip pattern for a floor tile with a wall below (game logic).
function wallTopPattern(grid: number[][], r: number, c: number): string {
  const left = at(grid, r, c - 1) === WALL;
  const right = at(grid, r, c + 1) === WALL;
  if (!left && !right) return "0010";
  if (left && !right) return "0110";
  if (!left && right) return "0011";
  return "0111";
}

function floorAsset(grid: number[][], r: number, c: number): string {
  // floor-1000 (baked top shadow) only under WALLS. The game shades under any
  // non-floor (trees included), but a hard architectural shadow under a round
  // tree canopy reads wrong in this open field, so trees keep the plain floor.
  return at(grid, r - 1, c) === WALL ? FLOOR_NORTH_EDGE : FLOOR_DEFAULT;
}

function treeAsset(r: number, c: number): string {
  return TREE_ASSETS[Math.abs(r * 37 + c * 101) % TREE_ASSETS.length]; // game's picker
}

// ---------------------------------------------------------------------------
// Mobs — turn-based: they take one step when (and only when) the hero steps.
// ---------------------------------------------------------------------------

type MobKind = "dog" | "white-goblin" | "green-goblin" | "blue-goblin" | "snake";

interface MobDef {
  id: string;
  kind: MobKind;
  patrol: [number, number][]; // endpoints; walks one tile per turn between them
  scale: number; // some art fills its frame more than others
  cluster?: number;
  label: string;
}

const MOB_DEFS: MobDef[] = [
  {
    id: "dog",
    kind: "dog",
    patrol: [
      [START - 3, START + 3],
      [START + 3, START + 3],
    ],
    scale: 0.66,
    label: "Dog — real frames",
  },
  {
    id: "wgob",
    kind: "white-goblin",
    patrol: [
      [START + 3, START - 4],
      [START + 3, START],
    ],
    scale: 1,
    cluster: 4,
    label: "White goblins — 4 overlaid singles",
  },
  {
    id: "ggob",
    kind: "green-goblin",
    patrol: [
      [START - 4, START - 3],
      [START - 4, START + 1],
    ],
    scale: 1,
    label: "Green goblin — procedural",
  },
  {
    id: "bgob",
    kind: "blue-goblin",
    patrol: [
      [START - 2, START + 4],
      [START + 2, START + 4],
    ],
    scale: 1,
    label: "Blue goblin — procedural",
  },
  {
    id: "snake",
    kind: "snake",
    patrol: [
      [START + 4, START - 2],
      [START + 4, START + 2],
    ],
    scale: 0.7,
    label: "Snake — pose swap",
  },
];

interface MobRuntime {
  def: MobDef;
  r: number;
  c: number;
  fromR: number;
  fromC: number;
  toR: number;
  toC: number;
  stepStart: number;
  stepDur: number;
  stepping: boolean;
  linear: boolean; // tween easing for the current step (true while hero runs)
  facing: Facing;
  parity: number;
  patrolIdx: number; // index of the CURRENT target endpoint
  lastSrc: string;
  el: HTMLDivElement | null;
  flip: HTMLDivElement | null;
  sprite: HTMLDivElement | null;
  sprites: Array<HTMLDivElement | null>;
  shadow: HTMLDivElement | null;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

interface Settings {
  walkStepMs: number;
  runStepMs: number;
  runThreshold: number;
  decayMs: number;
  bobWalk: number;
  bobRun: number;
  tiltDeg: number;
  squash: number;
  frameFps: number;
  idleBob: boolean;
  equip: Equip;
}

// Defaults = the feel signed off in review.
const DEFAULTS: Settings = {
  walkStepMs: 270,
  runStepMs: 120,
  runThreshold: 1,
  decayMs: 150,
  bobWalk: 0.5,
  bobRun: 3,
  tiltDeg: 4,
  squash: 0.04,
  frameFps: 6,
  idleBob: true,
  equip: "none",
};

const easeInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TestAnimationPage() {
  const map = useMemo(buildMap, []);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [ready, setReady] = useState(false);

  const viewRef = useRef<HTMLDivElement | null>(null);
  const dimsRef = useRef({ w: VIEW, h: VIEW });
  const mapLayerRef = useRef<HTMLDivElement | null>(null);
  const heroFlipRef = useRef<HTMLDivElement | null>(null);
  const heroSpriteRef = useRef<HTMLDivElement | null>(null);
  const heroShadowRef = useRef<HTMLDivElement | null>(null);
  const hudRef = useRef<HTMLDivElement | null>(null);

  const hero = useRef({
    r: START,
    c: START,
    fromR: START,
    fromC: START,
    toR: START,
    toC: START,
    stepStart: 0,
    stepDur: DEFAULTS.walkStepMs,
    stepping: false,
    facing: "front" as Facing,
    lastSrc: "",
    parity: 0,
    chain: 0,
    running: false,
    lastStepEnd: 0,
    turns: 0,
  });

  const heldOrder = useRef<Dir[]>([]);
  const queued = useRef<Dir | null>(null);

  const mobs = useRef<MobRuntime[]>(
    MOB_DEFS.map((def) => ({
      def,
      r: def.patrol[0][0],
      c: def.patrol[0][1],
      fromR: def.patrol[0][0],
      fromC: def.patrol[0][1],
      toR: def.patrol[0][0],
      toC: def.patrol[0][1],
      stepStart: 0,
      stepDur: DEFAULTS.walkStepMs,
      stepping: false,
      linear: false,
      facing: "front" as Facing,
      parity: 0,
      patrolIdx: 1, // walk toward the far endpoint first
      lastSrc: "",
      el: null,
      flip: null,
      sprite: null,
      sprites: [],
      shadow: null,
    }))
  );

  const isBlocked = (r: number, c: number) => {
    if (r < 0 || c < 0 || r >= MAP || c >= MAP) return true;
    return map.blocked[r][c];
  };

  // ------------------------------------------------------------------ input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const dir = KEY_TO_DIR[e.key];
      if (!dir) return;
      e.preventDefault();
      if (e.repeat) return;
      queued.current = dir;
      heldOrder.current = heldOrder.current.filter((d) => d !== dir);
      heldOrder.current.push(dir);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const dir = KEY_TO_DIR[e.key];
      if (!dir) return;
      heldOrder.current = heldOrder.current.filter((d) => d !== dir);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const pressDir = (dir: Dir) => {
    queued.current = dir;
    heldOrder.current = heldOrder.current.filter((d) => d !== dir);
    heldOrder.current.push(dir);
  };
  const releaseDir = (dir: Dir) => {
    heldOrder.current = heldOrder.current.filter((d) => d !== dir);
  };

  // ------------------------------------------------------------- rAF loop
  useLayoutEffect(() => {
    let raf = 0;
    let lastHudAt = 0;
    let fpsEma = 60;
    let lastFrame = performance.now();

    const measure = () => {
      const el = viewRef.current;
      if (el) dimsRef.current = { w: el.clientWidth, h: el.clientHeight };
    };
    measure();
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro && viewRef.current) ro.observe(viewRef.current);

    // ---- turn advancement: every mob takes one tile-step with the hero ----
    const advanceMobTurn = (now: number, dur: number, linear: boolean) => {
      const h = hero.current;
      for (const m of mobs.current) {
        // Commit any in-flight step FIRST. When the hero runs, turns chain in the
        // same frame a step completes — before the mob tween section has run — so
        // without this the new step starts from the stale pre-step tile and the
        // mob visibly snaps backward and re-walks it.
        if (m.stepping) {
          m.r = m.toR;
          m.c = m.toC;
          m.stepping = false;
        }
        // One tile toward the current patrol endpoint; turn around at the end.
        let [tr, tc] = m.def.patrol[m.patrolIdx];
        if (m.r === tr && m.c === tc) {
          m.patrolIdx = (m.patrolIdx + 1) % m.def.patrol.length;
          [tr, tc] = m.def.patrol[m.patrolIdx];
        }
        let nr = m.r;
        let nc = m.c;
        if (m.r < tr) nr++;
        else if (m.r > tr) nr--;
        else if (m.c < tc) nc++;
        else if (m.c > tc) nc--;
        if (nr === m.r && nc === m.c) continue; // nowhere to go this turn
        const facing: Facing =
          nr < m.r ? "back" : nr > m.r ? "front" : nc > m.c ? "right" : "left";
        m.facing = facing;
        // Don't walk onto the hero's tile (current or destination) — face it instead.
        if ((nr === h.toR && nc === h.toC) || (nr === h.r && nc === h.c)) continue;
        m.fromR = m.r;
        m.fromC = m.c;
        m.toR = nr;
        m.toC = nc;
        m.stepStart = now;
        m.stepDur = dur;
        m.linear = linear; // easing captured at turn start, not read mid-tween
        m.stepping = true;
        m.parity ^= 1;
      }
    };

    const consumeDir = (): Dir | null => {
      if (queued.current) {
        const d = queued.current;
        queued.current = null;
        return d;
      }
      const held = heldOrder.current;
      return held.length ? held[held.length - 1] : null;
    };

    const startHeroStep = (now: number) => {
      const h = hero.current;
      if (h.stepping) return;
      const s = settingsRef.current;
      const dir = consumeDir();
      if (!dir) return;
      const info = DIRS[dir];
      h.facing = info.facing;
      const nr = h.r + info.dr;
      const nc = h.c + info.dc;
      if (isBlocked(nr, nc)) {
        // Face the wall; no turn consumed, no run momentum.
        h.chain = 0;
        h.running = false;
        return;
      }
      if (now - h.lastStepEnd <= s.decayMs) h.chain += 1;
      else h.chain = 1;
      h.running = h.chain > s.runThreshold;
      h.fromR = h.r;
      h.fromC = h.c;
      h.toR = nr;
      h.toC = nc;
      h.stepStart = now;
      h.stepDur = h.running ? s.runStepMs : s.walkStepMs;
      h.stepping = true;
      h.parity ^= 1;
      h.turns += 1;
      advanceMobTurn(now, h.stepDur, h.running); // THE turn: everyone moves with you
    };

    // Gait = bob + weight-shift tilt + squash; baseScale folds in art sizing.
    const computeGait = (
      progress: number,
      parity: number,
      moving: boolean,
      idlePhase: number,
      running: boolean,
      baseScale: number
    ): { transform: string; lift: number } => {
      const s = settingsRef.current;
      let lift = 0;
      let tilt = 0;
      let squashY = 1;
      let squashX = 1;
      if (moving) {
        const arc = Math.sin(Math.PI * progress);
        lift = (running ? s.bobRun : s.bobWalk) * arc;
        tilt = s.tiltDeg * (parity ? 1 : -1) * arc;
        squashY = 1 + s.squash * arc;
        squashX = 1 - s.squash * 0.5 * arc;
      } else if (s.idleBob) {
        const breathe = 0.5 - 0.5 * Math.cos(idlePhase);
        lift = 1.0 * breathe;
        squashY = 1 + 0.015 * breathe;
      }
      return {
        transform: `translateY(${-lift}px) rotate(${tilt}deg) scale(${squashX * baseScale}, ${squashY * baseScale})`,
        lift,
      };
    };

    const paintShadow = (el: HTMLDivElement | null, lift: number, base: number) => {
      if (!el) return;
      const shrink = clamp01(1 - lift * 0.03);
      el.style.transform = `translate(-50%, -50%) scale(${shrink})`;
      el.style.opacity = String(base * shrink);
    };

    const mobSpriteSrc = (
      m: MobRuntime,
      moving: boolean,
      now: number
    ): { src: string; flip: boolean } => {
      const s = settingsRef.current;
      const frame = Math.floor(now / (1000 / Math.max(1, s.frameFps)));
      switch (m.def.kind) {
        case "dog":
          return { src: dogSrc(m.facing, moving ? frame : 0), flip: false };
        case "white-goblin":
          return { src: whiteGoblinSrc(m.facing), flip: m.facing === "left" };
        case "green-goblin":
          return { src: goblinSrc("green", m.facing), flip: m.facing === "left" };
        case "blue-goblin":
          return { src: goblinSrc("blue", m.facing), flip: m.facing === "left" };
        case "snake":
          return moving
            ? { src: snakeSrc(true), flip: m.facing === "right" }
            : { src: snakeSrc(false), flip: m.facing === "left" };
      }
    };

    // Initial paint: positions + sprite images, independent of rAF (which is
    // paused while the tab is hidden).
    const paintInitial = () => {
      const d = dimsRef.current;
      if (mapLayerRef.current) {
        mapLayerRef.current.style.transform = `translate3d(${d.w / 2 - (START + 0.5) * TILE}px, ${d.h / 2 - (START + 0.5) * TILE}px, 0)`;
      }
      const now = performance.now();
      for (const m of mobs.current) {
        if (m.el) m.el.style.transform = `translate3d(${m.c * TILE}px, ${m.r * TILE}px, 0)`;
        const { src, flip } = mobSpriteSrc(m, false, now);
        m.lastSrc = src;
        const paint = (el: HTMLDivElement | null) => {
          if (el) el.style.backgroundImage = `url("${src}")`;
        };
        if (m.def.cluster) m.sprites.forEach(paint);
        else paint(m.sprite);
        if (m.flip) m.flip.style.transform = `scaleX(${flip ? -1 : 1})`;
      }
      const h = hero.current;
      h.lastSrc = heroSrc(h.facing, settingsRef.current.equip);
      if (heroSpriteRef.current) {
        heroSpriteRef.current.style.backgroundImage = `url("${h.lastSrc}")`;
      }
    };

    const frame = (now: number) => {
      const dt = now - lastFrame;
      lastFrame = now;
      fpsEma = fpsEma * 0.9 + (1000 / Math.max(1, dt)) * 0.1;
      const s = settingsRef.current;
      const h = hero.current;

      // ---- hero ----
      if (!h.stepping) {
        if (now - h.lastStepEnd > s.decayMs) {
          h.chain = 0;
          h.running = false;
        }
        startHeroStep(now);
      }

      let hr = h.r;
      let hc = h.c;
      let heroMoving = false;
      let heroProgress = 0;
      if (h.stepping) {
        const raw = clamp01((now - h.stepStart) / h.stepDur);
        heroProgress = raw;
        const e = h.running ? raw : easeInOut(raw); // linear run = seamless chaining
        hr = h.fromR + (h.toR - h.fromR) * e;
        hc = h.fromC + (h.toC - h.fromC) * e;
        heroMoving = true;
        if (raw >= 1) {
          h.r = h.toR;
          h.c = h.toC;
          h.stepping = false;
          h.lastStepEnd = now;
          hr = h.r;
          hc = h.c;
          heroMoving = false;
          startHeroStep(now); // chain instantly while a key is held
          if (h.stepping) {
            heroMoving = true;
            heroProgress = 0;
            hr = h.fromR;
            hc = h.fromC;
          }
        }
      }

      const d = dimsRef.current;
      if (mapLayerRef.current) {
        mapLayerRef.current.style.transform = `translate3d(${d.w / 2 - (hc + 0.5) * TILE}px, ${d.h / 2 - (hr + 0.5) * TILE}px, 0)`;
      }

      // Hero sprite: imperative image swap (no React state — see header note).
      const src = heroSrc(h.facing, s.equip);
      if (src !== h.lastSrc && heroSpriteRef.current) {
        heroSpriteRef.current.style.backgroundImage = `url("${src}")`;
        h.lastSrc = src;
      }
      if (heroFlipRef.current) {
        heroFlipRef.current.style.transform = `scaleX(${h.facing === "left" ? -1 : 1})`;
      }
      const hg = computeGait(heroProgress, h.parity, heroMoving, now / 900, h.running, 1);
      if (heroSpriteRef.current) heroSpriteRef.current.style.transform = hg.transform;
      paintShadow(heroShadowRef.current, hg.lift, 0.35);

      // ---- mobs (tween only; steps are started by advanceMobTurn) ----
      for (let i = 0; i < mobs.current.length; i++) {
        const m = mobs.current[i];
        let mr = m.r;
        let mc = m.c;
        let moving = false;
        let progress = 0;
        if (m.stepping) {
          const raw = clamp01((now - m.stepStart) / m.stepDur);
          progress = raw;
          const e = m.linear ? raw : easeInOut(raw); // easing fixed at turn start
          mr = m.fromR + (m.toR - m.fromR) * e;
          mc = m.fromC + (m.toC - m.fromC) * e;
          moving = true;
          if (raw >= 1) {
            m.r = m.toR;
            m.c = m.toC;
            m.stepping = false;
            mr = m.r;
            mc = m.c;
            moving = false;
          }
        }
        if (m.el) m.el.style.transform = `translate3d(${mc * TILE}px, ${mr * TILE}px, 0)`;

        const { src: mSrc, flip } = mobSpriteSrc(m, moving, now);
        const changed = mSrc !== m.lastSrc;
        if (changed) m.lastSrc = mSrc;
        if (m.def.cluster) {
          for (let k = 0; k < m.sprites.length; k++) {
            const el = m.sprites[k];
            if (!el) continue;
            if (changed) el.style.backgroundImage = `url("${mSrc}")`;
            const g = computeGait(progress, m.parity ^ (k & 1), moving, now / 900 + k * 0.8, false, 1);
            el.style.transform = g.transform;
            if (k === 0) paintShadow(m.shadow, g.lift, 0.3);
          }
        } else {
          if (changed && m.sprite) m.sprite.style.backgroundImage = `url("${mSrc}")`;
          const g = computeGait(progress, m.parity, moving, now / 900 + i, false, m.def.scale);
          if (m.sprite) m.sprite.style.transform = g.transform;
          paintShadow(m.shadow, g.lift, 0.3);
        }
        if (m.flip) m.flip.style.transform = `scaleX(${flip ? -1 : 1})`;
      }

      // ---- HUD ----
      if (now - lastHudAt > 120 && hudRef.current) {
        lastHudAt = now;
        hudRef.current.textContent =
          `${h.running ? "RUN" : heroMoving ? "WALK" : "IDLE"}  ` +
          `| facing ${h.facing}  | momentum ${h.chain}  | turn ${h.turns}  ` +
          `| ${Math.round(fpsEma)} fps`;
      }

      raf = requestAnimationFrame(frame);
    };

    paintInitial();
    setReady(true);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- render
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  // Static tile layer (rendered once; memoized with the map).
  const tileLayer = useMemo(() => {
    const cells: React.ReactNode[] = [];
    for (let r = 0; r < MAP; r++) {
      for (let c = 0; c < MAP; c++) {
        const t = map.grid[r][c];
        const base: React.CSSProperties = {
          position: "absolute",
          left: c * TILE,
          top: r * TILE,
          width: TILE,
          height: TILE,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        };
        if (t === WALL) {
          // NOTE: the game also draws an 8px #1f1f1f base border on walls above
          // floor (forced perspective). Without the game's FOV vignette dimming
          // everything, that flat strip reads as a weird detached black band, so
          // the sandbox skips it — the floor-1000 baked shadow below carries the
          // effect. Irrelevant to the port: the real game keeps its own Tile.tsx.
          cells.push(
            <div
              key={`t${r}-${c}`}
              style={{
                ...base,
                backgroundImage: `url("${WALL_PREFIX}${wallPattern(map.grid, r, c)}.png")`,
              }}
            />
          );
        } else {
          // FLOOR and TREE both draw the floor first (game does the same).
          const wallBelow = at(map.grid, r + 1, c) === WALL;
          cells.push(
            <div
              key={`t${r}-${c}`}
              style={{ ...base, backgroundImage: `url("${floorAsset(map.grid, r, c)}")` }}
            >
              {t === TREE && (
                <div
                  style={{
                    position: "absolute",
                    left: "-7.5%",
                    bottom: 0,
                    width: "115%",
                    height: "115%",
                    backgroundImage: `url("${treeAsset(r, c)}")`,
                    backgroundSize: "cover",
                    backgroundPosition: "center bottom",
                    imageRendering: "pixelated",
                    zIndex: 20, // above mobs, like the game (trees occlude characters)
                    pointerEvents: "none",
                  }}
                />
              )}
              {wallBelow && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: "33%",
                    backgroundImage: `url("${WALL_PREFIX}${wallTopPattern(map.grid, r, c)}.png")`,
                    backgroundPosition: "center top",
                    backgroundSize: "100% 300%", // top third of the wall image
                    zIndex: 30,
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
          );
        }
      }
    }
    return cells;
  }, [map]);

  return (
    <div style={styles.page}>
      <style>{floatCss}</style>
      <div style={styles.header}>
        <h1 style={styles.h1}>Animation Sandbox</h1>
        <p style={styles.sub}>
          Arrow keys / WASD or the pad. Chain taps (or hold) to run. Turn-based:
          every character moves one tile per hero step, in sync — bumping a wall
          only turns you and costs no turn.
        </p>
      </div>

      <div style={styles.stage}>
        <div style={styles.viewportWrap}>
          <div
            ref={viewRef}
            style={{ ...styles.viewport, opacity: ready ? 1 : 0 }}
            role="application"
            aria-label="animation preview"
          >
            <div ref={mapLayerRef} style={styles.mapLayer}>
              {tileLayer}

              {/* Decor (small, centered) */}
              {map.decor.map((p, i) => (
                <div
                  key={`d${i}`}
                  style={{
                    position: "absolute",
                    left: p.c * TILE + (TILE * (1 - p.scale)) / 2,
                    top: p.r * TILE + (TILE * (1 - p.scale)) / 2,
                    width: TILE * p.scale,
                    height: TILE * p.scale,
                    backgroundImage: `url("${p.src}")`,
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                    zIndex: 5,
                    pointerEvents: "none",
                  }}
                />
              ))}

              {/* Pink goblin scene: pulsing aura + ring on the ground, rising
                  sparkles (pink-realm style), ringless goblin floating above */}
              <div
                style={{
                  position: "absolute",
                  left: PINK_TILE[1] * TILE,
                  top: PINK_TILE[0] * TILE,
                  width: TILE,
                  height: TILE,
                  zIndex: 8,
                  pointerEvents: "none",
                }}
              >
                <div className="ta-aura" />
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: 0,
                    width: TILE * 1.05,
                    height: TILE * 1.05,
                    transform: "translateX(-50%)",
                    backgroundImage: `url("${PINK_RING}")`,
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "bottom center",
                  }}
                />
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <span
                    key={i}
                    className="ta-sparkle"
                    style={
                      {
                        left: `${24 + i * 10}%`,
                        ["--dx" as string]: `${(i % 2 ? 1 : -1) * (3 + i)}px`,
                        ["--rise" as string]: `${18 + (i % 3) * 8}px`,
                        animationDelay: `${i * 0.32}s`,
                      } as React.CSSProperties
                    }
                  />
                ))}
              </div>
              <div
                className="ta-float"
                style={{
                  position: "absolute",
                  left: PINK_TILE[1] * TILE + TILE * 0.075,
                  top: PINK_TILE[0] * TILE - TILE * 0.12, // hovers just above the ring
                  width: TILE * 0.85,
                  height: TILE * 0.85,
                  backgroundImage: `url("${PINK_GOBLIN}")`,
                  backgroundSize: "contain",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                  zIndex: 12,
                  pointerEvents: "none",
                }}
              />

              {/* Mobs */}
              {mobs.current.map((m) => (
                <div
                  key={m.def.id}
                  ref={(el) => {
                    m.el = el;
                  }}
                  style={styles.mobContainer}
                >
                  <div
                    ref={(el) => {
                      m.shadow = el;
                    }}
                    style={styles.shadow}
                  />
                  <div
                    ref={(el) => {
                      m.flip = el;
                    }}
                    style={styles.charBox}
                  >
                    {m.def.cluster ? (
                      CLUSTER_OFFSETS.slice(0, m.def.cluster).map((off, k) => (
                        <div
                          key={k}
                          style={{
                            position: "absolute",
                            inset: 0,
                            transform: `translate(${off[0]}px, ${off[1]}px) scale(${CLUSTER_SCALE})`,
                            transformOrigin: "50% 100%",
                            // Painter's order by vertical offset: goblins higher on
                            // screen sit BEHIND lower ones, so the pack reads as a
                            // crowd instead of the back ones floating on top.
                            zIndex: 10 + off[1],
                          }}
                        >
                          <div
                            ref={(el) => {
                              m.sprites[k] = el;
                            }}
                            style={styles.charSprite}
                          />
                        </div>
                      ))
                    ) : (
                      <div
                        ref={(el) => {
                          m.sprite = el;
                        }}
                        style={styles.charSprite}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Hero: pinned at center; world slides beneath */}
            <div style={styles.heroAnchor}>
              <div ref={heroShadowRef} style={styles.shadow} />
              <div ref={heroFlipRef} style={styles.charBox}>
                <div ref={heroSpriteRef} style={styles.charSprite} />
              </div>
            </div>

            <div ref={hudRef} style={styles.hud}>
              IDLE
            </div>
          </div>

          <DPad onPress={pressDir} onRelease={releaseDir} />
        </div>

        <div style={styles.panel}>
          <PanelSection title="Speed">
            <Slider label="Walk step" unit="ms" min={120} max={400} step={10}
              value={settings.walkStepMs} onChange={(v) => set("walkStepMs", v)} />
            <Slider label="Run step" unit="ms" min={60} max={240} step={5}
              value={settings.runStepMs} onChange={(v) => set("runStepMs", v)} />
            <Slider label="Run after N steps" unit="" min={1} max={5} step={1}
              value={settings.runThreshold} onChange={(v) => set("runThreshold", v)} />
            <Slider label="Momentum decay" unit="ms" min={100} max={700} step={10}
              value={settings.decayMs} onChange={(v) => set("decayMs", v)} />
          </PanelSection>

          <PanelSection title="Step animation">
            <Slider label="Bob (walk)" unit="px" min={0} max={12} step={0.5}
              value={settings.bobWalk} onChange={(v) => set("bobWalk", v)} />
            <Slider label="Bob (run)" unit="px" min={0} max={20} step={0.5}
              value={settings.bobRun} onChange={(v) => set("bobRun", v)} />
            <Slider label="Weight-shift tilt" unit="°" min={0} max={14} step={0.5}
              value={settings.tiltDeg} onChange={(v) => set("tiltDeg", v)} />
            <Slider label="Squash / stretch" unit="" min={0} max={0.2} step={0.005}
              value={settings.squash} onChange={(v) => set("squash", v)} />
            <Slider label="Dog frame rate" unit="fps" min={3} max={16} step={1}
              value={settings.frameFps} onChange={(v) => set("frameFps", v)} />
          </PanelSection>

          <PanelSection title="Options">
            <label style={styles.row}>
              <span>Hero gear</span>
              <select
                value={settings.equip}
                onChange={(e) => set("equip", e.target.value as Equip)}
                style={styles.select}
              >
                <option value="none">none</option>
                <option value="sword">sword</option>
                <option value="shield">shield</option>
                <option value="both">sword + shield</option>
              </select>
            </label>
            <Toggle label="Idle breathing" checked={settings.idleBob}
              onChange={(v) => set("idleBob", v)} />
            <button style={styles.reset} onClick={() => setSettings(DEFAULTS)}>
              Reset to defaults
            </button>
          </PanelSection>

          <div style={styles.legend}>
            {MOB_DEFS.map((m) => (
              <div key={m.id} style={styles.legendRow}>
                <span style={legendDot(m.kind === "dog")} />
                {m.label}
              </div>
            ))}
            <div style={styles.legendRow}>
              <span style={legendDot(false)} />
              Pink goblin — floats over its ring (placeholder cut asset)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const floatCss = `
@keyframes ta-float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-4px); }
}
@keyframes ta-aura {
  0%, 100% { opacity: 0.25; transform: translate(-50%, 0) scale(1); }
  50%      { opacity: 0.5;  transform: translate(-50%, 0) scale(1.15); }
}
@keyframes ta-sparkle {
  0%   { opacity: 0; transform: translate(-50%, 0) scale(0.2); }
  25%  { opacity: 1; }
  100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-1 * var(--rise))) scale(1); }
}
.ta-float { animation: ta-float 1.8s ease-in-out infinite; }
.ta-aura {
  position: absolute;
  left: 50%;
  bottom: 2px;
  width: ${TILE * 1.1}px;
  height: ${TILE * 0.5}px;
  background: radial-gradient(ellipse at center, rgba(255,120,200,0.5) 0%, rgba(255,120,200,0) 68%);
  animation: ta-aura 2.2s ease-in-out infinite;
}
.ta-sparkle {
  position: absolute;
  bottom: 8px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: radial-gradient(circle, #ffd9f0 0%, #ff86cf 60%, rgba(255,134,207,0) 100%);
  animation: ta-sparkle 1.9s ease-out infinite;
}
`;

// ---------------------------------------------------------------------------
// UI bits
// ---------------------------------------------------------------------------

function DPad({
  onPress,
  onRelease,
}: {
  onPress: (d: Dir) => void;
  onRelease: (d: Dir) => void;
}) {
  const btn = (d: Dir, label: string, gridArea: string) => (
    <button
      style={{ ...styles.dpadBtn, gridArea }}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress(d);
      }}
      onPointerUp={() => onRelease(d)}
      onPointerLeave={() => onRelease(d)}
      onPointerCancel={() => onRelease(d)}
      aria-label={d}
    >
      {label}
    </button>
  );
  return (
    <div style={styles.dpad}>
      {btn("up", "▲", "up")}
      {btn("left", "◀", "left")}
      {btn("down", "▼", "down")}
      {btn("right", "▶", "right")}
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

function Slider({
  label,
  unit,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label style={styles.sliderRow}>
      <span style={styles.sliderLabel}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={styles.range}
      />
      <span style={styles.sliderVal}>
        {value}
        {unit}
      </span>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={styles.row}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function legendDot(frames: boolean): React.CSSProperties {
  return {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: frames ? "#7fd1a0" : "#d19a7f",
    flexShrink: 0,
  };
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at 50% 0%, #1a1420 0%, #0b0910 70%)",
    color: "#e8e2d8",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    padding: "24px 16px 64px",
    boxSizing: "border-box",
  },
  header: { textAlign: "center", marginBottom: 20 },
  h1: { fontSize: 26, margin: 0, letterSpacing: 0.5, fontWeight: 700 },
  sub: { maxWidth: 640, margin: "8px auto 0", fontSize: 13, lineHeight: 1.5, opacity: 0.75 },
  stage: {
    display: "flex",
    gap: 24,
    justifyContent: "center",
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  viewportWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16 },
  viewport: {
    position: "relative",
    width: `min(${VIEW}px, 94vw)`,
    aspectRatio: "1 / 1",
    overflow: "hidden",
    borderRadius: 12,
    boxShadow: "0 12px 40px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.05)",
    background: "#0d0b12",
    transition: "opacity 300ms ease",
    touchAction: "none",
  },
  mapLayer: {
    position: "absolute",
    left: 0,
    top: 0,
    width: MAP * TILE,
    height: MAP * TILE,
    willChange: "transform",
  },
  heroAnchor: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: TILE,
    height: TILE,
    marginLeft: -TILE / 2,
    marginTop: -TILE / 2,
    zIndex: 50,
    pointerEvents: "none",
  },
  mobContainer: {
    position: "absolute",
    left: 0,
    top: 0,
    width: TILE,
    height: TILE,
    zIndex: 10,
    willChange: "transform",
  },
  charBox: { position: "absolute", inset: 0, transformOrigin: "50% 100%", willChange: "transform" },
  charSprite: {
    position: "absolute",
    inset: 0,
    backgroundSize: "contain",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
    transformOrigin: "50% 50%",
  },
  shadow: {
    position: "absolute",
    left: "50%",
    top: "72%",
    width: TILE * 0.46,
    height: TILE * 0.14,
    transform: "translate(-50%, -50%)",
    background: "radial-gradient(ellipse at center, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 70%)",
    borderRadius: "50%",
    opacity: 0.3,
    pointerEvents: "none",
  },
  hud: {
    position: "absolute",
    left: 10,
    top: 10,
    padding: "6px 10px",
    fontSize: 12,
    fontFamily: "ui-monospace, monospace",
    background: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    letterSpacing: 0.4,
    color: "#ffe9a8",
    zIndex: 100,
  },
  dpad: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 52px)",
    gridTemplateRows: "repeat(2, 52px)",
    gridTemplateAreas: `". up ." "left down right"`,
    gap: 6,
    userSelect: "none",
  },
  dpadBtn: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#e8e2d8",
    borderRadius: 10,
    fontSize: 18,
    cursor: "pointer",
    touchAction: "none",
  },
  panel: {
    width: 320,
    maxWidth: "94vw",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  section: { display: "flex", flexDirection: "column", gap: 8 },
  sectionTitle: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    opacity: 0.55,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    paddingBottom: 4,
  },
  sliderRow: {
    display: "grid",
    gridTemplateColumns: "110px 1fr 52px",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
  },
  sliderLabel: { opacity: 0.85 },
  range: { width: "100%" },
  sliderVal: { textAlign: "right", fontFamily: "ui-monospace, monospace", opacity: 0.8 },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, gap: 8 },
  select: {
    background: "#1a1620",
    color: "#e8e2d8",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 6,
    padding: "3px 6px",
  },
  reset: {
    marginTop: 4,
    background: "rgba(255,233,168,0.12)",
    border: "1px solid rgba(255,233,168,0.3)",
    color: "#ffe9a8",
    borderRadius: 8,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 12,
  },
  legend: { display: "flex", flexDirection: "column", gap: 6, fontSize: 11, opacity: 0.8 },
  legendRow: { display: "flex", alignItems: "center", gap: 8 },
};
