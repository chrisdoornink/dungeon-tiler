"use client";

import React from "react";
import type { CrosswordPuzzle } from "@/lib/crossword/types";

type Props = {
  puzzle: CrosswordPuzzle;
};

function keyFor(row: number, col: number) {
  return `${row}-${col}`;
}

// Predefined color schemes - Modern 2025 palettes
const COLOR_SCHEMES = {
  sage: {
    name: 'Sage',
    cellFocused: '#B5D4B5',           // Darker sage (for actively focused cell)
    cellWordHighlight: '#D4E7D4',      // Soft sage (for word highlight)
    cellHintRevealed: '#E6D4F5',       // Lavender (for hint-revealed cells)
    clueBackgroundTint: '#F5FAF5',     // Very light sage (for clue card backgrounds)
    clueFocusedBorder: '#7C9473',     // Muted sage green
    clueFocusedBg: '#F5FAF5',         // Very light sage for focused clue
    clueFocusedRing: '#A8C5A0',       // Light sage
    clueHoverBorder: '#90A889',       
    clueHoverBg: '#F5FAF5',           // Very light sage for hover
    clueDefaultBorder: '#D1D5DB',
    clueDefaultBg: '#FAFAFA',
    badgeText: '#5D7C55',             // Deep sage
  },
  lavender: {
    name: 'Lavender',
    cellFocused: '#DDD5EF',           // Soft lavender (darker)
    cellWordHighlight: '#F7F5FB',      // Very light lavender
    clueFocusedBorder: '#9B87C4',     // Muted lavender
    clueFocusedBg: '#F7F5FB',         
    clueFocusedRing: '#C4B5E3',       // Light lavender
    clueHoverBorder: '#B09DD4',       
    clueHoverBg: '#F7F5FB',           
    clueDefaultBorder: '#D1D5DB',
    clueDefaultBg: '#FAFAFA',
    badgeText: '#7B6BA0',             // Deep lavender
  },
  ocean: {
    name: 'Ocean',
    cellFocused: '#CCE8F0',           // Soft ocean blue (darker)
    cellWordHighlight: '#F0F9FB',      // Very light ocean
    clueFocusedBorder: '#5BA5C3',     // Ocean teal
    clueFocusedBg: '#F0F9FB',         
    clueFocusedRing: '#8EBFD5',       // Light ocean
    clueHoverBorder: '#6FB5CC',       
    clueHoverBg: '#F0F9FB',           
    clueDefaultBorder: '#D1D5DB',
    clueDefaultBg: '#FAFAFA',
    badgeText: '#4A8DA8',             // Deep ocean
  },
  terracotta: {
    name: 'Terracotta',
    cellFocused: '#EBD4CA',           // Soft terracotta (darker)
    cellWordHighlight: '#FAF5F3',      // Very light terracotta
    clueFocusedBorder: '#C17E6B',     // Warm terracotta
    clueFocusedBg: '#FAF5F3',         
    clueFocusedRing: '#D9A394',       // Light terracotta
    clueHoverBorder: '#CC9180',       
    clueHoverBg: '#FAF5F3',           
    clueDefaultBorder: '#D1D5DB',
    clueDefaultBg: '#FAFAFA',
    badgeText: '#A8614F',             // Deep terracotta
  },
  slate: {
    name: 'Slate',
    cellFocused: '#D6DEE6',           // Soft slate blue (darker)
    cellWordHighlight: '#F5F7FA',      // Very light slate
    clueFocusedBorder: '#6B7D8F',     // Cool slate
    clueFocusedBg: '#F5F7FA',         
    clueFocusedRing: '#9BAAB8',       // Light slate
    clueHoverBorder: '#7D8FA1',       
    clueHoverBg: '#F5F7FA',           
    clueDefaultBorder: '#D1D5DB',
    clueDefaultBg: '#FAFAFA',
    badgeText: '#54647A',             // Deep slate
  },
};

