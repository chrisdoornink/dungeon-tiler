import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  TileType,
  GameState,
  Direction,
  movePlayer,
  TileSubtype,
} from "../lib/map";
import type { Enemy } from "../lib/enemy";
import { canSee, calculateDistance } from "../lib/line_of_sight";
import { Tile } from "./Tile";
import MobileControls from "./MobileControls";
import styles from "./TilemapGrid.module.css";

// Grid configuration constants
const GRID_WIDTH = 25;
const GRID_HEIGHT = 25;

interface TilemapGridProps {
  tilemap?: number[][];
  tileTypes: Record<number, TileType>;
  subtypes?: number[][][];
  initialGameState?: GameState;
}

export const TilemapGrid: React.FC<TilemapGridProps> = ({
  tilemap,
  tileTypes,
  subtypes,
  initialGameState,
}) => {
  const router = useRouter();

  // Initialize game state
  const [gameState, setGameState] = useState<GameState>(() => {
    if (initialGameState) {
      return initialGameState;
    } else if (tilemap) {
      // Create a new game state with the provided tilemap and subtypes
      return {
        hasKey: false,
        hasExitKey: false,
        mapData: {
          tiles: tilemap,
          subtypes:
            subtypes ||
            Array(GRID_HEIGHT)
              .fill(0)
              .map(() =>
                Array(GRID_WIDTH)
                  .fill(0)
                  .map(() => [])
              ),
        },
        showFullMap: false,
        win: false,
        playerDirection: Direction.DOWN, // Default to facing down/front
        heroHealth: 5,
        heroAttack: 1,
        stats: {
          damageDealt: 0,
          damageTaken: 0,
          enemiesDefeated: 0,
          steps: 0,
        },
      };
    } else {
      throw new Error("Either initialGameState or tilemap must be provided");
    }
  });

  // Find player position in the grid
  const [playerPosition, setPlayerPosition] = useState<[number, number] | null>(
    null
  );
  // Add state to track if player is currently moving
  const [isMoving, setIsMoving] = useState<boolean>(false);
  // Store the previous game state for smooth transitions
  const [prevGameState, setPrevGameState] = useState<GameState | null>(null);
  // Transient BAM effect state
  const [bamEffect, setBamEffect] = useState<null | {
    y: number;
    x: number;
    src: string;
  }>(null);
  // Transient Spirit effects (spawn on enemy death)
  const [spirits, setSpirits] = useState<
    Array<{ id: string; y: number; x: number; createdAt: number }>
  >([]);

  useEffect(() => {
    // Find player position whenever gameState changes
    if (gameState.mapData.subtypes) {
      // If we have a previous state and the player has moved
      if (prevGameState && !isMoving) {
        // Set moving flag to true
        setIsMoving(true);

        // Delay updating the player position to match the grid transition
        setTimeout(() => {
          // Find new player position
          for (let y = 0; y < gameState.mapData.subtypes.length; y++) {
            for (let x = 0; x < gameState.mapData.subtypes[y].length; x++) {
              if (
                gameState.mapData.subtypes[y][x].includes(TileSubtype.PLAYER)
              ) {
                setPlayerPosition([y, x]);
                // Reset moving flag
                setIsMoving(false);
                return;
              }
            }
          }
          setPlayerPosition(null);
          setIsMoving(false);
        }, 150); // Half of the CSS transition time for a smooth effect
      } else if (!prevGameState) {
        // Initial load - set position immediately
        for (let y = 0; y < gameState.mapData.subtypes.length; y++) {
          for (let x = 0; x < gameState.mapData.subtypes[y].length; x++) {
            if (gameState.mapData.subtypes[y][x].includes(TileSubtype.PLAYER)) {
              setPlayerPosition([y, x]);
              return;
            }
          }
        }
        setPlayerPosition(null);
      }

      // Update previous game state
      setPrevGameState(gameState);
    }
  }, [gameState, prevGameState, isMoving]);

  // Inventory is derived from gameState flags (hasKey, hasExitKey)

  // Auto-disable full map visibility after 3 seconds
  useEffect(() => {
    if (gameState.showFullMap) {
      // Auto-disable after 3 seconds
      const timer = setTimeout(() => {
        setGameState((prev) => ({ ...prev, showFullMap: false }));
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [gameState.showFullMap]);

  // Redirect to end page and persist game snapshot on win
  useEffect(() => {
    if (gameState.win) {
      try {
        // Compute streak: increment from previous lastGame.streak if available
        let nextStreak = 1;
        try {
          if (typeof window !== "undefined") {
            const prevRaw = window.sessionStorage.getItem("lastGame");
            if (prevRaw) {
              const prev = JSON.parse(prevRaw);
              const prevStreak = typeof prev?.streak === 'number' ? prev.streak : 0;
              nextStreak = prevStreak + 1;
            }
          }
        } catch {}
        const payload = {
          completedAt: new Date().toISOString(),
          hasKey: gameState.hasKey,
          hasExitKey: gameState.hasExitKey,
          hasSword: !!gameState.hasSword,
          hasShield: !!gameState.hasShield,
          showFullMap: !!gameState.showFullMap,
          mapData: gameState.mapData,
          stats: gameState.stats,
          outcome: "win" as const,
          streak: nextStreak,
        };
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem("lastGame", JSON.stringify(payload));
        }
      } catch {
        // no-op – storage may be unavailable in some environments
      }
      router.push("/end");
    }
  }, [
    gameState.win,
    gameState.hasKey,
    gameState.hasExitKey,
    gameState.hasSword,
    gameState.hasShield,
    gameState.showFullMap,
    gameState.mapData,
    gameState.stats,
    router,
  ]);

  // Redirect to end page and persist snapshot on death (heroHealth <= 0)
  useEffect(() => {
    if (gameState.heroHealth <= 0) {
      try {
        const payload = {
          completedAt: new Date().toISOString(),
          hasKey: gameState.hasKey,
          hasExitKey: gameState.hasExitKey,
          hasSword: !!gameState.hasSword,
          hasShield: !!gameState.hasShield,
          showFullMap: !!gameState.showFullMap,
          mapData: gameState.mapData,
          stats: gameState.stats,
          outcome: "dead",
          streak: 0,
        } as const;
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem("lastGame", JSON.stringify(payload));
        }
      } catch {
        // ignore storage errors
      }
      router.push("/end");
    }
  }, [
    gameState.heroHealth,
    gameState.hasKey,
    gameState.hasExitKey,
    gameState.hasSword,
    gameState.hasShield,
    gameState.showFullMap,
    gameState.mapData,
    gameState.stats,
    router,
  ]);

  // Handle player movement
  const handlePlayerMove = useCallback(
    (direction: Direction) => {
      // Detect potential combat: moving into an adjacent enemy tile
      if (playerPosition && gameState.enemies && gameState.enemies.length > 0) {
        const [py, px] = playerPosition;
        let ty = py;
        let tx = px;
        switch (direction) {
          case Direction.UP:
            ty = py - 1;
            break;
          case Direction.RIGHT:
            tx = px + 1;
            break;
          case Direction.DOWN:
            ty = py + 1;
            break;
          case Direction.LEFT:
            tx = px - 1;
            break;
        }
        const enemy = gameState.enemies.find((e) => e.y === ty && e.x === tx);
        if (enemy) {
          // Show BAM at midpoint between player and enemy
          const yMid = (py + enemy.y) / 2;
          const xMid = (px + enemy.x) / 2;
          const choices = [
            "/images/items/bam1.png",
            "/images/items/bam2.png",
            "/images/items/bam3.png",
          ];
          const src = choices[Math.floor(Math.random() * choices.length)];
          setBamEffect({ y: yMid, x: xMid, src });
          // Clear after ~600ms
          setTimeout(() => setBamEffect(null), 200);
        }
      }

      const newGameState = movePlayer(gameState, direction);
      // Spawn spirits only for actual deaths reported by the engine this tick
      const died = newGameState.recentDeaths || [];
      if (died.length > 0) {
        const now = Date.now();
        setSpirits((prev) => {
          const next = [...prev];
          for (const [y, x] of died) {
            const key = `${y},${x}`;
            const id = `${key}-${now}-${Math.random().toString(36).slice(2, 7)}`;
            next.push({ id, y, x, createdAt: now });
            // Auto-remove after animation completes (~1800ms + pad)
            setTimeout(() => {
              setSpirits((curr) => curr.filter((s) => s.id !== id));
            }, 2000);
          }
          return next;
        });
      }
      setGameState(newGameState);
    },
    [gameState, playerPosition]
  );

  // Handle mobile control button clicks
  const handleMobileMove = useCallback(
    (directionStr: string) => {
      switch (directionStr) {
        case "UP":
          handlePlayerMove(Direction.UP);
          break;
        case "RIGHT":
          handlePlayerMove(Direction.RIGHT);
          break;
        case "DOWN":
          handlePlayerMove(Direction.DOWN);
          break;
        case "LEFT":
          handlePlayerMove(Direction.LEFT);
          break;
      }
    },
    [handlePlayerMove]
  );

  // Add keyboard event listener
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      let direction: Direction | null = null;

      switch (event.key) {
        case "ArrowUp":
          direction = Direction.UP;
          break;
        case "ArrowRight":
          direction = Direction.RIGHT;
          break;
        case "ArrowDown":
          direction = Direction.DOWN;
          break;
        case "ArrowLeft":
          direction = Direction.LEFT;
          break;
      }

      if (direction !== null) {
        handlePlayerMove(direction);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [gameState, handlePlayerMove]);

  return (
    <div
      className="relative flex justify-center"
      data-testid="tilemap-grid-wrapper"
    >
      {/* HUD: Hero health and visible enemy healths (top-left) */}
      <div className="absolute top-2 left-2 z-10 p-2 bg-[#1B1B1B] rounded-md shadow-md text-white min-w-[120px]">
        <div className="text-xs font-medium mb-1">Status</div>
        <div className="text-sm">❤️ Health: {gameState.heroHealth}</div>
        {playerPosition &&
          gameState.enemies &&
          gameState.enemies.length > 0 &&
          (() => {
            const [py, px] = playerPosition;
            const visibleNearby = gameState.enemies
              .filter((e) =>
                canSee(gameState.mapData.tiles, [py, px], [e.y, e.x])
              )
              .map((e) => ({
                e,
                d: calculateDistance([py, px], [e.y, e.x], "manhattan"),
              }))
              .filter(({ d }) => d <= 8)
              .sort((a, b) => a.d - b.d);
            if (visibleNearby.length === 0) return null;
            return (
              <div className="mt-2">
                <div className="text-xs font-medium mb-1">Enemies in sight</div>
                <ul className="space-y-1">
                  {visibleNearby.map(({ e }, idx) => (
                    <li
                      key={`${e.y},${e.x},${idx}`}
                      className="text-sm flex items-center gap-2"
                    >
                      <span
                        className="inline-block"
                        style={{
                          width: 18,
                          height: 18,
                          backgroundImage:
                            "url(/images/enemies/fire-goblin/fire-goblin-front.png)",
                          backgroundSize: "contain",
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "center",
                        }}
                        aria-hidden="true"
                      />
                      <span>HP {e.health}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
      </div>
      {/* Fixed inventory at top right */}
      {(gameState.hasKey ||
        gameState.hasExitKey ||
        gameState.hasSword ||
        gameState.hasShield) && (
        <div
          className="absolute top-2 right-2 z-10 p-2 bg-[#1B1B1B] rounded-md shadow-md"
          style={{ maxWidth: "200px" }}
        >
          <h3 className="text-xs font-medium mb-1 text-white">Inventory:</h3>
          <div className="flex flex-wrap gap-1">
            {gameState.hasKey && (
              <div className="px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0">
                Key 🔑
              </div>
            )}
            {gameState.hasExitKey && (
              <div className="px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0">
                Exit Key 🗝️
              </div>
            )}
            {gameState.hasSword && (
              <div className="px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0">
                Sword 🗡️
              </div>
            )}
            {gameState.hasShield && (
              <div className="px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0">
                Shield 🛡️
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile controls */}
      <MobileControls onMove={handleMobileMove} />

      {/* Centered map container */}
      <div className="flex justify-center items-center h-[calc(100vh-100px)]">
        <div
          className={`${styles.viewportContainer} max-w-full overflow-auto`}
          data-testid="tilemap-grid-container"
          style={{
            gridTemplateColumns:
              process.env.NODE_ENV === "test" ? "repeat(25, 1fr)" : undefined,
          }}
        >
          <div
            className={styles.mapContainer}
            style={{
              transform: playerPosition
                ? `translate(${calculateMapTransform(playerPosition)})`
                : "none",
            }}
          >
            {bamEffect &&
              (() => {
                const tileSize = 40; // px
                // Use tile centers: add 0.5 to grid coords before converting to pixels
                const pxLeft = (bamEffect.x + 0.5) * tileSize;
                const pxTop = (bamEffect.y + 0.5) * tileSize;
                const size = 48; // effect image size in px
                return (
                  <div
                    data-testid="bam-effect"
                    data-bam-y={String(bamEffect.y)}
                    data-bam-x={String(bamEffect.x)}
                    aria-hidden="true"
                    className="absolute pointer-events-none"
                    style={{
                      left: `${pxLeft - size / 2}px`,
                      top: `${pxTop - size / 2}px`,
                      width: `${size}px`,
                      height: `${size}px`,
                      backgroundImage: `url(${bamEffect.src})`,
                      backgroundSize: "contain",
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "center",
                      zIndex: 12000,
                      animation: "popFade 300ms ease-out",
                    }}
                  />
                );
              })()}
            {spirits.length > 0 &&
              (() => {
                const tileSize = 40; // px
                return spirits.map((s) => {
                  const pxLeft = (s.x + 0.5) * tileSize;
                  const pxTop = (s.y + 0.5) * tileSize;
                  const size = 40; // spirit size
                  return (
                    <div
                      key={s.id}
                      aria-hidden="true"
                      className="absolute pointer-events-none spirit-rise-fade"
                      style={{
                        left: `${pxLeft - size / 2}px`,
                        top: `${pxTop - size / 2}px`,
                        width: `${size}px`,
                        height: `${size}px`,
                        zIndex: 11000,
                      }}
                    >
                      <div
                        className="w-full h-full spirit-flip"
                        style={{
                          backgroundImage: 'url(/images/items/spirit.png)',
                          backgroundSize: 'contain',
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'center',
                          width: '100%',
                          height: '100%',
                        }}
                      />
                    </div>
                  );
                });
              })()}
            <div
              className={styles.gridContainer}
              style={{
                gridTemplateRows: `repeat(${GRID_HEIGHT}, 40px)`,
                gridTemplateColumns: `repeat(${GRID_WIDTH}, 40px)`,
              }}
              tabIndex={0} // Make div focusable for keyboard events
            >
              {renderTileGrid(
                gameState.mapData.tiles,
                tileTypes,
                gameState.mapData.subtypes,
                gameState.showFullMap,
                gameState.playerDirection,
                gameState.enemies
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Calculate visibility based on player position
function calculateVisibility(
  grid: number[][],
  playerPosition: [number, number] | null,
  showFullMap: boolean = false
): number[][] {
  const gridHeight = grid.length;
  const gridWidth = grid[0].length;

  // If showFullMap is true or no player, everything is visible
  if (showFullMap || !playerPosition) {
    return Array(gridHeight)
      .fill(0)
      .map(() => Array(gridWidth).fill(3));
  }

  // Create a grid of false values (not visible)
  const visibility: number[][] = Array(gridHeight)
    .fill(0)
    .map(() => Array(gridWidth).fill(0));

  const [playerY, playerX] = playerPosition;

  // Full-visibility radius
  const fullRadius = 4;

  // Set visibility for all tiles in range
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      // Use Euclidean distance for circular FOV
      const dy = y - playerY;
      const dx = x - playerX;
      const d = Math.sqrt(dx * dx + dy * dy);

      // Tiered visibility:
      // 3: d <= 4 (full)
      // 2: 4 < d <= 5 (mid)
      // 1: 5 < d <= 6 (low)
      // 0: d > 6 (invisible)
      let tier = 0;
      if (d <= fullRadius) tier = 3;
      else if (d <= fullRadius + 1) tier = 2;
      else if (d <= fullRadius + 2) tier = 1;
      else tier = 0;

      visibility[y][x] = tier;
    }
  }

  return visibility;
}

// Render the grid of tiles
function renderTileGrid(
  grid: number[][],
  tileTypes: Record<number, TileType>,
  subtypes: number[][][] | undefined,
  showFullMap: boolean = false,
  playerDirection: Direction = Direction.DOWN,
  enemies?: Enemy[]
) {
  // Find player position in the grid
  let playerPosition: [number, number] | null = null;

  if (subtypes) {
    for (let y = 0; y < subtypes.length; y++) {
      for (let x = 0; x < subtypes[y].length; x++) {
        if (subtypes[y][x].includes(TileSubtype.PLAYER)) {
          playerPosition = [y, x];
          break;
        }
      }
      if (playerPosition) break;
    }
  }

  // Calculate visibility for each tile
  const visibility = calculateVisibility(grid, playerPosition, showFullMap);

  // Function to safely get a tile ID at specific coordinates
  const getTileAt = (row: number, col: number): number | null => {
    if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) {
      return null; // Out of bounds
    }
    return grid[row][col];
  };

  // Map enemies by position for sprite/facing lookup
  const enemyMap = new Map<string, Enemy>();
  if (enemies) {
    for (const e of enemies) enemyMap.set(`${e.y},${e.x}`, e);
  }

  const tiles = grid.flatMap((row, rowIndex) =>
    row.map((tileId, colIndex) => {
      const tileType = tileTypes[tileId];
      const subtype =
        subtypes && subtypes[rowIndex] ? subtypes[rowIndex][colIndex] : [];
      const tier = visibility[rowIndex][colIndex];
      const isVisible = tier > 0;

      // Get neighboring tiles
      const neighbors = {
        top: getTileAt(rowIndex - 1, colIndex),
        right: getTileAt(rowIndex, colIndex + 1),
        bottom: getTileAt(rowIndex + 1, colIndex),
        left: getTileAt(rowIndex, colIndex - 1),
      };

      // Check if this is the player tile to pass the playerDirection prop
      const isPlayerTile = subtype && subtype.includes(TileSubtype.PLAYER);

      const enemyAtTile = enemyMap.get(`${rowIndex},${colIndex}`);
      const hasEnemy = !!enemyAtTile;

      return (
        <div
          key={`${rowIndex}-${colIndex}`}
          className={`relative ${styles.tileWrapper}`}
        >
          <Tile
            tileId={tileId}
            tileType={tileType}
            subtype={subtype}
            row={rowIndex}
            col={colIndex}
            isVisible={isVisible}
            visibilityTier={tier}
            neighbors={neighbors}
            playerDirection={isPlayerTile ? playerDirection : undefined}
            hasEnemy={hasEnemy}
            enemyVisible={isVisible}
            enemyFacing={enemyAtTile?.facing}
          />
        </div>
      );
    })
  );

  // Add a smooth radial gradient overlay centered on the player for continuous fade
  if (playerPosition && !showFullMap) {
    const [py, px] = playerPosition; // grid coords
    const tileSize = 40; // px (w-10/h-10)
    const centerX = (px + 0.5) * tileSize;
    const centerY = (py + 0.5) * tileSize;
    // Stronger, darker fade pulled slightly inward
    const r0 = 3.8 * tileSize; // inner safe
    const r1 = 4.4 * tileSize; // begin fade
    const r2 = 5.0 * tileSize; // mid fade
    const r3 = 5.6 * tileSize; // stronger fade
    const r4 = 6.2 * tileSize; // near dark
    const r5 = 7.0 * tileSize; // full dark

    // Warm torch glow radii (expanded for more dramatic effect)
    const t0 = 2.5 * tileSize; // bright core (larger)
    const t1 = 3.8 * tileSize; // warm mid (expanded)
    const t2 = 5.2 * tileSize; // outer falloff (expanded)
    const t3 = 6.5 * tileSize; // outer glow
    const t4 = 7.5 * tileSize; // transparent edge (much larger)

    const torchGradient = `radial-gradient(circle at ${centerX}px ${centerY}px,
      var(--torch-core) ${t0}px,
      var(--torch-mid) ${t1}px,
      var(--torch-falloff) ${t2}px,
      var(--torch-outer) ${t3}px,
      rgba(0,0,0,0) ${t4}px
    )`;

    const gradient = `radial-gradient(circle at ${centerX}px ${centerY}px,
      rgba(26,26,26,0) ${r0}px,
      rgba(26,26,26,0.25) ${r1}px,
      rgba(26,26,26,0.50) ${r2}px,
      rgba(26,26,26,0.75) ${r3}px,
      rgba(26,26,26,0.90) ${r4}px,
      rgba(26,26,26,1) ${r5}px
    )`;

    // Push the warm torch glow first (lower z), then the dark vignette (higher z)
    tiles.push(
      <div
        key="torch-glow"
        className={`${styles.torchGlow}`}
        style={{ backgroundImage: torchGradient, zIndex: 9000 }}
      />
    );

    tiles.push(
      <div
        key="fov-radial-overlay"
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: gradient, zIndex: 10000 }}
      />
    );
  }

  return tiles;
}

// Function removed since we're now using GameState

// Calculate the transform to center the map on the player
function calculateMapTransform(playerPosition: [number, number]): string {
  if (!playerPosition) return "0px, 0px";

  const tileSize = 40; // px
  const viewportWidth = 600; // px (from CSS)
  const viewportHeight = 600; // px (from CSS)

  // Calculate the center position of the player in pixels
  const playerX = (playerPosition[1] + 0.5) * tileSize;
  const playerY = (playerPosition[0] + 0.5) * tileSize;

  // Calculate the transform to center the player in the viewport
  const translateX = viewportWidth / 2 - playerX;
  const translateY = viewportHeight / 2 - playerY;

  return `${translateX}px, ${translateY}px`;
}
