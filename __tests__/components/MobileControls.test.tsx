import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MobileControls from '../../components/MobileControls';

describe('MobileControls', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // jsdom does not implement matchMedia; default to a fine pointer (desktop)
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });

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
  
  it('calls onMove with the correct direction when arrow buttons are pressed', () => {
    // Mock window.innerWidth to be less than 600px
    global.innerWidth = 500;
    global.dispatchEvent(new Event('resize'));

    const handleMove = jest.fn();
    render(<MobileControls onMove={handleMove} />);

    // Press each direction button and verify the callback fires on press
    fireEvent.pointerDown(screen.getByTestId('mobile-control-up'));
    expect(handleMove).toHaveBeenCalledWith('UP');

    fireEvent.pointerDown(screen.getByTestId('mobile-control-down'));
    expect(handleMove).toHaveBeenCalledWith('DOWN');

    fireEvent.pointerDown(screen.getByTestId('mobile-control-left'));
    expect(handleMove).toHaveBeenCalledWith('LEFT');

    fireEvent.pointerDown(screen.getByTestId('mobile-control-right'));
    expect(handleMove).toHaveBeenCalledWith('RIGHT');
  });

  it('fires onMove on press and onMoveEnd on release (for hold-to-run)', () => {
    global.innerWidth = 500;
    global.dispatchEvent(new Event('resize'));

    const handleMove = jest.fn();
    const handleMoveEnd = jest.fn();
    render(<MobileControls onMove={handleMove} onMoveEnd={handleMoveEnd} />);

    const up = screen.getByTestId('mobile-control-up');
    fireEvent.pointerDown(up);
    expect(handleMove).toHaveBeenCalledWith('UP');
    expect(handleMoveEnd).not.toHaveBeenCalled();

    fireEvent.pointerUp(up);
    expect(handleMoveEnd).toHaveBeenCalledWith('UP');

    // A cancelled touch (e.g. system gesture) also ends the hold
    fireEvent.pointerDown(up);
    fireEvent.pointerCancel(up);
    expect(handleMoveEnd).toHaveBeenCalledTimes(2);
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

  const padOf = (grabber: HTMLElement) =>
    grabber.closest('div[style*="translateX"]') as HTMLElement;

  // jsdom's synthetic pointer events drop clientX, so build events that carry it.
  const pointer = (type: string, clientX: number) =>
    Object.assign(new Event(type, { bubbles: true }), { clientX, pointerId: 1 });

  it('does not move the d-pad when the grabber is only tapped', () => {
    // innerWidth 500 -> maxLeft = 500 - 24 - 180 = 296; default side "right"
    global.innerWidth = 500;
    global.dispatchEvent(new Event('resize'));
    render(<MobileControls onMove={jest.fn()} />);

    const grabber = screen.getByTestId('mobile-dpad-grabber');
    const pad = padOf(grabber);
    expect(pad.style.transform).toBe('translateX(296px)');

    // A press that barely moves (< 8px) is a tap: no snap, no persistence
    fireEvent(grabber, pointer('pointerdown', 100));
    fireEvent(grabber, pointer('pointerup', 103));

    expect(pad.style.transform).toBe('translateX(296px)');
    expect(window.localStorage.getItem('tb_dpad_side')).toBeNull();
  });

  it('snaps the d-pad to the nearest position when dragged and remembers it', () => {
    global.innerWidth = 500;
    global.dispatchEvent(new Event('resize'));
    render(<MobileControls onMove={jest.fn()} />);

    const grabber = screen.getByTestId('mobile-dpad-grabber');
    const pad = padOf(grabber);

    // Drag left across the whole bar -> snaps to the left anchor (0)
    fireEvent(grabber, pointer('pointerdown', 400));
    fireEvent(grabber, pointer('pointermove', 100));
    fireEvent(grabber, pointer('pointerup', 100));
    expect(window.localStorage.getItem('tb_dpad_side')).toBe('left');
    expect(pad.style.transform).toBe('translateX(0px)');

    // Nudge toward the middle -> snaps to the center anchor (148)
    fireEvent(grabber, pointer('pointerdown', 0));
    fireEvent(grabber, pointer('pointermove', 150));
    fireEvent(grabber, pointer('pointerup', 150));
    expect(window.localStorage.getItem('tb_dpad_side')).toBe('center');
    expect(pad.style.transform).toBe('translateX(148px)');
  });

  it('restores the saved d-pad side on mount', () => {
    window.localStorage.setItem('tb_dpad_side', 'left');
    global.innerWidth = 500;
    global.dispatchEvent(new Event('resize'));
    render(<MobileControls onMove={jest.fn()} />);
    const pad = padOf(screen.getByTestId('mobile-dpad-grabber'));
    expect(pad.style.transform).toBe('translateX(0px)');
  });

  it('does not render the grabber on desktop', () => {
    global.innerWidth = 800;
    global.dispatchEvent(new Event('resize'));
    render(<MobileControls onMove={jest.fn()} />);
    expect(screen.queryByTestId('mobile-dpad-grabber')).not.toBeInTheDocument();
  });

  it('shows a one-time keyboard tip when a desktop control is clicked', () => {
    global.innerWidth = 800;
    global.dispatchEvent(new Event('resize'));

    const { unmount } = render(<MobileControls onMove={jest.fn()} />);
    expect(screen.queryByTestId('keyboard-tip')).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId('mobile-control-up'));
    expect(screen.getByTestId('keyboard-tip')).toBeInTheDocument();
    expect(window.localStorage.getItem('tb_kbd_tip_seen')).toBe('1');

    unmount();

    // Already seen — a later session should not show the tip again
    render(<MobileControls onMove={jest.fn()} />);
    fireEvent.pointerDown(screen.getByTestId('mobile-control-up'));
    expect(screen.queryByTestId('keyboard-tip')).not.toBeInTheDocument();
  });

  it('does not show the keyboard tip on mobile', () => {
    global.innerWidth = 500;
    global.dispatchEvent(new Event('resize'));
    render(<MobileControls onMove={jest.fn()} />);
    fireEvent.pointerDown(screen.getByTestId('mobile-control-up'));
    expect(screen.queryByTestId('keyboard-tip')).not.toBeInTheDocument();
  });
});
