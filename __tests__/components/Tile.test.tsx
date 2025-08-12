import React from 'react';
import { render, screen } from '@testing-library/react';
import { Tile } from '../../components/Tile';
import '@testing-library/jest-dom';
import { TileSubtype } from '../../lib/map';

describe('Tile component', () => {
  it('should render the tile with correct background color', () => {
    const mockTileType = { id: 0, name: 'floor', color: '#ccc', walkable: true };
    render(<Tile tileId={0} tileType={mockTileType} />);
    
    const tile = screen.getByTestId('tile-0');
    expect(tile).toBeInTheDocument();
    expect(tile).toHaveStyle('background-color: #c8c8c8');
  });

  it('adds an exaggerated bottom border and base shadow on walls when there is a floor below (forced perspective)', () => {
    const mockTileType = { id: 1, name: 'wall', color: '#333', walkable: false };
    render(
      <Tile
        tileId={1}
        tileType={mockTileType}
        isVisible={true}
        neighbors={{ top: 1, right: 1, bottom: 0, left: 1 }}
      />
    );
    const tile = screen.getByTestId('tile-1');
    expect(tile).toBeInTheDocument();
    expect(tile.className).toContain('border-b-8');
    expect(screen.getByTestId('wall-base-shadow')).toBeInTheDocument();
  });

  it('does not add thicker bottom border when the tile below is also a wall (no perspective needed)', () => {
    const mockTileType = { id: 1, name: 'wall', color: '#333', walkable: false };
    render(
      <Tile
        tileId={1}
        tileType={mockTileType}
        isVisible={true}
        neighbors={{ top: 1, right: 1, bottom: 1, left: 1 }}
      />
    );
    const tile = screen.getByTestId('tile-1');
    expect(tile).toBeInTheDocument();
    expect(tile.className).not.toContain('border-b-8');
    expect(screen.queryByTestId('wall-base-shadow')).toBeNull();
  });

  it('should not display content for tile with no subtype', () => {
    const mockTileType = { id: 1, name: 'wall', color: '#333', walkable: false };
    render(<Tile tileId={1} tileType={mockTileType} />);
    
    const tile = screen.getByTestId('tile-1');
    expect(tile).not.toHaveTextContent(/\d/);
  });

  it('should display subtype icon when subtype is provided', () => {
    const mockTileType = { id: 0, name: 'floor', color: '#ccc', walkable: true };
    render(<Tile tileId={0} tileType={mockTileType} subtype={[TileSubtype.EXIT]} />);
    
    const subtypeIcon = screen.getByTestId(`subtype-icon-${TileSubtype.EXIT}`);
    expect(subtypeIcon).toBeInTheDocument();
    expect(subtypeIcon).toHaveTextContent('E');
  });

  it('should display multiple subtypes as separate icons', () => {
    const mockTileType = { id: 0, name: 'floor', color: '#ccc', walkable: true };
    render(<Tile tileId={0} tileType={mockTileType} subtype={[TileSubtype.KEY, TileSubtype.DOOR]} />);
    
    const tile = screen.getByTestId('tile-0');
    const subtypeIcons = screen.getAllByTestId(/subtype-icon-/);
    
    // Should have two separate subtype icons
    expect(subtypeIcons).toHaveLength(2);
    expect(screen.getByTestId('subtype-icon-' + TileSubtype.KEY)).toBeInTheDocument();
    expect(screen.getByTestId('subtype-icon-' + TileSubtype.DOOR)).toBeInTheDocument();
    
    // Background should still be present (not replaced by subtypes)
    expect(tile).toHaveStyle('background-image: url(/images/floor/floor-try-1.png)');
  });
  
  it('should hide sword/shield/lock subtypes when a closed chest is present', () => {
    const mockTileType = { id: 0, name: 'floor', color: '#ccc', walkable: true };
    render(<Tile tileId={0} tileType={mockTileType} subtype={[TileSubtype.CHEST, TileSubtype.SWORD, TileSubtype.LOCK]} />);
    
    // Should have chest icon but not sword or lock icons
    expect(screen.getByTestId(`subtype-icon-${TileSubtype.CHEST}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`subtype-icon-${TileSubtype.SWORD}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`subtype-icon-${TileSubtype.LOCK}`)).not.toBeInTheDocument();
    
    // Chest should use the asset icon class
    const chestIcon = screen.getByTestId(`subtype-icon-${TileSubtype.CHEST}`);
    expect(chestIcon.className).toContain('closedChestIcon');
  });
  
  it('should render asset-based icons for special subtypes', () => {
    const mockTileType = { id: 0, name: 'floor', color: '#ccc', walkable: true };
    render(<Tile tileId={0} tileType={mockTileType} subtype={[
      TileSubtype.LIGHTSWITCH, 
      TileSubtype.OPEN_CHEST,
      TileSubtype.KEY,
      TileSubtype.EXITKEY,
      TileSubtype.DOOR
    ]} />);
    
    // Should have all special icons
    expect(screen.getByTestId(`subtype-icon-${TileSubtype.LIGHTSWITCH}`)).toBeInTheDocument();
    expect(screen.getByTestId(`subtype-icon-${TileSubtype.OPEN_CHEST}`)).toBeInTheDocument();
    expect(screen.getByTestId(`subtype-icon-${TileSubtype.KEY}`)).toBeInTheDocument();
    expect(screen.getByTestId(`subtype-icon-${TileSubtype.EXITKEY}`)).toBeInTheDocument();
    expect(screen.getByTestId(`subtype-icon-${TileSubtype.DOOR}`)).toBeInTheDocument();
    
    // Icons should use the asset classes
    const switchIcon = screen.getByTestId(`subtype-icon-${TileSubtype.LIGHTSWITCH}`);
    const openChestIcon = screen.getByTestId(`subtype-icon-${TileSubtype.OPEN_CHEST}`);
    const keyIcon = screen.getByTestId(`subtype-icon-${TileSubtype.KEY}`);
    const exitKeyIcon = screen.getByTestId(`subtype-icon-${TileSubtype.EXITKEY}`);
    const doorIcon = screen.getByTestId(`subtype-icon-${TileSubtype.DOOR}`);
    
    expect(switchIcon.className).toContain('switchIcon');
    expect(openChestIcon.className).toContain('openedChestIcon');
    expect(keyIcon.className).toContain('keyIcon');
    expect(exitKeyIcon.className).toContain('exitKeyIcon');
    expect(doorIcon.className).toContain('doorIcon');
  });

  it('should not display content when subtype is empty array', () => {
    const mockTileType = { id: 1, name: 'wall', color: '#333', walkable: false };
    render(<Tile tileId={1} tileType={mockTileType} subtype={[]} />);
    
    const tile = screen.getByTestId('tile-1');
    expect(tile).not.toHaveTextContent(/\d/);
  });
});
