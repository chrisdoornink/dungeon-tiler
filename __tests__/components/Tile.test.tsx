import React from 'react';
import { render, screen } from '@testing-library/react';
import { Tile } from '../../components/Tile';
import '@testing-library/jest-dom';
import { TileSubtype, Direction } from '../../lib/map';

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
    // Check for the correct CSS classes instead of text content
    expect(subtypeIcon.className).toContain('exitIcon');
    expect(subtypeIcon.className).toContain('fullHeightAssetIcon');
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
      TileSubtype.DOOR,
      TileSubtype.EXIT
    ]} />);
    
    // Should have all special icons
    expect(screen.getByTestId(`subtype-icon-${TileSubtype.LIGHTSWITCH}`)).toBeInTheDocument();
    expect(screen.getByTestId(`subtype-icon-${TileSubtype.OPEN_CHEST}`)).toBeInTheDocument();
    expect(screen.getByTestId(`subtype-icon-${TileSubtype.KEY}`)).toBeInTheDocument();
    expect(screen.getByTestId(`subtype-icon-${TileSubtype.EXITKEY}`)).toBeInTheDocument();
    expect(screen.getByTestId(`subtype-icon-${TileSubtype.DOOR}`)).toBeInTheDocument();
    expect(screen.getByTestId(`subtype-icon-${TileSubtype.EXIT}`)).toBeInTheDocument();
    
    // Icons should use the asset classes
    const switchIcon = screen.getByTestId(`subtype-icon-${TileSubtype.LIGHTSWITCH}`);
    const openChestIcon = screen.getByTestId(`subtype-icon-${TileSubtype.OPEN_CHEST}`);
    const keyIcon = screen.getByTestId(`subtype-icon-${TileSubtype.KEY}`);
    const exitKeyIcon = screen.getByTestId(`subtype-icon-${TileSubtype.EXITKEY}`);
    const doorIcon = screen.getByTestId(`subtype-icon-${TileSubtype.DOOR}`);
    const exitIcon = screen.getByTestId(`subtype-icon-${TileSubtype.EXIT}`);
    
    expect(switchIcon.className).toContain('switchIcon');
    expect(openChestIcon.className).toContain('openedChestIcon');
    expect(keyIcon.className).toContain('keyIcon');
    expect(exitKeyIcon.className).toContain('exitKeyIcon');
    expect(doorIcon.className).toContain('doorIcon');
    expect(doorIcon.className).toContain('fullHeightAssetIcon');
    expect(exitIcon.className).toContain('exitIcon');
    expect(exitIcon.className).toContain('fullHeightAssetIcon');
  });

  it('should not display content when subtype is empty array', () => {
    const mockTileType = { id: 1, name: 'wall', color: '#333', walkable: false };
    render(<Tile tileId={1} tileType={mockTileType} subtype={[]} />);
    
    const tile = screen.getByTestId('tile-1');
    expect(tile).not.toHaveTextContent(/\d/);
  });

  it('should render hero image with front-facing direction by default', () => {
    const mockTileType = { id: 0, name: 'floor', color: '#ccc', walkable: true };
    render(
      <Tile 
        tileId={0} 
        tileType={mockTileType} 
        subtype={[TileSubtype.PLAYER]} 
        isVisible={true} 
      />
    );
    
    // Find the hero image overlay
    const heroImage = screen.getByTestId('tile-0').querySelector(`.heroImage`);
    expect(heroImage).toBeInTheDocument();
    expect(heroImage).toHaveStyle("background-image: url('/images/hero/hero-front-static.png')");
    expect(heroImage).toHaveStyle('transform: none');
  });

  it('should render hero image with correct direction based on playerDirection prop', () => {
    const mockTileType = { id: 0, name: 'floor', color: '#ccc', walkable: true };
    
    // Test UP direction
    const { rerender } = render(
      <Tile 
        tileId={0} 
        tileType={mockTileType} 
        subtype={[TileSubtype.PLAYER]} 
        isVisible={true} 
        playerDirection={Direction.UP}
      />
    );
    
    let heroImage = screen.getByTestId('tile-0').querySelector(`.heroImage`);
    expect(heroImage).toHaveStyle("background-image: url('/images/hero/hero-back-static.png')");
    
    // Test RIGHT direction
    rerender(
      <Tile 
        tileId={0} 
        tileType={mockTileType} 
        subtype={[TileSubtype.PLAYER]} 
        isVisible={true} 
        playerDirection={Direction.RIGHT}
      />
    );
    
    heroImage = screen.getByTestId('tile-0').querySelector(`.heroImage`);
    expect(heroImage).toHaveStyle("background-image: url('/images/hero/hero-right-static.png')");
    expect(heroImage).toHaveStyle('transform: none');
    
    // Test LEFT direction (should use right image with horizontal flip)
    rerender(
      <Tile 
        tileId={0} 
        tileType={mockTileType} 
        subtype={[TileSubtype.PLAYER]} 
        isVisible={true} 
        playerDirection={Direction.LEFT}
      />
    );
    
    heroImage = screen.getByTestId('tile-0').querySelector(`.heroImage`);
    expect(heroImage).toHaveStyle("background-image: url('/images/hero/hero-right-static.png')");
    expect(heroImage).toHaveStyle('transform: scaleX(-1)');
  });

  it('should overlay hero image on top of floor tile background', () => {
    const mockTileType = { id: 0, name: 'floor', color: '#ccc', walkable: true };
    render(
      <Tile 
        tileId={0} 
        tileType={mockTileType} 
        subtype={[TileSubtype.PLAYER]} 
        isVisible={true} 
        playerDirection={Direction.DOWN}
      />
    );
    
    const tile = screen.getByTestId('tile-0');
    const heroImage = tile.querySelector(`.heroImage`);
    
    // Check that the tile has a background image (floor)
    expect(tile).toHaveStyle('background-image: url("/images/floor/floor-try-1.png")');
    
    // Check that the hero image is positioned absolutely to overlay the floor
    expect(heroImage).toHaveClass('heroImage');
    
    // Verify the hero image has transparent background
    expect(heroImage).toHaveStyle('background-color: transparent');
  });
});
