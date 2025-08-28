import React, { useState, useEffect, useCallback } from 'react';

interface MobileControlsProps {
  onMove: (direction: string) => void;
  onThrowRock?: () => void;
  rockCount?: number;
  onUseRune?: () => void;
  runeCount?: number;
}

const MobileControls: React.FC<MobileControlsProps> = ({ onMove, onThrowRock, rockCount, onUseRune, runeCount }) => {
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
      className={`fixed bottom-4 right-4 z-10 ${!isMobile ? 'opacity-70 scale-90' : ''}`}
    >
      {/* Action bar above d-pad: Rock and Rune buttons */}
      <div className="flex justify-end gap-2 mb-2">
        {(rockCount ?? 0) > 0 && (
          <button
            data-testid="mobile-action-rock"
            className={`${isMobile ? 'p-3' : 'p-2'} rounded-md ${
              (rockCount ?? 0) > 0
                ? (isMobile
                    ? 'bg-[#333333] hover:bg-[#444444] text-white'
                    : 'bg-transparent border border-[#444444] hover:border-[#555555] text-[#dddddd]')
                : 'bg-[#222222] text-[#666666] cursor-not-allowed'
            }`}
            onClick={() => (rockCount ?? 0) > 0 && onThrowRock && onThrowRock()}
            aria-label="Throw Rock"
            title={`Throw rock (${rockCount})`}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: isMobile ? 22 : 18,
                height: isMobile ? 22 : 18,
                backgroundImage: "url(/images/items/rock-1.png)",
                backgroundSize: 'contain',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
                verticalAlign: 'middle'
              }}
            />
          </button>
        )}
        {(runeCount ?? 0) > 0 && (
          <button
            data-testid="mobile-action-rune"
            className={`${isMobile ? 'p-3' : 'p-2'} rounded-md ${
              (runeCount ?? 0) > 0
                ? (isMobile
                    ? 'bg-[#333333] hover:bg-[#444444] text-white'
                    : 'bg-transparent border border-[#444444] hover:border-[#555555] text-[#dddddd]')
                : 'bg-[#222222] text-[#666666] cursor-not-allowed'
            }`}
            onClick={() => (runeCount ?? 0) > 0 && onUseRune && onUseRune()}
            aria-label="Use Rune"
            title={`Use rune (${runeCount})`}
          >
            <span aria-hidden="true" role="img" style={{ fontSize: isMobile ? 18 : 16 }}>💎</span>
          </button>
        )}
      </div>

      {/* D-pad grid */}
      <div className={`grid grid-cols-3 gap-1`}>
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
        {/* Center placeholder */}
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
    </div>
  );
};

export default MobileControls;
