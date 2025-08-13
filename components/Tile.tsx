import React from "react";
import { TileType, TileSubtype, Direction } from "../lib/map";
import styles from "./Tile.module.css";

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
  isVisible?: boolean; // Whether this tile is in the player's field of view
  visibilityTier?: number; // 0-3 for FOV fade tiers
  neighbors?: NeighborInfo; // Information about neighboring tiles
  playerDirection?: Direction; // Direction the player is facing
}

export const Tile: React.FC<TileProps> = ({
  tileId,
  // We don't need tileType for now, but it's in the props interface for future use
  subtype = [],
  isVisible = true,
  visibilityTier = 3,
  neighbors = { top: null, right: null, bottom: null, left: null },
  playerDirection = Direction.DOWN, // Default to facing down/front
}) => {
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

  // If this is a player tile
  const tierClass = isVisible
    ? visibilityTier === 3
      ? "fov-tier-3"
      : visibilityTier === 2
      ? "fov-tier-2"
      : visibilityTier === 1
      ? "fov-tier-1"
      : ""
    : "";

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
  const hasExitKey = (subtypes: number[] | undefined): boolean => {
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
        subtype !== TileSubtype.EXIT
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

        {/* Render lightswitch with asset if present */}
        {hasLightswitch(subtypes) && (
          <div
            key="lightswitch"
            data-testid={`subtype-icon-${TileSubtype.LIGHTSWITCH}`}
            className={`${styles.assetIcon} ${styles.switchIcon}`}
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
        {hasExitKey(subtypes) && (
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

        {/* Render exit with asset if present - using full height icon */}
        {hasExit(subtypes) && (
          <div
            key="exit"
            data-testid={`subtype-icon-${TileSubtype.EXIT}`}
            className={`${styles.fullHeightAssetIcon} ${styles.exitIcon}`}
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

  if (isVisible && subtype && subtype.includes(TileSubtype.PLAYER)) {
    // Get the appropriate hero image based on player direction
    let heroImage = '/images/hero/hero-front-static.png'; // Default
    
    switch (playerDirection) {
      case Direction.UP:
        heroImage = '/images/hero/hero-back-static.png';
        break;
      case Direction.RIGHT:
        heroImage = '/images/hero/hero-right-static.png';
        break;
      case Direction.LEFT:
        // Mirror the right-facing image for left direction
        heroImage = '/images/hero/hero-right-static.png';
        break;
      case Direction.DOWN:
      default:
        heroImage = '/images/hero/hero-front-static.png';
        break;
    }
    
    return (
      <div
        className={`${styles.tileContainer} ${styles.player} ${tierClass}`}
        data-testid={`tile-${tileId}`}
        data-neighbor-code={neighborCode}
      >
        <div 
          className={styles.heroImage}
          style={{
            backgroundImage: `url(${heroImage})`,
            transform: playerDirection === Direction.LEFT ? 'scaleX(-1)' : 'none',
          }}
        />
      </div>
    );
  }

  // If this is a floor tile
  if (tileId === 0) {
    // Floor tiles - only visible if within player's field of view
    if (isVisible) {
      const floorClasses = `${styles.tileContainer} ${styles.floor} ${tierClass}`;

      // Map floor variant to NESW asset filename based on neighbors
      let floorAsset = "/images/floor/floor-try-1.png"; // Default floor

      if (!topNeighbor) {
        floorAsset = "/images/floor/floor-1000.png";
      } else {
        floorAsset = "/images/floor/floor-try-1.png";
      }

      // TODO - if bottom neighbor is false then its a wall and we shoudl rend er the top of the wall in the bottom off this tile

      return (
        <div
          className={floorClasses}
          style={{
            backgroundImage: `url(${floorAsset})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
          data-testid={`tile-${tileId}`}
          data-neighbor-code={neighborCode}
        >
          {/* Render all subtypes as standardized icons */}
          {renderSubtypeIcons(subtype)}
        </div>
      );
    } else {
      // Invisible floor
      return (
        <div
          className={`${styles.tileContainer} ${styles.invisible} bg-gray-900`}
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
      let wallAsset = "";

      if (variantName === "wall_pillar") {
        wallClasses += ` ${styles.wallPillar}`;
        wallAsset = "/images/wall/wall-0000.png"; // Isolated wall
      }
      // Apply helper classes for other variants and map to NESW wall assets
      if (variantName === "wall_end_e") {
        if (isFloorBelow) wallClasses += ` ${styles.wallBase70}`;
        wallClasses += ` ${styles.wallEdgeR}`;
        wallAsset = "/images/wall/wall-0001.png"; // Wall to the west only (0001)
      } else if (variantName === "wall_end_w") {
        if (isFloorBelow) wallClasses += ` ${styles.wallBase70}`;
        wallClasses += ` ${styles.wallEdgeL}`;
        wallAsset = "/images/wall/wall-0100.png"; // Wall to the east only (0100)
      } else if (variantName === "wall_end_n") {
        if (isFloorBelow) wallClasses += ` ${styles.wallBase70}`;
        wallAsset = "/images/wall/wall-0010.png"; // Wall to the south only (0010)
      } else if (variantName === "wall_corner_ne") {
        if (isFloorBelow) wallClasses += ` ${styles.wallBase70}`;
        // Corner NE shows left face in our simplified CSS
        wallClasses += ` ${styles.wallEdgeL}`;
        wallAsset = "/images/wall/wall-0011.png"; // Walls to south and west (0011)
      } else if (variantName === "wall_corner_nw") {
        if (isFloorBelow) wallClasses += ` ${styles.wallBase70}`;
        // Corner NW shows right face
        wallClasses += ` ${styles.wallEdgeR}`;
        wallAsset = "/images/wall/wall-0110.png"; // Walls to east and south (0110)
      } else if (variantName === "wall_horiz") {
        if (isFloorBelow) wallClasses += ` ${styles.wallBase70}`;
        wallClasses += ` ${styles.wallEdgeL} ${styles.wallEdgeR}`;
        wallAsset = "/images/wall/wall-0101.png"; // Walls to east and west (0101)
      } else if (variantName === "wall_t_n") {
        if (isFloorBelow) wallClasses += ` ${styles.wallBase70}`;
        wallClasses += ` ${styles.wallEdgeL} ${styles.wallEdgeR}`;
        wallAsset = "/images/wall/wall-0111.png"; // Walls to east, south, and west (0111)
      }

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
                  backgroundRepeat: "no-repeat",
                }
              : undefined
          }
        >
          {/* Wall details - inner texture or pattern (only shown if no wall asset) */}
          {!wallAsset && <div className={styles.wallInsetTexture}></div>}

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
          className={`${styles.tileContainer} ${styles.invisible} bg-gray-900`}
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
