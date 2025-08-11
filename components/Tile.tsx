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
  // tileType not currently used but kept for future extensibility
  tileType,
  subtype = [],
  isVisible = true,
  visibilityTier = 3,
  neighbors = { top: null, right: null, bottom: null, left: null }
}) => {
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
      return (
        <div
          className={floorClasses}
          style={{ backgroundColor: '#c8c8c8' }}
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

      // Forced perspective: if the tile below is a FLOOR (0), make the bottom border much thicker/darker
      const isFloorBelow = neighbors.bottom === 0;
      if (isFloorBelow) {
        // Keep these utility-like classes for tests and easy tuning via :global
        wallClasses += ' border-b-8 border-b-[#1f1f1f]';
      }
      
      return (
        <div
          className={`${wallClasses} ${shadowClasses} ${highlightClasses}`}
          style={{ backgroundColor: '#5a5a5a' }}
          data-testid={`tile-${tileId}`}
          data-neighbor-code={neighborCode}
        >
          {/* Wall details - inner texture or pattern */}
          <div className={styles.wallInsetTexture}></div>

          {/* Exaggerated base shadow when standing in front of floor */}
          {isFloorBelow && (
            <div
              data-testid="wall-base-shadow"
              className={styles.wallBaseShadow}
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
