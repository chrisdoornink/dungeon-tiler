import React from "react";
import { TileType, TileSubtype, Direction } from "../lib/map";
import { getEnemyIcon } from "../lib/enemies/registry";
import type { EnemyKind, Facing } from "../lib/enemies/registry";
import type { NPC } from "../lib/npc";
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

interface TileProps {
  tileId: number;
  tileType: TileType;
  subtype?: number[];
  row?: number; // grid row (y)
  col?: number; // grid col (x)
  isVisible?: boolean; // Whether this tile is in the player's field of view
  visibilityTier?: number; // 0-3 for FOV fade tiers
  neighbors?: NeighborInfo; // Information about neighboring tiles
  playerDirection?: Direction; // Direction the player is facing
  heroTorchLit?: boolean; // Whether the hero's torch is lit (affects hero sprite)
  heroPoisoned?: boolean; // Whether the hero is poisoned (for visual overlay)
  hasEnemy?: boolean; // Whether this tile contains an enemy
  enemyVisible?: boolean; // Whether enemy is in player's FOV
  enemyFacing?: 'UP' | 'RIGHT' | 'DOWN' | 'LEFT';
  enemyKind?: 'goblin' | 'ghost' | 'stone-exciter' | 'snake';
  enemyMoved?: boolean; // did the enemy move last tick (for snakes: choose moving vs coiled)
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
}

