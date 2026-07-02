// Centralized enemy registry: assets and behaviors
import { canSee } from "../line_of_sight";
import { TileSubtype } from "../map/constants";
import { orderPursuitSteps } from "./pursuit";
export type EnemyKind = "fire-goblin" | "water-goblin" | "water-goblin-spear" | "earth-goblin" | "earth-goblin-knives" | "pink-goblin" | "ghost" | "stone-goblin" | "snake" | "white-goblin";

export type Facing = "front" | "left" | "right" | "back";

// Contexts passed into behavior hooks; engine will wire these later
export interface BehaviorContext {
  // grid and entities
  grid: number[][];
  subtypes?: number[][][]; // tile subtypes for placing/removing objects (e.g., pink ring)
  enemies: Array<{ y: number; x: number; kind: EnemyKind; health: number; behaviorMemory?: Record<string, unknown> }>;
  enemyIndex: number; // index into enemies array for this enemy
  player: { y: number; x: number; torchLit: boolean };
  ghosts?: Array<{ y: number; x: number }>;
  // Pink-mist tiles for the current tick (pink realm only). Lets mist-aware behaviors
  // (e.g. pink goblins fleeing the haze) see where the mist is. Absent outside the realm.
  mist?: Array<[number, number]>;
  // utilities
  rng?: () => number;
  // actions
  setPlayerTorchLit?: (lit: boolean) => void;
  // current enemy snapshot with a mutable memory bag persisted by engine
  enemy: {
    y: number;
    x: number;
    facing: "UP" | "RIGHT" | "DOWN" | "LEFT";
    memory: Record<string, unknown>;
    attack: number;
  };
}

export interface BehaviorHooks {
  // Called each enemy tick; can mutate context data or return side-effects
  onTick?: (ctx: BehaviorContext) => void;
  // Called when player is adjacent/nearby; e.g., ghost snuffs torch
  onProximity?: (ctx: BehaviorContext) => void;
  // Called when enemy takes a hit
  onHit?: (ctx: BehaviorContext & { damage: number }) => void;
  // Called when enemy dies
  onDeath?: (ctx: BehaviorContext) => void;
  // Called when spawning/assignment finishes
  onSpawn?: (ctx: BehaviorContext) => void;
  // Movement decision; return next [dy, dx] or null to use default
  decideMove?: (ctx: BehaviorContext) => [number, number] | null;
  // Full custom per-tick update. Should mutate ctx.enemy.{y,x,facing,memory} and return contact damage dealt this tick (0 if none).
  customUpdate?: (ctx: BehaviorContext) => number;
}

export interface EnemyConfig {
  kind: EnemyKind;
  displayName: string;
  assets: Partial<Record<Facing, string>> & { front: string };
  base: { health: number; attack: number };
  // Desired per-level count bounds used by assignment logic
  desiredMinCount?: number;
  desiredMaxCount?: number;
  // Compute melee damage dealt by hero to this enemy
  calcMeleeDamage: (ctx: {
    heroAttack: number;
    swordBonus: number;
    variance: number; // already discretized to -1/0/1 when used
  }) => number;
  // Optional behavior hooks implemented by specific kinds
  behavior?: BehaviorHooks;
}

const clampMin = (n: number, min = 0) => (n < min ? min : n);

