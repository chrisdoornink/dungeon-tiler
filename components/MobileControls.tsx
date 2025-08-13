import React, { useState, useEffect, useCallback } from 'react';

interface MobileControlsProps {
  onMove: (direction: string) => void;
}

const MobileControls: React.FC<MobileControlsProps> = ({ onMove }) => {
  const [isMobile, setIsMobile] = useState(false);
  const [activeKeys, setActiveKeys] = useState<Record<string, boolean>>({
    UP: false,
    DOWN: false,
    LEFT: false,
    RIGHT: false
  });

  // Check if screen width is less than 600px
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 600);
    };

    // Initial check
    checkMobile();

    // Add event listener for window resize
    window.addEventListener('resize', checkMobile);

    // Clean up
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle keyboard events to highlight the corresponding button
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    let direction = '';
    
    switch (event.key) {
      case 'ArrowUp':
        direction = 'UP';
        break;
      case 'ArrowDown':
        direction = 'DOWN';
        break;
      case 'ArrowLeft':
        direction = 'LEFT';
        break;
      case 'ArrowRight':
        direction = 'RIGHT';
        break;
      default:
        return;
    }
    
    setActiveKeys(prev => ({ ...prev, [direction]: true }));
    
    // Reset after a short delay to create a flash effect
    setTimeout(() => {
      setActiveKeys(prev => ({ ...prev, [direction]: false }));
    }, 150);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Determine button style based on mobile/desktop and active state
  const getButtonStyle = (direction: string) => {
    const isActive = activeKeys[direction];
    
    if (isMobile) {
      // Mobile style - more prominent
      return isActive
        ? "bg-[#555555] text-white p-3 rounded-md transition-colors"
        : "bg-[#333333] text-white p-3 rounded-md hover:bg-[#444444] transition-colors";
    } else {
      // Desktop style - subtle outline
      return isActive
        ? "bg-[#333333] text-white p-2 rounded-md border border-[#555555] transition-colors"
        : "bg-transparent text-[#777777] p-2 rounded-md border border-[#444444] hover:border-[#555555] transition-colors";
    }
  };

  // Always render the controls, but with different styles based on device
  return (
    <div 
      data-testid="mobile-controls" 
      className={`fixed bottom-4 right-4 grid grid-cols-3 gap-1 z-10 ${!isMobile ? 'opacity-70 scale-90' : ''}`}
    >
      {/* Empty space for top-left */}
      <div></div>
      {/* Up button */}
      <button 
        data-testid="mobile-control-up"
        className={getButtonStyle('UP')}
        onClick={() => onMove('UP')}
        aria-label="Move Up"
      >
        ▲
      </button>
      {/* Empty space for top-right */}
      <div></div>
      
      {/* Left button */}
      <button 
        data-testid="mobile-control-left"
        className={getButtonStyle('LEFT')}
        onClick={() => onMove('LEFT')}
        aria-label="Move Left"
      >
        ◄
      </button>
      {/* Empty space for center */}
      <div></div>
      {/* Right button */}
      <button 
        data-testid="mobile-control-right"
        className={getButtonStyle('RIGHT')}
        onClick={() => onMove('RIGHT')}
        aria-label="Move Right"
      >
        ►
      </button>
      
      {/* Empty space for bottom-left */}
      <div></div>
      {/* Down button */}
      <button 
        data-testid="mobile-control-down"
        className={getButtonStyle('DOWN')}
        onClick={() => onMove('DOWN')}
        aria-label="Move Down"
      >
        ▼
      </button>
      {/* Empty space for bottom-right */}
      <div></div>
    </div>
  );
};

export default MobileControls;