export const Tile: React.FC<TileProps> = ({
  tileId,
  // We don't need tileType for now, but it's in the props interface for future use
  subtype = [],
  row,
  col,
  isVisible = true,
  visibilityTier = 3,
  neighbors = { top: null, right: null, bottom: null, left: null },
  playerDirection = Direction.DOWN, // Default to facing down/front
  heroTorchLit = true,
  heroPoisoned = false,
  hasEnemy = false,
  enemyVisible = undefined,
  enemyFacing,
  enemyKind,
  enemyMoved,
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
}) => {
  const environmentConfig = getEnvironmentConfig(environment);
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

  const hasRoad = (subtypes: number[] | undefined): boolean => {
    return subtypes?.includes(TileSubtype.ROAD) || false;
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
        subtype !== TileSubtype.WALL_TORCH &&
        // Exclude checkpoint: it has a custom asset overlay
        subtype !== TileSubtype.CHECKPOINT &&
        subtype !== TileSubtype.FAULTY_FLOOR &&
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
        subtype !== TileSubtype.ROAD_ROTATE_270 // Filter out subtypes with custom rendering
    );
  };

  // Render subtype icons
  const renderSubtypeIcons = (subtypes: number[] | undefined) => {
    if (!subtypes || subtypes.length === 0) return null;

    const filteredSubtypes = getFilteredSubtypes(subtypes);

    return (
      <div className={styles.subtypeContainer}>
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

        {/* Render lightswitch with asset if present */}
        {hasLightswitch(subtypes) && (
          <div
            key="lightswitch"
            data-testid={`subtype-icon-${TileSubtype.LIGHTSWITCH}`}
            className={`${styles.assetIcon} ${styles.switchIcon}`}
          />
        )}

        {/* Render wall torch as a static sprite (no animation). Suppress on checkpoint tiles */}
        {hasWallTorch(subtypes) && !(subtypes?.includes(TileSubtype.CHECKPOINT)) && (
          <div
            key="wall-torch"
            data-testid={`subtype-icon-${TileSubtype.WALL_TORCH}`}
            className={`${styles.assetIcon} ${styles.torchSprite}`}
            style={{ backgroundImage: `url(/images/items/wall-torch-2.png)` }}
          />
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
        {hasPot(subtypes) && (
          <div
            key="pot"
            data-testid={`subtype-icon-${TileSubtype.POT}`}
            className={`${styles.assetIcon} ${styles.potIcon}`}
            style={{
              backgroundImage: `url(${pickVariant([
                '/images/items/pot-1.png',
                '/images/items/pot-2.png',
                '/images/items/pot-3.png',
              ])})`,
            }}
          />
        )}
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
        {hasFood(subtypes) && (
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
        {hasMed(subtypes) && (
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
          </>
        )}

        {/* Render faulty floor cracks overlay */}
        {hasFaultyFloor(subtypes) && (
          <div
            key="faulty-floor"
            data-testid={`subtype-icon-${TileSubtype.FAULTY_FLOOR}`}
            className={`${styles.assetIcon} ${styles.faultyFloorIcon}`}
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
        switch (playerDirection) {
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
        const snuff = heroTorchLit ? '' : '-snuff';
        return `/images/hero/hero-${dir}${equip()}${snuff}-static.png`;
      })()
    : '';
  
  // Determine if we need to flip the hero image for left-facing direction
  const heroTransform = isPlayerTile && playerDirection === Direction.LEFT ? 'scaleX(-1)' : 'none';

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
    const s = (npc as any)?.metadata?.scale;
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
  const showNpcPrompt = shouldShowNpc && npcInteractable;

  // If this is a floor tile
  if (tileId === 0) {
    // Floor tiles - only visible if within player's field of view
    if (isVisible) {
      // Check if this floor tile has darkness (collapsed faulty floor)
      const isDarkness = hasDarkness(subtype);
      const floorClasses = `${styles.tileContainer} ${isDarkness ? styles.darkness : styles.floor} ${tierClass}`;

      // Map floor variant to NESW asset filename based on neighbors
      const floorAsset =
        process.env.NODE_ENV === 'test'
          ? environmentConfig.floorDefault
          : getFloorAsset(environment, { hasNorthNeighbor: Boolean(topNeighbor) });

      // Check if bottom neighbor is a wall - if so, we'll render the wall top overlay
      const hasWallBelow = neighbors.bottom === 1;
      
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
          {/* Render checkpoint-unlit asset if present (full-tile overlay) */}
          {Array.isArray(subtype) && subtype.includes(TileSubtype.CHECKPOINT) && (
            <div
              key="checkpoint"
              className={styles.checkpointOverlay}
              style={{ backgroundImage: "url(/images/items/checkpoint-unlit.png)" }}
              aria-label="checkpoint"
            />
          )}
          {/* Render dirt road overlay if this floor tile is marked as part of a road */}
          {hasRoad(subtype) && renderRoadOverlay(subtype)}
          {/* Render hero image on top of floor if this is a player tile */}
          {isPlayerTile && (
            <div
              className={styles.heroImage}
              style={{
                backgroundImage: `url(${heroImage})`,
                transform: heroTransform,
                backgroundColor: 'transparent'
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
              className={styles.npcImage}
              style={{
                backgroundImage: `url(${npc.sprite})`,
                transform: npcTransformWithScale,
                transformOrigin: npcTransformOrigin,
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
          {hasEnemy && (
            <>
              {enemyAura && (
                <div
                  className={styles.exitGlow}
                  aria-hidden="true"
                />
              )}
              {((enemyVisible ?? isVisible) === true) && (
                <div
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
                      const kind: EnemyKind = (enemyKind ?? 'goblin');
                      // For snakes: use moving sprite when enemyMoved, else coiled
                      if (kind === 'snake') {
                        const f = enemyFacing;
                        // moving sprite only exists for 'left'; request 'left' for moving, coiled otherwise
                        const useMoving = !!enemyMoved;
                        if (useMoving) {
                          return getEnemyIcon('snake', 'left');
                        }
                        // coiled sprite follows facing (front/back/right are coiled)
                        return getEnemyIcon('snake', toFacing(f));
                      }
                      const facing: Facing = toFacing(enemyFacing);
                      return getEnemyIcon(kind, facing);
                    })()})`,
                    backgroundSize: 'contain',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    zIndex: 10500, // above fog (10000), below wall tops (12000)
                    transform: (() => {
                      // Default flip rule (for enemies that only have right-facing art): flip when facing LEFT
                      if (enemyKind !== 'snake') {
                        return enemyKind === 'ghost' ? 'none' : (enemyFacing === 'LEFT' ? 'scaleX(-1)' : 'none');
                      }
                      // Snakes: scale to 50% and flip moving-right to mirror moving-left asset
                      const baseScale = 'scale(0.5)';
                      const moved = !!enemyMoved;
                      if (moved && enemyFacing === 'RIGHT') {
                        return 'scaleX(-1) ' + baseScale;
                      }
                      return baseScale;
                    })(),
                  }}
                  data-testid="enemy-sprite"
                />
              )}
            </>
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

      // Forced perspective: if the tile below is a FLOOR (0), make the bottom border thicker/darker
      const isFloorBelow = neighbors.bottom === 0;
      if (isFloorBelow) {
        // Keep these utility-like classes for tests and easy tuning via :global
        wallClasses += " border-b-8 border-b-[#1f1f1f]";
      }

      const variantName = getWallVariantName(neighbors);

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