export const EnemyRegistry: Record<EnemyKind, EnemyConfig> = {
  "fire-goblin": {
    kind: "fire-goblin",
    displayName: "Fire Goblin",
    assets: {
      front: "/images/enemies/fire-goblin/fire-goblin-front.png",
      left: "/images/enemies/fire-goblin/fire-goblin-right.png", // mirror right for left
      right: "/images/enemies/fire-goblin/fire-goblin-right.png",
      back: "/images/enemies/fire-goblin/fire-goblin-back.png",
    },
    desiredMinCount: 2,
    desiredMaxCount: 3,
    base: { health: 4, attack: 1 },
    calcMeleeDamage: ({ heroAttack, swordBonus, variance }) =>
      clampMin(heroAttack + swordBonus + variance),
    behavior: {},
  },
  "water-goblin": {
    kind: "water-goblin",
    displayName: "Water Goblin",
    assets: {
      front: "/images/enemies/fire-goblin/blue-goblin-front.png",
      left: "/images/enemies/fire-goblin/blue-goblin-right.png", // mirror right for left
      right: "/images/enemies/fire-goblin/blue-goblin-right.png",
      back: "/images/enemies/fire-goblin/blue-goblin-back.png",
    },
    desiredMinCount: 1,
    desiredMaxCount: 2,
    base: { health: 5, attack: 1 },
    calcMeleeDamage: ({ heroAttack, swordBonus, variance }) =>
      clampMin(heroAttack + swordBonus + variance),
    behavior: {},
  },
  "water-goblin-spear": {
    kind: "water-goblin-spear",
    displayName: "Water Goblin Spearman",
    assets: {
      front: "/images/enemies/fire-goblin/blue-goblin-front-spear.png",
      left: "/images/enemies/fire-goblin/blue-goblin-right-spear.png", // mirror right for left
      right: "/images/enemies/fire-goblin/blue-goblin-right-spear.png",
      back: "/images/enemies/fire-goblin/blue-goblin-back-spear.png",
    },
    desiredMinCount: 0,
    desiredMaxCount: 1,
    base: { health: 5, attack: 3 },
    calcMeleeDamage: ({ heroAttack, swordBonus, variance }) =>
      clampMin(heroAttack + swordBonus + variance),
    behavior: {},
  },
  "earth-goblin": {
    kind: "earth-goblin",
    displayName: "Earth Goblin",
    assets: {
      front: "/images/enemies/fire-goblin/brown-goblin-front.png",
      left: "/images/enemies/fire-goblin/brown-goblin-right.png",
      right: "/images/enemies/fire-goblin/brown-goblin-right.png",
      back: "/images/enemies/fire-goblin/brown-goblin-back.png",
    },
    desiredMinCount: 1,
    desiredMaxCount: 2,
    base: { health: 3, attack: 1 },
    calcMeleeDamage: ({ heroAttack, swordBonus, variance }) =>
      clampMin(heroAttack + swordBonus + variance),
    behavior: {},
  },
  "earth-goblin-knives": {
    kind: "earth-goblin-knives",
    displayName: "Earth Goblin Knifesman",
    assets: {
      front: "/images/enemies/fire-goblin/brown-goblin-front-knives.png",
      left: "/images/enemies/fire-goblin/brown-goblin-right-knives.png",
      right: "/images/enemies/fire-goblin/brown-goblin-right-knives.png",
      back: "/images/enemies/fire-goblin/brown-goblin-back-knives.png",
    },
    desiredMinCount: 0,
    desiredMaxCount: 1,
    base: { health: 3, attack: 2 },
    calcMeleeDamage: ({ heroAttack, swordBonus, variance }) =>
      clampMin(heroAttack + swordBonus + variance),
    behavior: {},
  },
  "pink-goblin": {
    kind: "pink-goblin",
    displayName: "Pink Goblin",
    assets: {
      // Ringless art: the goblin and its teleport ring are separate entities
      // now — the ring renders as its own tile subtype with CSS sparkles.
      front: "/images/enemies/fire-goblin/pink-goblin-ringless-front.png",
      left: "/images/enemies/fire-goblin/pink-goblin-ringless-left.png",
      right: "/images/enemies/fire-goblin/pink-goblin-ringless-left.png",
      back: "/images/enemies/fire-goblin/pink-goblin-ringless-back.png",
    },
    desiredMinCount: 0,
    desiredMaxCount: 1,
    base: { health: 4, attack: 1 },
    calcMeleeDamage: ({ heroAttack, swordBonus, variance }) =>
      clampMin(heroAttack + swordBonus + variance),
    behavior: {
      customUpdate: (ctx) => {
        const grid = ctx.grid;
        const subtypes = ctx.subtypes;
        const e = ctx.enemy;
        const py = ctx.player.y;
        const px = ctx.player.x;
        const rng = ctx.rng ?? Math.random;
        const H = grid.length;
        const W = grid[0]?.length ?? 0;
        const isIn = (y: number, x: number) => y >= 0 && y < H && x >= 0 && x < W;
        const isFloor = (y: number, x: number) => isIn(y, x) && grid[y][x] === 0;
        const manhattan = Math.abs(e.y - py) + Math.abs(e.x - px);

        // Memory keys: aware, ringY, ringX, ringOrigSubs (saved subtypes), ringAge (turns
        // since ring placed), lastHealth/stunned (hit-reaction defensive mode)
        const mem = e.memory as {
          aware?: boolean;
          ringY?: number;
          ringX?: number;
          ringOrigSubs?: number[];
          ringAge?: number;
          lastHealth?: number;
          stunned?: boolean;
        };

        // Taking a hit breaks the goblin's concentration: compare health against last
        // tick's snapshot — a drop means the hero connected (rock or melee). From then
        // on it is "stunned": it can never teleport again, and it either swipes at an
        // adjacent hero or keeps backing away (branch below, dungeon variant only).
        // ctx.enemy omits health, so read it off the enemies array by index.
        const selfHealth = ctx.enemies[ctx.enemyIndex]?.health;
        if (
          typeof selfHealth === "number" &&
          typeof mem.lastHealth === "number" &&
          selfHealth < mem.lastHealth
        ) {
          mem.stunned = true;
          mem.aware = true;
        }
        if (typeof selfHealth === "number") mem.lastHealth = selfHealth;

        // --- Pink mist (realm only): if standing in the haze the goblin is disoriented.
        // It can only shuffle ONE tile toward the nearest clear tile and cannot attack;
        // getting out is its only goal while inside. This is a purely positional check each
        // tick — it has no memory of the mist once clear, and the pursuit/leap logic below
        // never avoids the mist, so it can blunder back in on its own.
        if (
          (mem as Record<string, unknown>).ninja === true &&
          Array.isArray(ctx.mist) &&
          ctx.mist.length > 0
        ) {
          const mk = (y: number, x: number) => y * 10000 + x;
          const mistSet = new Set(ctx.mist.map(([my, mx]) => mk(my, mx)));
          if (mistSet.has(mk(e.y, e.x))) {
            const occupied = new Set<number>();
            for (let k = 0; k < ctx.enemies.length; k++) {
              if (k === ctx.enemyIndex) continue;
              occupied.add(mk(ctx.enemies[k].y, ctx.enemies[k].x));
            }
            const startY = e.y, startX = e.x;
            const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            const walkableFirst = (y: number, x: number) =>
              isFloor(y, x) && !(y === py && x === px) && !occupied.has(mk(y, x));
            // BFS outward through mist-covered floor to the nearest clear tile; take the
            // first step toward it (one tile this turn).
            const visited = new Set<number>([mk(startY, startX)]);
            const queue: Array<[number, number, number, number]> = [];
            for (const [dy, dx] of dirs) {
              const ny = startY + dy, nx = startX + dx;
              if (!walkableFirst(ny, nx)) continue;
              visited.add(mk(ny, nx));
              queue.push([ny, nx, ny, nx]);
            }
            while (queue.length > 0) {
              const [cy, cx, fy, fx] = queue.shift()!;
              if (!mistSet.has(mk(cy, cx))) {
                e.y = fy; e.x = fx; e.memory.moved = true;
                const sdy = fy - startY, sdx = fx - startX;
                e.facing = sdx !== 0 ? (sdx > 0 ? "RIGHT" : "LEFT") : (sdy > 0 ? "DOWN" : "UP");
                break;
              }
              for (const [dy, dx] of dirs) {
                const ny = cy + dy, nx = cx + dx;
                const kk = mk(ny, nx);
                if (visited.has(kk) || !isFloor(ny, nx)) continue;
                visited.add(kk);
                queue.push([ny, nx, fy, fx]);
              }
            }
            return 0; // disoriented: no attack while in the mist, even if it couldn't move
          }
        }

        // Becomes aware when player is within range 8 (regardless of LOS — it can sense nearby presence)
        // LOS is only required for ranged attacks, not for awareness/teleport logic
        const withinSenseRange = manhattan <= 8;
        const playerSees = withinSenseRange && canSee(grid, [e.y, e.x], [py, px]);
        if (withinSenseRange && !mem.aware) {
          mem.aware = true;
        }

        // Not yet aware — wander randomly
        if (!mem.aware) {
          const dirs: Array<[number, number, "UP"|"RIGHT"|"DOWN"|"LEFT"]> = [
            [-1, 0, "UP"], [1, 0, "DOWN"], [0, -1, "LEFT"], [0, 1, "RIGHT"],
          ];
          for (let i = dirs.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
          }
          for (const [dy, dx, face] of dirs) {
            const ny = e.y + dy;
            const nx = e.x + dx;
            if (isFloor(ny, nx)) {
              e.y = ny;
              e.x = nx;
              e.facing = face;
              e.memory.moved = true;
              break;
            }
          }
          return 0;
        }

        // --- Aware ---

        // Helper: find walkable floor tiles within a distance range from a point
        const findEligibleTiles = (
          fromY: number, fromX: number, minDist: number, maxDist: number
        ): Array<[number, number]> => {
          const tiles: Array<[number, number]> = [];
          for (let y = Math.max(0, fromY - maxDist); y <= Math.min(H - 1, fromY + maxDist); y++) {
            for (let x = Math.max(0, fromX - maxDist); x <= Math.min(W - 1, fromX + maxDist); x++) {
              const d = Math.abs(y - fromY) + Math.abs(x - fromX);
              if (d >= minDist && d <= maxDist && isFloor(y, x)) {
                const subs = subtypes?.[y]?.[x] ?? [];
                const hasImportant = subs.length > 0 && !subs.every(s => s === TileSubtype.NONE || s === TileSubtype.FAULTY_FLOOR);
                if (!hasImportant) tiles.push([y, x]);
              }
            }
          }
          return tiles;
        };

        // Helper: remove THIS goblin's own ring, restoring the tile's original subtypes.
        // Scoped to mem.ringY/ringX only — no blanket sweep, which would also erase other
        // pink goblins' rings or a bomb-dropped portal left for the player.
        const removeRing = () => {
          if (
            subtypes &&
            typeof mem.ringY === "number" &&
            typeof mem.ringX === "number"
          ) {
            const orig = mem.ringOrigSubs ?? [];
            subtypes[mem.ringY][mem.ringX] = orig.length > 0 ? [...orig] : [TileSubtype.NONE];
          }
          delete mem.ringY;
          delete mem.ringX;
          delete mem.ringOrigSubs;
        };

        // Helper: place ring at a tile (removes any existing rings first, saves original subtypes)
        const placeRing = (ry: number, rx: number) => {
          if (!subtypes) return;
          removeRing();
          const subs = subtypes[ry]?.[rx];
          if (!subs) return;
          mem.ringOrigSubs = [...subs];
          subtypes[ry][rx] = [TileSubtype.PINK_RING];
          mem.ringY = ry;
          mem.ringX = rx;
        };

        // Helper: face toward player
        const facePlayer = () => {
          const dy = py - e.y;
          const dx = px - e.x;
          if (Math.abs(dx) >= Math.abs(dy)) {
            e.facing = dx > 0 ? "RIGHT" : (dx < 0 ? "LEFT" : e.facing);
          } else {
            e.facing = dy > 0 ? "DOWN" : (dy < 0 ? "UP" : e.facing);
          }
        };

        // Helper: take one greedy step toward player
        const stepToward = () => {
          const dy = py - e.y;
          const dx = px - e.x;
          facePlayer();
          // Bias toward the larger-gap axis but keep it unpredictable, so the
          // pink goblin's approach can't be read as easily as before.
          const tryMoves = orderPursuitSteps(dy, dx, rng);
          for (const [my, mx] of tryMoves) {
            const ny = e.y + my;
            const nx = e.x + mx;
            if (ny === py && nx === px) continue; // don't step onto player
            if (isFloor(ny, nx)) {
              if (mx !== 0) e.facing = mx > 0 ? "RIGHT" : "LEFT";
              else if (my !== 0) e.facing = my > 0 ? "DOWN" : "UP";
              e.y = ny;
              e.x = nx;
              e.memory.moved = true;
              return;
            }
          }
        };

        // Helper: take one step to reach ideal distance (4-5) from player
        const stepToIdealDistance = () => {
          const dy = py - e.y;
          const dx = px - e.x;
          // If too close (< 4), move away; if too far (> 5), move closer
          const awayY = dy === 0 ? 0 : dy > 0 ? -1 : 1;
          const awayX = dx === 0 ? 0 : dx > 0 ? -1 : 1;
          const towardY = -awayY;
          const towardX = -awayX;
          const [dirY, dirX] = manhattan < 4 ? [awayY, awayX] : [towardY, towardX];
          const tryMoves: Array<[number, number]> = [];
          if (dirX !== 0) tryMoves.push([0, dirX]);
          if (dirY !== 0) tryMoves.push([dirY, 0]);
          for (const [my, mx] of tryMoves) {
            const ny = e.y + my;
            const nx = e.x + mx;
            if (ny === py && nx === px) continue;
            if (isFloor(ny, nx)) {
              if (mx !== 0) e.facing = mx > 0 ? "RIGHT" : "LEFT";
              else if (my !== 0) e.facing = my > 0 ? "DOWN" : "UP";
              e.y = ny;
              e.x = nx;
              e.memory.moved = true;
              return;
            }
          }
        };

        // Ranged attack damage by manhattan distance
        const rangedDamage = (dist: number): number => {
          if (dist <= 1) return 1;
          if (dist <= 3) return 2;
          if (dist <= 5) return 1;
          return 0;
        };

        const hasLOS = canSee(grid, [e.y, e.x], [py, px]);
        const hasRing = typeof mem.ringY === "number" && typeof mem.ringX === "number";

        // --- Pink-realm "ninja" variant (tagged at spawn via behaviorMemory.ninja) ---
        // A fast hit-and-run skirmisher: slides several tiles to close the gap, strikes
        // hard, then blinks far away (no ring needed in the realm). Branches out before the
        // dungeon-only ring/teleport logic below, so ordinary pink goblins are unchanged.
        if ((mem as Record<string, unknown>).ninja === true) {
          const NINJA_MELEE = 4; // -> ~3-5 after the engine's +/-1 variance, then capped
          const SLIDE_MIN = 3;
          const FLEE_MIN = 6, FLEE_MAX = 12; // where it reappears after a strike
          const AMBUSH_MIN = 1, AMBUSH_MAX = 2; // occasional blink-in near the hero

          // Valid landing spot: in-bounds floor, not the player, not another enemy's
          // start-of-tick tile (the engine reverts moves onto an occupied tile), and free
          // of important overlays (chest/key/ring/berry, etc).
          const tileFree = (y: number, x: number): boolean => {
            if (!isFloor(y, x)) return false;
            if (y === py && x === px) return false;
            for (let k = 0; k < ctx.enemies.length; k++) {
              if (k === ctx.enemyIndex) continue;
              if (ctx.enemies[k].y === y && ctx.enemies[k].x === x) return false;
            }
            const subs = subtypes?.[y]?.[x] ?? [];
            const hasImportant =
              subs.length > 0 &&
              !subs.every((s) => s === TileSubtype.NONE || s === TileSubtype.FAULTY_FLOOR);
            return !hasImportant;
          };

          // Teleport to a random free tile within [minD,maxD] of the hero. Returns success.
          const blinkTo = (minD: number, maxD: number): boolean => {
            const elig = findEligibleTiles(py, px, minD, maxD).filter(([y, x]) => tileFree(y, x));
            if (elig.length === 0) return false;
            const [ty, tx] = elig[Math.floor(rng() * elig.length)];
            e.y = ty;
            e.x = tx;
            e.memory.moved = true;
            facePlayer();
            return true;
          };

          // Slide up to maxTiles steps toward the hero, stopping at a wall, the hero, or a
          // blocked tile. Picks the dominant axis each step with a one-axis sidestep fallback.
          const slide = (maxTiles: number): void => {
            facePlayer();
            for (let step = 0; step < maxTiles; step++) {
              const dy = py - e.y;
              const dx = px - e.x;
              if (Math.abs(dy) + Math.abs(dx) <= 1) break; // adjacent — stop, strike next turn
              let sy = 0, sx = 0;
              if (Math.abs(dx) >= Math.abs(dy)) sx = dx > 0 ? 1 : -1;
              else sy = dy > 0 ? 1 : -1;
              let ny = e.y + sy, nx = e.x + sx;
              if (!(ny === py && nx === px) && tileFree(ny, nx)) {
                e.y = ny; e.x = nx; e.memory.moved = true;
                e.facing = sx !== 0 ? (sx > 0 ? "RIGHT" : "LEFT") : sy > 0 ? "DOWN" : "UP";
                continue;
              }
              // Dominant axis blocked — try the other axis once.
              let ay = 0, ax = 0;
              if (sx !== 0 && dy !== 0) ay = dy > 0 ? 1 : -1;
              else if (sy !== 0 && dx !== 0) ax = dx > 0 ? 1 : -1;
              ny = e.y + ay; nx = e.x + ax;
              if ((ay !== 0 || ax !== 0) && !(ny === py && nx === px) && tileFree(ny, nx)) {
                e.y = ny; e.x = nx; e.memory.moved = true;
                e.facing = ax !== 0 ? (ax > 0 ? "RIGHT" : "LEFT") : ay > 0 ? "DOWN" : "UP";
                continue;
              }
              break; // fully blocked
            }
          };

          facePlayer();
          if (manhattan === 1) {
            // Hit and run: strike, then vanish far across the realm.
            blinkTo(FLEE_MIN, FLEE_MAX);
            return NINJA_MELEE;
          }
          // Occasionally blink in close for an ambush; otherwise slide in fast.
          if (rng() < 0.25 && blinkTo(AMBUSH_MIN, AMBUSH_MAX)) {
            return 0;
          }
          slide(SLIDE_MIN + (rng() < 0.5 ? 0 : 1)); // slide 3-4 tiles
          return 0;
        }

        // --- Stunned (has taken a hit): teleporting is permanently disabled. ---
        // Melee if adjacent, otherwise keep backing away one tile per turn. Ninjas
        // never reach here (their branch above always returns).
        if (mem.stunned === true) {
          if (hasRing) {
            removeRing();
            delete mem.ringAge;
          }
          facePlayer();
          if (manhattan === 1) {
            // Cornered swipe — same base damage as the un-stunned adjacent case.
            return 1;
          }
          // Back away along the larger-gap axis, falling back to the other axis.
          const dy = py - e.y;
          const dx = px - e.x;
          const awayY: [number, number] = [dy > 0 ? -1 : 1, 0];
          const awayX: [number, number] = [0, dx > 0 ? -1 : 1];
          const tryMoves = Math.abs(dy) >= Math.abs(dx) ? [awayY, awayX] : [awayX, awayY];
          for (const [my, mx] of tryMoves) {
            const ny = e.y + my;
            const nx = e.x + mx;
            if (ny === py && nx === px) continue;
            if (isFloor(ny, nx)) {
              e.y = ny;
              e.x = nx;
              e.memory.moved = true;
              break;
            }
          }
          facePlayer(); // keep eyes on the hero even while retreating
          return 0;
        }

        if (hasLOS) {
          // --- LOS mode: ranged attack + positioning, no teleportation ---
          // Clean up any existing ring since we have direct sight
          if (hasRing) removeRing();

          facePlayer();

          if (manhattan > 5) {
            // Too far to attack — move closer
            stepToward();
            return 0;
          }

          // Adjacent (manhattan === 1): always melee, no back-away. Pink goblins should
          // be at least as threatening as a basic goblin when the hero stands right in
          // front of them — base 1 damage matching fire/water/earth goblins.
          if (manhattan === 1) {
            return 1;
          }

          // Within attack range (4-5): always attack at ideal distance
          if (manhattan >= 4 && manhattan <= 5) {
            return rangedDamage(manhattan);
          }

          // Mid-close (2-3): 50% attack, 50% back away to ideal distance
          if (rng() < 0.5) {
            return rangedDamage(manhattan);
          } else {
            stepToIdealDistance();
            return 0;
          }
        } else {
          // --- No LOS but aware: teleportation ring logic; stay still ---
          if (!hasRing) {
            // Place a ring 2-10 tiles from the hero on a walkable floor
            const eligible = findEligibleTiles(py, px, 2, 10);
            if (eligible.length > 0) {
              const [ry, rx] = eligible[Math.floor(rng() * eligible.length)];
              placeRing(ry, rx);
              mem.ringAge = 0;
            }
            // Stay still — no movement when aware but no LOS
          } else {
            // Ring exists — increment age
            mem.ringAge = (mem.ringAge ?? 0) + 1;
            if (mem.ringAge >= 2) {
              // Ring has been down for at least 2 turns — 50% teleport, else ring moves
              if (rng() < 0.5) {
                // Teleport to ring
                e.y = mem.ringY!;
                e.x = mem.ringX!;
                e.memory.moved = true;
                facePlayer();
                removeRing();
                delete mem.ringAge;
              } else {
                // Ring moves up to 5 tiles from itself
                const eligible = findEligibleTiles(mem.ringY!, mem.ringX!, 1, 5);
                if (eligible.length > 0) {
                  removeRing();
                  const [ry, rx] = eligible[Math.floor(rng() * eligible.length)];
                  placeRing(ry, rx);
                  mem.ringAge = 0;
                }
              }
            }
            // If ringAge < 2, do nothing — ring stays, goblin stays still
          }
          return 0;
        }
      },
    },
  },
  ghost: {
    kind: "ghost",
    displayName: "Lantern Wisp",
    assets: {
      front: "/images/enemies/lantern-wisp.png",
      left: "/images/enemies/lantern-wisp.png", // placeholder
      right: "/images/enemies/lantern-wisp.png", // placeholder
      back: "/images/enemies/lantern-wisp.png", // placeholder
    },
    desiredMinCount: 0,
    desiredMaxCount: 2,
    base: { health: 2, attack: 1 },
    calcMeleeDamage: ({ heroAttack, swordBonus, variance }) =>
      clampMin(heroAttack + swordBonus + variance),
    behavior: {
      // Torch snuffing when adjacent to the player
      onProximity: (ctx) => {
        // If adjacent, snuff the torch via engine-provided setter
        const e = ctx.enemies[ctx.enemyIndex];
        const adj =
          Math.abs(e.y - ctx.player.y) + Math.abs(e.x - ctx.player.x) === 1;
        if (adj && ctx.setPlayerTorchLit) ctx.setPlayerTorchLit(false);
      },
    },
  },
  "stone-goblin": {
    kind: "stone-goblin",
    displayName: "Stone Goblin",
    assets: {
      front: "/images/enemies/fire-goblin/green-goblin-front.png",
      left: "/images/enemies/fire-goblin/green-goblin-right.png",
      right: "/images/enemies/fire-goblin/green-goblin-right.png",
      back: "/images/enemies/fire-goblin/green-goblin-back.png",
    },
    desiredMinCount: 0,
    desiredMaxCount: 1,
    base: { health: 8, attack: 5 },
    // Takes exactly 1 melee damage regardless of sword/variance
    calcMeleeDamage: () => 1,
  },
  "white-goblin": {
    kind: "white-goblin",
    displayName: "White Goblin",
    assets: {
      front: "/images/enemies/fire-goblin/white-goblins-front-1.png",
      back: "/images/enemies/fire-goblin/white-goblins-back-1.png",
      left: "/images/enemies/fire-goblin/white-goblins-right-1.png", // mirror right for left
      right: "/images/enemies/fire-goblin/white-goblins-right-1.png",
    },
    desiredMinCount: 0,
    desiredMaxCount: 0, // spawned as groups of 4 by assignment logic
    base: { health: 1, attack: 1 },
    calcMeleeDamage: ({ heroAttack, swordBonus, variance }) =>
      clampMin(heroAttack + swordBonus + variance),
    behavior: {
      customUpdate: (ctx) => {
        const grid = ctx.grid;
        const e = ctx.enemy;
        const py = ctx.player.y;
        const px = ctx.player.x;
        const rng = ctx.rng ?? Math.random;
        const H = grid.length;
        const W = grid[0]?.length ?? 0;
        const isIn = (y: number, x: number) => y >= 0 && y < H && x >= 0 && x < W;

        const isFloor = (y: number, x: number) => {
          if (!isIn(y, x) || grid[y][x] !== 0) return false;
          const subs = ctx.subtypes?.[y]?.[x] ?? [];
          return !subs.includes(TileSubtype.OPEN_ABYSS);
        };

        const swarmId = (e.memory as Record<string, unknown>).swarmId as string | undefined;

        // Find all living swarm-mates (same swarmId)
        const swarmMates = swarmId
          ? ctx.enemies.filter(
              (en, idx) =>
                idx !== ctx.enemyIndex &&
                en.kind === "white-goblin" &&
                en.behaviorMemory?.swarmId === swarmId
            )
          : [];

        // Determine leader: first living member of the swarm (lowest index)
        // Leader is the one with the lowest enemyIndex among living swarm members
        const allSwarmMembers = swarmId
          ? ctx.enemies
              .map((en, idx) => ({ enemy: en, index: idx }))
              .filter(
                ({ enemy }) =>
                  enemy.kind === "white-goblin" &&
                  enemy.behaviorMemory?.swarmId === swarmId
              )
          : [];
        
        const leaderEntry = allSwarmMembers.length > 0 ? allSwarmMembers[0] : null;
        const leader = leaderEntry ? leaderEntry.enemy : null;

        let nearestMate: { y: number; x: number } | null = null;
        let nearestMateDist = Infinity;
        for (const m of swarmMates) {
          const d = Math.abs(m.y - e.y) + Math.abs(m.x - e.x);
          if (d < nearestMateDist) { nearestMateDist = d; nearestMate = m; }
        }

        // Manhattan distance to player
        const manhattan = Math.abs(e.y - py) + Math.abs(e.x - px);

        // Attack if adjacent to player
        if (manhattan === 1) {
          if (Math.abs(px - e.x) >= Math.abs(py - e.y)) {
            e.facing = px > e.x ? "RIGHT" : "LEFT";
          } else {
            e.facing = py > e.y ? "DOWN" : "UP";
          }
          // Strength in numbers: count living swarm-mates also pressed against
          // the player (cardinally adjacent). A lone white goblin is a minor
          // threat; every extra body on the player makes the whole pack bite
          // harder.
          const flankers = swarmMates.filter(
            (m) =>
              m.health > 0 &&
              Math.abs(m.y - py) + Math.abs(m.x - px) === 1
          ).length;
          // Base 2 (up from 1) so stragglers aren't trivial, +1 per flanking
          // mate (capped at +2). The engine still applies +/-1 variance, shield,
          // and the per-turn damage cap on top, so a full surround reliably maxes
          // a turn while a lone goblin stays survivable.
          // Pink-realm swarms hit harder (base 3) — tagged via behaviorMemory at spawn.
          const realmBuffed = (e.memory as Record<string, unknown>).realmBuffed === true;
          const baseBite = realmBuffed ? 3 : 2;
          return baseBite + Math.min(flankers, 2);
        }

        // Vision check
        const withinRange = manhattan <= 8;
        const seesPlayer = withinRange && canSee(grid, [e.y, e.x], [py, px]);

        // Helper: face toward a target
        const faceToward = (ty: number, tx: number) => {
          const dy = ty - e.y;
          const dx = tx - e.x;
          if (Math.abs(dx) >= Math.abs(dy)) {
            e.facing = dx > 0 ? "RIGHT" : (dx < 0 ? "LEFT" : e.facing);
          } else {
            e.facing = dy > 0 ? "DOWN" : (dy < 0 ? "UP" : e.facing);
          }
        };

        // Helper: move one step toward a target position, returns true if moved
        const stepToward = (ty: number, tx: number): boolean => {
          const dyRaw = ty - e.y;
          const dxRaw = tx - e.x;
          if (dyRaw === 0 && dxRaw === 0) return false;
          const stepY = dyRaw === 0 ? 0 : dyRaw > 0 ? 1 : -1;
          const stepX = dxRaw === 0 ? 0 : dxRaw > 0 ? 1 : -1;
          // Prefer the axis with greater distance
          const candMoves: Array<[number, number]> =
            Math.abs(dyRaw) >= Math.abs(dxRaw)
              ? [[stepY, 0], [0, stepX]]
              : [[0, stepX], [stepY, 0]];
          for (const [dy, dx] of candMoves) {
            if (dy === 0 && dx === 0) continue;
            const ny = e.y + dy;
            const nx = e.x + dx;
            if (ny === py && nx === px) continue;
            if (!isFloor(ny, nx)) continue;
            if (dx !== 0) e.facing = dx > 0 ? "RIGHT" : "LEFT";
            else e.facing = dy > 0 ? "DOWN" : "UP";
            e.y = ny;
            e.x = nx;
            e.memory.moved = true;
            return true;
          }
          return false;
        };

        // ENGAGED: surround the player instead of trailing in single file.
        // The old behavior made followers chase the leader, so the swarm strung
        // out in a line and only the front goblin ever reached the hero. Now
        // each member makes for the nearest open tile beside the player; once a
        // side is taken the others claim the remaining sides, and a member with
        // nowhere open piles onto a held side so it keeps attacking. Every step
        // only ever closes the gap, so they tighten the noose instead of milling
        // around.
        const leaderSeesPlayer = leader
          ? withinRange && canSee(grid, [leader.y, leader.x], [py, px])
          : false;
        if (seesPlayer || leaderSeesPlayer) {
          faceToward(py, px);

          const mateOn = (yy: number, xx: number) =>
            swarmMates.some((m) => m.y === yy && m.x === xx);

          // Step one tile toward (ty,tx), taking only moves that strictly reduce
          // the distance to it (so a goblin can never oscillate back and forth).
          // With allowStack false it refuses to share a mate's tile, which keeps
          // the pack spreading; with it true it may pile on to reach the player.
          const stepCloser = (
            ty: number,
            tx: number,
            allowStack: boolean
          ): boolean => {
            const curDist = Math.abs(ty - e.y) + Math.abs(tx - e.x);
            if (curDist === 0) return false;
            const opts: Array<[number, number]> = [
              [-1, 0],
              [1, 0],
              [0, -1],
              [0, 1],
            ];
            for (const [dy, dx] of opts) {
              const ny = e.y + dy;
              const nx = e.x + dx;
              if (ny === py && nx === px) continue; // never the player's tile
              if (Math.abs(ty - ny) + Math.abs(tx - nx) >= curDist) continue; // must close in
              if (!isFloor(ny, nx)) continue;
              if (!allowStack && mateOn(ny, nx)) continue; // don't pile while flanking
              e.facing =
                dx !== 0 ? (dx > 0 ? "RIGHT" : "LEFT") : dy > 0 ? "DOWN" : "UP";
              e.y = ny;
              e.x = nx;
              e.memory.moved = true;
              return true;
            }
            return false;
          };

          // Open floor tiles beside the player, nearest to this goblin first.
          const slots = (
            [
              [py - 1, px],
              [py + 1, px],
              [py, px - 1],
              [py, px + 1],
            ] as Array<[number, number]>
          )
            .filter(([sy, sx]) => isFloor(sy, sx))
            .sort(
              (a, b) =>
                Math.abs(a[0] - e.y) +
                Math.abs(a[1] - e.x) -
                (Math.abs(b[0] - e.y) + Math.abs(b[1] - e.x))
            );

          // Claim the nearest reachable open flank; if every flank is blocked,
          // pile onto a held side so this goblin still presses the player.
          let advanced = false;
          for (const [sy, sx] of slots) {
            if (mateOn(sy, sx)) continue; // taken side -- let a mate have it
            if (stepCloser(sy, sx, false)) {
              advanced = true;
              break;
            }
          }
          if (!advanced) stepCloser(py, px, true);
          return 0;
        }

        // Not in combat: regroup with swarm
        if (nearestMate && nearestMateDist > 0) {
          // Move toward nearest mate to stack together
          const shouldStack = rng() < 0.75; // 75% prefer stacking
          if (shouldStack || nearestMateDist > 1) {
            faceToward(nearestMate.y, nearestMate.x);
            stepToward(nearestMate.y, nearestMate.x);
            return 0;
          }
        }

        // Idle and together: minimal wandering, stay tight
        if (rng() < 0.3) {
          const dirs: Array<[number, number, "UP"|"RIGHT"|"DOWN"|"LEFT"]> = [
            [-1, 0, "UP"], [1, 0, "DOWN"], [0, -1, "LEFT"], [0, 1, "RIGHT"],
          ];
          for (let i = dirs.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
          }
          for (const [dy, dx, face] of dirs) {
            const ny = e.y + dy;
            const nx = e.x + dx;
            if (ny === py && nx === px) continue;
            if (!isFloor(ny, nx)) continue;
            // Only wander to adjacent tiles of current swarm position
            if (nearestMate) {
              const distNew = Math.abs(ny - nearestMate.y) + Math.abs(nx - nearestMate.x);
              if (distNew > 1) continue; // stay within 1 tile of swarm
            }
            e.y = ny;
            e.x = nx;
            e.facing = face;
            e.memory.moved = true;
            break;
          }
        }

        return 0;
      },
    },
  },
  snake: {
    kind: "snake",
    displayName: "Snake",
    assets: {
      front: "/images/enemies/snake-coiled-right.png", // coiled when not moving
      left: "/images/enemies/snake-moving-left.png", // moving asset
      right: "/images/enemies/snake-coiled-right.png", // coiled when not moving
      back: "/images/enemies/snake-coiled-right.png", // coiled when not moving
    },
    desiredMinCount: 0,
    desiredMaxCount: 1,
    base: { health: 2, attack: 1 },
    calcMeleeDamage: ({ heroAttack, swordBonus, variance }) =>
      clampMin(heroAttack + swordBonus + variance),
    behavior: {
      // Move away from player when visible; wander otherwise
      customUpdate: (ctx) => {
        const grid = ctx.grid;
        const e = ctx.enemy; // contains mutable y,x,facing,memory
        const py = ctx.player.y;
        const px = ctx.player.x;

        // Reset the per-turn UI flag: `moved` was only ever set to true, so the
        // snake stuck on its slither sprite after its first move instead of
        // alternating coiled <-> moving each turn.
        e.memory.moved = false;

        // If adjacent, attack
        const manhattan = Math.abs(e.y - py) + Math.abs(e.x - px);
        if (manhattan === 1) {
          // Face the player
          if (Math.abs(px - e.x) >= Math.abs(py - e.y)) {
            e.facing = px > e.x ? "RIGHT" : "LEFT";
          } else {
            e.facing = py > e.y ? "DOWN" : "UP";
          }
          return ctx.enemy.attack; // deal base attack; engine applies variance/defense
        }

        // Helper: bounds & floor
        const H = grid.length;
        const W = grid[0].length;
        const isIn = (y: number, x: number) => y >= 0 && y < H && x >= 0 && x < W;
        const isFloor = (y: number, x: number) => {
          if (!isIn(y, x) || grid[y][x] !== 0) return false;
          const subs = ctx.subtypes?.[y]?.[x] ?? [];
          return !subs.includes(TileSubtype.OPEN_ABYSS);
        };

        // If can see player, decide each tick: 33% approach, 67% avoid (move away)
        const sees = canSee(grid, [e.y, e.x], [py, px]);
        if (sees) {
          const dy = py - e.y;
          const dx = px - e.x;
          const goToward = (ctx.rng?.() ?? Math.random()) < 0.33;
          const tryMoves: Array<[number, number]> = [];
          if (Math.abs(dx) >= Math.abs(dy)) {
            // Favor X axis first
            if (dx !== 0) tryMoves.push([0, goToward ? (dx > 0 ? 1 : -1) : (dx > 0 ? -1 : 1)]);
            if (dy !== 0) tryMoves.push([goToward ? (dy > 0 ? 1 : -1) : (dy > 0 ? -1 : 1), 0]);
          } else {
            // Favor Y axis first
            if (dy !== 0) tryMoves.push([goToward ? (dy > 0 ? 1 : -1) : (dy > 0 ? -1 : 1), 0]);
            if (dx !== 0) tryMoves.push([0, goToward ? (dx > 0 ? 1 : -1) : (dx > 0 ? -1 : 1)]);
          }
          for (const [my, mx] of tryMoves) {
            const ny = e.y + my;
            const nx = e.x + mx;
            if (isFloor(ny, nx)) {
              // Face direction of movement
              if (mx !== 0) e.facing = mx > 0 ? "RIGHT" : "LEFT";
              else if (my !== 0) e.facing = my > 0 ? "DOWN" : "UP";
              e.y = ny; e.x = nx;
              // Flag moved for UI sprite logic
              e.memory.moved = true;
              return 0;
            }
          }
          // If cannot step due to walls, stay coiled
          return 0;
        }

        // If far from player (>5 tiles) and not seeing them, only move ~25% of the time (inclined to stay coiled)
        const farThreshold = 5;
        if (manhattan > farThreshold) {
          const r = (ctx.rng?.() ?? Math.random());
          if (r >= 0.25) {
            // Stay coiled this tick (no movement)
            return 0;
          }
        }
        // Wander randomly: try up to 4 shuffled directions
        const dirs: Array<[number, number, 'UP'|'RIGHT'|'DOWN'|'LEFT']> = [
          [-1, 0, 'UP'],
          [0, 1, 'RIGHT'],
          [1, 0, 'DOWN'],
          [0, -1, 'LEFT'],
        ];
        // Shuffle
        for (let i = dirs.length - 1; i > 0; i--) {
          const j = Math.floor((ctx.rng?.() ?? Math.random()) * (i + 1));
          [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
        }
        for (const [my, mx, face] of dirs) {
          const ny = e.y + my;
          const nx = e.x + mx;
          if (isFloor(ny, nx)) {
            e.facing = face;
            e.y = ny; e.x = nx;
            // Flag moved for UI sprite logic
            e.memory.moved = true;
            break;
          }
        }
        return 0;
      },
    },
  },
};

export function getEnemyIcon(
  kind: EnemyKind,
  facing: Facing = "front",
  swarmCount?: number
): string {
  const cfg = EnemyRegistry[kind];
  if (!cfg) return "";
  // White goblins: select asset by count (1-4) and facing (front/back only; sideways uses front or back)
  if (kind === "white-goblin") {
    const count = Math.min(4, Math.max(1, swarmCount ?? 1));
    const useFront = facing === "front" || facing === "left" || facing === "right";
    const side = useFront ? "front" : "back";
    return `/images/enemies/fire-goblin/white-goblins-${side}-${count}.png`;
  }
  return cfg.assets[facing] || cfg.assets.front;
}

// Optional helper: deterministic weights surface for spawner
// Removed legacy spawn weights; assignment uses desired count ranges.

// Helper: desired min/max counts for assignment logic
export function getDesiredCountRanges(): Record<EnemyKind, { min: number; max: number }> {
  const res = {} as Record<EnemyKind, { min: number; max: number }>;
  (Object.keys(EnemyRegistry) as EnemyKind[]).forEach((k) => {
    const cfg = EnemyRegistry[k];
    res[k] = {
      min: cfg.desiredMinCount ?? 0,
      max: cfg.desiredMaxCount ?? 0,
    };
  });
  return res;
}

export const enemyKinds = Object.keys(EnemyRegistry) as EnemyKind[];

export function createEmptyByKind(): Record<EnemyKind, number> {
  return enemyKinds.reduce((acc, k) => {
    acc[k] = 0;
    return acc;
  }, {} as Record<EnemyKind, number>);
}
