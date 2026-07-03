import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MobileControls from '../../components/MobileControls';

describe('MobileControls', () => {
  it('should use desktop style on screens wider than 600px', () => {
    // Mock window.innerWidth to be greater than 600px
    global.innerWidth = 800;
    global.dispatchEvent(new Event('resize'));
    
    const handleMove = jest.fn();
    render(<MobileControls onMove={handleMove} />);
    
    // Controls should be visible but with desktop styling
    const controls = screen.getByTestId('mobile-controls');
    expect(controls).toBeInTheDocument();
    expect(controls).toHaveClass('opacity-70');
    
    // Check that buttons have desktop styling (transparent background)
    const upButton = screen.getByTestId('mobile-control-up');
    expect(upButton).toHaveClass('bg-transparent');
  });
  
  it('should use mobile style on screens narrower than 600px', () => {
    // Mock window.innerWidth to be less than 600px
    global.innerWidth = 500;
    global.dispatchEvent(new Event('resize'));
    
    const handleMove = jest.fn();
    render(<MobileControls onMove={handleMove} />);
    
    // Controls should be visible with mobile styling
    const controls = screen.getByTestId('mobile-controls');
    expect(controls).toBeInTheDocument();
    expect(controls).not.toHaveClass('opacity-70');
    
    // Check that buttons have mobile styling (solid background)
    const upButton = screen.getByTestId('mobile-control-up');
    expect(upButton).toHaveClass('bg-[#333333]');
  });
  
  it('should call onMove with correct direction when arrow buttons are clicked', () => {
    // Mock window.innerWidth to be less than 600px
    global.innerWidth = 500;
    global.dispatchEvent(new Event('resize'));
    
    const handleMove = jest.fn();
    render(<MobileControls onMove={handleMove} />);
    
    // Click each direction button and verify the callback is called with correct direction
    fireEvent.click(screen.getByTestId('mobile-control-up'));
    expect(handleMove).toHaveBeenCalledWith('UP');
    
    fireEvent.click(screen.getByTestId('mobile-control-down'));
    expect(handleMove).toHaveBeenCalledWith('DOWN');
    
    fireEvent.click(screen.getByTestId('mobile-control-left'));
    expect(handleMove).toHaveBeenCalledWith('LEFT');
    
    fireEvent.click(screen.getByTestId('mobile-control-right'));
    expect(handleMove).toHaveBeenCalledWith('RIGHT');
  });

  it('shows usable inventory items as buttons in the mobile strip', () => {
    global.innerWidth = 500;
    global.dispatchEvent(new Event('resize'));

    const handleUseFood = jest.fn();
    render(
      <MobileControls
        onMove={jest.fn()}
        inventoryItems={[
          { key: 'rock', label: 'Rock', icon: '/images/items/rock-1.png', count: 3, onUse: jest.fn() },
          { key: 'food', label: 'Food', icon: '/images/items/food-1.png', count: 2, onUse: handleUseFood },
          { key: 'sword', label: 'Sword', icon: '/images/items/sword.png' },
        ]}
      />
    );

    // Rock keeps its long-standing action testid
    expect(screen.getByTestId('mobile-action-rock')).toBeInTheDocument();

    // Usable item triggers its handler
    fireEvent.click(screen.getByTestId('mobile-inventory-item-food'));
    expect(handleUseFood).toHaveBeenCalled();

    // Passive items (no onUse) are not part of the strip
    expect(screen.queryByTestId('mobile-inventory-item-sword')).not.toBeInTheDocument();
  });

  it('does not render inventory strip items on desktop', () => {
    global.innerWidth = 800;
    global.dispatchEvent(new Event('resize'));
    render(
      <MobileControls
        onMove={jest.fn()}
        inventoryItems={[{ key: 'food', label: 'Food', onUse: jest.fn() }]}
      />
    );
    expect(screen.queryByTestId('mobile-inventory-item-food')).not.toBeInTheDocument();
  });
});