export default function CrosswordGrid({ puzzle }: Props) {
  // Design constants - adjust these to tweak the appearance
  const CELL_SIZE = 50; // pixels
  const BORDER_WIDTH = 3; // pixels
  const FONT_SIZE = 30; // pixels (text-lg is ~18px)
  
  const COLORS = COLOR_SCHEMES.sage;
  
  const { grid, placements } = puzzle;
  const [direction, setDirection] = React.useState<"across" | "down">("across");
  const [focusedClue, setFocusedClue] = React.useState<{ row: number; col: number; direction: "across" | "down" } | null>(null);

  // Track user-entered letters per active cell
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  
  // Track incorrect cells (for check feature)
  const [incorrectCells, setIncorrectCells] = React.useState<Set<string>>(new Set());
  
  // Track which hints are revealed (using clue number as key)
  const [revealedHints, setRevealedHints] = React.useState<Set<number>>(new Set());
  
  // Track which cells were revealed by hints (using cell key)
  const [hintRevealedCells, setHintRevealedCells] = React.useState<Set<string>>(new Set());
  
  // Track completion animation and modal
  const [isAnimating, setIsAnimating] = React.useState(false);
  const [showCompletionModal, setShowCompletionModal] = React.useState(false);
  
  // Timer state
  const [timerSeconds, setTimerSeconds] = React.useState(0);
  const [timerRunning, setTimerRunning] = React.useState(false);
  const [showTimer, setShowTimer] = React.useState(false);
  const [timerJustStarted, setTimerJustStarted] = React.useState(false);
  const [countdown, setCountdown] = React.useState(3);
  
  // Hint tracking
  const [clueHintClicks, setClueHintClicks] = React.useState(0);
  const [letterRevealClicks, setLetterRevealClicks] = React.useState(0);
  
  // Congratulatory messages
  const congratsMessages = React.useMemo(() => [
    "Nicely Done!",
    "Great Job!",
    "Excellent Work!",
    "Fantastic!",
    "Well Played!",
    "Impressive!",
    "Outstanding!",
    "Brilliant!",
    "Superb!",
    "Magnificent!",
    "Stellar Work!",
    "Bravo!",
    "Amazing!",
    "You Nailed It!",
    "Perfect!",
    "Exceptional!",
    "Wonderful!",
    "Terrific!",
    "Marvelous!",
    "Spectacular!",
    "You Crushed It!",
    "Phenomenal!",
    "Well Done!",
    "Top Notch!",
    "Ace!",
    "Champion!",
    "Master Solver!",
    "Puzzle Pro!",
    "Word Wizard!",
    "Crossword King!",
  ], []);
  
  const [completionMessage] = React.useState(() => 
    congratsMessages[Math.floor(Math.random() * congratsMessages.length)]
  );
  
  const [shareText, setShareText] = React.useState<string>("");
  const [copied, setCopied] = React.useState(false);

  // Build refs for focus management
  const cellRefs = React.useRef<Record<string, HTMLInputElement | null>>({});
  
  // Update cell backgrounds when focused clue changes
  React.useEffect(() => {
    // Skip during animation or check mode
    if (isAnimating || incorrectCells.size > 0) return;
    
    // Reset all cells to white or hint-revealed color first
    Object.entries(cellRefs.current).forEach(([key, cell]) => {
      if (cell && cell !== document.activeElement) {
        cell.style.backgroundColor = hintRevealedCells.has(key) ? COLORS.cellHintRevealed : '#FFFFFF';
      }
    });
    
    // Apply word highlight to cells in focused word (except the focused cell)
    if (focusedClue) {
      const wordCells: HTMLInputElement[] = [];
      
      if (focusedClue.direction === 'across') {
        const wordLength = placements.find(p => 
          p.row === focusedClue.row && 
          p.col === focusedClue.col && 
          p.direction === focusedClue.direction
        )?.word.length || 0;
        
        for (let c = focusedClue.col; c < focusedClue.col + wordLength; c++) {
          const key = keyFor(focusedClue.row, c);
          const cell = cellRefs.current[key];
          if (cell && cell !== document.activeElement) {
            wordCells.push(cell);
          }
        }
      } else {
        const wordLength = placements.find(p => 
          p.row === focusedClue.row && 
          p.col === focusedClue.col && 
          p.direction === focusedClue.direction
        )?.word.length || 0;
        
        for (let r = focusedClue.row; r < focusedClue.row + wordLength; r++) {
          const key = keyFor(r, focusedClue.col);
          const cell = cellRefs.current[key];
          if (cell && cell !== document.activeElement) {
            wordCells.push(cell);
          }
        }
      }
      
      // Apply highlight to word cells (but keep hint-revealed cells with their lavender color)
      wordCells.forEach((cell, idx) => {
        const cellKey = cell.dataset.pos ? keyFor(
          parseInt(cell.dataset.pos.split('-')[0], 10),
          parseInt(cell.dataset.pos.split('-')[1], 10)
        ) : null;
        if (cellKey && hintRevealedCells.has(cellKey)) {
          cell.style.backgroundColor = COLORS.cellHintRevealed;
        } else {
          cell.style.backgroundColor = COLORS.cellWordHighlight;
        }
      });
    }
  }, [focusedClue, COLORS.cellWordHighlight, COLORS.cellHintRevealed, placements, incorrectCells.size, hintRevealedCells, isAnimating]);
  
  // Countdown effect on mount
  React.useEffect(() => {
    if (countdown > 0) {
      const timeout = setTimeout(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timeout);
    } else if (countdown === 0 && !timerRunning) {
      // Countdown finished, start the timer
      setTimerRunning(true);
      setTimerJustStarted(true);
      setShowTimer(false); // Hide time display after countdown
      setTimeout(() => setTimerJustStarted(false), 600);
    }
  }, [countdown, timerRunning]);
  
  // Timer increment effect
  React.useEffect(() => {
    if (!timerRunning || isAnimating || showCompletionModal) return;
    
    const interval = setInterval(() => {
      setTimerSeconds(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [timerRunning, isAnimating, showCompletionModal]);
  
  // Apply terracotta highlighting when check is triggered
  React.useEffect(() => {
    if (incorrectCells.size > 0 && !isAnimating) {
      incorrectCells.forEach(cellKey => {
        const cell = cellRefs.current[cellKey];
        if (cell) {
          cell.style.backgroundColor = COLOR_SCHEMES.terracotta.cellFocused;
        }
      });
    }
  }, [incorrectCells, isAnimating]);

  // Precompute active cells for quick lookup
  const isActive = React.useMemo(() => {
    const active: Record<string, boolean> = {};
    for (let r = 0; r < grid.length; r += 1) {
      for (let c = 0; c < grid[r].length; c += 1) {
        if (grid[r][c]) active[keyFor(r, c)] = true;
      }
    }
    return active;
  }, [grid]);

  // Assign standard crossword numbers (top-left to bottom-right)
  // A cell gets a number if it starts at least one word (across or down)
  const cellNumbering = React.useMemo(() => {
    const cellToNumber: Record<string, number> = {};
    let currentNumber = 1;

    for (let r = 0; r < grid.length; r += 1) {
      for (let c = 0; c < grid[r].length; c += 1) {
        const k = keyFor(r, c);
        if (!isActive[k]) continue;

        // Check if this cell starts a word in either direction
        const startsAcross = (() => {
          const leftActive = c - 1 >= 0 && isActive[keyFor(r, c - 1)];
          const rightActive = c + 1 < grid[0].length && isActive[keyFor(r, c + 1)];
          return !leftActive && rightActive;
        })();

        const startsDown = (() => {
          const upActive = r - 1 >= 0 && isActive[keyFor(r - 1, c)];
          const downActive = r + 1 < grid.length && isActive[keyFor(r + 1, c)];
          return !upActive && downActive;
        })();

        if (startsAcross || startsDown) {
          cellToNumber[k] = currentNumber;
          currentNumber += 1;
        }
      }
    }

    return cellToNumber;
  }, [grid, isActive]);

  // Map of cell key -> display number (for rendering on grid)
  const startNumbers = React.useMemo(() => {
    const map: Record<string, number> = {};
    Object.entries(cellNumbering).forEach(([k, num]) => {
      map[k] = num;
    });
    return map;
  }, [cellNumbering]);

  const tryFocus = (r: number, c: number) => {
    const k = keyFor(r, c);
    const ref = cellRefs.current[k];
    if (ref) ref.focus();
  };

  // Helpers to detect starts and spans based on the grid
  const isStart = (r: number, c: number, dir: "across" | "down") => {
    if (!isActive[keyFor(r, c)]) return false;
    if (dir === "across") {
      const leftActive = c - 1 >= 0 && isActive[keyFor(r, c - 1)];
      const rightActive = c + 1 < grid[0].length && isActive[keyFor(r, c + 1)];
      return !leftActive && rightActive;
    }
    const upActive = r - 1 >= 0 && isActive[keyFor(r - 1, c)];
    const downActive = r + 1 < grid.length && isActive[keyFor(r + 1, c)];
    return !upActive && downActive;
  };

  const collectKeys = (r: number, c: number, dir: "across" | "down") => {
    const keys: string[] = [];
    let rr = r;
    let cc = c;
    const stepR = dir === "down" ? 1 : 0;
    const stepC = dir === "across" ? 1 : 0;
    while (
      rr >= 0 && rr < grid.length && cc >= 0 && cc < grid[0].length && isActive[keyFor(rr, cc)]
    ) {
      keys.push(keyFor(rr, cc));
      rr += stepR;
      cc += stepC;
    }
    return keys;
  };

  const wordHasBlanksFrom = (r: number, c: number, dir: "across" | "down") => {
    const keys = collectKeys(r, c, dir);
    for (const k of keys) {
      if (!(answers[k] && answers[k].length === 1)) return true;
    }
    return false;
  };

  const moveNext = (r: number, c: number) => {
    // Move only in the locked/current direction; no fallback
    if (direction === "across") {
      if (isActive[keyFor(r, c + 1)]) tryFocus(r, c + 1);
    } else {
      if (isActive[keyFor(r + 1, c)]) tryFocus(r + 1, c);
    }
  };

  const movePrev = (r: number, c: number) => {
    if (direction === "across") {
      if (isActive[keyFor(r, c - 1)]) tryFocus(r, c - 1);
    } else {
      if (isActive[keyFor(r - 1, c)]) tryFocus(r - 1, c);
    }
  };

  // Check answers and highlight incorrect cells
  const checkAnswers = () => {
    const incorrect = new Set<string>();
    
    placements.forEach(placement => {
      const { row, col, direction, word } = placement;
      
      for (let i = 0; i < word.length; i++) {
        const cellRow = direction === 'across' ? row : row + i;
        const cellCol = direction === 'across' ? col + i : col;
        const cellKey = keyFor(cellRow, cellCol);
        const userAnswer = answers[cellKey]?.toUpperCase();
        const correctLetter = word[i].toUpperCase();
        
        if (userAnswer && userAnswer !== correctLetter) {
          incorrect.add(cellKey);
        }
      }
    });
    
    setIncorrectCells(incorrect);
  };

  // Reveal a random unfilled letter for a clue
  const revealRandomLetter = (clueNumber: number) => {
    const clue = numberedClues.find(c => c.number === clueNumber);
    if (!clue) return;

    const { row, col, direction, word } = clue;
    const unfilledCells: Array<{ key: string; letter: string; index: number }> = [];

    for (let i = 0; i < word.length; i++) {
      const cellRow = direction === 'across' ? row : row + i;
      const cellCol = direction === 'across' ? col + i : col;
      const cellKey = keyFor(cellRow, cellCol);
      
      // Only include cells that don't have a user answer yet
      if (!answers[cellKey]) {
        unfilledCells.push({
          key: cellKey,
          letter: word[i],
          index: i
        });
      }
    }

    // If all cells are filled, do nothing
    if (unfilledCells.length === 0) return;

    // Pick a random unfilled cell
    const randomCell = unfilledCells[Math.floor(Math.random() * unfilledCells.length)];

    // Set the answer for this cell
    setAnswers(prev => ({ ...prev, [randomCell.key]: randomCell.letter }));

    // Mark this cell as hint-revealed
    setHintRevealedCells(prev => new Set([...prev, randomCell.key]));
  };

  const onInput = (r: number, c: number, v: string) => {
    const value = (v || "").toUpperCase().slice(-1).replace(/[^A-Z]/g, "");
    const cellKey = keyFor(r, c);
    setAnswers((prev) => ({ ...prev, [cellKey]: value }));
    if (value) moveNext(r, c);
  };
  
  // Check for puzzle completion
  React.useEffect(() => {
    // Don't check if already animating
    if (isAnimating || showCompletionModal) return;
    
    // Check if all cells are filled
    let allFilled = true;
    let allCorrect = true;
    
    for (const placement of placements) {
      const { row, col, direction, word } = placement;
      
      for (let i = 0; i < word.length; i++) {
        const cellRow = direction === 'across' ? row : row + i;
        const cellCol = direction === 'across' ? col + i : col;
        const cellKey = keyFor(cellRow, cellCol);
        const userAnswer = answers[cellKey]?.toUpperCase();
        const correctLetter = word[i].toUpperCase();
        
        if (!userAnswer) {
          allFilled = false;
          break;
        }
        if (userAnswer !== correctLetter) {
          allCorrect = false;
          break;
        }
      }
      
      if (!allFilled || !allCorrect) break;
    }
    
    // If puzzle is complete and correct, trigger animation
    if (allFilled && allCorrect) {
      setIsAnimating(true);
      setTimerRunning(false); // Stop timer
      
      // Animation colors (alternating sage and ocean)
      const animationColors = [
        COLOR_SCHEMES.sage.cellFocused,
        COLOR_SCHEMES.sage.cellWordHighlight,
        COLOR_SCHEMES.ocean.cellFocused,
        COLOR_SCHEMES.ocean.cellWordHighlight,
        COLOR_SCHEMES.sage.cellFocused,
        COLOR_SCHEMES.ocean.cellFocused,
      ];
      
      // Animate each cell with position-based delay
      Object.entries(cellRefs.current).forEach(([key, cell]) => {
        if (!cell) return;
        
        const [rowStr, colStr] = key.split('-');
        const row = parseInt(rowStr, 10);
        const col = parseInt(colStr, 10);
        
        // Delay based on position (diagonal wave effect)
        const delay = (row + col) * 50; // 50ms per step
        
        setTimeout(() => {
          let colorIndex = 0;
          const interval = setInterval(() => {
            if (cell) {
              cell.style.backgroundColor = animationColors[colorIndex % animationColors.length];
              cell.style.transition = 'background-color 0.3s ease';
            }
            colorIndex++;
            
            // Stop after cycling through colors for 3 seconds
            if (colorIndex >= 12) {
              clearInterval(interval);
            }
          }, 250); // Change color every 250ms
          
          // Clean up interval after 3 seconds
          setTimeout(() => clearInterval(interval), 3000);
        }, delay);
      });
      
      // Show modal after 3 seconds + max delay
      const maxDelay = (grid.length + grid[0].length) * 50;
      setTimeout(() => {
        setShowCompletionModal(true);
      }, 3000 + maxDelay);
    }
  }, [answers, placements, isAnimating, showCompletionModal, grid.length, grid]);

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    const target = e.target as HTMLInputElement;
    const [rStr, cStr] = (target.dataset.pos || "0-0").split("-");
    const r = parseInt(rStr, 10);
    const c = parseInt(cStr, 10);

    // Helper: is single A-Z letter key
    const isLetter = e.key.length === 1 && /[a-zA-Z]/.test(e.key);

    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        setDirection("across");
        tryFocus(r, c + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        setDirection("across");
        tryFocus(r, c - 1);
        break;
      case "ArrowDown":
        e.preventDefault();
        setDirection("down");
        tryFocus(r + 1, c);
        break;
      case "ArrowUp":
        e.preventDefault();
        setDirection("down");
        tryFocus(r - 1, c);
        break;
      case "Backspace":
        if (!target.value) {
          e.preventDefault();
          movePrev(r, c);
        }
        break;
      default:
        if (isLetter) {
          // Always advance on letter entry, even if the cell already had a value
          e.preventDefault();
          const ch = e.key.toUpperCase();
          setAnswers((prev) => ({ ...prev, [keyFor(r, c)]: ch }));
          // Move after setting
          moveNext(r, c);
        }
        break;
    }
  };

  // Format timer display
  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Generate shareable text
  const generateShareText = React.useCallback(() => {
    // Create emoji grid
    const emojiGrid = grid.map((row, rowIndex) => 
      row.map((cell, colIndex) => {
        if (!cell) return '⬜';
        const cellKey = keyFor(rowIndex, colIndex);
        return hintRevealedCells.has(cellKey) ? '🟪' : '🟩';
      }).join('')
    ).join('\n');
    
    // Build share text
    const lines = [
      `Crossword ${puzzle.dateKey}`,
      `⏱️ ${formatTime(timerSeconds)}`,
      emojiGrid,
      '',
      
    ];
    
    return lines.join('\n');
  }, [grid, hintRevealedCells, puzzle.dateKey, timerSeconds, clueHintClicks, letterRevealClicks, formatTime]);
  
  // Copy to clipboard
  const handleShare = async () => {
    const text = generateShareText();
    setShareText(text);
    
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Map each placement to its proper crossword number based on grid position
  const numberedClues = React.useMemo(() => {
    return placements.map((placement) => {
      const k = keyFor(placement.row, placement.col);
      const number = cellNumbering[k];
      return {
        ...placement,
        number,
      };
    }).sort((a, b) => a.number - b.number);
  }, [placements, cellNumbering]);

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif' }}>
      {/* Timer Icon - Always visible */}
      <div 
        className="fixed top-4 right-4 z-40 select-none"
        onClick={() => countdown === 0 && setShowTimer(!showTimer)}
        style={{
          animation: timerJustStarted ? 'shake 0.6s ease-in-out' : undefined,
          cursor: countdown === 0 ? 'pointer' : 'default',
        }}
      >
          <div className="flex items-center gap-2 bg-white rounded-lg shadow-lg px-3 py-2 border border-slate-200 hover:border-slate-300 transition-colors">
            {countdown > 0 ? (
              <span className="text-sm font-semibold text-slate-700">
                Starting in {countdown}...
              </span>
            ) : (
              <>
                <svg 
                  width="20" 
                  height="20" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                  style={{
                    transform: timerJustStarted ? 'scale(1.2)' : 'scale(1)',
                    transition: 'transform 0.3s ease-out'
                  }}
                >
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                {showTimer && (
                  <span className="font-mono text-sm font-semibold text-slate-700">
                    {formatTime(timerSeconds)}
                  </span>
                )}
              </>
            )}
          </div>
      </div>
      
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px) rotate(-5deg); }
          20%, 40%, 60%, 80% { transform: translateX(4px) rotate(5deg); }
        }
      `}</style>
      
      <div className="flex flex-col gap-10 lg:flex-row lg:items-start">
      <section className="flex-1 space-y-6 order-1">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-black">Clues</h2>
            <p className="text-sm text-slate-600">Organized by direction. Coordinates are one-indexed.</p>
          </div>
          <button
            onClick={checkAnswers}
            className="px-4 py-2 rounded-md font-medium text-sm bg-slate-800 text-white hover:bg-slate-700 transition-colors"
          >
            Check
          </button>
        </div>

        {placements.length === 0 ? (
          <p className="rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">
            No crossword could be generated for this seed. Refresh to try again!
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Across */}
            <div>
              <h3 className="mb-2 text-lg font-semibold text-black">Across</h3>
              <ol className="space-y-3 text-black">
                {numberedClues
                  .filter((p) => p.direction === "across")
                  .map((clue) => {
                    const isFocused = focusedClue?.row === clue.row && focusedClue?.col === clue.col && focusedClue?.direction === clue.direction;
                    return (
                      <li
                        key={`A-${clue.number}-${clue.word}`}
                        className="rounded-lg border p-4 shadow-sm cursor-pointer transition-colors"
                        style={{
                          borderColor: isFocused ? COLORS.clueFocusedBorder : COLORS.clueDefaultBorder,
                          backgroundColor: isFocused ? COLORS.clueFocusedBg : COLORS.clueDefaultBg,
                          boxShadow: isFocused ? `0 0 0 2px ${COLORS.clueFocusedRing}` : undefined,
                        }}
                        onMouseEnter={(e) => {
                          if (!isFocused) {
                            e.currentTarget.style.borderColor = COLORS.clueHoverBorder;
                            e.currentTarget.style.backgroundColor = COLORS.clueHoverBg;
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isFocused) {
                            e.currentTarget.style.borderColor = COLORS.clueDefaultBorder;
                            e.currentTarget.style.backgroundColor = COLORS.clueDefaultBg;
                          }
                        }}
                        onClick={() => {
                          setDirection("across");
                          setFocusedClue({ row: clue.row, col: clue.col, direction: clue.direction });
                          const firstCellKey = keyFor(clue.row, clue.col);
                          cellRefs.current[firstCellKey]?.focus();
                        }}
                      >
                        <p 
                          className="text-sm text-slate-700 transition-all duration-500"
                          style={{
                            filter: countdown > 0 ? 'blur(5px)' : 'none',
                            userSelect: countdown > 0 ? 'none' : 'auto',
                          }}
                        >
                          <span className="font-bold text-black">{clue.number}.</span> {clue.clue}
                        </p>
                        <div className="mt-2 space-y-1">
                          {/* Clue hint button - commented out for now */}
                          {/* {clue.hint && !revealedHints.has(clue.number) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRevealedHints(prev => new Set([...prev, clue.number]));
                                setClueHintClicks(prev => prev + 1);
                              }}
                              className="text-xs px-2 py-1 rounded font-medium transition-colors"
                              style={{ backgroundColor: '#E6D4F5', color: '#7B6BA0' }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#DDD5EF'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#E6D4F5'}
                            >
                              Hint
                            </button>
                          )}
                          {clue.hint && revealedHints.has(clue.number) && (
                            <p className="text-xs text-slate-600 italic">💡 {clue.hint}</p>
                          )} */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              revealRandomLetter(clue.number);
                              setLetterRevealClicks(prev => prev + 1);
                            }}
                            className="text-xs px-2 py-1 rounded font-medium transition-colors"
                            style={{ backgroundColor: '#E6D4F5', color: '#7B6BA0' }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#DDD5EF'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#E6D4F5'}
                          >
                            Hint
                          </button>
                        </div>
                      </li>
                    );
                  })}
              </ol>
            </div>

            {/* Down */}
            <div>
              <h3 className="mb-2 text-lg font-semibold text-black">Down</h3>
              <ol className="space-y-3 text-black">
                {numberedClues
                  .filter((p) => p.direction === "down")
                  .map((clue) => {
                    const isFocused = focusedClue?.row === clue.row && focusedClue?.col === clue.col && focusedClue?.direction === clue.direction;
                    return (
                      <li
                        key={`D-${clue.number}-${clue.word}`}
                        className="rounded-lg border p-4 shadow-sm cursor-pointer transition-colors"
                        style={{
                          borderColor: isFocused ? COLORS.clueFocusedBorder : COLORS.clueDefaultBorder,
                          backgroundColor: isFocused ? COLORS.clueFocusedBg : COLORS.clueDefaultBg,
                          boxShadow: isFocused ? `0 0 0 2px ${COLORS.clueFocusedRing}` : undefined,
                        }}
                        onMouseEnter={(e) => {
                          if (!isFocused) {
                            e.currentTarget.style.borderColor = COLORS.clueHoverBorder;
                            e.currentTarget.style.backgroundColor = COLORS.clueHoverBg;
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isFocused) {
                            e.currentTarget.style.borderColor = COLORS.clueDefaultBorder;
                            e.currentTarget.style.backgroundColor = COLORS.clueDefaultBg;
                          }
                        }}
                        onClick={() => {
                          setDirection("down");
                          setFocusedClue({ row: clue.row, col: clue.col, direction: clue.direction });
                          const firstCellKey = keyFor(clue.row, clue.col);
                          cellRefs.current[firstCellKey]?.focus();
                        }}
                      >
                        <p 
                          className="text-sm text-slate-700 transition-all duration-500"
                          style={{
                            filter: countdown > 0 ? 'blur(5px)' : 'none',
                            userSelect: countdown > 0 ? 'none' : 'auto',
                          }}
                        >
                          <span className="font-bold text-black">{clue.number}.</span> {clue.clue}
                        </p>
                        <div className="mt-2 space-y-1">
                          {/* Clue hint button - commented out for now */}
                          {/* {clue.hint && !revealedHints.has(clue.number) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRevealedHints(prev => new Set([...prev, clue.number]));
                                setClueHintClicks(prev => prev + 1);
                              }}
                              className="text-xs px-2 py-1 rounded font-medium transition-colors"
                              style={{ backgroundColor: '#E6D4F5', color: '#7B6BA0' }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#DDD5EF'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#E6D4F5'}
                            >
                              Hint
                            </button>
                          )}
                          {clue.hint && revealedHints.has(clue.number) && (
                            <p className="text-xs text-slate-600 italic">💡 {clue.hint}</p>
                          )} */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              revealRandomLetter(clue.number);
                              setLetterRevealClicks(prev => prev + 1);
                            }}
                            className="text-xs px-2 py-1 rounded font-medium transition-colors"
                            style={{ backgroundColor: '#E6D4F5', color: '#7B6BA0' }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#DDD5EF'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#E6D4F5'}
                          >
                            Hint
                          </button>
                        </div>
                      </li>
                    );
                  })}
              </ol>
            </div>
          </div>
        )}
      </section>
      <section className="mx-auto lg:mx-0 flex-shrink-0 order-2">
        <div 
          className="grid bg-white" 
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(10, ${CELL_SIZE}px)`,
            gap: '4px',
            pointerEvents: countdown > 0 ? 'none' : 'auto',
          }}
        >
          {grid.map((row, rowIndex) =>
            row.map((cell, colIndex) => {
              const k = keyFor(rowIndex, colIndex);
              const active = Boolean(cell);
              
              if (!active) {
                return (
                  <div key={k} style={{ width: CELL_SIZE, height: CELL_SIZE }} aria-hidden />
                );
              }
              
              const r = rowIndex;
              const c = colIndex;
              
              return (
                <div key={k} className="relative" style={{ width: CELL_SIZE, height: CELL_SIZE, display: 'block', lineHeight: 0 }}>
                  {startNumbers[k] ? (
                    <span className="pointer-events-none absolute left-1 top-1 z-10 text-[9px] leading-none text-slate-600 font-medium">
                      {startNumbers[k]}
                    </span>
                  ) : null}
                  <input
                    type="text"
                    ref={(el) => {
                      cellRefs.current[k] = el;
                    }}
                    data-pos={`${rowIndex}-${colIndex}`}
                    aria-label={`Row ${rowIndex + 1}, Col ${colIndex + 1}`}
                    inputMode="text"
                    pattern="[A-Za-z]"
                    maxLength={1}
                    value={answers[k] ?? ""}
                    onChange={(e) => onInput(rowIndex, colIndex, e.target.value)}
                    onKeyDown={onKeyDown}
                    onClick={() => {
                      // Clear check mode when clicking any cell
                      if (incorrectCells.size > 0) {
                        setIncorrectCells(new Set());
                      }
                      
                      const startsAcross = isStart(r, c, "across");
                      const startsDown = isStart(r, c, "down");

                      let newDirection: "across" | "down" = direction;

                      if (startsAcross && startsDown) {
                        const acrossBlank = wordHasBlanksFrom(r, c, "across");
                        const downBlank = wordHasBlanksFrom(r, c, "down");
                        if (acrossBlank && !downBlank) newDirection = "across";
                        else if (!acrossBlank && downBlank) newDirection = "down";
                        else newDirection = "across";
                      } else if (startsAcross) {
                        newDirection = "across";
                      } else if (startsDown) {
                        newDirection = "down";
                      } else {
                        // Not a start cell: infer possible directions from neighbors
                        const hasAcross =
                          (c - 1 >= 0 && isActive[keyFor(r, c - 1)]) ||
                          (c + 1 < grid[0].length && isActive[keyFor(r, c + 1)]);
                        const hasDown =
                          (r - 1 >= 0 && isActive[keyFor(r - 1, c)]) ||
                          (r + 1 < grid.length && isActive[keyFor(r + 1, c)]);

                        if (hasAcross && !hasDown) {
                          newDirection = "across";
                        } else if (!hasAcross && hasDown) {
                          newDirection = "down";
                        }
                      }

                      setDirection(newDirection);

                      // Find the clue this cell belongs to
                      const clueForCell = placements.find(p => {
                        if (p.direction !== newDirection) return false;
                        if (newDirection === "across") {
                          return p.row === r && c >= p.col && c < p.col + p.word.length;
                        } else {
                          return p.col === c && r >= p.row && r < p.row + p.word.length;
                        }
                      });

                      if (clueForCell) {
                        setFocusedClue({ row: clueForCell.row, col: clueForCell.col, direction: clueForCell.direction });
                      }
                    }}
                    className="h-full w-full text-center font-medium uppercase text-black focus:outline-none"
                    style={{
                      boxSizing: 'border-box',
                      display: 'block',
                      border: `${BORDER_WIDTH}px solid black`,
                      borderRadius: '4px',
                      fontSize: `${FONT_SIZE}px`,
                      backgroundColor: hintRevealedCells.has(k) ? COLORS.cellHintRevealed : '#FFFFFF',
                    }}
                    onFocus={(e) => {
                      if (!isAnimating) {
                        e.target.style.backgroundColor = COLORS.cellFocused;
                      }
                    }}
                    onBlur={(e) => {
                      // Don't change colors during animation
                      if (isAnimating) return;
                      
                      // Always restore hint-revealed cells to lavender, regardless of focus state
                      if (hintRevealedCells.has(k)) {
                        e.target.style.backgroundColor = COLORS.cellHintRevealed;
                        return;
                      }
                      
                      // Check if still part of focused word after blur
                      const isCellPartOfWord = focusedClue && (() => {
                        if (focusedClue.direction === 'across') {
                          return focusedClue.row === rowIndex && 
                                 colIndex >= focusedClue.col && 
                                 colIndex < focusedClue.col + (placements.find(p => 
                                   p.row === focusedClue.row && 
                                   p.col === focusedClue.col && 
                                   p.direction === focusedClue.direction
                                 )?.word.length || 0);
                        } else {
                          return focusedClue.col === colIndex && 
                                 rowIndex >= focusedClue.row && 
                                 rowIndex < focusedClue.row + (placements.find(p => 
                                   p.row === focusedClue.row && 
                                   p.col === focusedClue.col && 
                                   p.direction === focusedClue.direction
                                 )?.word.length || 0);
                        }
                      })();
                      
                      if (isCellPartOfWord) {
                        e.target.style.backgroundColor = COLORS.cellWordHighlight;
                      } else {
                        e.target.style.backgroundColor = '#FFFFFF';
                      }
                    }}
                  />
                </div>
              );
            })
          )}
        </div>
      </section>
      </div>
      
      {/* Completion Modal */}
      {showCompletionModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowCompletionModal(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-xl mx-4 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-3xl font-bold mb-6" style={{ color: COLOR_SCHEMES.sage.badgeText }}>
              {completionMessage}
            </h2>
            
            {/* Timer display */}
            {timerSeconds > 0 && (
              <div className="mb-4 text-2xl font-mono font-bold text-slate-700">
                ⏱️ {formatTime(timerSeconds)}
              </div>
            )}
            
            {/* Mini emoji grid */}
            <div className="mb-6 inline-block">
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: `repeat(10, 1fr)`,
                gap: '2px',
                fontSize: '12px',
                lineHeight: '1'
              }}>
                {grid.map((row, rowIndex) =>
                  row.map((cell, colIndex) => {
                    const cellKey = keyFor(rowIndex, colIndex);
                    const isHintRevealed = hintRevealedCells.has(cellKey);
                    const isActive = Boolean(cell);
                    
                    if (!isActive) {
                      return <div key={cellKey} style={{ width: '16px', height: '16px' }} />;
                    }
                    
                    return (
                      <div 
                        key={cellKey}
                        style={{
                          width: '16px',
                          height: '16px',
                          backgroundColor: isHintRevealed ? '#E6D4F5' : '#D4E6D4',
                          border: '1px solid #999',
                          borderRadius: '2px',
                        }}
                      />
                    );
                  })
                )}
              </div>
              <div className="mt-2 flex items-center justify-center gap-4 text-xs text-slate-600">
                <div className="flex items-center gap-1">
                  <div style={{ width: '12px', height: '12px', backgroundColor: '#D4E6D4', border: '1px solid #999', borderRadius: '2px' }} />
                  <span>Solved</span>
                </div>
                <div className="flex items-center gap-1">
                  <div style={{ width: '12px', height: '12px', backgroundColor: '#E6D4F5', border: '1px solid #999', borderRadius: '2px' }} />
                  <span>Hint used</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mb-6">
              <button
                onClick={handleShare}
                className="flex-1 min-w-[120px] px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
                style={{ 
                  backgroundColor: copied ? COLOR_SCHEMES.sage.badgeText : COLOR_SCHEMES.sage.clueFocusedBorder,
                  color: 'white'
                }}
                onMouseEnter={(e) => {
                  if (!copied) e.currentTarget.style.backgroundColor = COLOR_SCHEMES.sage.badgeText;
                }}
                onMouseLeave={(e) => {
                  if (!copied) e.currentTarget.style.backgroundColor = COLOR_SCHEMES.sage.clueFocusedBorder;
                }}
              >
                {copied ? 'Copied!' : 'Share'}
              </button>
              <button
                onClick={() => setShowCompletionModal(false)}
                className="flex-1 min-w-[120px] px-6 py-3 rounded-lg font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Close
              </button>
            </div>

            {/* Creator info */}
            <div className="border-t border-slate-200 pt-6 text-center">
              <div className="text-sm leading-relaxed space-y-2">
                <p className="text-xs text-slate-600">
                  Made by Chris Doornink, a web developer out of Seattle, Washington.
                </p>
                <p className="text-sm font-medium" style={{ color: COLOR_SCHEMES.sage.badgeText }}>
                  I&apos;m looking for the perfect fit. Want to hire me?
                </p>
                <div className="space-y-1 text-sm">
                  <div>
                    <a 
                      href="https://chrisdoornink.com" 
                      target="_blank" 
                      rel="noreferrer"
                      className="underline transition-colors"
                      style={{ color: COLOR_SCHEMES.lavender.clueFocusedBorder }}
                      onMouseEnter={(e) => e.currentTarget.style.color = COLOR_SCHEMES.lavender.badgeText}
                      onMouseLeave={(e) => e.currentTarget.style.color = COLOR_SCHEMES.lavender.clueFocusedBorder}
                    >
                      Visit my website
                    </a>
                  </div>
                  <div>
                    <a 
                      href="https://www.linkedin.com/in/chrisdoornink/" 
                      target="_blank" 
                      rel="noreferrer"
                      className="underline transition-colors"
                      style={{ color: COLOR_SCHEMES.lavender.clueFocusedBorder }}
                      onMouseEnter={(e) => e.currentTarget.style.color = COLOR_SCHEMES.lavender.badgeText}
                      onMouseLeave={(e) => e.currentTarget.style.color = COLOR_SCHEMES.lavender.clueFocusedBorder}
                    >
                      Connect on LinkedIn
                    </a>
                  </div>
                  <div>
                    <a 
                      href="https://github.com/chrisdoornink/dungeon-tiler" 
                      target="_blank" 
                      rel="noreferrer"
                      className="underline transition-colors"
                      style={{ color: COLOR_SCHEMES.lavender.clueFocusedBorder }}
                      onMouseEnter={(e) => e.currentTarget.style.color = COLOR_SCHEMES.lavender.badgeText}
                      onMouseLeave={(e) => e.currentTarget.style.color = COLOR_SCHEMES.lavender.clueFocusedBorder}
                    >
                      View the GitHub repository
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
