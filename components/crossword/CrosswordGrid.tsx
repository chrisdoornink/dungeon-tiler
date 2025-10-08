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
    cellFocused: '#D4E7D4',           // Soft sage (darker)
    cellWordHighlight: '#F5FAF5',      // Very light sage
    clueFocusedBorder: '#7C9473',     // Muted sage green
    clueFocusedBg: '#F5FAF5',         
    clueFocusedRing: '#A8C5A0',       // Light sage
    clueHoverBorder: '#90A889',       
    clueHoverBg: '#F5FAF5',           
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
  
  const [colorScheme, setColorScheme] = React.useState<keyof typeof COLOR_SCHEMES>('sage');
  const COLORS = COLOR_SCHEMES[colorScheme];
  
  const { grid, placements } = puzzle;
  const [direction, setDirection] = React.useState<"across" | "down">("across");
  const [focusedClue, setFocusedClue] = React.useState<{ row: number; col: number; direction: "across" | "down" } | null>(null);

  // Track user-entered letters per active cell
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  
  // Track incorrect cells (for check feature)
  const [incorrectCells, setIncorrectCells] = React.useState<Set<string>>(new Set());

  // Build refs for focus management
  const cellRefs = React.useRef<Record<string, HTMLInputElement | null>>({});
  
  // Update cell backgrounds when focused clue changes
  React.useEffect(() => {
    // Only update if we're not in check mode
    if (incorrectCells.size > 0) return;
    
    // Reset all cells to white first
    Object.values(cellRefs.current).forEach(cell => {
      if (cell && cell !== document.activeElement) {
        cell.style.backgroundColor = '#FFFFFF';
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
      
      // Apply highlight to word cells
      wordCells.forEach(cell => {
        cell.style.backgroundColor = COLORS.cellWordHighlight;
      });
    }
  }, [focusedClue, COLORS.cellWordHighlight, placements, incorrectCells.size]);
  
  // Apply terracotta highlighting when check is triggered
  React.useEffect(() => {
    if (incorrectCells.size > 0) {
      incorrectCells.forEach(cellKey => {
        const cell = cellRefs.current[cellKey];
        if (cell) {
          cell.style.backgroundColor = COLOR_SCHEMES.terracotta.cellFocused;
        }
      });
    }
  }, [incorrectCells]);

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

  const onInput = (r: number, c: number, v: string) => {
    const value = (v || "").toUpperCase().slice(-1).replace(/[^A-Z]/g, "");
    const cellKey = keyFor(r, c);
    setAnswers((prev) => ({ ...prev, [cellKey]: value }));
    if (value) moveNext(r, c);
  };

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
      {/* Color Scheme Selector */}
      <div className="mb-6 flex items-center gap-3 bg-slate-100 p-4 rounded-lg">
        <label className="text-sm font-semibold text-slate-700">Color Scheme:</label>
        <div className="flex gap-2">
          {(Object.keys(COLOR_SCHEMES) as Array<keyof typeof COLOR_SCHEMES>).map((scheme) => (
            <button
              key={scheme}
              onClick={() => setColorScheme(scheme)}
              className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${
                colorScheme === scheme
                  ? 'bg-white shadow-md'
                  : 'bg-white/50 hover:bg-white hover:shadow'
              }`}
              style={{
                color: COLOR_SCHEMES[scheme].badgeText,
                outline: colorScheme === scheme ? `2px solid ${COLOR_SCHEMES[scheme].badgeText}` : undefined,
                outlineOffset: colorScheme === scheme ? '2px' : undefined,
              }}
            >
              {COLOR_SCHEMES[scheme].name}
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex flex-col gap-10 lg:flex-row lg:items-start">
      <section className="mx-auto lg:mx-0 flex-shrink-0">
        <div className="grid bg-white" style={{ gap: 0, lineHeight: 0, gridTemplateColumns: `repeat(10, ${CELL_SIZE}px)` }}>
          {grid.map((row, rowIndex) =>
            row.map((cell, colIndex) => {
              const k = keyFor(rowIndex, colIndex);
              const active = Boolean(cell);
              
              if (!active) {
                // Check if there's an active cell above - if so, we need a top border
                const hasActiveAbove = rowIndex > 0 && isActive[keyFor(rowIndex - 1, colIndex)];
                const hasActiveLeft = colIndex > 0 && isActive[keyFor(rowIndex, colIndex - 1)];
                const hasActiveRight = colIndex < grid[0].length - 1 && isActive[keyFor(rowIndex, colIndex + 1)];
                const hasActiveBelow = rowIndex < grid.length - 1 && isActive[keyFor(rowIndex + 1, colIndex)];
                
                return (
                  <div key={k} className="relative bg-white" style={{ width: CELL_SIZE, height: CELL_SIZE, zIndex: 1 }} aria-hidden>
                    {hasActiveAbove && (
                      <span 
                        className="pointer-events-none absolute bg-black" 
                        style={{ 
                          left: 0, 
                          right: hasActiveRight ? `-${BORDER_WIDTH}px` : 0, 
                          top: 0, 
                          height: `${BORDER_WIDTH}px`, 
                          zIndex: 2 
                        }}
                        aria-hidden 
                      />
                    )}
                    {hasActiveLeft && (
                      <span 
                        className="pointer-events-none absolute bg-black" 
                        style={{ 
                          top: 0, 
                          bottom: hasActiveBelow ? `-${BORDER_WIDTH}px` : 0, 
                          left: 0, 
                          width: `${BORDER_WIDTH}px`, 
                          zIndex: 2 
                        }}
                        aria-hidden 
                      />
                    )}
                  </div>
                );
              }
              
              const r = rowIndex;
              const c = colIndex;
              
              // Check for adjacent active cells
              const hasLeft = c > 0 && isActive[keyFor(r, c - 1)];
              const hasRight = c < grid[0].length - 1 && isActive[keyFor(r, c + 1)];
              const hasTop = r > 0 && isActive[keyFor(r - 1, c)];
              const hasBottom = r < grid.length - 1 && isActive[keyFor(r + 1, c)];
              
              // Determine if this cell is part of the currently focused word
              const isPartOfFocusedWord = focusedClue && (() => {
                if (focusedClue.direction === 'across') {
                  return focusedClue.row === r && 
                         c >= focusedClue.col && 
                         c < focusedClue.col + (placements.find(p => 
                           p.row === focusedClue.row && 
                           p.col === focusedClue.col && 
                           p.direction === focusedClue.direction
                         )?.word.length || 0);
                } else {
                  return focusedClue.col === c && 
                         r >= focusedClue.row && 
                         r < focusedClue.row + (placements.find(p => 
                           p.row === focusedClue.row && 
                           p.col === focusedClue.col && 
                           p.direction === focusedClue.direction
                         )?.word.length || 0);
                }
              })();
              
              return (
                <div key={k} className="relative" style={{ width: CELL_SIZE, height: CELL_SIZE, display: 'block', lineHeight: 0 }}>
                  {/* Draw borders where there's no active neighbor */}
                  {/* Don't draw bottom/right if inactive cell is there (it will draw top/left) */}
                  {!hasLeft && (
                    <span 
                      className="pointer-events-none absolute bg-black" 
                      style={{ top: 0, bottom: 0, left: 0, width: `${BORDER_WIDTH}px` }}
                      aria-hidden 
                    />
                  )}
                  {!hasTop && (
                    <span 
                      className="pointer-events-none absolute bg-black" 
                      style={{ left: 0, right: 0, top: 0, height: `${BORDER_WIDTH}px` }}
                      aria-hidden 
                    />
                  )}
                  {!hasRight && c === grid[0].length - 1 && (
                    <span 
                      className="pointer-events-none absolute bg-black" 
                      style={{ top: 0, bottom: 0, right: 0, width: `${BORDER_WIDTH}px` }}
                      aria-hidden 
                    />
                  )}
                  {!hasBottom && r === grid.length - 1 && (
                    <span 
                      className="pointer-events-none absolute bg-black" 
                      style={{ left: 0, right: 0, bottom: 0, height: `${BORDER_WIDTH}px` }}
                      aria-hidden 
                    />
                  )}
                  {startNumbers[k] ? (
                    <span className="pointer-events-none absolute left-1 top-1 z-10 text-[9px] leading-none text-slate-600 font-medium">
                      {startNumbers[k]}
                    </span>
                  ) : null}
                  <input
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
                      borderTop: hasTop ? `${BORDER_WIDTH}px solid black` : 'none',
                      borderLeft: hasLeft ? `${BORDER_WIDTH}px solid black` : 'none',
                      borderRight: 'none',
                      borderBottom: 'none',
                      fontSize: `${FONT_SIZE}px`,
                      backgroundColor: '#FFFFFF',
                    }}
                    onFocus={(e) => {
                      e.target.style.backgroundColor = COLORS.cellFocused;
                    }}
                    onBlur={(e) => {
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

      <section className="flex-1 space-y-6">
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
                        <div className="flex items-baseline justify-between gap-3">
                          <div className="flex items-baseline gap-3">
                            <span className="text-lg font-semibold text-black">{clue.number}.</span>
                            <span className="font-semibold" style={{ color: COLORS.badgeText }}>Across</span>
                          </div>
                          <span className="text-xs uppercase tracking-wide text-slate-500">
                            Row {clue.row + 1}, Col {clue.col + 1}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-700">{clue.clue}</p>
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
                        <div className="flex items-baseline justify-between gap-3">
                          <div className="flex items-baseline gap-3">
                            <span className="text-lg font-semibold text-black">{clue.number}.</span>
                            <span className="font-semibold" style={{ color: COLORS.badgeText }}>Down</span>
                          </div>
                          <span className="text-xs uppercase tracking-wide text-slate-500">
                            Row {clue.row + 1}, Col {clue.col + 1}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-700">{clue.clue}</p>
                      </li>
                    );
                  })}
              </ol>
            </div>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
