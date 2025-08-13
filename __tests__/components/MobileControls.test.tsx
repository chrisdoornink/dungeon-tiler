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
});
