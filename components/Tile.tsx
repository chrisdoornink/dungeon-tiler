import React from 'react';
import { TileType, TileSubtype } from '../lib/map';

interface TileProps {
  tileId: number;
  tileType: TileType;
  subtype?: number;
  isVisible?: boolean; // Whether this tile is in the player's field of view
}

export const Tile: React.FC<TileProps> = ({ tileId, tileType, subtype = 0, isVisible = true }) => {
  // Display format: show subtype only if it's not 0
  const displayText = subtype > 0 ? `${tileId}:${subtype}` : `${tileId}`;
  
  // Determine colors based on visibility
  let backgroundColor = '#000'; // Default black for invisible tiles
  let textColor = '#fff';
  
  if (isVisible) {
    // Visible tiles - show actual colors
    if (subtype === TileSubtype.PLAYER) {
      backgroundColor = '#3b82f6'; // Blue for player
    } else {
      backgroundColor = tileType.color;
      textColor = tileType.id === 1 ? '#fff' : '#000';
    }
  } else {
    // Not visible - determine if it's a wall or floor for basic structure
    if (tileId === 0) { // Floor
      backgroundColor = '#222'; // Dark gray for floors
    } else if (tileId === 1) { // Wall
      backgroundColor = '#444'; // Light gray for walls
    }
    textColor = 'transparent'; // Hide text for non-visible tiles
  }
  
  return (
    <div 
      className="w-10 h-10 flex items-center justify-center text-sm font-medium"
      style={{ 
        backgroundColor,
        color: textColor,
        transition: 'background-color 0.3s' // Smooth transition for fog of war effect
      }}
      data-testid={`tile-${tileId}`}
    >
      {displayText}
    </div>
  );
};
