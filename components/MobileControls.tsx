import React, { useState, useEffect, useCallback, useRef } from 'react';

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
  // Called when a direction button is released (or the touch is cancelled), so
  // the game can stop a held-to-run repeat. onMove fires on press.
  onMoveEnd?: (direction: string) => void;
  onThrowRock?: () => void;
  rockCount?: number;
  onUseRune?: () => void;
  runeCount?: number;
  onThrowBomb?: () => void;
  bombCount?: number;
  inventoryItems?: MobileInventoryItem[];
}

type DpadSide = 'left' | 'center' | 'right';
const DPAD_SIDE_KEY = 'tb_dpad_side';
const KBD_TIP_KEY = 'tb_kbd_tip_seen';

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

// 3x3 d-pad layout; null cells are empty spacers (index 4 is the center)
const DPAD_CELLS: (string | null)[] = [
  null, 'UP', null,
  'LEFT', null, 'RIGHT',
  null, 'DOWN', null,
];

// Full-size touch button and the smallest we'll shrink a strip button to before
// we give up on a single row and let items wrap instead.
const MAX_BTN = 56;
const MIN_TOUCH = 44; // Apple's minimum comfortable touch target
const WRAP_BTN = 48; // size used once we accept wrapping (>~7 items)
const STRIP_GAP = 8; // gap-2

// D-pad drag-to-reposition. The pad is a 3x3 grid of 56px (h-14) buttons with
// 6px (gap-1.5) gaps, so its footprint is a fixed 180px.
const DPAD_WIDTH = 3 * 56 + 2 * 6;
const DRAG_TAP_THRESHOLD = 8; // px of travel below which a press counts as a tap (no-op)
const DPAD_SNAP_MS = 160;

// Suppress the mobile long-press artifacts on the controls: the blue text/element
// selection highlight, the tap flash, and the iOS callout menu.
const NO_SELECT: React.CSSProperties = {
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTapHighlightColor: 'transparent',
  WebkitTouchCallout: 'none',
};
// Direction buttons additionally claim the touch so a press-and-hold never turns
// into a scroll/zoom gesture.
const NO_SELECT_TOUCH: React.CSSProperties = { ...NO_SELECT, touchAction: 'none' };

