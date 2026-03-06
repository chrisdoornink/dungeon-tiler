// Centralized enemy registry: assets and behaviors
import { canSee } from "../line_of_sight";
import { TileSubtype } from "../map/constants";
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
      front: "/images/enemies/fire-goblin/pink-goblin-front.png",
      left: "/images/enemies/fire-goblin/pink-goblin-left.png",
      right: "/images/enemies/fire-goblin/pink-goblin-left.png",
      back: "/images/enemies/fire-goblin/pink-goblin-back.png",
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

        // Memory keys: aware, ringY, ringX, ringOrigSubs (saved subtypes), ringAge (turns since ring placed)
        const mem = e.memory as {
          aware?: boolean;
          ringY?: number;
          ringX?: number;
          ringOrigSubs?: number[];
          ringAge?: number;
        };

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

        // Helper: remove any existing ring from the map, restoring original subtypes
        const removeRing = () => {
          if (!subtypes) { delete mem.ringY; delete mem.ringX; delete mem.ringOrigSubs; return; }
          if (typeof mem.ringY === "number" && typeof mem.ringX === "number") {
            const orig = mem.ringOrigSubs ?? [];
            subtypes[mem.ringY][mem.ringX] = orig.length > 0 ? [...orig] : [TileSubtype.NONE];
          }
          for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
              const s = subtypes[y]?.[x];
              if (!s) continue;
              const ri = s.indexOf(TileSubtype.PINK_RING);
              if (ri !== -1) {
                s.splice(ri, 1);
                if (s.length === 0) s.push(TileSubtype.NONE);
              }
            }
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
          const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1;
          const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
          facePlayer();
          const tryMoves: Array<[number, number]> = [];
          if (stepX !== 0) tryMoves.push([0, stepX]);
          if (stepY !== 0) tryMoves.push([stepY, 0]);
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

          // Within attack range (1-5): 50% attack, 50% reposition to ideal distance (4-5)
          if (manhattan >= 4 && manhattan <= 5) {
            // Already at ideal distance — always attack
            return rangedDamage(manhattan);
          }

          // Closer than ideal (1-3): 50% attack, 50% back away to ideal distance
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
      // No dedicated side assets; front/back used for sideways facing (chosen randomly per tile)
      left: "/images/enemies/fire-goblin/white-goblins-front-1.png",
      right: "/images/enemies/fire-goblin/white-goblins-front-1.png",
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
        const isFloor = (y: number, x: number) => isIn(y, x) && grid[y][x] === 0;

        const swarmId = (e.memory as Record<string, unknown>).swarmId as string | undefined;

        // Find all living swarm-mates (same swarmId) using behaviorMemory now included in ctx.enemies
        const swarmMates = swarmId
          ? ctx.enemies.filter(
              (en, idx) =>
                idx !== ctx.enemyIndex &&
                en.kind === "white-goblin" &&
                en.behaviorMemory?.swarmId === swarmId
            )
          : [];

        // Find the nearest swarm-mate (concrete tile to move toward when regrouping)
        let nearestMate: { y: number; x: number } | null = null;
        let nearestMateDist = Infinity;
        for (const m of swarmMates) {
          const d = Math.abs(m.y - e.y) + Math.abs(m.x - e.x);
          if (d < nearestMateDist) { nearestMateDist = d; nearestMate = m; }
        }

        // Regroup whenever any mate is more than 1 tile away (not on same or adjacent tile)
        const needsRegroup = nearestMateDist > 1;

        // Manhattan distance to player
        const manhattan = Math.abs(e.y - py) + Math.abs(e.x - px);

        // Attack if adjacent to player
        if (manhattan === 1) {
          if (Math.abs(px - e.x) >= Math.abs(py - e.y)) {
            e.facing = px > e.x ? "RIGHT" : "LEFT";
          } else {
            e.facing = py > e.y ? "DOWN" : "UP";
          }
          return e.attack;
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

        // If chasing player: regroup first if separated, otherwise chase
        if (seesPlayer) {
          faceToward(py, px);
          if (needsRegroup && nearestMate) {
            stepToward(nearestMate.y, nearestMate.x);
          } else {
            stepToward(py, px);
          }
          return 0;
        }

        // Not chasing: always move toward nearest mate when separated
        if (needsRegroup && nearestMate) {
          faceToward(nearestMate.y, nearestMate.x);
          stepToward(nearestMate.y, nearestMate.x);
          return 0;
        }

        // Idle and together: 40% chance to wander, don't move away from nearest mate
        if (rng() < 0.4) {
          const distNow = nearestMate
            ? Math.abs(e.y - nearestMate.y) + Math.abs(e.x - nearestMate.x)
            : 0;
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
            // Don't wander further from nearest mate than current distance
            if (nearestMate) {
              const distNew = Math.abs(ny - nearestMate.y) + Math.abs(nx - nearestMate.x);
              if (distNew > distNow + 1) continue;
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
        const isFloor = (y: number, x: number) => isIn(y, x) && grid[y][x] === 0;

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
        const isLeader = leaderEntry ? leaderEntry.index === ctx.enemyIndex : true;
        const leader = leaderEntry ? leaderEntry.enemy : null;

        // Find distances to leader and nearest mate
        const leaderDist = leader && !isLeader
          ? Math.abs(leader.y - e.y) + Math.abs(leader.x - e.x)
          : 0;
        
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
          return e.attack;
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

        // LEADER BEHAVIOR: Chase player with occasional pauses to let swarm catch up
        if (isLeader && seesPlayer) {
          faceToward(py, px);
          
          // Check if swarm is too spread out (any member >2 tiles away)
          const maxSwarmDist = swarmMates.reduce((max, m) => {
            const d = Math.abs(m.y - e.y) + Math.abs(m.x - e.x);
            return Math.max(max, d);
          }, 0);
          
          // If swarm is spread out (>2 tiles), pause 40% of the time to let them catch up
          if (maxSwarmDist > 2 && rng() < 0.4) {
            // Stay in place this turn (let followers catch up)
            return 0;
          }
          
          // Otherwise pursue player with some variation
          const tacticRoll = rng();
          if (tacticRoll < 0.7) {
            // 70%: Direct pursuit
            stepToward(py, px);
          } else {
            // 30%: Slight variation (adjacent move that doesn't increase distance much)
            const dirs: Array<[number, number, "UP"|"RIGHT"|"DOWN"|"LEFT"]> = [
              [-1, 0, "UP"], [1, 0, "DOWN"], [0, -1, "LEFT"], [0, 1, "RIGHT"],
            ];
            for (let i = dirs.length - 1; i > 0; i--) {
              const j = Math.floor(rng() * (i + 1));
              [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
            }
            let moved = false;
            for (const [dy, dx, face] of dirs) {
              const ny = e.y + dy;
              const nx = e.x + dx;
              if (ny === py && nx === px) continue;
              if (!isFloor(ny, nx)) continue;
              const newDist = Math.abs(ny - py) + Math.abs(nx - px);
              if (newDist > manhattan + 1) continue; // don't move away from player
              e.y = ny;
              e.x = nx;
              e.facing = face;
              e.memory.moved = true;
              moved = true;
              break;
            }
            if (!moved) stepToward(py, px);
          }
          return 0;
        }

        // NON-LEADER BEHAVIOR: Prioritize following leader over chasing player
        if (!isLeader && leader) {
          // If leader can see player, non-leaders focus on staying near leader
          const leaderSeesPlayer = leader && withinRange && canSee(grid, [leader.y, leader.x], [py, px]);
          
          if (leaderSeesPlayer || seesPlayer) {
            // During combat: >60% chance to move toward leader, <40% toward player
            const followLeader = rng() < 0.65;
            
            if (followLeader && leaderDist > 0) {
              // Move toward leader to maintain swarm cohesion
              faceToward(leader.y, leader.x);
              stepToward(leader.y, leader.x);
            } else if (leaderDist <= 2) {
              // Already close to leader, can pursue player with variation
              faceToward(py, px);
              const tacticRoll = rng();
              if (tacticRoll < 0.5) {
                stepToward(py, px);
              } else {
                // Move adjacent to leader's position for flanking
                const dirs: Array<[number, number, "UP"|"RIGHT"|"DOWN"|"LEFT"]> = [
                  [-1, 0, "UP"], [1, 0, "DOWN"], [0, -1, "LEFT"], [0, 1, "RIGHT"],
                ];
                for (let i = dirs.length - 1; i > 0; i--) {
                  const j = Math.floor(rng() * (i + 1));
                  [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
                }
                let moved = false;
                for (const [dy, dx, face] of dirs) {
                  const ny = e.y + dy;
                  const nx = e.x + dx;
                  if (ny === py && nx === px) continue;
                  if (!isFloor(ny, nx)) continue;
                  // Prefer staying near leader
                  const distToLeader = Math.abs(ny - leader.y) + Math.abs(nx - leader.x);
                  if (distToLeader > 2) continue;
                  e.y = ny;
                  e.x = nx;
                  e.facing = face;
                  e.memory.moved = true;
                  moved = true;
                  break;
                }
                if (!moved) stepToward(py, px);
              }
            } else {
              // Too far from leader, regroup
              faceToward(leader.y, leader.x);
              stepToward(leader.y, leader.x);
            }
            return 0;
          }
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

        // If adjacent, attack
        const manhattan = Math.abs(e.y - py) + Math.abs(e.x - px);
        if (manhattan === 1) {
          // Face the player
          if (Math.abs(px - e.x) >= Math.abs(py - e.y)) {
            e.facing = px > e.x ? "RIGHT" : "LEFT";
          } else {
            e.facing = py > e.y ? "DOWN" : "UP";
          }
          console.log(`[ENEMY ATTACK] Snake at (${e.y},${e.x}) attacking player at (${py},${px}) - distance: ${manhattan}, base damage: ${ctx.enemy.attack}`);
          return ctx.enemy.attack; // deal base attack; engine applies variance/defense
        }

        // Helper: bounds & floor
        const H = grid.length;
        const W = grid[0].length;
        const isIn = (y: number, x: number) => y >= 0 && y < H && x >= 0 && x < W;
        const isFloor = (y: number, x: number) => isIn(y, x) && grid[y][x] === 0;

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
