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
  subtype?: number;
  isVisible?: boolean; // Whether this tile is in the player's field of view
  neighbors?: NeighborInfo; // Information about neighboring tiles
}

export const Tile: React.FC<TileProps> = ({ tileId, tileType, subtype = 0, isVisible = true, neighbors = { top: null, right: null, bottom: null, left: null } }) => {
  // Display format: show subtype only if it's not 0
  const displayText = subtype > 0 ? `${tileId}:${subtype}` : `${tileId}`;
  
  // For debugging neighbor info
  console.log(`Tile ${tileId} at (${displayText}) has neighbors:`, neighbors);
  
  // Determine colors based on visibility
  let backgroundColor = '#000'; // Default black for invisible tiles
  let textColor = '#fff';
  
  // Define border colors based on tile type - Make them more visible
  const floorBorderColor = 'rgba(0, 255, 0, 0.8)';  // Green for floor borders - very visible for debugging
  const wallBorderColor = 'rgba(255, 0, 0, 0.9)';    // Red for wall borders - very visible for debugging
  const wallHighlightColor = 'rgba(255, 255, 0, 0.7)'; // Yellow for wall highlights
  const floorHighlightColor = 'rgba(0, 0, 255, 0.6)'; // Blue for floor highlights
  
  // Determine border styles for autotiling - using more visible borders for debugging
  let borderTop = '';
  let borderRight = '';
  let borderBottom = '';
  let borderLeft = '';
  const cornerTopLeft = '';
  const cornerTopRight = '';
  const cornerBottomLeft = '';
  const cornerBottomRight = '';
  
  if (isVisible) {
    // Visible tiles - show actual colors
    if (subtype === TileSubtype.PLAYER) {
      backgroundColor = '#3b82f6'; // Blue for player
    } else {
      backgroundColor = tileType.color;
      textColor = tileType.id === 1 ? '#fff' : '#000';
      
      // Apply autotiling only for visible floor and wall tiles
      if (tileId === 0) { // Floor
        backgroundColor = '#e2e2e2'; // Light gray base for floors
        
        // Check neighboring tiles and apply borders where we meet different tile types
        if (neighbors.top !== null && neighbors.top !== tileId) {
          borderTop = 'border-t-4 border-green-500'; // Much more visible border
          console.log('Added TOP border to floor tile');
        }
        
        if (neighbors.right !== null && neighbors.right !== tileId) {
          borderRight = 'border-r-4 border-green-500'; // Much more visible border
          console.log('Added RIGHT border to floor tile');
        }
        
        if (neighbors.bottom !== null && neighbors.bottom !== tileId) {
          borderBottom = 'border-b-4 border-green-500'; // Much more visible border
          console.log('Added BOTTOM border to floor tile');
        }
        
        if (neighbors.left !== null && neighbors.left !== tileId) {
          borderLeft = 'border-l-4 border-green-500'; // Much more visible border
          console.log('Added LEFT border to floor tile');
        }
      } else if (tileId === 1) { // Wall
        backgroundColor = '#777777'; // Medium gray for walls
        
        // Apply wall-specific borders with more visible colors for debugging
        if (neighbors.top !== null && neighbors.top !== tileId) {
          borderTop = 'border-t-4 border-red-500'; // Much more visible border
          console.log('Added TOP border to wall tile');
        }
        
        if (neighbors.right !== null && neighbors.right !== tileId) {
          borderRight = 'border-r-4 border-red-500'; // Much more visible border
          console.log('Added RIGHT border to wall tile');
        }
        
        if (neighbors.bottom !== null && neighbors.bottom !== tileId) {
          borderBottom = 'border-b-4 border-red-500'; // Much more visible border
          console.log('Added BOTTOM border to wall tile');
        }
        
        if (neighbors.left !== null && neighbors.left !== tileId) {
          borderLeft = 'border-l-4 border-red-500'; // Much more visible border
          console.log('Added LEFT border to wall tile');
        }
      }
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
  
  // Add inner shadow/highlight effect based on tile type - simplified for debugging
  const innerShadow = tileId === 1 ? 'shadow-inner' : ''; 
  const highlight = ''; // Removing subtle effects for debugging
  
  // Remove random variations for consistency in debugging
  // Only apply base background color
  const bgColorStyle = { 
    backgroundColor,
    transition: 'background-color 0.3s', // Smooth transitions
  };
  
  return (
    <div 
      className={`w-10 h-10 flex items-center justify-center text-sm font-bold relative 
                 ${borderTop} ${borderRight} ${borderBottom} ${borderLeft} ${innerShadow}`}
      style={bgColorStyle}
      data-testid={`tile-${tileId}`}
    >
      {/* Content - Make text more visible for debugging */}
      <span style={{ color: textColor, position: 'relative', zIndex: 2 }}>
        {displayText}
      </span>
      
      {/* Debugging border info */}
      {borderTop && <span className="absolute top-0 left-0 text-[8px] text-yellow-300">T</span>}
      {borderRight && <span className="absolute top-0 right-0 text-[8px] text-yellow-300">R</span>}
      {borderBottom && <span className="absolute bottom-0 left-0 text-[8px] text-yellow-300">B</span>}
      {borderLeft && <span className="absolute bottom-0 right-0 text-[8px] text-yellow-300">L</span>}
    </div>
  );
};
