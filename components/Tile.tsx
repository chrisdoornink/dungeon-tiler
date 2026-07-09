import React from "react";
import { TileType, TileSubtype, Direction } from "../lib/map";
import { getEnemyIcon } from "../lib/enemies/registry";
import type { EnemyKind, Facing } from "../lib/enemies/registry";
import type { NPC } from "../lib/npc";
import type { SmoothEntityStep } from "../lib/smooth_movement";
import { ENEMY_GAIT, REGULAR_GOBLIN_KINDS } from "../lib/smooth_movement";
import PixelFlame, {
  HERO_FLAME_ANCHOR,
  GOBLIN_FLAME_ANCHOR,
} from "./PixelFlame";
import styles from "./Tile.module.css";
import {
  DEFAULT_ENVIRONMENT,
  type EnvironmentId,
  getEnvironmentConfig,
  getFloorAsset,
  getWallAsset,
} from "../lib/environment";

type NeighborInfo = {
  top: number | null;
  right: number | null;
  bottom: number | null;
  left: number | null;
};

export type HeroDeathPhase =
  | "idle"
  | "spinning"
  | "fallen"
  | "sinking" // abyss/faulty-floor death: hero collapses to zero height
  | "spirit"
  | "complete";

export interface HeroDeathState {
  phase: HeroDeathPhase;
  orientation: Direction;
  // "topple" = spin then fall on side (enemy/poison); "abyss" = shrink into the hole
  variant?: "topple" | "abyss";
}

interface TileProps {
  tileId: number;
  tileType: TileType;
  subtype?: number[];
  row?: number; // grid row (y)
  col?: number; // grid col (x)
  isVisible?: boolean; // Whether this tile is in the player's field of view
  visibilityTier?: number; // 0-3 for FOV fade tiers
  // True when this tile is diagonally adjacent to a wall torch / torch-carrier
  // (its strongest glow contribution is DIAGONAL_GLOW). Used to give torch
  // corners a soft flickering half-light while the hero's own torch is out,
  // instead of the near-black snuff ring.
  torchDiagonalGlow?: boolean;
  // True when this tile is orthogonally adjacent to a wall torch / torch-carrier
  // (strongest glow is ADJACENT_GLOW). While the hero's torch is out these arms
  // get the brightest flickering torchlight.
  torchAdjacentGlow?: boolean;
  // True when this tile is in the torch's rounded second ring (strongest glow is
  // SECOND_RING_GLOW). While snuffed these get the faintest flicker, softening
  // the glow's edge so it doesn't read as a hard square.
  torchSecondRingGlow?: boolean;
  neighbors?: NeighborInfo; // Information about neighboring tiles
  playerDirection?: Direction; // Direction the player is facing
  heroTorchLit?: boolean; // Whether the hero's torch is lit (affects hero sprite)
  heroTorchSnuffing?: boolean; // brief window after a snuff: show the blue flame flutter-out
  heroPoisoned?: boolean; // Whether the hero is poisoned (for visual overlay)
  hasEnemy?: boolean; // Whether this tile contains an enemy
  enemyVisible?: boolean; // Whether enemy is in player's FOV
  enemyFacing?: 'UP' | 'RIGHT' | 'DOWN' | 'LEFT';
  enemyKind?: 'fire-goblin' | 'water-goblin' | 'water-goblin-spear' | 'earth-goblin' | 'earth-goblin-knives' | 'pink-goblin' | 'ghost' | 'stone-goblin' | 'snake' | 'white-goblin';
  enemyMoved?: boolean; // did the enemy move last tick (for snakes: choose moving vs coiled)
  enemySwarmCount?: number; // for white-goblin: how many swarm members share this tile (1-4)
  enemyAura?: boolean; // show eerie green glow when close to hero
  npc?: NPC;
  npcVisible?: boolean;
  npcInteractable?: boolean;
  hasSword?: boolean; // Whether player holds a sword (for sprite)
  hasShield?: boolean; // Whether player holds a shield (for sprite)
  invisibleClassName?: string; // Optional class override for invisible tiles
  playerHasExitKey?: boolean; // Player holds the exit key for conditional exit rendering
  environment?: EnvironmentId;
  suppressDarknessOverlay?: boolean;
  inNightmare?: boolean; // Nightmare room: darken the floor + invert its sparkles
  activeCheckpoint?: [number, number] | null; // Active checkpoint position for lit/unlit rendering
  heroDeathState?: HeroDeathState;
  heroWarping?: boolean; // when true, flicker the hero sprite (teleport dematerialize)
  // Smooth-movement mode renders the hero as a viewport-centered overlay in
  // TilemapGrid; this suppresses the tile-rendered hero sprite so it doesn't
  // double up. Everything else about the player tile renders as usual.
  suppressHeroSprite?: boolean;
  // Smooth movement Phase 2: slide the enemy/NPC sprite in from its previous
  // tile (set only on the turn the entity moved exactly one tile).
  enemyStep?: SmoothEntityStep;
  npcStep?: SmoothEntityStep;
  // Smooth movement Phase 3: white-goblin swarms render as N overlaid single
  // goblins instead of the baked 1-4 pack images (smooth mode only).
  smoothMode?: boolean;
  // Pink goblin whose teleport ring is NOT cast elsewhere: render the ring
  // (with sparkles) directly under the goblin.
  enemyRingUnder?: boolean;
  // Combat lunge: hard shake toward the opponent when a melee hit lands.
  // dy/dx are the unit direction toward the opponent; seq restarts the
  // animation on consecutive hits (see combatLungeStyle).
  heroLunge?: CombatLunge;
  enemyLunge?: CombatLunge;
}

export type CombatLunge = { dy: number; dx: number; seq: number };

// Horizontal clashes read best with a bigger excursion; vertical combat
// overlaps the neighboring tile sooner (sprites already bleed up/down), so
// it gets a slightly smaller one.
const LUNGE_X_PX = 9;
const LUNGE_Y_PX = 7;

// Style fragment for the combat lunge. Animates the standalone `translate`
// property (keyframes in globals.css) so it composes with the facing-flip /
// slide transforms on the same element. Alternating A/B keyframe names by
// seq restarts the shake on back-to-back hits without remounting the sprite.
export const combatLungeStyle = (
  lunge: CombatLunge | undefined
): React.CSSProperties | null => {
  if (!lunge) return null;
  return {
    ["--lunge-x" as string]: `${lunge.dx * LUNGE_X_PX}px`,
    ["--lunge-y" as string]: `${lunge.dy * LUNGE_Y_PX}px`,
    animation: `combatLunge${lunge.seq % 2 ? "B" : "A"} 240ms ease-out`,
  };
};

