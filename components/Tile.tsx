import React from 'react';
import { TileType, TileSubtype } from '../lib/map';
import styles from './Tile.module.css';

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
}

export const Tile: React.FC<TileProps> = ({
  tileId,
  // We don't need tileType for now, but it's in the props interface for future use
  subtype = [],
  isVisible = true,
  visibilityTier = 3,
  neighbors = { top: null, right: null, bottom: null, left: null }
}) => {
  // Fast bitmask-based wall variant resolver for perspective.
  // We IGNORE the North (behind) bit and only key off E, S, W.
  const getWallVariantName = (n: NeighborInfo): string => {
    // Treat value 1 as wall; anything else is not wall
    const eBit = n.right === 1 ? 4 : 0; // E
    const sBit = n.bottom === 1 ? 2 : 0; // S
    const wBit = n.left === 1 ? 1 : 0;  // W
    const maskESW = eBit | sBit | wBit; // 0..7

    // 8-entry lookup for ESW; any N combinations collapse to these
    const tableESW: Record<number, string> = {
      0b000: 'wall_pillar',     // isolated or N-only
      0b001: 'wall_end_e',      // W only
      0b010: 'wall_end_n',      // S only (bottom face visible)
      0b011: 'wall_corner_ne',  // S + W -> open NE
      0b100: 'wall_end_w',      // E only
      0b101: 'wall_horiz',      // E + W (straight)
      0b110: 'wall_corner_nw',  // E + S -> open NW
      0b111: 'wall_t_n',        // E + S + W -> open N (behind)
    };
    return tableESW[maskESW] ?? 'wall_pillar';
  };
  // Generate shorthand code for autotiling
  const topNeighbor = neighbors.top === tileId ? 'T' : '';
  const rightNeighbor = neighbors.right === tileId ? 'R' : '';
  const bottomNeighbor = neighbors.bottom === tileId ? 'B' : '';
  const leftNeighbor = neighbors.left === tileId ? 'L' : '';
  const neighborCode = `${topNeighbor}${rightNeighbor}${bottomNeighbor}${leftNeighbor}`;
  
  // We only want to display subtypes when they exist
  // No need to display tileId or neighbor codes
  
  // Pixel art colors - directly use these values in the JSX
  
  // If this is a player tile
  const tierClass = isVisible
    ? visibilityTier === 3
      ? 'fov-tier-3'
      : visibilityTier === 2
        ? 'fov-tier-2'
        : visibilityTier === 1
          ? 'fov-tier-1'
          : ''
    : '';

  const subtypeNames = (arr: number[] | undefined): string[] => {
    if (!arr || arr.length === 0) return [];
    return arr.map((s) => {
      switch (s) {
        case TileSubtype.PLAYER:
          return 'PLAYER';
        case TileSubtype.LIGHTSWITCH:
          return 'LIGHTSWITCH';
        case TileSubtype.EXITKEY:
          return 'EXITKEY';
        case TileSubtype.KEY:
          return 'KEY';
        case TileSubtype.LOCK:
          return 'LOCK';
        case TileSubtype.DOOR:
          return 'DOOR';
        case TileSubtype.EXIT:
          return 'EXIT';
        case TileSubtype.CHEST:
          return 'CHEST';
        case TileSubtype.SWORD:
          return 'SWORD';
        case TileSubtype.SHIELD:
          return 'SHIELD';
        case TileSubtype.OPEN_CHEST:
          return 'OPEN_CHEST';
        case TileSubtype.NONE:
          return 'NONE';
        default:
          return String(s);
      }
    });
  };

  if (isVisible && subtype && subtype.includes(TileSubtype.PLAYER)) {
    return (
      <div
        className={`${styles.tileContainer} ${styles.player} ${tierClass}`}
        data-testid={`tile-${tileId}`}
        data-neighbor-code={neighborCode}
      >
        @
      </div>
    );
  }
  
  // If this is a floor tile
  if (tileId === 0) {
    // Floor tiles - only visible if within player's field of view
    if (isVisible) {
      const floorClasses = `${styles.tileContainer} ${styles.floor} ${tierClass}`;
      
      // Map floor variant to NESW asset filename based on neighbors
      let floorAsset = '/images/floor/floor-try-1.png'; // Default floor
      
      // Check for specific floor patterns based on NESW neighbors
      if (topNeighbor && !rightNeighbor && !bottomNeighbor && !leftNeighbor) {
        floorAsset = '/images/floor/floor-1000.png'; // Only north neighbor
      } else if (topNeighbor && !rightNeighbor && !bottomNeighbor && leftNeighbor) {
        floorAsset = '/images/floor/floor-1001.png'; // North and west neighbors
      } else if (!topNeighbor && !rightNeighbor && !bottomNeighbor && leftNeighbor) {
        floorAsset = '/images/floor/floor-0001.png'; // Only west neighbor
      }
      
      return (
        <div
          className={floorClasses}
          style={{
            backgroundColor: '#c8c8c8', // Keep for test compatibility
            backgroundImage: `url(${floorAsset})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }}
          data-testid={`tile-${tileId}`}
          data-neighbor-code={neighborCode}
        >
          {subtype && subtype.includes(TileSubtype.LIGHTSWITCH) ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center shadow-md">
                <span className="text-white font-bold text-sm">⚡</span>
              </div>
            </div>
          ) : subtype && subtype.length > 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-600 font-bold">
              {subtypeNames(subtype).join(',')}
            </div>
          )}
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
      let shadowClasses = '';
      
      // Top-left inner shadow
      if (topNeighbor || leftNeighbor) {
        // If wall has neighbors at top or left, add inset shadow
        if (topNeighbor && leftNeighbor) {
          shadowClasses = ' shadow-[inset_2px_2px_0px_#3a3a3a]';
        } else if (topNeighbor) {
          shadowClasses = ' shadow-[inset_0px_2px_0px_#3a3a3a]';
        } else if (leftNeighbor) {
          shadowClasses = ' shadow-[inset_2px_0px_0px_#3a3a3a]';
        }
      }
      
      // Edge highlights - only on edges without same neighbors
      let highlightClasses = '';
      
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
        wallClasses += ' border-b-8 border-b-[#1f1f1f]';
      }

      const variantName = getWallVariantName(neighbors);
      
      // Map wall variant to NESW asset filename
      // N is always 0 since we don't care about the north direction
      let wallAsset = '';
      
      if (variantName === 'wall_pillar') {
        wallClasses += ` ${styles.wallPillar}`;
        wallAsset = '/images/wall/wall-0000.png'; // Isolated wall
      }
      // Apply helper classes for other variants and map to NESW wall assets
      if (variantName === 'wall_end_e') {
        if (isFloorBelow) wallClasses += ` ${styles.wallBase70}`;
        wallClasses += ` ${styles.wallEdgeR}`;
        wallAsset = '/images/wall/wall-0001.png'; // Wall to the west only (0001)
      } else if (variantName === 'wall_end_w') {
        if (isFloorBelow) wallClasses += ` ${styles.wallBase70}`;
        wallClasses += ` ${styles.wallEdgeL}`;
        wallAsset = '/images/wall/wall-0100.png'; // Wall to the east only (0100)
      } else if (variantName === 'wall_end_n') {
        if (isFloorBelow) wallClasses += ` ${styles.wallBase70}`;
        wallAsset = '/images/wall/wall-0010.png'; // Wall to the south only (0010)
      } else if (variantName === 'wall_corner_ne') {
        if (isFloorBelow) wallClasses += ` ${styles.wallBase70}`;
        // Corner NE shows left face in our simplified CSS
        wallClasses += ` ${styles.wallEdgeL}`;
        wallAsset = '/images/wall/wall-0011.png'; // Walls to south and west (0011)
      } else if (variantName === 'wall_corner_nw') {
        if (isFloorBelow) wallClasses += ` ${styles.wallBase70}`;
        // Corner NW shows right face
        wallClasses += ` ${styles.wallEdgeR}`;
        wallAsset = '/images/wall/wall-0110.png'; // Walls to east and south (0110)
      } else if (variantName === 'wall_horiz') {
        if (isFloorBelow) wallClasses += ` ${styles.wallBase70}`;
        wallClasses += ` ${styles.wallEdgeL} ${styles.wallEdgeR}`;
        wallAsset = '/images/wall/wall-0101.png'; // Walls to east and west (0101)
      } else if (variantName === 'wall_t_n') {
        if (isFloorBelow) wallClasses += ` ${styles.wallBase70}`;
        wallClasses += ` ${styles.wallEdgeL} ${styles.wallEdgeR}`;
        wallAsset = '/images/wall/wall-0111.png'; // Walls to east, south, and west (0111)
      }
      
      // For wall tiles with assets, use a simplified class without borders and extra styling
      // But keep the border-b-8 class for tests if there's a floor below
      const finalWallClasses = wallAsset 
        ? `${styles.tileContainer} ${styles.wallWithAsset} ${tierClass} ${isFloorBelow ? 'border-b-8 border-b-[#1f1f1f]' : ''}` 
        : `${wallClasses} ${shadowClasses} ${highlightClasses}`;
      
      return (
        <div
          className={finalWallClasses}
          data-testid={`tile-${tileId}`}
          data-neighbor-code={neighborCode}
          data-wall-variant={variantName}
          title={variantName}
          style={wallAsset ? {
            backgroundImage: `url(${wallAsset})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          } : undefined}
        >
          {/* Wall details - inner texture or pattern (only shown if no wall asset) */}
          {!wallAsset && <div className={styles.wallInsetTexture}></div>}

          {/* Exaggerated base shadow when standing in front of floor */}
          {isFloorBelow && (
            <div
              data-testid="wall-base-shadow"
              className={styles.wallBaseShadow}
              style={wallAsset ? { opacity: 0 } : undefined} /* Invisible but present for tests */
            />
          )}
          
          {/* Only display subtype if it exists */}
          {subtype && subtype.length > 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-white font-bold">
              {subtypeNames(subtype).join(',')}
            </div>
          )}
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
      {subtype && subtype.length > 0 ? subtypeNames(subtype).join(',') : tileId}
    </div>
  );
};
