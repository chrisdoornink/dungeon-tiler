"use client";

import React from "react";
import type { CrosswordPuzzle } from "@/lib/crossword/types";

type Props = {
  puzzle: CrosswordPuzzle;
};

function keyFor(row: number, col: number) {
  return `${row}-${col}`;
}

export default function CrosswordGrid({ puzzle }: Props) {
  // Design constants - adjust these to tweak the appearance
  const CELL_SIZE = 50; // pixels
  const BORDER_WIDTH = 3; // pixels
  const FONT_SIZE = 30; // pixels (text-lg is ~18px)
  
  const { grid, placements } = puzzle;
  const [direction, setDirection] = React.useState<"across" | "down">("across");

  // Track user-entered letters per active cell
  const [answers, setAnswers] = React.useState<Record<string, string>>({});

  // Build refs for focus management
  const cellRefs = React.useRef<Record<string, HTMLInputElement | null>>({});

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

  const onInput = (r: number, c: number, v: string) => {
    const value = (v || "").toUpperCase().slice(-1).replace(/[^A-Z]/g, "");
    setAnswers((prev) => ({ ...prev, [keyFor(r, c)]: value }));
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
    <div className="flex flex-col gap-10 lg:flex-row lg:items-start" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif' }}>
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
                      const startsAcross = isStart(r, c, "across");
                      const startsDown = isStart(r, c, "down");

                      if (startsAcross && startsDown) {
                        const acrossBlank = wordHasBlanksFrom(r, c, "across");
                        const downBlank = wordHasBlanksFrom(r, c, "down");
                        if (acrossBlank && !downBlank) setDirection("across");
                        else if (!acrossBlank && downBlank) setDirection("down");
                        else setDirection("across");
                        return;
                      }

                      if (startsAcross) {
                        setDirection("across");
                        return;
                      }
                      if (startsDown) {
                        setDirection("down");
                        return;
                      }
                      // Not a start cell: infer possible directions from neighbors
                      const hasAcross =
                        (c - 1 >= 0 && isActive[keyFor(r, c - 1)]) ||
                        (c + 1 < grid[0].length && isActive[keyFor(r, c + 1)]);
                      const hasDown =
                        (r - 1 >= 0 && isActive[keyFor(r - 1, c)]) ||
                        (r + 1 < grid.length && isActive[keyFor(r + 1, c)]);

                      if (hasAcross && !hasDown) {
                        setDirection("across");
                      } else if (!hasAcross && hasDown) {
                        setDirection("down");
                      }
                    }}
                    style={{
                      boxSizing: 'border-box',
                      display: 'block',
                      borderTop: hasTop ? `${BORDER_WIDTH}px solid black` : 'none',
                      borderLeft: hasLeft ? `${BORDER_WIDTH}px solid black` : 'none',
                      borderRight: 'none',
                      borderBottom: 'none',
                      fontSize: `${FONT_SIZE}px`
                    }}
                    className="h-full w-full text-center font-medium uppercase bg-white text-black focus:outline-none focus:bg-blue-100"
                  />
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="flex-1 space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-black">Clues</h2>
          <p className="text-sm text-slate-600">Organized by direction. Coordinates are one-indexed.</p>
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
                  .map((clue) => (
                    <li
                      key={`A-${clue.number}-${clue.word}`}
                      className="rounded-lg border border-slate-300 bg-slate-50 p-4 shadow-sm"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="flex items-baseline gap-3">
                          <span className="text-lg font-semibold text-black">{clue.number}.</span>
                          <span className="font-semibold text-blue-600">Across</span>
                        </div>
                        <span className="text-xs uppercase tracking-wide text-slate-500">
                          Row {clue.row + 1}, Col {clue.col + 1}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{clue.clue}</p>
                    </li>
                  ))}
              </ol>
            </div>

            {/* Down */}
            <div>
              <h3 className="mb-2 text-lg font-semibold text-black">Down</h3>
              <ol className="space-y-3 text-black">
                {numberedClues
                  .filter((p) => p.direction === "down")
                  .map((clue) => (
                    <li
                      key={`D-${clue.number}-${clue.word}`}
                      className="rounded-lg border border-slate-300 bg-slate-50 p-4 shadow-sm"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="flex items-baseline gap-3">
                          <span className="text-lg font-semibold text-black">{clue.number}.</span>
                          <span className="font-semibold text-blue-600">Down</span>
                        </div>
                        <span className="text-xs uppercase tracking-wide text-slate-500">
                          Row {clue.row + 1}, Col {clue.col + 1}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{clue.clue}</p>
                    </li>
                  ))}
              </ol>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