export const Tile: React.FC<TileProps> = ({
  tileId,
  // We don't need tileType for now, but it's in the props interface for future use
  subtype = [],
  row,
  col,
  isVisible = true,
  visibilityTier = 3,
  torchDiagonalGlow = false,
  torchAdjacentGlow = false,
  torchSecondRingGlow = false,
  neighbors = { top: null, right: null, bottom: null, left: null },
  playerDirection = Direction.DOWN, // Default to facing down/front
  heroTorchLit = true,
  heroTorchSnuffing = false,
  heroPoisoned = false,
  hasEnemy = false,
  enemyVisible = undefined,
  enemyFacing,
  enemyKind,
  enemyMoved,
  enemySwarmCount,
  enemyAura,
  npc,
  npcVisible = undefined,
  npcInteractable = false,
  hasSword,
  hasShield,
  invisibleClassName,
  playerHasExitKey,
  environment = DEFAULT_ENVIRONMENT,
  suppressDarknessOverlay = false,
  inNightmare = false,
  activeCheckpoint = null,
  heroDeathState,
  heroWarping = false,
  suppressHeroSprite = false,
  enemyStep,
  npcStep,
  smoothMode = false,
  enemyRingUnder = false,
  heroLunge,
  enemyLunge,
}) => {
  const environmentConfig = getEnvironmentConfig(environment);
  // Smooth movement: tracks the enemy slide animation finishing (via
  // onAnimationEnd) so sprites that change pose with motion — the snake's
  // coiled <-> slither swap — revert the moment the tween lands instead of
  // waiting for the next turn's re-render. Re-keyed steps (new seq) reset it.
  const [smoothSlideDoneSeq, setSmoothSlideDoneSeq] = React.useState<number | null>(null);
  const enemySliding = !!enemyStep && smoothSlideDoneSeq !== enemyStep.seq;
  // Torch animations disabled for performance: render static torch sprite when present.
  // Fast bitmask-based wall variant resolver for perspective.
  // We IGNORE the North (behind) bit and only key off E, S, W.
  const getWallVariantName = (n: NeighborInfo): string => {
    // Treat value 1 as wall; anything else is not wall
    const eBit = n.right === 1 ? 4 : 0; // E
    const sBit = n.bottom === 1 ? 2 : 0; // S
    const wBit = n.left === 1 ? 1 : 0; // W
    const maskESW = eBit | sBit | wBit; // 0..7

    // 8-entry lookup for ESW; any N combinations collapse to these
    const tableESW: Record<number, string> = {
      0b000: "wall_pillar", // isolated or N-only
      0b001: "wall_end_e", // W only
      0b010: "wall_end_n", // S only (bottom face visible)
      0b011: "wall_corner_ne", // S + W -> open NE
      0b100: "wall_end_w", // E only
      0b101: "wall_horiz", // E + W (straight)
      0b110: "wall_corner_nw", // E + S -> open NW
      0b111: "wall_t_n", // E + S + W -> open N (behind)
    };
    return tableESW[maskESW] ?? "wall_pillar";
  };
  // Generate shorthand code for autotiling
  const topNeighbor = neighbors.top === tileId ? "T" : "";
  const rightNeighbor = neighbors.right === tileId ? "R" : "";
  const bottomNeighbor = neighbors.bottom === tileId ? "B" : "";
  const leftNeighbor = neighbors.left === tileId ? "L" : "";
  const neighborCode = `${topNeighbor}${rightNeighbor}${bottomNeighbor}${leftNeighbor}`;

  // We only want to display subtypes when they exist
  // No need to display tileId or neighbor codes

  // Pixel art colors - directly use these values in the JSX

  const isPlayerTile =
    isVisible && Array.isArray(subtype) && subtype.includes(TileSubtype.PLAYER);

  const tierClass = (() => {
    if (!isVisible) return "";
    if (!heroTorchLit && !suppressDarknessOverlay) {
      if (isPlayerTile) return "fov-tier-snuff-core";
      // Wall torches stay light sources even while snuffed: bright flickering
      // arms, dimmer flickering corners, instead of a hard cross with black
      // corners. (Adjacent wins over diagonal — they're mutually exclusive
      // anyway since ADJACENT_GLOW > DIAGONAL_GLOW.)
      if (torchAdjacentGlow) return "fov-tier-torch-adj";
      if (torchDiagonalGlow) return "fov-tier-torch-diag";
      if (torchSecondRingGlow) return "fov-tier-torch-far";
      if (visibilityTier <= 1) return "fov-tier-snuff-ring";
    }
    if (visibilityTier === 3) return "fov-tier-3";
    if (visibilityTier === 2) return "fov-tier-2";
    if (visibilityTier === 1) return "fov-tier-1";
    return "";
  })();

  // Get display name for a subtype
  const subtypeNames = (arr: number[] | undefined): string[] => {
    if (!arr || arr.length === 0) return [];
    return arr.map((s) => {
      switch (s) {
        case TileSubtype.PLAYER:
          return "PLAYER";
        case TileSubtype.LIGHTSWITCH:
          return "LIGHTSWITCH";
        case TileSubtype.EXITKEY:
          return "EXITKEY";
        case TileSubtype.KEY:
          return "KEY";
        case TileSubtype.LOCK:
          return "LOCK";
        case TileSubtype.DOOR:
          return "DOOR";
        case TileSubtype.EXIT:
          return "EXIT";
        case TileSubtype.CHEST:
          return "CHEST";
        case TileSubtype.SWORD:
          return "SWORD";
        case TileSubtype.SHIELD:
          return "SHIELD";
        case TileSubtype.OPEN_CHEST:
          return "OPEN_CHEST";
        case TileSubtype.NONE:
          return "NONE";
        case TileSubtype.ROOM_TRANSITION:
          return "ROOM_TRANSITION";
      case TileSubtype.CHECKPOINT:
        return "CHECKPOINT";
      case TileSubtype.WINDOW:
        return "WINDOW";
      case TileSubtype.ROAD:
        return "ROAD";
      case TileSubtype.ROAD_STRAIGHT:
        return "ROAD_STRAIGHT";
      case TileSubtype.ROAD_CORNER:
        return "ROAD_CORNER";
      case TileSubtype.ROAD_T:
        return "ROAD_T";
      case TileSubtype.ROAD_END:
        return "ROAD_END";
      case TileSubtype.ROAD_ROTATE_90:
        return "ROAD_ROTATE_90";
      case TileSubtype.ROAD_ROTATE_180:
        return "ROAD_ROTATE_180";
      case TileSubtype.ROAD_ROTATE_270:
        return "ROAD_ROTATE_270";
      case TileSubtype.OPEN_ABYSS:
        return "OPEN_ABYSS";
      default:
        return String(s);
    }
  });
  };

  // Get color for a subtype icon
  const getSubtypeColor = (subtype: number): string => {
    switch (subtype) {
      case TileSubtype.PLAYER:
        return "bg-blue-500";
      case TileSubtype.LIGHTSWITCH:
        return "bg-amber-500";
      case TileSubtype.EXITKEY:
        return "bg-yellow-500";
      case TileSubtype.KEY:
        return "bg-purple-500";
      case TileSubtype.LOCK:
        return "bg-gray-500";
      case TileSubtype.DOOR:
        return "bg-amber-700";
      case TileSubtype.EXIT:
        return "bg-green-500";
      case TileSubtype.CHEST:
        return "bg-amber-800";
      case TileSubtype.SWORD:
        return "bg-red-500";
      case TileSubtype.SHIELD:
        return "bg-blue-700";
      case TileSubtype.OPEN_CHEST:
        return "bg-amber-400";
      case TileSubtype.ROOM_TRANSITION:
        return "bg-indigo-500";
      case TileSubtype.CHECKPOINT:
        return "bg-cyan-500";
      case TileSubtype.WINDOW:
        return "bg-sky-500";
      case TileSubtype.ROAD:
      case TileSubtype.ROAD_STRAIGHT:
      case TileSubtype.ROAD_CORNER:
      case TileSubtype.ROAD_T:
      case TileSubtype.ROAD_END:
        return "bg-amber-600";
      case TileSubtype.OPEN_ABYSS:
        return "bg-black";
      default:
        return "bg-gray-400";
    }
  };

  // Get symbol for a subtype icon
  const getSubtypeSymbol = (subtype: number): string => {
    switch (subtype) {
      case TileSubtype.PLAYER:
        return "P";
      case TileSubtype.LIGHTSWITCH:
        return "";
      case TileSubtype.EXITKEY:
        return "K";
      case TileSubtype.KEY:
        return "";
      case TileSubtype.LOCK:
        return "L";
      case TileSubtype.DOOR:
        return "D";
      case TileSubtype.EXIT:
        return "E";
      case TileSubtype.CHEST:
        return "C";
      case TileSubtype.SWORD:
        return "S";
      case TileSubtype.SHIELD:
        return "";
      case TileSubtype.OPEN_CHEST:
        return "O";
      case TileSubtype.ROOM_TRANSITION:
        return "⇆";
      case TileSubtype.CHECKPOINT:
        return "⛳";
      case TileSubtype.WINDOW:
        return "≋";
      case TileSubtype.ROAD:
      case TileSubtype.ROAD_STRAIGHT:
      case TileSubtype.ROAD_CORNER:
      case TileSubtype.ROAD_T:
      case TileSubtype.ROAD_END:
        return "≡";
      case TileSubtype.OPEN_ABYSS:
        return "";
      default:
        return "?";
    }
  };

  // Check if a tile has a chest subtype
  const hasChest = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.CHEST) || false;
  };

  // Check if a tile has an open chest subtype
  const hasOpenChest = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.OPEN_CHEST) || false;
  };

  // Check if a tile has a lightswitch subtype
  const hasLightswitch = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.LIGHTSWITCH) || false;
  };

  // Check if a tile has a key subtype
  const hasKey = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.KEY) || false;
  };

  // Check if a tile has an exit key subtype
  const hasExitKeySubtype = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.EXITKEY) || false;
  };

  // Check if a tile has a door subtype
  const hasDoor = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.DOOR) || false;
  };

  // Check if a tile has an exit subtype
  const hasExit = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.EXIT) || false;
  };
  // Story-only cave opening visual (uses exit-dark art, but not a Daily EXIT)
  const hasCaveOpening = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.CAVE_OPENING) || false;
  };

  // Pots and Rocks + revealed items
  const hasPot = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.POT) || false;
  };
  const hasRock = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.ROCK) || false;
  };
  const hasFood = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.FOOD) || false;
  };
  const hasMed = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.MED) || false;
  };
  const hasRune = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.RUNE) || false;
  };
  const hasWallTorch = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.WALL_TORCH) || false;
  };
  const hasSwordItem = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.SWORD) || false;
  };
  const hasShieldItem = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.SHIELD) || false;
  };
  const hasFaultyFloor = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.FAULTY_FLOOR) || false;
  };
  const hasDarkness = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.DARKNESS) || false;
  };

  const hasOpenAbyss = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.OPEN_ABYSS) || false;
  };

  const hasRoad = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.ROAD) || false;
  };
  const hasPinkRing = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.PINK_RING) || false;
  };

  const hasTownSign = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.TOWN_SIGN) || false;
  };

  const hasPortal = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.PORTAL) || false;
  };

  const hasSnakeMedallion = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.SNAKE_MEDALLION) || false;
  };

  const hasExtraHeart = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.EXTRA_HEART) || false;
  };

  const hasBombItem = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.BOMB) || false;
  };
  const hasLiveBomb = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.BOMB_LIVE) || false;
  };
  const hasSinged = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.SINGED) || false;
  };
  const hasPinkHeart = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.PINK_HEART) || false;
  };
  const hasBerry = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.BERRY) || false;
  };

  // Bed helpers
  const hasBed = (subtypes: number[] | undefined): boolean => {
    if (!subtypes) return false;
    return subtypes.some(s => 
      s === TileSubtype.BED_EMPTY_1 || s === TileSubtype.BED_EMPTY_2 ||
      s === TileSubtype.BED_EMPTY_3 || s === TileSubtype.BED_EMPTY_4 ||
      s === TileSubtype.BED_FULL_1 || s === TileSubtype.BED_FULL_2 ||
      s === TileSubtype.BED_FULL_3 || s === TileSubtype.BED_FULL_4
    );
  };

  const getBedAsset = (subtypes: number[] | undefined): string | null => {
    if (!subtypes) return null;
    if (subtypes.includes(TileSubtype.BED_EMPTY_1)) return '/images/items/beds/bed-1-empty.png';
    if (subtypes.includes(TileSubtype.BED_EMPTY_2)) return '/images/items/beds/bed-2-empty.png';
    if (subtypes.includes(TileSubtype.BED_EMPTY_3)) return '/images/items/beds/bed-3-empty.png';
    if (subtypes.includes(TileSubtype.BED_EMPTY_4)) return '/images/items/beds/bed-4-empty.png';
    if (subtypes.includes(TileSubtype.BED_FULL_1)) return '/images/items/beds/bed-1-full.png';
    if (subtypes.includes(TileSubtype.BED_FULL_2)) return '/images/items/beds/bed-2-full.png';
    if (subtypes.includes(TileSubtype.BED_FULL_3)) return '/images/items/beds/bed-3-full.png';
    if (subtypes.includes(TileSubtype.BED_FULL_4)) return '/images/items/beds/bed-4-full.png';
    return null;
  };

  const getRoadShape = (
    subtypes: number[] | undefined
  ): TileSubtype | null => {
    if (!hasRoad(subtypes) || !subtypes) return null;
    if (subtypes.includes(TileSubtype.ROAD_T)) return TileSubtype.ROAD_T;
    if (subtypes.includes(TileSubtype.ROAD_CORNER)) return TileSubtype.ROAD_CORNER;
    if (subtypes.includes(TileSubtype.ROAD_END)) return TileSubtype.ROAD_END;
    if (subtypes.includes(TileSubtype.ROAD_STRAIGHT)) {
      return TileSubtype.ROAD_STRAIGHT;
    }
    return TileSubtype.ROAD;
  };

  const getRoadRotation = (subtypes: number[] | undefined): number => {
    if (!subtypes) return 0;
    if (subtypes.includes(TileSubtype.ROAD_ROTATE_270)) return 270;
    if (subtypes.includes(TileSubtype.ROAD_ROTATE_180)) return 180;
    if (subtypes.includes(TileSubtype.ROAD_ROTATE_90)) return 90;
    return 0;
  };

  const getRoadAsset = (shape: TileSubtype | null): string | null => {
    switch (shape) {
      case TileSubtype.ROAD_STRAIGHT:
        return "/images/floor/dirt-road-i.png";
      case TileSubtype.ROAD_CORNER:
        return "/images/floor/dirt-road-r.png";
      case TileSubtype.ROAD_T:
        return "/images/floor/dirt-road-t.png";
      case TileSubtype.ROAD_END:
        return "/images/floor/dirt-road-end.png";
      case TileSubtype.ROAD:
        return "/images/floor/dirt-road-i.png";
      default:
        return null;
    }
  };

  const renderRoadOverlay = (subtypes: number[] | undefined) => {
    const shape = getRoadShape(subtypes);
    const asset = getRoadAsset(shape);
    if (!asset) return null;
    const rotation = getRoadRotation(subtypes);
    return (
      <div
        key="road"
        data-testid="road-overlay"
        className={styles.roadOverlay}
        style={{
          backgroundImage: `url(${asset})`,
          transform: `rotate(${rotation}deg)`,
        }}
      />
    );
  };

  // Generate random rotation for faulty floors based on coordinates
  const getFaultyFloorRotation = (): number => {
    const y = typeof row === 'number' ? row : 0;
    const x = typeof col === 'number' ? col : 0;
    // Generate deterministic rotation between 0-360 degrees
    const seed = (y * 73 + x * 127) % 360;
    return seed;
  };

  // Deterministic variant picker based on coordinates
  const pickVariant = (choices: string[]): string => {
    if (!choices || choices.length === 0) return '';
    // Use row/col if available; otherwise default index 0
    const y = typeof row === 'number' ? row : 0;
    const x = typeof col === 'number' ? col : 0;
    // Simple hash
    const idx = Math.abs((y * 37 + x * 101) % choices.length);
    return choices[idx];
  };

  // Get subtypes excluding special cases that have custom rendering
  const getFilteredSubtypes = (subtypes: number[] | undefined): number[] => {
    if (!subtypes || subtypes.length === 0) return [];

    // Filter out subtypes that have custom asset-based rendering
    return subtypes.filter(
      (subtype) =>
        subtype !== TileSubtype.NONE &&
        subtype !== TileSubtype.SWORD &&
        subtype !== TileSubtype.SHIELD &&
        subtype !== TileSubtype.LOCK &&
        subtype !== TileSubtype.CHEST &&
        subtype !== TileSubtype.OPEN_CHEST &&
        subtype !== TileSubtype.LIGHTSWITCH &&
        subtype !== TileSubtype.KEY &&
        subtype !== TileSubtype.EXITKEY &&
        subtype !== TileSubtype.DOOR &&
        subtype !== TileSubtype.EXIT &&
        subtype !== TileSubtype.CAVE_OPENING &&
        // Exclude pots/rocks and revealed items from generic rendering
        subtype !== TileSubtype.POT &&
        subtype !== TileSubtype.ROCK &&
        subtype !== TileSubtype.FOOD &&
        subtype !== TileSubtype.MED &&
        subtype !== TileSubtype.RUNE &&
        subtype !== TileSubtype.SNAKE &&
        subtype !== TileSubtype.WALL_TORCH &&
        subtype !== TileSubtype.TOWN_SIGN &&
        subtype !== TileSubtype.PORTAL &&
        subtype !== TileSubtype.SNAKE_MEDALLION &&
        subtype !== TileSubtype.PINK_RING &&
        // Exclude checkpoint: it has a custom asset overlay
        subtype !== TileSubtype.CHECKPOINT &&
        subtype !== TileSubtype.FAULTY_FLOOR &&
        subtype !== TileSubtype.OPEN_ABYSS &&
        subtype !== TileSubtype.DARKNESS &&
        subtype !== TileSubtype.DOOR &&
        subtype !== TileSubtype.ROOM_TRANSITION &&
        subtype !== TileSubtype.PLAYER &&
        subtype !== TileSubtype.WINDOW &&
        subtype !== TileSubtype.ROAD &&
        subtype !== TileSubtype.ROAD_STRAIGHT &&
        subtype !== TileSubtype.ROAD_CORNER &&
        subtype !== TileSubtype.ROAD_T &&
        subtype !== TileSubtype.ROAD_END &&
        subtype !== TileSubtype.ROAD_ROTATE_90 &&
        subtype !== TileSubtype.ROAD_ROTATE_180 &&
        subtype !== TileSubtype.ROAD_ROTATE_270 &&
        subtype !== TileSubtype.SIGN_STORE &&
        subtype !== TileSubtype.SIGN_LIBRARY &&
        subtype !== TileSubtype.SIGN_SMITHY &&
        subtype !== TileSubtype.BOOKSHELF &&
        // Exclude beds from generic rendering
        subtype !== TileSubtype.BED_EMPTY_1 &&
        subtype !== TileSubtype.BED_EMPTY_2 &&
        subtype !== TileSubtype.BED_EMPTY_3 &&
        subtype !== TileSubtype.BED_EMPTY_4 &&
        subtype !== TileSubtype.BED_FULL_1 &&
        subtype !== TileSubtype.BED_FULL_2 &&
        subtype !== TileSubtype.BED_FULL_3 &&
        subtype !== TileSubtype.BED_FULL_4 &&
        subtype !== TileSubtype.EXTRA_HEART &&
        // Bomb item + scorch/breach overlays have custom rendering
        subtype !== TileSubtype.BOMB &&
        subtype !== TileSubtype.BOMB_LIVE &&
        subtype !== TileSubtype.SINGED &&
        subtype !== TileSubtype.BREACH &&
        // Pink realm prizes have custom rendering (heart gets a glow overlay)
        subtype !== TileSubtype.PINK_HEART &&
        subtype !== TileSubtype.BERRY
    );
  };

  // Render subtype icons
  const renderSubtypeIcons = (subtypes: number[] | undefined) => {
    if (!subtypes || subtypes.length === 0) return null;

    const filteredSubtypes = getFilteredSubtypes(subtypes);

    return (
      <div className={styles.subtypeContainer}>
        {/* Scorch overlay left by a bomb blast (floor decal under items). Swap the
            CSS background for /images/items/singe-*.png art when available. */}
        {hasSinged(subtypes) && (
          <div
            key="singed"
            aria-hidden="true"
            data-testid={`subtype-icon-${TileSubtype.SINGED}`}
            className={styles.singedOverlay}
          />
        )}

        {/* Render chest with asset if present */}
        {hasChest(subtypes) && (
          <div
            key="chest"
            data-testid={`subtype-icon-${TileSubtype.CHEST}`}
            className={`${styles.assetIcon} ${styles.closedChestIcon}`}
          />
        )}

        {/* Render open chest with asset if present */}
        {hasOpenChest(subtypes) && (
          <div
            key="open-chest"
            data-testid={`subtype-icon-${TileSubtype.OPEN_CHEST}`}
            className={`${styles.assetIcon} ${styles.openedChestIcon}`}
          />
        )}

        {/* If chest is open, render revealed SWORD/SHIELD overlays */}
        {hasOpenChest(subtypes) && hasSwordItem(subtypes) && (
          <div
            key="sword-revealed"
            data-testid={`subtype-icon-${TileSubtype.SWORD}`}
            className={`${styles.assetIcon} ${styles.overlayIcon} ${styles.swordIcon}`}
          />
        )}
        {hasOpenChest(subtypes) && hasShieldItem(subtypes) && (
          <div
            key="shield-revealed"
            data-testid={`subtype-icon-${TileSubtype.SHIELD}`}
            className={`${styles.assetIcon} ${styles.overlayIcon} ${styles.shieldIcon}`}
          />
        )}
        {hasOpenChest(subtypes) && hasSnakeMedallion(subtypes) && (
          <div
            key="medallion-revealed"
            data-testid={`subtype-icon-${TileSubtype.SNAKE_MEDALLION}`}
            className={`${styles.assetIcon} ${styles.overlayIcon} ${styles.rockIcon}`}
            style={{
              backgroundImage: `url('/images/items/snake-medalion.png')`,
            }}
          />
        )}
        {hasOpenChest(subtypes) && hasExtraHeart(subtypes) && (
          <div
            key="extra-heart-revealed"
            data-testid={`subtype-icon-${TileSubtype.EXTRA_HEART}`}
            className={`${styles.assetIcon} ${styles.overlayIcon} ${styles.heartIcon}`}
          />
        )}
        {hasOpenChest(subtypes) && hasBombItem(subtypes) && (
          <div
            key="bomb-revealed"
            data-testid={`subtype-icon-${TileSubtype.BOMB}`}
            className={`${styles.assetIcon} ${styles.overlayIcon} ${styles.bombIcon}`}
          />
        )}

        {/* Render lightswitch with asset if present */}
        {hasLightswitch(subtypes) && (
          <div
            key="lightswitch"
            data-testid={`subtype-icon-${TileSubtype.LIGHTSWITCH}`}
            className={`${styles.assetIcon} ${styles.switchIcon}`}
          />
        )}

        {/* Render wall torch: flameless base sprite + animated flame overlay.
            Suppress on checkpoint tiles */}
        {hasWallTorch(subtypes) && !(subtypes?.includes(TileSubtype.CHECKPOINT)) && (
          <React.Fragment key="wall-torch">
            <div
              data-testid={`subtype-icon-${TileSubtype.WALL_TORCH}`}
              className={`${styles.assetIcon} ${styles.torchSprite}`}
              style={{ backgroundImage: `url(/images/items/wall-torch-2-base.png)` }}
            />
            <PixelFlame
              cell={1.5}
              glow
              seed={(row ?? 0) * 31 + (col ?? 0)}
              className={styles.wallTorchFlame}
            />
          </React.Fragment>
        )}

        {/* Render key with asset if present */}
        {hasKey(subtypes) && (
          <div
            key="key"
            data-testid={`subtype-icon-${TileSubtype.KEY}`}
            className={`${styles.assetIcon} ${styles.keyIcon}`}
          />
        )}

        {/* Render exit key with asset if present */}
        {hasExitKeySubtype(subtypes) && (
          <div
            key="exit-key"
            data-testid={`subtype-icon-${TileSubtype.EXITKEY}`}
            className={`${styles.assetIcon} ${styles.exitKeyIcon}`}
          />
        )}

        {/* Render door with asset if present - using full height icon */}
        {hasDoor(subtypes) && (
          <div
            key="door"
            data-testid={`subtype-icon-${TileSubtype.DOOR}`}
            className={`${styles.fullHeightAssetIcon} ${styles.doorIcon}`}
          />
        )}

        {/* Render exit with asset if present (floor overlay) */}
        {hasExit(subtypes) && (
          <>
            {/* Soft pulsing glow behind the exit icon (bigger/brighter when key owned) */}
            <div
              aria-hidden="true"
              className={`${styles.exitGlow} ${playerHasExitKey ? styles.exitGlowUnlocked : ''}`}
            />
            <div
              key="exit"
              data-testid={`subtype-icon-${TileSubtype.EXIT}`}
              className={`${styles.assetIcon} ${styles.fullHeightAssetIcon} ${styles.exitIcon}`}
              style={{
                backgroundImage: `url(${playerHasExitKey ? '/images/door/exit-transparent.png' : '/images/door/exit-dark.png'})`,
              }}
            />
            <div
              key="exit-lock"
              data-testid={`subtype-icon-exit-lock`}
              className={`${styles.assetIcon} ${styles.exitLockIcon}`}
            />
          </>
        )}

        {/* Render cave opening using exit-dark art, without lock overlay */}
        {hasCaveOpening(subtypes) && (
          <div
            key="cave-opening"
            data-testid={`subtype-icon-${TileSubtype.CAVE_OPENING}`}
            className={`${styles.assetIcon} ${styles.fullHeightAssetIcon} ${styles.exitIcon}`}
            style={{
              backgroundImage: `url('/images/door/exit-dark.png')`,
            }}
          />
        )}

        {/* Render POT/ROCK/FOOD/MED with assets if present */}
        {hasPot(subtypes) && (() => {
          const isSnakePot = subtypes?.includes(TileSubtype.SNAKE) ?? false;
          // Deterministic per-tile delay so multiple snake-pots don't rattle in
          // sync. Range 0.0-2.9s, kept under the 3s cycle so every value lands on a
          // distinct phase (delays past one cycle would alias back into sync).
          const y = typeof row === 'number' ? row : 0;
          const x = typeof col === 'number' ? col : 0;
          const delayMs = (((y * 73 + x * 131) % 30) / 10).toFixed(1);
          return (
            <div
              key="pot"
              data-testid={`subtype-icon-${TileSubtype.POT}`}
              className={`${styles.assetIcon} ${styles.potIcon}${isSnakePot ? ` ${styles.potIconSnake}` : ''}`}
              style={{
                backgroundImage: `url(${pickVariant([
                  '/images/items/pot-1.png',
                  '/images/items/pot-2.png',
                  '/images/items/pot-3.png',
                ])})`,
                ...(isSnakePot
                  ? ({ ['--snake-pot-delay' as string]: `${delayMs}s` } as React.CSSProperties)
                  : {}),
              }}
            />
          );
        })()}
        {hasRock(subtypes) && (
          <div
            key="rock"
            data-testid={`subtype-icon-${TileSubtype.ROCK}`}
            className={`${styles.assetIcon} ${styles.rockIcon}`}
            style={{
              backgroundImage: `url(${pickVariant([
                '/images/items/rock-1.png',
                '/images/items/rock-2.png',
              ])})`,
            }}
          />
        )}

        {/* Live thrown bomb sitting on the floor with its fuse lit: flashes between the
            black and red bomb sprites for a sparking, about-to-blow look. */}
        {hasLiveBomb(subtypes) && (
          <div
            key="bomb-live"
            data-testid={`subtype-icon-${TileSubtype.BOMB_LIVE}`}
            className={styles.bombLive}
            aria-hidden="true"
          >
            <div className={`${styles.bombLiveSprite} ${styles.bombLiveBlack}`} />
            <div className={`${styles.bombLiveSprite} ${styles.bombLiveRed}`} />
          </div>
        )}
        {hasFood(subtypes) && !hasPot(subtypes) && (
          <div
            key="food"
            data-testid={`subtype-icon-${TileSubtype.FOOD}`}
            className={`${styles.assetIcon} ${styles.foodIcon}`}
            style={{
              backgroundImage: `url(${pickVariant([
                '/images/items/food-1.png',
                '/images/items/food-2.png',
                '/images/items/food-3.png',
              ])})`,
            }}
          />
        )}
        {hasMed(subtypes) && !hasPot(subtypes) && (
          <div
            key="med"
            data-testid={`subtype-icon-${TileSubtype.MED}`}
            className={`${styles.assetIcon} ${styles.medIcon}`}
            style={{
              backgroundImage: `url('/images/items/meds-1.png')`,
            }}
          />
        )}

        {/* Render RUNE when revealed (do not show if still inside a POT) */}
        {hasRune(subtypes) && !hasPot(subtypes) && (
          <>
            {/* Glow behind the rune asset */}
            <div className={styles.runeGlow} aria-hidden="true" />
            <div
              key="rune"
              data-testid={`subtype-icon-${TileSubtype.RUNE}`}
              className={`${styles.assetIcon} ${styles.runeIcon}`}
              style={{
                backgroundImage: `url('/images/items/rune1.png')`,
              }}
            />
            {/* One-shot portal-sparkle burst on reveal: this block mounts the
                moment the pot smashes, so the burst marks the rune appearing */}
            <div
              className={styles.runeRevealSparkle}
              data-testid="rune-reveal-sparkle"
              aria-hidden="true"
            />
            <div
              className={`${styles.runeRevealSparkle} ${styles.runeRevealSparkleSmall}`}
              aria-hidden="true"
            />
          </>
        )}

        {/* Render pink ring (teleportation marker from pink goblin). The ring
            asset is sparkle-free; dynamic CSS sparkles rise off it instead, so
            the effect travels with the ring — not the goblin — when the ring
            is parked on another tile. */}
        {hasPinkRing(subtypes) && (
          <>
            <div
              key="pink-ring"
              data-testid={`subtype-icon-${TileSubtype.PINK_RING}`}
              className={`${styles.assetIcon} ${styles.runeIcon}`}
              style={{
                backgroundImage: `url('/images/enemies/fire-goblin/pink-ring-no-sparkle.png')`,
              }}
            />
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={`pink-ring-sparkle-${i}`}
                className="pink-ring-sparkle"
                aria-hidden="true"
                style={
                  {
                    left: `${28 + i * 11}%`,
                    ['--dx' as string]: `${(i % 2 ? 1 : -1) * (3 + i * 2)}px`,
                    animationDelay: `${i * 0.35}s`,
                  } as React.CSSProperties
                }
              />
            ))}
          </>
        )}

        {/* Render the pink flaming heart prize (with a pink glow) only once its chest is
            open — while the chest is closed/locked it stays hidden inside. */}
        {hasOpenChest(subtypes) && hasPinkHeart(subtypes) && (
          <>
            <div className={styles.pinkGlow} aria-hidden="true" />
            <div
              key="pink-heart"
              data-testid={`subtype-icon-${TileSubtype.PINK_HEART}`}
              className={`${styles.assetIcon} ${styles.pinkHeartIcon}`}
            />
          </>
        )}

        {/* Render the belted berry prize */}
        {hasBerry(subtypes) && (
          <div
            key="berry"
            data-testid={`subtype-icon-${TileSubtype.BERRY}`}
            className={`${styles.assetIcon} ${styles.berryIcon}`}
          />
        )}

        {/* Render town sign */}
        {hasTownSign(subtypes) && (
          <div
            key="town-sign"
            data-testid={`subtype-icon-${TileSubtype.TOWN_SIGN}`}
            className={`${styles.assetIcon} ${styles.rockIcon}`}
            style={{
              backgroundImage: `url('/images/items/town-sign.png')`,
            }}
          />
        )}

        {/* Render portal (snake medallion travel point): a blue twin of the
            pink goblin's teleport ring — same ring asset recolored, same
            rising sparkles — so the two teleport visuals read as parallels. */}
        {hasPortal(subtypes) && (
          <>
            <div
              key="portal"
              data-testid={`subtype-icon-${TileSubtype.PORTAL}`}
              aria-hidden="true"
              style={{
                // Nudged down a few px (matching the pink goblin's under-ring)
                // so the ring ellipse sits at the hero's feet when he's standing
                // on the portal, instead of overlapping his body.
                position: 'absolute',
                left: '50%',
                top: 'calc(50% + 5px)',
                width: 24,
                height: 24,
                transform: 'translate(-50%, -50%)',
                backgroundImage: `url('/images/enemies/fire-goblin/blue-ring-no-sparkle.png')`,
                backgroundSize: 'contain',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
                zIndex: 1030,
                pointerEvents: 'none',
              }}
            />
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={`portal-sparkle-${i}`}
                className="pink-ring-sparkle blue"
                aria-hidden="true"
                style={
                  {
                    left: `${28 + i * 11}%`,
                    ['--dx' as string]: `${(i % 2 ? 1 : -1) * (3 + i * 2)}px`,
                    animationDelay: `${i * 0.35}s`,
                  } as React.CSSProperties
                }
              />
            ))}
          </>
        )}

        {/* Render snake medallion (standalone, not inside a chest) */}
        {hasSnakeMedallion(subtypes) && !hasChest(subtypes) && !hasOpenChest(subtypes) && (
          <div
            key="snake-medallion"
            data-testid={`subtype-icon-${TileSubtype.SNAKE_MEDALLION}`}
            className={`${styles.assetIcon} ${styles.rockIcon}`}
            style={{
              backgroundImage: `url('/images/items/snake-medalion.png')`,
            }}
          />
        )}

        {/* Render bed */}
        {hasBed(subtypes) && getBedAsset(subtypes) && (
          <div
            key="bed"
            data-testid="bed-overlay"
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${getBedAsset(subtypes)})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              imageRendering: 'pixelated',
              zIndex: 1,
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Render faulty floor cracks overlay. Kept mounted (same key) through the
            faulty -> open-abyss transition so it never blinks to plain floor; once
            the tile opens, it breaks away in sync with the pit (see abyssOpen). */}
        {(hasFaultyFloor(subtypes) || hasOpenAbyss(subtypes)) && (
          <div
            key="faulty-floor"
            data-testid={`subtype-icon-${TileSubtype.FAULTY_FLOOR}`}
            className={`${styles.assetIcon} ${styles.faultyFloorIcon}${
              hasOpenAbyss(subtypes) && !hasFaultyFloor(subtypes)
                ? ` ${styles.faultyFloorIconBreaking}`
                : ""
            }`}
            style={{
              transform: `translate(-50%, -50%) rotate(${getFaultyFloorRotation()}deg)`,
            }}
          />
        )}

        {/* Render remaining subtypes with standard icons */}
        {filteredSubtypes.map((subtype) => (
          <div
            key={subtype}
            data-testid={`subtype-icon-${subtype}`}
            className={`${styles.subtypeIcon} ${getSubtypeColor(subtype)}`}
          >
            {getSubtypeSymbol(subtype)}
          </div>
        ))}
      </div>
    );
  };

  // Get the appropriate hero image based on player direction, equipment, and torch state if this is a player tile
  const deathPhase = heroDeathState?.phase ?? "idle";
  const heroDirectionForSprite = (() => {
    if (!heroDeathState || deathPhase === "idle") {
      return playerDirection;
    }
    // Abyss death: show the hero's back (diving in); the heading is conveyed by
    // rotating the sprite, not by swapping it.
    if (heroDeathState.variant === "abyss") {
      return Direction.UP; // maps to the back-facing sprite
    }
    if (deathPhase === "fallen" || deathPhase === "spirit" || deathPhase === "complete") {
      return Direction.RIGHT;
    }
    return heroDeathState.orientation;
  })();

  const heroImage = isVisible && subtype && subtype.includes(TileSubtype.PLAYER)
    ? (() => {
        const equip = () => {
          const s = hasSword ? '-sword' : '';
          const h = hasShield ? '-shield' : '';
          // Order: shield then sword when both are present
          if (s && h) return '-shield-sword';
          if (h) return '-shield';
          if (s) return '-sword';
          return '';
        };
        let dir = 'front';
        switch (heroDirectionForSprite) {
          case Direction.UP:
            dir = 'back';
            break;
          case Direction.RIGHT:
          case Direction.LEFT:
            dir = 'right';
            break;
          case Direction.DOWN:
          default:
            dir = 'front';
        }
        // Lit torch uses the flameless base sprite; PixelFlame supplies the fire
        const variant = heroTorchLit ? '-noflame' : '-snuff';
        return `/images/hero/hero-${dir}${equip()}${variant}-static.png`;
      })()
    : '';

  // Determine if we need to flip the hero image for left-facing direction
  const heroDeathVariant = heroDeathState?.variant ?? "topple";
  const heroIsDying = !!heroDeathState && deathPhase !== "idle";
  const heroIsAbyss = isPlayerTile && heroIsDying && heroDeathVariant === "abyss";
  const heroTransform = (() => {
    // Abyss uses the standalone `rotate`/`scale` props (below), not `transform`.
    if (heroIsAbyss) return 'none';
    const transforms: string[] = [];
    if (isPlayerTile) {
      const directionForTransform = heroIsDying
        ? heroDeathState!.orientation
        : playerDirection;
      if (directionForTransform === Direction.LEFT && (!heroDeathState || deathPhase === "spinning")) {
        transforms.push('scaleX(-1)');
      }
      if (
        heroDeathState &&
        (deathPhase === "fallen" || deathPhase === "spirit" || deathPhase === "complete")
      ) {
        transforms.push('rotate(-90deg)');
      }
    }
    return transforms.length > 0 ? transforms.join(' ') : 'none';
  })();
  // Abyss death: rotate the back-facing sprite toward the heading (instant, so it
  // reads as "turned", not spinning), and shrink it uniformly to nothing. Done via
  // the standalone `rotate`/`scale` CSS props so only the scale transitions.
  const heroAbyssRotate = (() => {
    if (!heroIsAbyss) return undefined;
    switch (heroDeathState?.orientation) {
      case Direction.RIGHT:
        return '90deg'; // clockwise
      case Direction.DOWN:
        return '180deg';
      case Direction.LEFT:
        return '-90deg';
      case Direction.UP:
      default:
        return '0deg';
    }
  })();
  const heroScale = heroIsAbyss ? '0' : undefined;
  const heroTransition = heroIsAbyss ? 'scale 450ms ease-in' : undefined;

  const shouldShowNpc = npc && ((npcVisible ?? isVisible) === true);
  const npcTransform = (() => {
    if (!npc) return 'none';
    const transforms: string[] = [];
    switch (npc.facing) {
      case Direction.LEFT:
        transforms.push('scaleX(-1)');
        break;
      case Direction.UP:
        transforms.push('rotate(-90deg)');
        break;
      case Direction.RIGHT:
      case Direction.DOWN:
      default:
        break;
    }
    return transforms.join(' ');
  })();
  const npcScale = (() => {
    const s = npc?.metadata?.scale;
    return typeof s === 'number' ? s : 1;
  })();
  const npcTransformWithScale = npc
    ? `${npcTransform}${npcScale !== 1 ? ` scale(${npcScale})` : ''}`
    : npcTransform;
  const npcTransformOrigin = (() => {
    if (!npc) return '50% 100%';
    switch (npc.facing) {
      case Direction.UP:
        return '50% 60%';
      default:
        return '50% 100%';
    }
  })();
  // Don't show dialogue prompt for dogs (they use petting interaction instead)
  const isDogNpc = npc?.tags?.includes("dog") || npc?.tags?.includes("pet");
  const showNpcPrompt = shouldShowNpc && npcInteractable && !isDogNpc;

  // Smooth movement (Phase 2): style fragment that slides a sprite in from its
  // previous tile (see SmoothEntityStep). The translate leads so it applies in
  // tile coordinates before any facing flip/scale in `base`.
  const smoothStepStyle = (
    step: SmoothEntityStep | undefined,
    base: string
  ): React.CSSProperties | null => {
    if (!step) return null;
    const baseSuffix = !base || base === 'none' ? '' : ` ${base}`;
    return {
      ['--smooth-step-from' as string]: `translate(${step.dx * 40}px, ${step.dy * 40}px)${baseSuffix}`,
      ['--smooth-step-to' as string]: !base || base === 'none' ? 'none' : base,
      animation: `smoothStepSlide ${step.dur}ms ${step.ease} both`,
    } as React.CSSProperties;
  };

  // Regular-goblin variant: same slide, plus a bob + alternating tilt baked
  // into a midpoint keyframe (see smoothStepSlideBob in globals.css). The
  // midpoint is the geometric center of the slide with a vertical lift
  // subtracted (screen-up is negative Y) and a rotate layered on top; 0%/100%
  // stay flat-footed so the arc reads as a step, not a wobble at rest.
  const smoothStepBobStyle = (
    step: SmoothEntityStep | undefined,
    base: string
  ): React.CSSProperties | null => {
    if (!step) return null;
    const baseSuffix = !base || base === 'none' ? '' : ` ${base}`;
    const midX = (step.dx * 40) / 2;
    const midY = (step.dy * 40) / 2 - ENEMY_GAIT.bobPx;
    const tilt = (step.seq % 2 ? 1 : -1) * ENEMY_GAIT.tiltDeg;
    return {
      ['--smooth-step-from' as string]: `translate(${step.dx * 40}px, ${step.dy * 40}px)${baseSuffix}`,
      ['--smooth-step-mid' as string]: `translate(${midX}px, ${midY}px) rotate(${tilt}deg)${baseSuffix}`,
      ['--smooth-step-to' as string]: !base || base === 'none' ? 'none' : base,
      animation: `smoothStepSlideBob ${step.dur}ms ${step.ease} both`,
    } as React.CSSProperties;
  };

  // The pink goblin carries its teleport ring with it: unless the ring is
  // cast somewhere else (a PINK_RING subtype tile), it renders directly under
  // the goblin with the same rising sparkles the standing ring has.
  const renderPinkRingUnder = () => (
    <>
      <div
        key="pink-ring-under"
        aria-hidden="true"
        style={{
          // Mirror the deployed ring's .assetIcon sizing (24x24, centered in
          // the tile) so the ring looks identical whether it's under the
          // goblin or parked on its own tile. Nudged down a few px so the
          // ring ellipse sits under the goblin's feet rather than behind him.
          position: 'absolute',
          left: '50%',
          top: 'calc(50% + 5px)',
          width: 24,
          height: 24,
          transform: 'translate(-50%, -50%)',
          backgroundImage: `url('/images/enemies/fire-goblin/pink-ring-no-sparkle.png')`,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          pointerEvents: 'none',
        }}
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={`pink-ring-under-sparkle-${i}`}
          className="pink-ring-sparkle"
          aria-hidden="true"
          style={
            {
              left: `${28 + i * 11}%`,
              ['--dx' as string]: `${(i % 2 ? 1 : -1) * (3 + i * 2)}px`,
              animationDelay: `${i * 0.35}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </>
  );

  // Enemy aura + sprite, shared by the floor (tileId 0) and flowers (tileId 5)
  // branches so the smooth slide-in logic lives in one place.
  const renderEnemySprite = () => {
    if (!hasEnemy) return null;
    // Hovering enemies: ghosts (smooth mode) and pink goblins (ALL modes —
    // since the ringless art landed, the floating-goblin-over-ring composition
    // IS the pink goblin's look, not a smooth-mode extra). Two transform
    // animations can't share one element, so the slide (+ facing flip) runs on
    // the outer wrapper and the float — plus the ghost's opacity flicker — on
    // the inner sprite. (The ghost's inline animation list must re-include
    // ghost-flicker: the inline property overrides the .ghostFlicker class.)
    if ((smoothMode && enemyKind === 'ghost') || enemyKind === 'pink-goblin') {
      if ((enemyVisible ?? isVisible) !== true) return null;
      const isGhost = enemyKind === 'ghost';
      const hoverIcon = isGhost
        ? getEnemyIcon('ghost', 'front')
        : getEnemyIcon(
            'pink-goblin',
            enemyFacing === 'UP'
              ? 'back'
              : enemyFacing === 'RIGHT'
              ? 'right'
              : enemyFacing === 'LEFT'
              ? 'left'
              : 'front'
          );
      // Pink goblin's side art faces LEFT, so it flips when facing RIGHT.
      const hoverBase =
        !isGhost && enemyFacing === 'RIGHT' ? 'scaleX(-1)' : 'none';
      return (
        <div
          key={enemyStep ? `enemy-step-${enemyStep.seq}` : 'enemy-static'}
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 10500, // above fog (10000), below wall tops (12000)
            transform: hoverBase,
            ...smoothStepStyle(enemyStep, hoverBase),
          }}
          data-testid="enemy-sprite"
        >
          {/* Undeployed teleport ring travels with the goblin (inside the
              sliding wrapper so it glides along) */}
          {!isGhost && enemyRingUnder && renderPinkRingUnder()}
          <div
            className={isGhost ? 'ghostFlicker' : undefined}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${hoverIcon})`,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              // Same cave dimming as the legacy sprite path
              filter: !environmentConfig.daylight
                ? 'brightness(var(--enemy-dim, 0.80))'
                : undefined,
              animation: isGhost
                ? 'ghost-flicker 2000ms ease-in-out infinite, ghostFloat 3600ms ease-in-out infinite'
                : 'ghostFloat 3200ms ease-in-out infinite',
            }}
          />
        </div>
      );
    }
    // Phase 3 (smooth mode only): white-goblin swarms render as N overlaid
    // SINGLE goblins instead of the baked 1-4 pack images. Singles have real
    // right-facing art, so sideways packs mirror properly instead of the
    // legacy front/back-by-parity fallback. Members are depth-sorted by their
    // vertical offset so higher-up goblins sit behind lower ones.
    if (smoothMode && enemyKind === 'white-goblin') {
      const count = Math.max(1, Math.min(4, enemySwarmCount ?? 1));
      const dir =
        enemyFacing === 'UP'
          ? 'back'
          : enemyFacing === 'LEFT' || enemyFacing === 'RIGHT'
          ? 'right'
          : 'front';
      const src = `/images/enemies/fire-goblin/white-goblins-${dir}-1.png`;
      // Flip the whole cluster for LEFT so member offsets mirror consistently.
      const clusterBase = enemyFacing === 'LEFT' ? 'scaleX(-1)' : 'none';
      const offsets: Array<[number, number]> = [
        [-8, 2],
        [7, 3],
        [-2, -3],
        [9, -1],
      ];
      return (
        <>
          {enemyAura && (
            <div className={styles.exitGlow} aria-hidden="true" />
          )}
          {((enemyVisible ?? isVisible) === true) && (
            <div
              key={enemyStep ? `enemy-step-${enemyStep.seq}` : 'enemy-static'}
              className="absolute inset-0 pointer-events-none"
              style={{
                zIndex: 10500, // above fog (10000), below wall tops (12000)
                transform: clusterBase,
                // Same cave dimming as the single-sprite path
                filter: !environmentConfig.daylight
                  ? 'brightness(var(--enemy-dim, 0.80))'
                  : undefined,
                ...smoothStepStyle(enemyStep, clusterBase),
              }}
              data-testid="enemy-sprite"
            >
              {offsets.slice(0, count).map(([ox, oy], k) => (
                <div
                  key={k}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    transform: `translate(${ox}px, ${oy}px) scale(0.68)`,
                    transformOrigin: '50% 100%',
                    zIndex: 10 + oy, // painter's order by vertical offset
                    backgroundImage: `url(${src})`,
                    backgroundSize: 'contain',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                  }}
                />
              ))}
            </div>
          )}
        </>
      );
    }
    // Facing flip / scale for the sprite (composed into the slide keyframes too).
    // Snake pose: in smooth mode the slither sprite shows ONLY while the tile
    // slide is actually animating (coiled the moment it lands); legacy keeps
    // the per-turn `moved` flag since there is no tween to sync with.
    const snakeMoving = smoothMode ? enemySliding : !!enemyMoved;
    const enemyBaseTransform = (() => {
      // Default flip rule (for enemies that only have right-facing art): flip when facing LEFT
      if (enemyKind !== 'snake') {
        if (enemyKind === 'ghost') return 'none';
        if (enemyKind === 'white-goblin') return 'none';
        // (pink-goblin never reaches here — it always takes the hover branch)
        return enemyFacing === 'LEFT' ? 'scaleX(-1)' : 'none';
      }
      // Snakes: scale to 50% and flip moving-right to mirror moving-left asset
      const baseScale = 'scale(0.5)';
      if (snakeMoving && enemyFacing === 'RIGHT') {
        return 'scaleX(-1) ' + baseScale;
      }
      return baseScale;
    })();
    return (
      <>
        {enemyAura && (
          <div
            // Slide with the goblin: the aura renders in the destination tile,
            // so without this it snaps a tile ahead while the sprite glides.
            // The class's own centering translate composes into the keyframes.
            key={enemyStep ? `enemy-aura-step-${enemyStep.seq}` : 'enemy-aura-static'}
            className={styles.exitGlow}
            style={{
              ...smoothStepStyle(enemyStep, 'translate(-50%, -50%)'),
            }}
            aria-hidden="true"
          />
        )}
        {((enemyVisible ?? isVisible) === true) && (
          <div
            // A fresh step re-keys the node so the CSS animation restarts even
            // when a different enemy arrives on a still-mounted tile.
            key={enemyStep ? `enemy-step-${enemyStep.seq}` : 'enemy-static'}
            className={`absolute inset-0 pointer-events-none ${enemyKind === 'ghost' ? 'ghostFlicker' : ''}`}
            style={{
              backgroundImage: `url(${(() => {
                // Map Tile.tsx enemyFacing to registry Facing
                const toFacing = (f: 'UP' | 'RIGHT' | 'DOWN' | 'LEFT' | undefined): Facing => {
                  switch (f) {
                    case 'UP':
                      return 'back';
                    case 'RIGHT':
                      return 'right';
                    case 'LEFT':
                      return 'left';
                    case 'DOWN':
                    default:
                      return 'front';
                  }
                };
                const kind: EnemyKind = (enemyKind ?? 'fire-goblin');
                // For snakes: slither sprite while moving, coiled otherwise
                // (smooth mode syncs "moving" to the live slide animation)
                if (kind === 'snake') {
                  const f = enemyFacing;
                  // moving sprite only exists for 'left'; request 'left' for moving, coiled otherwise
                  if (snakeMoving) {
                    return getEnemyIcon('snake', 'left');
                  }
                  // coiled sprite follows facing (front/back/right are coiled)
                  return getEnemyIcon('snake', toFacing(f));
                }
                // White goblins: no side asset; sideways uses front or back based on swarm count parity
                if (kind === 'white-goblin') {
                  const f = enemyFacing;
                  const isSideways = f === 'LEFT' || f === 'RIGHT';
                  const facing: Facing = isSideways
                    ? ((enemySwarmCount ?? 1) % 2 === 0 ? 'back' : 'front')
                    : toFacing(f);
                  return getEnemyIcon('white-goblin', facing, enemySwarmCount ?? 1);
                }
                const facing: Facing = toFacing(enemyFacing);
                // Fire goblins carry an animated torch (see PixelFlame below):
                // swap in the flameless base art. Registry paths stay flamed
                // for non-game UI (summaries, end screens).
                if (kind === 'fire-goblin') {
                  const f = facing === 'left' ? 'right' : facing;
                  return `/images/enemies/fire-goblin/fire-goblin-${f}-base.png`;
                }
                return getEnemyIcon(kind, facing);
              })()})`,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              zIndex: 10500, // above fog (10000), below wall tops (12000)
              transform: enemyBaseTransform,
              // Darken non-torch-carrying enemies in cave/underground environments
              filter: (!environmentConfig.daylight && enemyKind !== 'fire-goblin')
                ? 'brightness(var(--enemy-dim, 0.80))'
                : undefined,
              // Combat lunge (standalone `translate`) — spread before the
              // slide styles so a live slide's `animation` wins if both fire
              // on the same turn.
              ...combatLungeStyle(enemyLunge),
              // Only while actually sliding: once the tween lands the animation
              // style is dropped so the static transform/pose takes over (this
              // is what lets the snake snap back to its coiled sprite). Regular
              // goblins (fire/water/earth family) get the bob+tilt variant so
              // their walk reads as a step rather than a flat glide.
              ...(enemySliding
                ? REGULAR_GOBLIN_KINDS.has(enemyKind ?? '')
                  ? smoothStepBobStyle(enemyStep, enemyBaseTransform)
                  : smoothStepStyle(enemyStep, enemyBaseTransform)
                : null),
            }}
            onAnimationEnd={(e) => {
              if (
                (e.animationName === 'smoothStepSlide' ||
                  e.animationName === 'smoothStepSlideBob') &&
                enemyStep
              ) {
                setSmoothSlideDoneSeq(enemyStep.seq);
              }
            }}
            data-testid="enemy-sprite"
          >
            {/* Fire goblin torch flame; nested so the facing flip and smooth
                slide transforms carry it along */}
            {enemyKind === 'fire-goblin' && (() => {
              const dirKey =
                enemyFacing === 'UP'
                  ? 'back'
                  : enemyFacing === 'RIGHT' || enemyFacing === 'LEFT'
                  ? 'right'
                  : 'front';
              const anchor = GOBLIN_FLAME_ANCHOR[dirKey];
              return (
                <PixelFlame
                  cell={1.4}
                  seed={(row ?? 0) * 17 + (col ?? 0) * 7 + 3}
                  style={{ ...anchor, transform: 'translateX(-50%)' }}
                />
              );
            })()}
          </div>
        )}
      </>
    );
  };

  // If this is a floor tile
  if (tileId === 0) {
    // Floor tiles - only visible if within player's field of view
    if (isVisible) {
      // Check if this floor tile has darkness (collapsed faulty floor) or open abyss
      const isDarkness = hasDarkness(subtype);
      const isOpenAbyss = hasOpenAbyss(subtype);
      const floorClasses = `${styles.tileContainer} ${isDarkness ? styles.darkness : isOpenAbyss ? styles.openAbyss : styles.floor} ${tierClass}${inNightmare ? " nightmare-floor" : ""}`;

      // Map floor variant to NESW asset filename based on neighbors
      const floorAsset =
        process.env.NODE_ENV === 'test'
          ? environmentConfig.floorDefault
          : getFloorAsset(environment, { hasNorthNeighbor: Boolean(topNeighbor) });

      // Check if bottom neighbor is a wall - if so, we'll render the wall top overlay
      const hasWallBelow = neighbors.bottom === 1;
      // Check if bottom neighbor is a roof - floor tiles behind the house have ROOF tiles below them
      const hasRoofBelowForBackOverhang = neighbors.bottom === 4;
      
      // Determine which wall image to use for the overlay based on neighboring walls
      let wallPattern = '0111';

      if (hasWallBelow) {
        // Check if there are walls to the left and right
        const hasWallLeft = neighbors.left === 1;
        const hasWallRight = neighbors.right === 1;
        
        if (!hasWallLeft && !hasWallRight) {
          // No walls on sides, use wall-0010.png (just top wall)
          wallPattern = '0010';
        } else if (hasWallLeft && !hasWallRight) {
          // Wall on left only
          wallPattern = '0110';
        } else if (!hasWallLeft && hasWallRight) {
          // Wall on right only
          wallPattern = '0011';
        } else {
          // Walls on both sides
          wallPattern = '0111';
        }
      }
      const wallTopImage = getWallAsset(environment, wallPattern);
      const roofBackOverhangImage = '/images/roof/spanish-roof-back-overhang.png';

      return (
        <div
          className={floorClasses}
          style={{
            backgroundImage: `url(${floorAsset})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            position: "relative", // Ensure relative positioning for absolute children
            backgroundColor: process.env.NODE_ENV === 'test' ? '#c8c8c8' : 'transparent'
          }}
          data-testid={`tile-${tileId}`}
          data-neighbor-code={neighborCode}
        >
          {/* Render checkpoint asset if present (full-tile overlay) */}
          {Array.isArray(subtype) && subtype.includes(TileSubtype.CHECKPOINT) && (() => {
            const isActive = Array.isArray(activeCheckpoint) &&
              typeof row === 'number' && typeof col === 'number' &&
              activeCheckpoint[0] === row && activeCheckpoint[1] === col;
            return (
              <>
                {isActive && (
                  <div
                    key="checkpoint-glow"
                    className={styles.checkpointGlow}
                    aria-hidden="true"
                  />
                )}
                <div
                  key="checkpoint"
                  className={styles.checkpointOverlay}
                  style={{
                    backgroundImage: `url('/images/items/checkpoint-unlit.png')`
                  }}
                  aria-label="checkpoint"
                />
                {/* Lit checkpoints burn with an animated flame on the torch nub */}
                {isActive && (
                  <PixelFlame
                    cell={1.1}
                    glow
                    seed={(row ?? 0) * 13 + (col ?? 0) * 3}
                    className={styles.checkpointFlame}
                  />
                )}
              </>
            );
          })()}
          {/* Render dirt road overlay if this floor tile is marked as part of a road */}
          {hasRoad(subtype) && renderRoadOverlay(subtype)}
          {/* Render hero image on top of floor if this is a player tile.
              Smooth mode shows the hero as a viewport overlay instead, but the
              tile hero stays MOUNTED (hidden) so death animations that rely on
              CSS transitions — the abyss scale-to-0 dive — start from a live
              element; a freshly-mounted node would jump straight to the end
              state and the dive would never be visible. */}
          {isPlayerTile && (
            <div
              className={styles.heroImage}
              style={{
                backgroundImage: `url(${heroImage})`,
                transform: heroTransform,
                rotate: heroAbyssRotate,
                scale: heroScale,
                transition: heroTransition,
                backgroundColor: 'transparent',
                // Combat lunge rides the standalone `translate` property, so
                // it can share the element with the warp flicker (opacity) —
                // both animations are comma-joined. Suppressed while dying so
                // it can't fight the death transitions.
                ...(heroDeathState ? null : combatLungeStyle(heroLunge)),
                animation:
                  [
                    heroWarping
                      ? 'heroWarpFlicker 0.16s steps(2) infinite'
                      : null,
                    !heroDeathState && heroLunge
                      ? combatLungeStyle(heroLunge)?.animation
                      : null,
                  ]
                    .filter(Boolean)
                    .join(', ') || undefined,
                visibility: suppressHeroSprite ? 'hidden' : undefined,
              }}
            >
              {/* Torch flame rides inside the hero div so facing flips, warp
                  flicker, and death transforms all apply to it too */}
              {heroTorchLit && (() => {
                const dirKey =
                  heroDirectionForSprite === Direction.UP
                    ? 'back'
                    : heroDirectionForSprite === Direction.RIGHT ||
                      heroDirectionForSprite === Direction.LEFT
                    ? 'right'
                    : 'front';
                const anchor = HERO_FLAME_ANCHOR[dirKey];
                return (
                  <PixelFlame
                    cell={1.4}
                    seed={5}
                    style={{ ...anchor, transform: 'translateX(-50%)' }}
                  />
                );
              })()}
              {!heroTorchLit && heroTorchSnuffing && (() => {
                const dirKey =
                  heroDirectionForSprite === Direction.UP
                    ? 'back'
                    : heroDirectionForSprite === Direction.RIGHT ||
                      heroDirectionForSprite === Direction.LEFT
                    ? 'right'
                    : 'front';
                const anchor = HERO_FLAME_ANCHOR[dirKey];
                // Blue spirit flame fluttering up and fading as the wisp takes it.
                // Same anchor + centering as the lit flame so it sits on the torch.
                return (
                  <PixelFlame
                    cell={1.4}
                    seed={5}
                    palette="blue"
                    style={{
                      ...anchor,
                      transform: 'translateX(-50%)',
                      animation: 'flameSnuffAway 0.56s ease-out forwards',
                    }}
                  />
                );
              })()}
            </div>
          )}
          {/* Hero poison visuals: glow + stench wisps */}
          {isPlayerTile && heroPoisoned && (
            <>
              {/* multiple wisps with slight offsets for variety */}
              <div className="poison-stench" style={{ left: '42%' }} aria-hidden="true" />
              <div className="poison-stench" style={{ left: '58%', animationDelay: '200ms' }} aria-hidden="true" />
              <div className="poison-stench" style={{ left: '50%', animationDelay: '400ms', width: '10px' }} aria-hidden="true" />
            </>
          )}

          {shouldShowNpc && npc && (
            <div
              // Re-key per step so the slide-in animation restarts (see enemy sprite).
              key={npcStep ? `npc-step-${npcStep.seq}` : 'npc-static'}
              className={isDogNpc ? styles.npcImageDog : styles.npcImage}
              style={{
                backgroundImage: `url(${npc.sprite})`,
                transform: npcTransformWithScale,
                transformOrigin: npcTransformOrigin,
                // Dogs get the bob+tilt step (the wiggle); other NPCs slide flat.
                ...(isDogNpc
                  ? smoothStepBobStyle(npcStep, npcTransformWithScale)
                  : smoothStepStyle(npcStep, npcTransformWithScale)),
              }}
              aria-hidden="true"
              data-testid="npc-sprite"
            />
          )}
          {showNpcPrompt && (
            <div className={styles.npcDialogueIcon} aria-hidden="true">
              💬
            </div>
          )}

          {/* Enemy rendering: sprite (when visible) */}
          {renderEnemySprite()}

          {/* Render bookshelf if present */}
          {subtype.includes(TileSubtype.BOOKSHELF) && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: "url(/images/items/bookshelf.png)",
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                imageRendering: "pixelated",
                zIndex: 1,
              }}
              data-testid="bookshelf-overlay"
              aria-hidden="true"
            />
          )}

          {/* Render all subtypes as standardized icons */}
          {renderSubtypeIcons(subtype)}
          
          {/* Render wall top overlay if there's a wall below this floor tile */}
          {hasWallBelow && (
            <div 
              className={styles.wallTopOverlay}
              style={{
                backgroundImage: `url(${wallTopImage})`,
              }}
              data-testid="wall-top-overlay"
            />
          )}
          
          {/* Render roof back overhang overlay if this floor tile has a roof below it */}
          {hasRoofBelowForBackOverhang && (
            <div 
              className={styles.roofOverhangOverlay}
              style={{
                backgroundImage: `url(${roofBackOverhangImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center bottom',
              }}
              data-testid="roof-back-overhang-overlay"
            />
          )}
        </div>
      );
    } else {
      // Invisible floor
      return (
        <div
          className={`${styles.tileContainer} ${styles.invisible} ${invisibleClassName ?? ''}`}
          data-testid={`tile-${tileId}`}
        />
      );
    }
  }

  // If this is a wall tile
  if (tileId === 1) {
    if (isVisible) {
      // Create the wall style
      let wallClasses = `${styles.tileContainer} ${styles.wall} ${tierClass}`;

      // Inner shadow for 3D effect - differs based on neighbors
      let shadowClasses = "";

      // Top-left inner shadow
      if (topNeighbor || leftNeighbor) {
        // If wall has neighbors at top or left, add inset shadow
        if (topNeighbor && leftNeighbor) {
          shadowClasses = " shadow-[inset_2px_2px_0px_#3a3a3a]";
        } else if (topNeighbor) {
          shadowClasses = " shadow-[inset_0px_2px_0px_#3a3a3a]";
        } else if (leftNeighbor) {
          shadowClasses = " shadow-[inset_2px_0px_0px_#3a3a3a]";
        }
      }

      // Edge highlights - only on edges without same neighbors
      let highlightClasses = "";

      // Top edge highlight
      if (!topNeighbor) {
        highlightClasses += ` ${styles.wallTopHighlight}`;
      }

      // Right edge highlight
      if (!rightNeighbor) {
        highlightClasses += ` ${styles.wallRightHighlight}`;
      }

      // Check if there's a roof tile behind (north of) this wall - for roof overhang
      const hasRoofBehind = neighbors.top === 4;
      const roofFrontOverhangImage = '/images/roof/spanish-roof-front-overhang.png';
      
      // Check if there's a roof tile below (south of) this wall - for roof back overhang
      const hasRoofBelow = neighbors.bottom === 4;
      const roofBackOverhangImage = '/images/roof/spanish-roof-back-overhang.png';

      // Forced perspective: if the tile below is a FLOOR (0), make the bottom border thicker/darker
      const isFloorBelow = neighbors.bottom === 0;
      if (isFloorBelow) {
        // Keep these utility-like classes for tests and easy tuning via :global
        wallClasses += " border-b-8 border-b-[#1f1f1f]";
      }

      // When there's a roof below, we need to modify the neighbor info to treat it like a wall below
      // This ensures the wall renders as a "top wall" (pattern 0010) connected to the house
      const modifiedNeighbors = hasRoofBelow 
        ? { ...neighbors, bottom: 1 } // Treat roof as wall for pattern calculation
        : neighbors;

      const variantName = getWallVariantName(modifiedNeighbors);

      // Map wall variant to NESW asset filename
      // N is always 0 since we don't care about the north direction
      let wallPattern = '0111';
      let wallAsset = "";

      if (variantName === "wall_pillar") {
        wallClasses += ` ${styles.wallPillar}`;
        wallPattern = '0000';
      }
      // Apply helper classes for other variants and map to NESW wall assets
      if (variantName === "wall_end_e") {
        if (isFloorBelow) wallClasses += ` ${styles.wallBase70}`;
        wallClasses += ` ${styles.wallEdgeR}`;
        wallPattern = '0001';
      } else if (variantName === "wall_end_w") {
        if (isFloorBelow) wallClasses += ` ${styles.wallBase70}`;
        wallClasses += ` ${styles.wallEdgeL}`;
        wallPattern = '0100';
      } else if (variantName === "wall_end_n") {
        if (isFloorBelow) wallClasses += ` ${styles.wallBase70}`;
        wallPattern = '0010';
      } else if (variantName === "wall_corner_ne") {
        if (isFloorBelow) wallClasses += ` ${styles.wallBase70}`;
        // Corner NE shows left face in our simplified CSS
        wallClasses += ` ${styles.wallEdgeL}`;
        wallPattern = '0011';
      } else if (variantName === "wall_corner_nw") {
        if (isFloorBelow) wallClasses += ` ${styles.wallBase70}`;
        // Corner NW shows right face
        wallClasses += ` ${styles.wallEdgeR}`;
        wallPattern = '0110';
      } else if (variantName === "wall_horiz") {
        if (isFloorBelow) wallClasses += ` ${styles.wallBase70}`;
        wallClasses += ` ${styles.wallEdgeL} ${styles.wallEdgeR}`;
        wallPattern = '0101';
      } else if (variantName === "wall_t_n") {
        if (isFloorBelow) wallClasses += ` ${styles.wallBase70}`;
        wallClasses += ` ${styles.wallEdgeL} ${styles.wallEdgeR}`;
        wallPattern = '0111';
      }

      wallAsset = getWallAsset(environment, wallPattern);

      // For wall tiles with assets, use a simplified class without borders and extra styling
      // But keep the border-b-8 class for tests if there's a floor below
      const finalWallClasses = wallAsset
        ? `${styles.tileContainer} ${styles.wallWithAsset} ${tierClass} ${
            isFloorBelow ? "border-b-8 border-b-[#1f1f1f]" : ""
          }`
        : `${wallClasses} ${shadowClasses} ${highlightClasses}`;

      return (
        <div
          className={finalWallClasses}
          data-testid={`tile-${tileId}`}
          data-neighbor-code={neighborCode}
          data-wall-variant={variantName}
          title={variantName}
          style={
            wallAsset
              ? {
                  backgroundImage: `url(${wallAsset})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat"
                }
              : undefined
          }
        >
          {/* Wall details - inner texture or pattern (only shown if no wall asset) */}
          {!wallAsset && <div className={styles.wallInsetTexture}></div>}

          {subtype.includes(TileSubtype.DOOR) &&
            (environment === "outdoor" || environment === "house") && (
              <div
                className={styles.wallDoorOverlay}
                style={{ backgroundImage: "url(/images/door/house-door.png)" }}
                aria-hidden="true"
              />
            )}

          {subtype.includes(TileSubtype.WINDOW) && (
            <div
              className={styles.wallWindowOverlay}
              style={{ backgroundImage: "url(/images/window.png)" }}
              aria-hidden="true"
            />
          )}

          {/* Exaggerated base shadow when standing in front of floor */}
          {isFloorBelow && (
            <div
              data-testid="wall-base-shadow"
              className={styles.wallBaseShadow}
              style={
                wallAsset ? { opacity: 0 } : undefined
              } /* Invisible but present for tests */
            />
          )}

          {/* Render roof front overhang overlay if there's a roof behind (north of) this wall */}
          {hasRoofBehind && (
            <div 
              className={styles.roofOverhangOverlay}
              style={{
                backgroundImage: `url(${roofFrontOverhangImage})`,
                top: 0,
                bottom: 'auto',
                height: '33%',
              }}
              data-testid="wall-roof-overhang-overlay"
            />
          )}
          
          {/* Render roof back overhang overlay if there's a roof below (south of) this wall */}
          {hasRoofBelow && (
            <div 
              className={styles.roofOverhangOverlay}
              style={{
                backgroundImage: `url(${roofBackOverhangImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center bottom',
                backgroundRepeat: 'no-repeat',
                bottom: 0,
                top: 'auto',
                height: '33%',
              }}
              data-testid="wall-roof-back-overhang-overlay"
            />
          )}

          {/* Render hanging signs if present */}
          {subtype.includes(TileSubtype.SIGN_STORE) && (
            <div
              className={styles.hangingSign}
              style={{
                backgroundImage: "url(/images/hanging-signs/store.png)",
              }}
              data-testid="hanging-sign-store"
              aria-hidden="true"
            />
          )}
          {subtype.includes(TileSubtype.SIGN_LIBRARY) && (
            <div
              className={styles.hangingSign}
              style={{
                backgroundImage: "url(/images/hanging-signs/library.png)",
              }}
              data-testid="hanging-sign-library"
              aria-hidden="true"
            />
          )}
          {subtype.includes(TileSubtype.SIGN_SMITHY) && (
            <div
              className={styles.hangingSign}
              style={{
                backgroundImage: "url(/images/hanging-signs/workshop.png)",
              }}
              data-testid="hanging-sign-smithy"
              aria-hidden="true"
            />
          )}

          {/* Render all subtypes as standardized icons */}
          {renderSubtypeIcons(subtype)}
        </div>
      );
    } else {
      // Invisible wall - same style as invisible floor
      return (
        <div
          className={`${styles.tileContainer} ${styles.invisible} ${invisibleClassName ?? ''}`}
          data-testid={`tile-${tileId}`}
        />
      );
    }
  }

  // If this is a roof tile
  if (tileId === 4) {
    if (isVisible) {
      const roofClasses = `${styles.tileContainer} ${styles.roof} ${tierClass}`;
      const roofAsset = '/images/roof/spanish-roof-main.png';
      
      // Check if there's a tree behind (north of) this roof - for roof overhang
      const hasTreeBehind = neighbors.top === 6;
      const roofFrontOverhangImage = '/images/roof/spanish-roof-front-overhang.png';

      return (
        <div
          className={roofClasses}
          data-testid={`tile-${tileId}`}
          style={{
            backgroundImage: `url(${roofAsset})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat"
          }}
        >
          {/* Render roof front overhang overlay if there's a tree behind (north of) this roof */}
          {hasTreeBehind && (
            <div 
              className={styles.roofOverhangOverlay}
              style={{
                backgroundImage: `url(${roofFrontOverhangImage})`,
                top: 0,
                bottom: 'auto',
                height: '33%',
              }}
              data-testid="roof-tree-overhang-overlay"
            />
          )}
          
          {/* Render all subtypes as standardized icons */}
          {renderSubtypeIcons(subtype)}
        </div>
      );
    } else {
      // Invisible roof - same style as invisible floor
      return (
        <div
          className={`${styles.tileContainer} ${styles.invisible} ${invisibleClassName ?? ''}`}
          data-testid={`tile-${tileId}`}
        />
      );
    }
  }

  // If this is a flowers tile
  if (tileId === 5) {
    if (isVisible) {
      const floorClasses = `${styles.tileContainer} ${styles.floor} ${tierClass}${inNightmare ? " nightmare-floor" : ""}`;
      const floorAsset =
        process.env.NODE_ENV === 'test'
          ? environmentConfig.floorDefault
          : getFloorAsset(environment, { hasNorthNeighbor: Boolean(topNeighbor) });

      // Deterministically pick a flower/bush asset based on tile coordinates
      const y = typeof row === 'number' ? row : 0;
      const x = typeof col === 'number' ? col : 0;
      const seed = (y * 37 + x * 101);
      const flowerAssets = [
        '/images/flowers/flowers-1.png',
        '/images/flowers/flowers-2.png',
        '/images/flowers/flowers-3.png',
        '/images/flowers/flowers-4.png',
        '/images/flowers/flowers-5.png',
        '/images/flowers/bush.png',
      ];
      const flowerAsset = flowerAssets[Math.abs(seed) % flowerAssets.length];

      return (
        <div
          className={floorClasses}
          style={{
            backgroundImage: `url(${floorAsset})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            position: "relative",
            backgroundColor: process.env.NODE_ENV === 'test' ? '#c8c8c8' : 'transparent'
          }}
          data-testid={`tile-${tileId}`}
          data-neighbor-code={neighborCode}
        >
          {/* Render checkpoint asset if present (full-tile overlay) */}
          {Array.isArray(subtype) && subtype.includes(TileSubtype.CHECKPOINT) && (() => {
            const isActive = Array.isArray(activeCheckpoint) &&
              typeof row === 'number' && typeof col === 'number' &&
              activeCheckpoint[0] === row && activeCheckpoint[1] === col;
            return (
              <>
                {isActive && (
                  <div
                    key="checkpoint-glow"
                    className={styles.checkpointGlow}
                    aria-hidden="true"
                  />
                )}
                <div
                  key="checkpoint"
                  className={styles.checkpointOverlay}
                  style={{
                    backgroundImage: `url('/images/items/checkpoint-unlit.png')`
                  }}
                  aria-label="checkpoint"
                />
                {/* Lit checkpoints burn with an animated flame on the torch nub */}
                {isActive && (
                  <PixelFlame
                    cell={1.1}
                    glow
                    seed={(row ?? 0) * 13 + (col ?? 0) * 3}
                    className={styles.checkpointFlame}
                  />
                )}
              </>
            );
          })()}
          {/* Render dirt road overlay if this flower tile is marked as part of a road */}
          {hasRoad(subtype) && renderRoadOverlay(subtype)}
          
          {/* Render flower/bush sprite on top of floor */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${flowerAsset})`,
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              imageRendering: 'pixelated',
              pointerEvents: 'none',
              zIndex: 1,
            }}
            aria-hidden="true"
          />
          
          {/* Render hero image on top if this is a player tile. Same
              smooth-mode treatment as the floor branch: stay mounted but
              hidden (the overlay hero renders instead) — this branch was
              missed originally, which made a duplicate hero pop onto flower
              tiles a step ahead of the gliding overlay. */}
          {isPlayerTile && (
            <div
              className={styles.heroImage}
              style={{
                backgroundImage: `url(${heroImage})`,
                transform: heroTransform,
                rotate: heroAbyssRotate,
                scale: heroScale,
                transition: heroTransition,
                backgroundColor: 'transparent',
                animation: heroWarping ? 'heroWarpFlicker 0.16s steps(2) infinite' : undefined,
                visibility: suppressHeroSprite ? 'hidden' : undefined,
              }}
            />
          )}
          {/* Hero poison visuals: glow + stench wisps */}
          {isPlayerTile && heroPoisoned && (
            <>
              {/* multiple wisps with slight offsets for variety */}
              <div className="poison-stench" style={{ left: '42%' }} aria-hidden="true" />
              <div className="poison-stench" style={{ left: '58%', animationDelay: '200ms' }} aria-hidden="true" />
              <div className="poison-stench" style={{ left: '50%', animationDelay: '400ms', width: '10px' }} aria-hidden="true" />
            </>
          )}

          {shouldShowNpc && npc && (
            <div
              // Re-key per step so the slide-in animation restarts (see enemy sprite).
              key={npcStep ? `npc-step-${npcStep.seq}` : 'npc-static'}
              className={isDogNpc ? styles.npcImageDog : styles.npcImage}
              style={{
                backgroundImage: `url(${npc.sprite})`,
                transform: npcTransformWithScale,
                transformOrigin: npcTransformOrigin,
                // Dogs get the bob+tilt step (the wiggle); other NPCs slide flat.
                ...(isDogNpc
                  ? smoothStepBobStyle(npcStep, npcTransformWithScale)
                  : smoothStepStyle(npcStep, npcTransformWithScale)),
              }}
              aria-hidden="true"
              data-testid="npc-sprite"
            />
          )}
          {showNpcPrompt && (
            <div className={styles.npcDialogueIcon} aria-hidden="true">
              💬
            </div>
          )}

          {/* Enemy rendering: sprite (when visible) */}
          {renderEnemySprite()}

          {/* Render all subtypes as standardized icons */}
          {renderSubtypeIcons(subtype)}
        </div>
      );
    } else {
      // Invisible flowers - same style as invisible floor
      return (
        <div
          className={`${styles.tileContainer} ${styles.invisible} ${invisibleClassName ?? ''}`}
          data-testid={`tile-${tileId}`}
        />
      );
    }
  }

  // If this is a tree tile
  if (tileId === 6) {
    if (isVisible) {
      const floorClasses = `${styles.tileContainer} ${styles.floor} ${tierClass}${inNightmare ? " nightmare-floor" : ""}`;
      const floorAsset =
        process.env.NODE_ENV === 'test'
          ? environmentConfig.floorDefault
          : getFloorAsset(environment, { hasNorthNeighbor: Boolean(topNeighbor) });

      // Check if bottom neighbor is a wall - if so, we'll render the wall top overlay
      const hasWallBelow = neighbors.bottom === 1;
      
      // Check if bottom neighbor is a roof - if so, we'll render the roof back overhang
      const hasRoofBelow = neighbors.bottom === 4;
      const roofBackOverhangImage = '/images/roof/spanish-roof-back-overhang.png';
      
      // Determine which wall image to use for the overlay based on neighboring walls
      let wallPattern = '0111';

      if (hasWallBelow) {
        // Check if there are walls to the left and right
        const hasWallLeft = neighbors.left === 1;
        const hasWallRight = neighbors.right === 1;
        
        if (!hasWallLeft && !hasWallRight) {
          // No walls on sides, use wall-0010.png (just top wall)
          wallPattern = '0010';
        } else if (hasWallLeft && !hasWallRight) {
          // Wall on left only
          wallPattern = '0110';
        } else if (!hasWallLeft && hasWallRight) {
          // Wall on right only
          wallPattern = '0011';
        } else {
          // Walls on both sides
          wallPattern = '0111';
        }
      }
      const wallTopImage = getWallAsset(environment, wallPattern);

      // Deterministically pick a tree asset based on tile coordinates
      const y = typeof row === 'number' ? row : 0;
      const x = typeof col === 'number' ? col : 0;
      const seed = (y * 37 + x * 101);
      const treeAssets = [
        '/images/trees/tree-1.png',
        '/images/trees/tree-2.png',
        '/images/trees/tree-3.png',
        '/images/trees/tree-4.png',
      ];
      const treeAsset = treeAssets[Math.abs(seed) % treeAssets.length];

      return (
        <div
          className={floorClasses}
          style={{
            backgroundImage: `url(${floorAsset})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            position: "relative",
            backgroundColor: process.env.NODE_ENV === 'test' ? '#c8c8c8' : 'transparent'
          }}
          data-testid={`tile-${tileId}`}
          data-neighbor-code={neighborCode}
        >
          {/* Render tree sprite on top of floor - 115% size, anchored to bottom, overlaps upward */}
          <img
            src={treeAsset}
            alt=""
            style={{
              position: 'absolute',
              left: '-7.5%',
              bottom: 0,
              width: '115%',
              height: '115%',
              objectFit: 'cover',
              objectPosition: 'center bottom',
              imageRendering: 'pixelated',
              pointerEvents: 'none',
              zIndex: 11500, // Above hero (11000) so trees overlap hero correctly
            }}
            aria-hidden="true"
          />

          {/* Render all subtypes as standardized icons */}
          {renderSubtypeIcons(subtype)}
          
          {/* Render wall top overlay if there's a wall below this tree tile */}
          {hasWallBelow && (
            <div 
              className={styles.wallTopOverlay}
              style={{
                backgroundImage: `url(${wallTopImage})`,
                zIndex: 12000, // Above tree (11500) so wall top renders over tree
              }}
              data-testid="wall-top-overlay"
            />
          )}
          
          {/* Render roof back overhang overlay if there's a roof below this tree tile */}
          {hasRoofBelow && (
            <div 
              className={styles.roofOverhangOverlay}
              style={{
                backgroundImage: `url(${roofBackOverhangImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center bottom',
                backgroundRepeat: 'no-repeat',
                bottom: 0,
                top: 'auto',
                height: '33%',
              }}
              data-testid="tree-roof-back-overhang-overlay"
            />
          )}
        </div>
      );
    } else {
      // Invisible tree - same style as invisible floor
      return (
        <div
          className={`${styles.tileContainer} ${styles.invisible} ${invisibleClassName ?? ''}`}
          data-testid={`tile-${tileId}`}
        />
      );
    }
  }

  // Fallback for any other tile type
  return (
    <div
      className="w-10 h-10 flex items-center justify-center bg-purple-500 text-white"
      data-testid={`tile-${tileId}`}
    >
      {subtype && subtype.length > 0 ? subtypeNames(subtype).join(",") : tileId}
    </div>
  );
};
