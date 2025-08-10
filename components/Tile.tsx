import React from 'react';
import { TileType, TileSubtype } from '../lib/map';

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

  // Visual fade overlay style per tier (inline to avoid Tailwind config variability)
  const overlayStyle = isVisible
    ? { opacity: visibilityTier === 3 ? 0 : visibilityTier === 2 ? 0.5 : 0.8, zIndex: 999 }
    : { opacity: 1, zIndex: 999 };

  // Guaranteed darkening using CSS filter brightness
  const brightnessValue = !isVisible
    ? 0 // invisible handled elsewhere
    : visibilityTier === 3
      ? 1
      : visibilityTier === 2
        ? 0.7
        : 0.4;
  const brightnessStyle = isVisible ? { filter: `brightness(${brightnessValue})` } : {};

  if (isVisible && subtype && subtype.includes(TileSubtype.PLAYER)) {
    return (
      <div 
        className={`relative w-10 h-10 flex items-center justify-center bg-blue-500 text-white font-bold ${tierClass}`}
        style={brightnessStyle}
        data-testid={`tile-${tileId}`}
        data-neighbor-code={neighborCode}
      >
        @
        {/* Fade overlay on top */}
        <div className="absolute inset-0 bg-black pointer-events-none mix-blend-multiply" style={overlayStyle} />
      </div>
    );
  }
  
  // If this is a floor tile
  if (tileId === 0) {
    // Floor tiles - only visible if within player's field of view
    if (isVisible) {
      // Create the autotiled floor style
      let floorClasses = `w-10 h-10 relative bg-[#c8c8c8] ${tierClass}`;
      
      // Add subtle texture to floors
      floorClasses += ' before:content-[""] before:absolute before:inset-0 before:bg-opacity-10 ' +
                     'before:bg-[url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVQImWNgYGD4z0AKYBzEAwAmAgMDZnGqswAAAABJRU5ErkJggg==")] ' +
                     'before:opacity-20';
      
      // Apply retro pixel borders based on neighbors
      // Top edge
      if (neighbors.top !== null && neighbors.top !== tileId) {
        floorClasses += ' border-t-2 border-t-[#9a9a9a]';
      }
      
      // Right edge
      if (neighbors.right !== null && neighbors.right !== tileId) {
        floorClasses += ' border-r-2 border-r-[#9a9a9a]';
      }
      
      // Bottom edge
      if (neighbors.bottom !== null && neighbors.bottom !== tileId) {
        floorClasses += ' border-b-2 border-b-[#9a9a9a]';
      }
      
      // Left edge
      if (neighbors.left !== null && neighbors.left !== tileId) {
        floorClasses += ' border-l-2 border-l-[#9a9a9a]';
      }
      
      // Add corner classes for when two perpendicular edges meet
      // These create the pixel corners effect
      
      return (
        <div 
          className={floorClasses}
          style={{ backgroundColor: '#c8c8c8', ...brightnessStyle }} 
          data-testid={`tile-${tileId}`}
          data-neighbor-code={neighborCode}
        >
          {/* Special styling for lightswitch */}
          {subtype && subtype.includes(TileSubtype.LIGHTSWITCH) ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center shadow-md">
                <span className="text-white font-bold text-sm">⚡</span>
              </div>
            </div>
          ) : subtype && subtype.length > 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-600 font-bold">
              {subtype.join(',')}
            </div>
          )}
          {/* Fade overlay on top (last to ensure highest stacking) */}
          <div className="absolute inset-0 bg-black pointer-events-none mix-blend-multiply" style={overlayStyle} />
        </div>
      );
    } else {
      // Invisible floor
      return (
        <div 
          className="w-10 h-10 bg-gray-900"
          data-testid={`tile-${tileId}`}
        />
      );
    }
  }
  
  // If this is a wall tile
  if (tileId === 1) {
    if (isVisible) {
      // Create the autotiled wall style
      let wallClasses = `w-10 h-10 relative bg-[#5a5a5a] ${tierClass}`;
      
      // Start with base wall style
      wallClasses += ' border border-[#3a3a3a]';
      
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
        highlightClasses += ' after:content-[""] after:absolute after:top-0 after:left-[2px] after:right-[2px] ' +
                          'after:h-[1px] after:bg-[#7a7a7a]';
      }
      
      // Right edge highlight
      if (!rightNeighbor) {
        highlightClasses += ' before:content-[""] before:absolute before:right-0 before:top-[2px] before:bottom-[2px] ' +
                          'before:w-[1px] before:bg-[#7a7a7a]';
      }
      
      return (
        <div 
          className={`${wallClasses} ${shadowClasses} ${highlightClasses}`}
          style={{ backgroundColor: '#5a5a5a', ...brightnessStyle }}
          data-testid={`tile-${tileId}`}
          data-neighbor-code={neighborCode}
        >
          {/* Wall details - inner texture or pattern */}
          <div className="absolute inset-[3px] border border-[#4a4a4a] opacity-30"></div>
          
          {/* Only display subtype if it exists */}
          {subtype && subtype.length > 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-white font-bold">
              {subtype.join(',')}
            </div>
          )}
          {/* Fade overlay on top (last to ensure highest stacking) */}
          <div className="absolute inset-0 bg-black pointer-events-none z-50" style={overlayStyle} />
        </div>
      );
    } else {
      // Invisible wall - same style as invisible floor
      return (
        <div 
          className="w-10 h-10 bg-gray-900"
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
      {subtype && subtype.length > 0 ? subtype.join(',') : tileId}
    </div>
  );
};
