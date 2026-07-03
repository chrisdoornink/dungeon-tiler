import React, { useState, useEffect, useCallback } from 'react';

export interface MobileInventoryItem {
  key: string;
  label: string;
  icon?: string;
  emoji?: string;
  count?: number;
  onUse?: () => void;
}

interface MobileControlsProps {
  onMove: (direction: string) => void;
  onThrowRock?: () => void;
  rockCount?: number;
  onUseRune?: () => void;
  runeCount?: number;
  onThrowBomb?: () => void;
  bombCount?: number;
  inventoryItems?: MobileInventoryItem[];
}

const ARROW_ROTATION: Record<string, number> = {
  UP: 0,
  RIGHT: 90,
  DOWN: 180,
  LEFT: 270,
};

const DirectionArrow = ({ direction }: { direction: string }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    aria-hidden="true"
    style={{ transform: `rotate(${ARROW_ROTATION[direction]}deg)` }}
  >
    <path
      d="M10 5 L15.5 14 H4.5 Z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

const ItemIcon = ({ src, size }: { src: string; size: number }) => (
  <span
    aria-hidden="true"
    style={{
      display: 'inline-block',
      width: size,
      height: size,
      backgroundImage: `url(${src})`,
      backgroundSize: 'contain',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
    }}
  />
);

// 3x3 d-pad layout; null cells are empty spacers
const DPAD_CELLS: (string | null)[] = [
  null, 'UP', null,
  'LEFT', null, 'RIGHT',
  null, 'DOWN', null,
];

const MobileControls: React.FC<MobileControlsProps> = ({
  onMove,
  onThrowRock,
  rockCount,
  onUseRune,
  runeCount,
  onThrowBomb,
  bombCount,
  inventoryItems = [],
}) => {
  const [isMobile, setIsMobile] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
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
      setViewportWidth(window.innerWidth);
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

  const quickActions = [
    {
      key: 'rock',
      testId: 'mobile-action-rock',
      icon: '/images/items/rock-1.png',
      count: rockCount ?? 0,
      onUse: onThrowRock,
      label: 'Throw Rock',
      title: `Throw rock (${rockCount})`,
    },
    {
      key: 'rune',
      testId: 'mobile-action-rune',
      icon: '/images/items/rune1.png',
      count: runeCount ?? 0,
      onUse: onUseRune,
      label: 'Use Rune',
      title: `Use rune (${runeCount})`,
    },
    {
      key: 'bomb',
      testId: 'mobile-action-bomb',
      icon: '/images/items/bomb-black.png',
      count: bombCount ?? 0,
      onUse: onThrowBomb,
      label: 'Throw Bomb',
      title: `Throw bomb (${bombCount})`,
    },
  ].filter((action) => action.count > 0 && action.onUse);

  const renderDpad = (buttonClass: (direction: string) => string, gapClass: string) => (
    <div className={`grid grid-cols-3 ${gapClass}`}>
      {DPAD_CELLS.map((direction, i) =>
        direction ? (
          <button
            key={direction}
            data-testid={`mobile-control-${direction.toLowerCase()}`}
            className={buttonClass(direction)}
            onClick={() => onMove(direction)}
            aria-label={`Move ${direction.charAt(0)}${direction.slice(1).toLowerCase()}`}
          >
            <DirectionArrow direction={direction} />
          </button>
        ) : (
          <div key={`spacer-${i}`} />
        )
      )}
    </div>
  );

  if (!isMobile) {
    // Desktop: subtle outline controls pinned bottom-right
    const desktopDpadClass = (direction: string) =>
      activeKeys[direction]
        ? 'flex h-9 w-9 items-center justify-center bg-[#333333] text-white rounded-md border border-[#555555] transition-colors'
        : 'flex h-9 w-9 items-center justify-center bg-transparent text-[#777777] rounded-md border border-[#444444] hover:border-[#555555] transition-colors';

    return (
      <div
        data-testid="mobile-controls"
        className="fixed right-4 z-10 opacity-70 scale-90"
        style={{ bottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
      >
        <div className="flex justify-end gap-2 mb-2">
          {quickActions.map((action) => (
            <button
              key={action.key}
              data-testid={action.testId}
              className="p-2 rounded-md bg-transparent border border-[#444444] hover:border-[#555555] text-[#dddddd]"
              onClick={action.onUse}
              aria-label={action.label}
              title={action.title}
            >
              <ItemIcon src={action.icon} size={18} />
            </button>
          ))}
        </div>
        {renderDpad(desktopDpadClass, 'gap-1')}
      </div>
    );
  }

  // Mobile: full-width control bar. All usable items sit in a strip above the
  // d-pad, filling from the right edge (nearest the thumb) and wrapping to a
  // second row when they run out of space.
  const mobileDpadClass = (direction: string) =>
    `flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 shadow-md text-gray-200 transition-colors ${
      activeKeys[direction] ? 'bg-[#555555]' : 'bg-[#333333] active:bg-[#555555]'
    }`;

  const stripItems = inventoryItems.filter((item) => item.onUse);
  // Rock/rune/bomb keep their long-standing action testids
  const stripTestId = (key: string) =>
    ['rock', 'rune', 'bomb'].includes(key)
      ? `mobile-action-${key}`
      : `mobile-inventory-item-${key}`;

  const renderStripButton = (item: MobileInventoryItem) => (
    <button
      key={item.key}
      data-testid={stripTestId(item.key)}
      className="relative flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-[#333333] shadow-md transition-colors active:bg-[#555555]"
      onClick={item.onUse}
      aria-label={item.label}
      title={(item.count ?? 0) > 0 ? `${item.label} (${item.count})` : item.label}
    >
      {item.icon ? (
        <ItemIcon src={item.icon} size={26} />
      ) : (
        <span className="text-xl leading-none" aria-hidden="true">
          {item.emoji}
        </span>
      )}
      {(item.count ?? 0) > 0 && (
        <span className="absolute bottom-0.5 right-1 text-[10px] font-medium text-white/90">
          {item.count}
        </span>
      )}
    </button>
  );

  // Serpentine fill: the first row starts at the right edge (nearest the
  // thumb) and runs left; overflow drops to a second row that comes back
  // from the left. Buttons are 56px wide with an 8px gap inside px-3 padding.
  const perRow = Math.max(1, Math.floor((viewportWidth - 24 + 8) / 64));
  const firstRowItems = stripItems.slice(0, perRow);
  const overflowItems = stripItems.slice(perRow);

  return (
    <div data-testid="mobile-controls" className="fixed inset-x-0 bottom-0 z-30 pointer-events-none">
      <div
        className="pointer-events-auto bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pt-4"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))' }}
      >
        {stripItems.length > 0 && (
          <div className="mb-2 flex flex-col gap-2">
            <div className="flex flex-row-reverse gap-2">
              {firstRowItems.map(renderStripButton)}
            </div>
            {overflowItems.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {overflowItems.map(renderStripButton)}
              </div>
            )}
          </div>
        )}
        <div className="flex items-end justify-end">
          {renderDpad(mobileDpadClass, 'gap-1.5')}
        </div>
      </div>
    </div>
  );
};

export default MobileControls;