const MobileControls: React.FC<MobileControlsProps> = ({
  onMove,
  onMoveEnd,
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
  const [dpadSide, setDpadSide] = useState<DpadSide>('right');
  const [showKbdTip, setShowKbdTip] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [activeKeys, setActiveKeys] = useState<Record<string, boolean>>({
    UP: false,
    DOWN: false,
    LEFT: false,
    RIGHT: false
  });
  const tipTimer = useRef<number | null>(null);
  const padRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; baseLeft: number; active: boolean }>({
    startX: 0,
    baseLeft: 0,
    active: false,
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

  // Restore the remembered d-pad side (handedness) after mount so SSR stays stable.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DPAD_SIDE_KEY);
      if (saved === 'left' || saved === 'center' || saved === 'right') {
        setDpadSide(saved);
      }
    } catch {
      // localStorage unavailable — keep the default
    }
  }, []);

  // Clear the tip timer on unmount
  useEffect(() => {
    return () => {
      if (tipTimer.current) window.clearTimeout(tipTimer.current);
    };
  }, []);

  const persistSide = useCallback((side: DpadSide) => {
    try {
      window.localStorage.setItem(DPAD_SIDE_KEY, side);
    } catch {
      // ignore persistence failures
    }
  }, []);

  // On desktop, the first time the player taps an on-screen control, surface a
  // one-time hint that the keyboard works too. Gated to real pointer devices so
  // large tablets don't get a "use your arrow keys" tip.
  const activateControl = useCallback(() => {
    if (isMobile || typeof window === 'undefined') return;
    try {
      if (window.localStorage.getItem(KBD_TIP_KEY)) return;
    } catch {
      return;
    }
    const fine =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: fine)').matches
        : true;
    if (!fine) return;
    setShowKbdTip(true);
    try {
      window.localStorage.setItem(KBD_TIP_KEY, '1');
    } catch {
      // ignore persistence failures
    }
    if (tipTimer.current) window.clearTimeout(tipTimer.current);
    tipTimer.current = window.setTimeout(() => setShowKbdTip(false), 6000);
  }, [isMobile]);

  // Press a direction: fire the move now and (via onMove -> game) start the
  // held-to-run repeat. Capturing the pointer keeps the hold alive even if the
  // finger drifts off the button, so a slight wobble doesn't stop the run.
  const pressDirection = useCallback(
    (direction: string, target: HTMLElement, pointerId: number) => {
      try {
        target.setPointerCapture(pointerId);
      } catch {
        // pointer capture unsupported — hold still works while over the button
      }
      onMove(direction);
      activateControl();
    },
    [onMove, activateControl]
  );

  const releaseDirection = useCallback(
    (direction: string) => {
      onMoveEnd?.(direction);
    },
    [onMoveEnd]
  );

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

  const renderDpad = (
    buttonClass: (direction: string) => string,
    gapClass: string,
    centerContent: React.ReactNode = null
  ) => (
    <div className={`grid grid-cols-3 ${gapClass}`}>
      {DPAD_CELLS.map((direction, i) =>
        direction ? (
          <button
            key={direction}
            data-testid={`mobile-control-${direction.toLowerCase()}`}
            className={buttonClass(direction)}
            style={NO_SELECT_TOUCH}
            onPointerDown={(e) => pressDirection(direction, e.currentTarget, e.pointerId)}
            onPointerUp={() => releaseDirection(direction)}
            onPointerCancel={() => releaseDirection(direction)}
            onContextMenu={(e) => e.preventDefault()}
            aria-label={`Move ${direction.charAt(0)}${direction.slice(1).toLowerCase()}`}
          >
            <DirectionArrow direction={direction} />
          </button>
        ) : (
          <div key={`spacer-${i}`} className="flex items-center justify-center">
            {i === 4 ? centerContent : null}
          </div>
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
      <>
        <div
          data-testid="mobile-controls"
          className="fixed right-4 z-10 opacity-70 scale-90"
          style={{ bottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))', ...NO_SELECT }}
        >
          <div className="flex justify-end gap-2 mb-2">
            {quickActions.map((action) => (
              <button
                key={action.key}
                data-testid={action.testId}
                className="p-2 rounded-md bg-transparent border border-[#444444] hover:border-[#555555] text-[#dddddd]"
                onClick={() => {
                  action.onUse?.();
                  activateControl();
                }}
                aria-label={action.label}
                title={action.title}
              >
                <ItemIcon src={action.icon} size={18} />
              </button>
            ))}
          </div>
          {renderDpad(desktopDpadClass, 'gap-1')}
        </div>
        {showKbdTip && (
          <div
            data-testid="keyboard-tip"
            role="status"
            aria-live="polite"
            className="fixed left-1/2 z-40 -translate-x-1/2 max-w-[90vw] rounded-lg bg-black/85 px-4 py-2 text-center text-sm text-white/90 shadow-lg pointer-events-none"
            style={{ bottom: 'max(4.5rem, calc(env(safe-area-inset-bottom, 1rem) + 4rem))' }}
          >
            Tip: You can use the arrow keys on your keyboard to move around instead
            of the controls, if you prefer.
          </div>
        )}
      </>
    );
  }

  // Mobile: full-width control bar. Usable items sit in a strip above the d-pad,
  // shrinking to stay on a single row until there are too many to keep tappable,
  // at which point they wrap. The d-pad can be nudged to the left, center, or
  // right via the subtle grabber in its middle.
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

  // Pick the largest button (<= 56px) that keeps every usable item on one row.
  // If that would push buttons below a comfortable touch target, fall back to a
  // fixed size and let the items wrap to a second row instead.
  const usableWidth = Math.max(0, viewportWidth - 24); // inside px-3
  const stripCount = stripItems.length;
  const oneRowSize =
    stripCount > 0
      ? (usableWidth - (stripCount - 1) * STRIP_GAP) / stripCount
      : MAX_BTN;
  // Shrink to the largest size that keeps one row, but never below the touch
  // minimum. Once even that won't fit, fall back to a comfortable size and let
  // the items wrap to a second row instead.
  let btnSize = MAX_BTN;
  if (oneRowSize < MAX_BTN) {
    btnSize = oneRowSize >= MIN_TOUCH ? Math.floor(oneRowSize) : WRAP_BTN;
  }
  const iconSize = Math.round(btnSize * 0.46);
  const emojiSize = Math.round(btnSize * 0.36);
  const badgeSize = Math.max(10, Math.round(btnSize * 0.18));

  const renderStripButton = (item: MobileInventoryItem) => (
    <button
      key={item.key}
      data-testid={stripTestId(item.key)}
      className="relative flex items-center justify-center rounded-xl border border-white/10 bg-[#333333] shadow-md transition-colors active:bg-[#555555]"
      style={{ width: btnSize, height: btnSize, ...NO_SELECT }}
      onClick={item.onUse}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={item.label}
      title={(item.count ?? 0) > 0 ? `${item.label} (${item.count})` : item.label}
    >
      {item.icon ? (
        <ItemIcon src={item.icon} size={iconSize} />
      ) : (
        <span
          className="leading-none"
          aria-hidden="true"
          style={{ fontSize: emojiSize }}
        >
          {item.emoji}
        </span>
      )}
      {(item.count ?? 0) > 0 && (
        <span
          className="absolute bottom-0.5 right-1 font-medium text-white/90"
          style={{ fontSize: badgeSize }}
        >
          {item.count}
        </span>
      )}
    </button>
  );

  // The strip and d-pad both hug the same edge as the chosen side, so items stay
  // nearest the thumb wherever the pad lives.
  const stripFlowClass =
    dpadSide === 'right'
      ? 'flex-row-reverse'
      : dpadSide === 'center'
      ? 'flex-row justify-center'
      : 'flex-row';
  // The d-pad slides horizontally within the bar; three snap positions map to a
  // translateX offset. maxLeft is how far the 180px pad can travel inside the
  // px-3 content box.
  const maxLeft = Math.max(0, viewportWidth - 24 - DPAD_WIDTH);
  const anchorLeft = (side: DpadSide) =>
    side === 'left' ? 0 : side === 'center' ? maxLeft / 2 : maxLeft;
  const nearestSide = (left: number): DpadSide => {
    const options: DpadSide[] = ['left', 'center', 'right'];
    return options.reduce((best, side) =>
      Math.abs(anchorLeft(side) - left) < Math.abs(anchorLeft(best) - left) ? side : best
    );
  };

  const setPadTransform = (left: number, animate: boolean) => {
    const el = padRef.current;
    if (!el) return;
    el.style.transition = animate ? `transform ${DPAD_SNAP_MS}ms ease` : 'none';
    el.style.transform = `translateX(${left}px)`;
  };

  const onGrabPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, baseLeft: anchorLeft(dpadSide), active: true };
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer capture unsupported — dragging still works while over the grip
    }
  };
  const onGrabPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const { startX, baseLeft } = dragRef.current;
    const left = Math.max(0, Math.min(maxLeft, baseLeft + (e.clientX - startX)));
    setPadTransform(left, false);
  };
  const endDrag = (clientX: number | null) => {
    if (!dragRef.current.active) return;
    const { startX, baseLeft } = dragRef.current;
    dragRef.current.active = false;
    setDragging(false);
    // A press that never really moved is a tap: leave the pad where it was.
    if (clientX === null || Math.abs(clientX - startX) < DRAG_TAP_THRESHOLD) {
      setPadTransform(anchorLeft(dpadSide), true);
      return;
    }
    const left = Math.max(0, Math.min(maxLeft, baseLeft + (clientX - startX)));
    const finalSide = nearestSide(left);
    setPadTransform(anchorLeft(finalSide), true);
    if (finalSide !== dpadSide) {
      setDpadSide(finalSide);
      persistSide(finalSide);
    }
  };

  const grabber = (
    <button
      type="button"
      data-testid="mobile-dpad-grabber"
      aria-label="Drag to move the controls left, center, or right"
      onPointerDown={onGrabPointerDown}
      onPointerMove={onGrabPointerMove}
      onPointerUp={(e) => endDrag(e.clientX)}
      onPointerCancel={() => endDrag(null)}
      className="flex h-14 w-14 cursor-grab items-center justify-center rounded-xl bg-transparent text-white/25 transition-colors active:cursor-grabbing active:text-white/50"
      style={NO_SELECT_TOUCH}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <line x1="3" y1="5" x2="13" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="3" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );

  return (
    <div data-testid="mobile-controls" className="fixed inset-x-0 bottom-0 z-30 pointer-events-none">
      <div
        className="pointer-events-auto bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pt-4"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))', ...NO_SELECT }}
      >
        {stripItems.length > 0 && (
          <div className={`mb-2 flex flex-wrap gap-2 ${stripFlowClass}`}>
            {stripItems.map(renderStripButton)}
          </div>
        )}
        <div className="flex items-end justify-start">
          <div
            ref={padRef}
            style={{
              transform: `translateX(${anchorLeft(dpadSide)}px)`,
              transition: dragging ? 'none' : `transform ${DPAD_SNAP_MS}ms ease`,
              willChange: 'transform',
            }}
          >
            {renderDpad(mobileDpadClass, 'gap-1.5', grabber)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileControls;
