// Centralized enemy registry: assets and behaviors
export type EnemyKind = "goblin" | "ghost" | "stone-exciter";

export type Facing = "front" | "left" | "right" | "back";

// Contexts passed into behavior hooks; engine will wire these later
export interface BehaviorContext {
  // grid and entities
  grid: number[][];
  enemies: Array<{ y: number; x: number; kind: EnemyKind; health: number }>;
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
  goblin: {
    kind: "goblin",
    displayName: "Goblin",
    assets: {
      front: "/images/enemies/fire-goblin/fire-goblin-front.png",
      left: "/images/enemies/fire-goblin/fire-goblin-right.png", // mirror right for left
      right: "/images/enemies/fire-goblin/fire-goblin-right.png",
      back: "/images/enemies/fire-goblin/fire-goblin-back.png",
    },
    desiredMinCount: 3,
    desiredMaxCount: 4,
    base: { health: 5, attack: 1 },
    calcMeleeDamage: ({ heroAttack, swordBonus, variance }) =>
      clampMin(heroAttack + swordBonus + variance),
    behavior: {},
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
    desiredMinCount: 1,
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
  "stone-exciter": {
    kind: "stone-exciter",
    displayName: "Stone Guardian",
    assets: {
      front: "/images/enemies/stone-exciter-front.png",
      left: "/images/enemies/stone-exciter-right.png", // placeholder until left art exists
      right: "/images/enemies/stone-exciter-right.png",
      back: "/images/enemies/stone-exciter-back.png",
    },
    desiredMinCount: 1,
    desiredMaxCount: 2,
    base: { health: 8, attack: 5 },
    // Takes exactly 1 melee damage regardless of sword/variance
    calcMeleeDamage: () => 1,
  },
};

export function getEnemyIcon(
  kind: EnemyKind,
  facing: Facing = "front"
): string {
  const cfg = EnemyRegistry[kind];
  if (!cfg) return "";
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
