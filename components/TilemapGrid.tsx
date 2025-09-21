import React, { useState, useEffect, useCallback } from "react";
import {
  TileType,
  GameState,
  Direction,
  movePlayer,
  TileSubtype,
  performThrowRock,
  performThrowRune,
  performUseFood,
  performUsePotion,
} from "../lib/map";
import type { Enemy } from "../lib/enemy";
import { canSee, calculateDistance } from "../lib/line_of_sight";
import { Tile } from "./Tile";
import {
  getEnemyIcon,
  createEmptyByKind,
  EnemyRegistry,
} from "../lib/enemies/registry";
import MobileControls from "./MobileControls";
import styles from "./TilemapGrid.module.css";
import {
  computeTorchGlow,
  ADJACENT_GLOW,
  DIAGONAL_GLOW,
} from "../lib/torch_glow";
import { useRouter } from "next/navigation";
// Daily flow is handled by parent via onDailyComplete when isDailyChallenge is true
import { trackGameComplete, trackUse, trackPickup } from "../lib/analytics";
import { DateUtils } from "../lib/date_utils";
import { computeMapId } from "../lib/map";
import { CurrentGameStorage } from "../lib/current_game_storage";
import HealthDisplay from "./HealthDisplay";
import EnemyHealthDisplay from "./EnemyHealthDisplay";
import { ScreenShake } from "./ScreenShake";
import ItemPickupAnimation from "./ItemPickupAnimation";

// Grid dimensions will be derived from provided map data

interface TilemapGridProps {
  tilemap?: number[][];
  tileTypes: Record<number, TileType>;
  subtypes?: number[][][];
  initialGameState?: GameState;
  forceDaylight?: boolean; // when true, override lighting to full visibility
  isDailyChallenge?: boolean; // when true, handle daily challenge completion
  onDailyComplete?: (result: "won" | "lost") => void; // when daily, signal result instead of routing
}

export const TilemapGrid: React.FC<TilemapGridProps> = ({
  tilemap,
  tileTypes,
  subtypes,
  initialGameState,
  forceDaylight = process.env.NODE_ENV !== "test",
  isDailyChallenge = false,
  onDailyComplete,
}) => {
  const router = useRouter();

  // Router removed; daily flow handled via onDailyComplete callback

  // Initialize game state
  const [gameState, setGameState] = useState<GameState>(() => {
    if (initialGameState) {
      return initialGameState;
    } else if (tilemap) {
      // Create a new game state with the provided tilemap and subtypes
      const dynH = tilemap.length;
      const dynW = tilemap[0]?.length ?? 0;
      return {
        hasKey: false,
        hasExitKey: false,
        mapData: {
          tiles: tilemap,
          subtypes:
            subtypes ||
            Array(dynH)
              .fill(0)
              .map(() =>
                Array(dynW)
                  .fill(0)
                  .map(() => [] as number[])
              ),
        },
        showFullMap: false,
        win: false,
        playerDirection: Direction.DOWN, // Default to facing down/front
        heroHealth: 5,
        heroAttack: 1,
        rockCount: 0,
        heroTorchLit: true,
        stats: {
          damageDealt: 0,
          damageTaken: 0,
          enemiesDefeated: 0,
          steps: 0,
          byKind: createEmptyByKind(),
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

  // Track if game completion has already been processed to prevent duplicate saves
  const [gameCompletionProcessed, setGameCompletionProcessed] = useState(false);

  // Transient moving rock effect
  const [rockEffect, setRockEffect] = useState<null | {
    y: number;
    x: number;
    id: string;
  }>(null);
  // Transient moving rune effect
  const [runeEffect, setRuneEffect] = useState<null | {
    y: number;
    x: number;
    id: string;
  }>(null);

  // Screen shake state
  const [isShaking, setIsShaking] = useState(false);

  // Item pickup animation state
  const [itemPickupAnimations, setItemPickupAnimations] = useState<Array<{
    id: string;
    itemType: string;
  }>>([]);

  // Handle using food from inventory
  const handleUseFood = useCallback(() => {
    try {
      trackUse("food");
    } catch {}
    setGameState((prev) => {
      const newState = performUseFood(prev);
      CurrentGameStorage.saveCurrentGame(newState, isDailyChallenge);
      return newState;
    });
  }, [isDailyChallenge]);

  // Handle using potion from inventory
  const handleUsePotion = useCallback(() => {
    try {
      trackUse("potion");
    } catch {}
    setGameState((prev) => {
      const newState = performUsePotion(prev);
      CurrentGameStorage.saveCurrentGame(newState, isDailyChallenge);
      return newState;
    });
  }, [isDailyChallenge]);

  // Handle throwing a rune: animate like rock and resolve via performThrowRune
  const handleThrowRune = useCallback(() => {
    try {
      trackUse("rune");
    } catch {}
    setGameState((prev) => {
      const count = prev.runeCount ?? 0;
      if (count <= 0) return prev;
      const pos = playerPosition;
      if (!pos) return prev;
      const [py, px] = pos;
      // Determine direction vector
      let vx = 0,
        vy = 0;
      switch (prev.playerDirection) {
        case Direction.UP:
          vy = -1;
          break;
        case Direction.RIGHT:
          vx = 1;
          break;
        case Direction.DOWN:
          vy = 1;
          break;
        case Direction.LEFT:
          vx = -1;
          break;
      }

      // Compute animation path (up to 4 steps)
      const path: Array<[number, number]> = [];
      let ty = py,
        tx = px;
      let impact: { y: number; x: number } | null = null;
      for (let step = 1; step <= 4; step++) {
        ty += vy;
        tx += vx;
        // Out of bounds: stop before leaving grid
        if (
          ty < 0 ||
          ty >= prev.mapData.tiles.length ||
          tx < 0 ||
          tx >= prev.mapData.tiles[0].length
        ) {
          const last = path[path.length - 1];
          if (last) impact = { y: last[0], x: last[1] };
          break;
        }
        // If wall, stop before entering wall (rune will drop on the last traversed floor tile)
        if (prev.mapData.tiles[ty][tx] !== 0) {
          const last = path[path.length - 1];
          if (last) impact = { y: last[0], x: last[1] };
          break;
        }
        // Add floor step
        path.push([ty, tx]);
        // If enemy at tile, include and stop
        const enemies = prev.enemies ?? [];
        const enemyAt = enemies.find((e) => e.y === ty && e.x === tx);
        if (enemyAt) {
          impact = { y: ty, x: tx };
          break;
        }
        // If pot at tile, include and stop
        const subs = prev.mapData.subtypes[ty][tx] || [];
        if (subs.includes(TileSubtype.POT)) {
          impact = { y: ty, x: tx };
          break;
        }
      }

      // Run the animation
      if (path.length > 0) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        let idx = 0;
        setRuneEffect({ y: path[0][0], x: path[0][1], id });
        const stepMs = 50;
        const interval = setInterval(() => {
          idx += 1;
          if (idx >= path.length || !path[idx]) {
            clearInterval(interval);
            setRuneEffect((cur) => (cur && cur.id === id ? null : cur));
            return;
          }
          const [ny, nx] = path[idx];
          setRuneEffect((cur) =>
            cur && cur.id === id ? { ...cur, y: ny, x: nx } : cur
          );
        }, stepMs);
        // Safety: clear after 1s
        setTimeout(() => {
          setRuneEffect((cur) => (cur && cur.id === id ? null : cur));
        }, 1000);

        // Schedule BAM effect at impact position timed with animation arrival
        if (impact) {
          const bamDelay = Math.max(0, path.length) * stepMs + 10;
          setTimeout(() => {
            const bamIdx = 1 + Math.floor(Math.random() * 3);
            setBamEffect({
              y: impact.y,
              x: impact.x,
              src: `/images/items/bam${bamIdx}.png`,
            });
            setTimeout(() => setBamEffect(null), 300);
            triggerScreenShake();
          }, bamDelay);
        }

        // If clear path (no impact and path reached 4), delay applying game logic until animation completes
        if (!impact && path.length === 4) {
          setTimeout(() => {
            setGameState((p2) => {
              const next = performThrowRune(p2);
              CurrentGameStorage.saveCurrentGame(next, isDailyChallenge);
              try {
                const died = next.recentDeaths || [];
                if (died.length > 0) {
                  const now = Date.now();
                  setSpirits((prevS) => {
                    const out = [...prevS];
                    for (const [y, x] of died) {
                      const key = `${y},${x}`;
                      const sid = `${key}-${now}-${Math.random()
                        .toString(36)
                        .slice(2, 7)}`;
                      out.push({ id: sid, y, x, createdAt: now });
                      setTimeout(() => {
                        setSpirits((curr) => curr.filter((s) => s.id !== sid));
                      }, 2000);
                    }
                    return out;
                  });
                }
              } catch (err) {
                console.error("Rune kill spirit spawn error:", err);
              }
              return next;
            });
          }, path.length * stepMs + 10);
          return prev;
        }
      }

      // Apply game logic immediately for collisions or early stops
      const next = performThrowRune(prev);
      CurrentGameStorage.saveCurrentGame(next, isDailyChallenge);
      try {
        const died = next.recentDeaths || [];
        if (died.length > 0) {
          const now = Date.now();
          setSpirits((prevS) => {
            const out = [...prevS];
            for (const [y, x] of died) {
              const key = `${y},${x}`;
              const id = `${key}-${now}-${Math.random()
                .toString(36)
                .slice(2, 7)}`;
              out.push({ id, y, x, createdAt: now });
              setTimeout(() => {
                setSpirits((curr) => curr.filter((s) => s.id !== id));
              }, 2000);
            }
            return out;
          });
        }
      } catch (err) {
        console.error("Rune kill spirit spawn error:", err);
      }
      return next;
    });
  }, [playerPosition, isDailyChallenge]);

  // Handle throwing a rock: animate a rock moving up to 4 tiles, then update game state via performThrowRock
  const handleThrowRock = useCallback(() => {
    try {
      trackUse("rock");
    } catch {}
    setGameState((prev) => {
      const count = prev.rockCount ?? 0;
      if (count <= 0) return prev;
      const pos = playerPosition;
      if (!pos) return prev;
      const [py, px] = pos;
      // Determine direction vector
      let vx = 0,
        vy = 0;
      switch (prev.playerDirection) {
        case Direction.UP:
          vy = -1;
          break;
        case Direction.RIGHT:
          vx = 1;
          break;
        case Direction.DOWN:
          vy = 1;
          break;
        case Direction.LEFT:
          vx = -1;
          break;
      }

      // Compute animation path (up to 4 steps)
      const path: Array<[number, number]> = [];
      let ty = py,
        tx = px;
      let impact: { y: number; x: number } | null = null;
      // Track pre-hit enemy (if any) at the impact tile to compute floating damage later
      let preEnemyAtImpact: Enemy | undefined;
      let preEnemyHealth = 0;
      for (let step = 1; step <= 4; step++) {
        ty += vy;
        tx += vx;
        // Out of bounds: stop before leaving grid
        if (
          ty < 0 ||
          ty >= prev.mapData.tiles.length ||
          tx < 0 ||
          tx >= prev.mapData.tiles[0].length
        ) {
          // Treat OOB as impact just beyond map; set impact to last in-bounds tile if available
          const last = path[path.length - 1];
          if (last) impact = { y: last[0], x: last[1] };
          break;
        }
        // If wall, stop before entering wall
        if (prev.mapData.tiles[ty][tx] !== 0) {
          // Impact on the wall tile
          impact = { y: ty, x: tx };
          break;
        }
        path.push([ty, tx]);
        // If enemy at tile, include and stop
        const enemies = prev.enemies ?? [];
        const enemyAt = enemies.find((e) => e.y === ty && e.x === tx);
        const hitEnemy = !!enemyAt;
        if (hitEnemy) {
          impact = { y: ty, x: tx };
          preEnemyAtImpact = enemyAt;
          preEnemyHealth = enemyAt!.health;
          break;
        }
        // If pot at tile, include and stop (already included above)
        const subs = prev.mapData.subtypes[ty][tx] || [];
        if (subs.includes(TileSubtype.POT)) {
          impact = { y: ty, x: tx };
          break;
        }
      }

      // Run the animation
      if (path.length > 0) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        let idx = 0;
        setRockEffect({ y: path[0][0], x: path[0][1], id });
        const stepMs = 50; // faster animation per tile
        const interval = setInterval(() => {
          idx += 1;
          if (idx >= path.length || !path[idx]) {
            clearInterval(interval);
            setRockEffect((cur) => (cur && cur.id === id ? null : cur));
            return;
          }
          const [ny, nx] = path[idx];
          setRockEffect((cur) =>
            cur && cur.id === id ? { ...cur, y: ny, x: nx } : cur
          );
        }, stepMs);
        // Safety: clear after 1s
        setTimeout(() => {
          setRockEffect((cur) => (cur && cur.id === id ? null : cur));
        }, 1000);

        // Schedule BAM effect at impact position timed with animation arrival
        if (impact) {
          const bamDelay = Math.max(0, path.length) * stepMs + 10;
          setTimeout(() => {
            const bamIdx = 1 + Math.floor(Math.random() * 3);
            setBamEffect({
              y: impact.y,
              x: impact.x,
              src: `/images/items/bam${bamIdx}.png`,
            });
            setTimeout(() => setBamEffect(null), 300);
            triggerScreenShake();
          }, bamDelay);
        }

        // If clear path (no impact and path reached 4), delay applying game logic until animation completes
        if (!impact && path.length === 4) {
          setTimeout(() => {
            setGameState((p2) => {
              const next = performThrowRock(p2);
              CurrentGameStorage.saveCurrentGame(next, isDailyChallenge);
              return next;
            });
          }, path.length * stepMs + 10);
          // Return previous state for now so the rock doesn't appear early
          return prev;
        }
      }
      // If there was an immediate impact with no path advanced (e.g., wall adjacent), still show BAM
      else if (impact) {
        const bamIdx = 1 + Math.floor(Math.random() * 3);
        setBamEffect({
          y: impact.y,
          x: impact.x,
          src: `/images/items/bam${bamIdx}.png`,
        });
        setTimeout(() => setBamEffect(null), 300);
      }

      // Apply game logic (inventory, enemy/pot resolution, placement) immediately for collisions
      const next = performThrowRock(prev);
      CurrentGameStorage.saveCurrentGame(next, isDailyChallenge);
      try {
        // Spawn floating damage for enemy rock hits based on pre/post enemy health at impact
        if (preEnemyAtImpact && impact) {
          const postEnemy = (next.enemies || []).find(
            (e) => e.y === impact.y && e.x === impact.x
          );
          const preHP =
            typeof preEnemyHealth === "number" && !Number.isNaN(preEnemyHealth)
              ? preEnemyHealth
              : preEnemyAtImpact.health ?? 0;
          let dmg = 0;
          if (postEnemy) {
            const postHP = Math.max(0, postEnemy.health ?? 0);
            dmg = Math.max(0, preHP - postHP);
          } else {
            // Enemy died; damage equals its remaining health before the hit
            dmg = Math.max(0, preHP);
          }
          if (dmg > 0 && Number.isFinite(dmg)) {
            const spawn = () => {
              const now = Date.now();
              const id = `fd-enemy-${impact!.y},${
                impact!.x
              }-${now}-${Math.random().toString(36).slice(2, 7)}`;
              setFloating((prevF) => {
                const nextF = [
                  ...prevF,
                  {
                    id,
                    y: impact!.y,
                    x: impact!.x,
                    amount: dmg,
                    color: "red" as const,
                    target: "enemy" as const,
                    sign: "-" as const,
                    createdAt: now,
                  },
                ];
                setTimeout(() => {
                  setFloating((curr) => curr.filter((f) => f.id !== id));
                }, 1200);
                return nextF;
              });
            };
            if (process.env.NODE_ENV === "test") {
              spawn();
            } else {
              // Align roughly with BAM flash timing
              setTimeout(spawn, 100);
            }
          }
        }
      } catch (err) {
        // Prevent any exception here from freezing input handling
        console.error("Rock hit damage popup error:", err);
      }
      try {
        // Spawn spirits directly if rock kills occurred (no movement tick in this flow)
        const died = next.recentDeaths || [];
        if (died.length > 0) {
          const now = Date.now();
          setSpirits((prevS) => {
            const out = [...prevS];
            for (const [y, x] of died) {
              const key = `${y},${x}`;
              const id = `${key}-${now}-${Math.random()
                .toString(36)
                .slice(2, 7)}`;
              out.push({ id, y, x, createdAt: now });
              setTimeout(() => {
                setSpirits((curr) => curr.filter((s) => s.id !== id));
              }, 2000);
            }
            return out;
          });
        }
      } catch (err) {
        console.error("Rock kill spirit spawn error:", err);
      }
      return next;
    });
  }, [playerPosition]);
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
  // Transient floating damage numbers (hero/enemy hits)
  const [floating, setFloating] = useState<
    Array<{
      id: string;
      y: number;
      x: number;
      amount: number;
      color: "red" | "green";
      target: "enemy" | "hero";
      sign: "+" | "-";
      createdAt: number;
    }>
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
    if (forceDaylight) return; // do not auto-disable when daylight override is on
    if (gameState.showFullMap) {
      const timer = setTimeout(() => {
        setGameState((prev) => ({ ...prev, showFullMap: false }));
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [gameState.showFullMap, forceDaylight]);

  // Redirect to end page OR signal completion (daily) and persist game snapshot on win
  useEffect(() => {
    if (gameState.win && !gameCompletionProcessed) {
      setGameCompletionProcessed(true);
      try {
        const mode = isDailyChallenge ? "daily" : "normal";
        const mapId = computeMapId(gameState.mapData);
        trackGameComplete({
          outcome: "win",
          mode,
          mapId,
          dateSeed: isDailyChallenge ? DateUtils.getTodayString() : undefined,
          heroHealth: gameState.heroHealth,
          steps: gameState.stats.steps,
          enemiesDefeated: gameState.stats.enemiesDefeated,
          damageDealt: gameState.stats.damageDealt,
          damageTaken: gameState.stats.damageTaken,
          byKind: gameState.stats.byKind,
        });
      } catch {}
      if (isDailyChallenge) {
        // Handle daily challenge completion
        try {
          // Store game data for daily challenge too
          let nextStreak = 1;
          try {
            if (typeof window !== "undefined") {
              const prevRaw = window.localStorage.getItem("lastGame");
              if (prevRaw) {
                const prev = JSON.parse(prevRaw);
                const prevStreak =
                  typeof prev?.streak === "number" ? prev.streak : 0;
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
            heroHealth: gameState.heroHealth,
          };
          if (typeof window !== "undefined") {
            window.localStorage.setItem("lastGame", JSON.stringify(payload));
          }
        } catch {
          // no-op – storage may be unavailable in some environments
        }
        if (onDailyComplete) {
          onDailyComplete("won");
        } else {
          router.push("/daily");
        }
      } else {
        // Handle regular game completion
        try {
          // Compute streak: increment from previous lastGame.streak if available
          let nextStreak = 1;
          try {
            if (typeof window !== "undefined") {
              const prevRaw = window.localStorage.getItem("lastGame");
              if (prevRaw) {
                const prev = JSON.parse(prevRaw);
                const prevStreak =
                  typeof prev?.streak === "number" ? prev.streak : 0;
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
            heroHealth: gameState.heroHealth,
          };
          if (typeof window !== "undefined") {
            window.localStorage.setItem("lastGame", JSON.stringify(payload));
            // Clear current game since it's completed
            CurrentGameStorage.clearCurrentGame(isDailyChallenge);
          }
        } catch {
          // no-op – storage may be unavailable in some environments
        }
        router.push("/end");
      }
    }
  }, [
    gameState.win,
    gameCompletionProcessed,
    gameState.heroHealth,
    gameState.hasKey,
    gameState.hasExitKey,
    gameState.hasSword,
    gameState.hasShield,
    gameState.showFullMap,
    gameState.mapData,
    gameState.stats,
    isDailyChallenge,
    onDailyComplete,
    router,
  ]);

  // Track pickups by diffing inventory/flags
  useEffect(() => {
    // Initialize once
  }, []);

  const [prevInv, setPrevInv] = useState({
    key: false,
    exitKey: false,
    sword: false,
    shield: false,
    rocks: 0,
    runes: 0,
    food: 0,
  });

  // Helper function to trigger item pickup animation
  const triggerItemPickupAnimation = (itemType: string) => {
    const animationId = `${itemType}-${Date.now()}`;
    setItemPickupAnimations(prev => [...prev, {
      id: animationId,
      itemType
    }]);
  };

  // Handle item pickup animation completion
  const handleItemPickupComplete = (animationId: string) => {
    setItemPickupAnimations(prev => prev.filter(anim => anim.id !== animationId));
  };

  // Helper function to trigger screen shake
  const triggerScreenShake = (duration = 200) => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), duration);
  };

  useEffect(() => {
    try {
      if (!gameState) return;
      // Keys
      if (gameState.hasKey && !prevInv.key) {
        trackPickup("key");
        triggerItemPickupAnimation("key");
      }
      if (gameState.hasExitKey && !prevInv.exitKey) {
        trackPickup("exit_key");
        triggerItemPickupAnimation("exitKey");
      }
      // Equipment
      if (!!gameState.hasSword && !prevInv.sword) {
        trackPickup("sword");
        triggerItemPickupAnimation("sword");
      }
      if (!!gameState.hasShield && !prevInv.shield) {
        trackPickup("shield");
        triggerItemPickupAnimation("shield");
      }
      // Counters
      if ((gameState.rockCount ?? 0) > prevInv.rocks) {
        trackPickup("rock");
        triggerItemPickupAnimation("rock");
      }
      if ((gameState.runeCount ?? 0) > prevInv.runes) {
        trackPickup("rune");
        triggerItemPickupAnimation("rune");
      }
      if ((gameState.foodCount ?? 0) > prevInv.food) {
        trackPickup("food");
        triggerItemPickupAnimation("food");
      }
    } catch {}
    const nextInv = {
      key: gameState.hasKey,
      exitKey: gameState.hasExitKey,
      sword: !!gameState.hasSword,
      shield: !!gameState.hasShield,
      rocks: gameState.rockCount ?? 0,
      runes: gameState.runeCount ?? 0,
      food: gameState.foodCount ?? 0,
    };
    if (
      nextInv.key !== prevInv.key ||
      nextInv.exitKey !== prevInv.exitKey ||
      nextInv.sword !== prevInv.sword ||
      nextInv.shield !== prevInv.shield ||
      nextInv.rocks !== prevInv.rocks ||
      nextInv.runes !== prevInv.runes ||
      nextInv.food !== prevInv.food
    ) {
      setPrevInv(nextInv);
    }
  }, [gameState, prevInv]);

  // Redirect to end page OR signal completion (daily) and persist snapshot on death (heroHealth <= 0)
  useEffect(() => {
    if (gameState.heroHealth <= 0 && !gameCompletionProcessed) {
      setGameCompletionProcessed(true);
      // Trigger screen shake on death
      triggerScreenShake(400);
      try {
        const mode = isDailyChallenge ? "daily" : "normal";
        const mapId = computeMapId(gameState.mapData);
        trackGameComplete({
          outcome: "dead",
          mode,
          mapId,
          dateSeed: isDailyChallenge ? DateUtils.getTodayString() : undefined,
          heroHealth: 0,
          steps: gameState.stats.steps,
          enemiesDefeated: gameState.stats.enemiesDefeated,
          damageDealt: gameState.stats.damageDealt,
          damageTaken: gameState.stats.damageTaken,
          byKind: gameState.stats.byKind,
          deathCause: gameState.deathCause?.type,
        });
      } catch {}
      if (isDailyChallenge) {
        // Handle daily challenge death
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
            deathCause: gameState.deathCause,
            heroHealth: 0, // Always 0 for deaths
          } as const;
          if (typeof window !== "undefined") {
            window.localStorage.setItem("lastGame", JSON.stringify(payload));
            // Clear current game since it's completed
            CurrentGameStorage.clearCurrentGame(isDailyChallenge);
          }
        } catch {
          // ignore storage errors
        }
        if (onDailyComplete) {
          onDailyComplete("lost");
        } else {
          router.push("/daily");
        }
      } else {
        // Handle regular game death
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
            deathCause: gameState.deathCause,
            heroHealth: 0, // Always 0 for deaths
          } as const;
          if (typeof window !== "undefined") {
            window.localStorage.setItem("lastGame", JSON.stringify(payload));
            // Clear current game since it's completed
            CurrentGameStorage.clearCurrentGame(isDailyChallenge);
          }
        } catch {
          // ignore storage errors
        }
        router.push("/end");
      }
    }
  }, [
    gameState.heroHealth,
    gameCompletionProcessed,
    gameState.hasKey,
    gameState.hasExitKey,
    gameState.hasSword,
    gameState.hasShield,
    gameState.deathCause,
    gameState.showFullMap,
    gameState.mapData,
    gameState.stats,
    isDailyChallenge,
    onDailyComplete,
    router,
  ]);

  // Handle player movement
  const handlePlayerMove = useCallback(
    (direction: Direction) => {
      // Detect potential combat: moving into an adjacent enemy tile
      const prePlayerY = playerPosition ? playerPosition[0] : null;
      const prePlayerX = playerPosition ? playerPosition[1] : null;
      let targetY = prePlayerY;
      let targetX = prePlayerX;
      let preEnemyAtTarget: Enemy | undefined;
      let preEnemyHealth = 0;
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
        targetY = ty;
        targetX = tx;
        const enemy = gameState.enemies.find((e) => e.y === ty && e.x === tx);
        if (enemy) {
          preEnemyAtTarget = enemy;
          preEnemyHealth = enemy.health;
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
      CurrentGameStorage.saveCurrentGame(newGameState, isDailyChallenge);
      // Compute floating damage numbers based on differences
      // 1) Enemy damage taken when attacking into enemy tile
      if (
        preEnemyAtTarget &&
        typeof targetY === "number" &&
        typeof targetX === "number"
      ) {
        // Check enemy at same position after move
        const postEnemy = (newGameState.enemies || []).find(
          (e) => e.y === targetY && e.x === targetX
        );
        let dmg = 0;
        if (postEnemy) {
          dmg = Math.max(0, preEnemyHealth - postEnemy.health);
        } else {
          // Enemy died -> damage equals its remaining health before the hit
          dmg = preEnemyHealth;
        }
        if (dmg > 0) {
          const spawn = () => {
            const now = Date.now();
            const id = `fd-enemy-${targetY},${targetX}-${now}-${Math.random()
              .toString(36)
              .slice(2, 7)}`;
            setFloating((prev) => {
              const next = [
                ...prev,
                {
                  id,
                  y: targetY as number,
                  x: targetX as number,
                  amount: dmg,
                  color: "red" as const,
                  target: "enemy" as const,
                  sign: "-" as const,
                  createdAt: now,
                },
              ];
              // Auto-remove after ~1200ms
              setTimeout(() => {
                setFloating((curr) => curr.filter((f) => f.id !== id));
              }, 1200);
              return next;
            });
          };
          if (process.env.NODE_ENV === "test") {
            spawn();
          } else {
            setTimeout(spawn, 120); // wait for enemy movement to settle
          }
        }
      }
      // 2) Hero damage taken from enemies this tick
      if (typeof prePlayerY === "number" && typeof prePlayerX === "number") {
        const heroDmg = Math.max(
          0,
          gameState.heroHealth - newGameState.heroHealth
        );
        if (heroDmg > 0) {
          // Trigger screen shake when taking damage
          setIsShaking(true);
          setTimeout(() => setIsShaking(false), 300);
          
          const now = Date.now();
          const id = `fd-hero-${prePlayerY},${prePlayerX}-${now}-${Math.random()
            .toString(36)
            .slice(2, 7)}`;
          setFloating((prev) => {
            const next = [
              ...prev,
              {
                id,
                y: prePlayerY as number,
                x: prePlayerX as number,
                amount: heroDmg,
                color: "green" as const,
                target: "hero" as const,
                sign: "-" as const,
                createdAt: now,
              },
            ];
            setTimeout(() => {
              setFloating((curr) => curr.filter((f) => f.id !== id));
            }, 1200);
            return next;
          });
        }
      }
      // 3) Hero healing gained this tick (from food/medicine pickup)
      if (typeof prePlayerY === "number" && typeof prePlayerX === "number") {
        const heroHeal = Math.max(
          0,
          newGameState.heroHealth - gameState.heroHealth
        );
        if (heroHeal > 0) {
          const now = Date.now();
          const id = `fh-hero-${prePlayerY},${prePlayerX}-${now}-${Math.random()
            .toString(36)
            .slice(2, 7)}`;
          setFloating((prev) => {
            const next = [
              ...prev,
              {
                id,
                y: prePlayerY as number,
                x: prePlayerX as number,
                amount: heroHeal,
                color: "green" as const,
                target: "hero" as const,
                sign: "+" as const,
                createdAt: now,
              },
            ];
            setTimeout(() => {
              setFloating((curr) => curr.filter((f) => f.id !== id));
            }, 1200);
            return next;
          });
        }
      }
      // Spawn spirits only for actual deaths reported by the engine this tick
      const died = newGameState.recentDeaths || [];
      if (died.length > 0) {
        // Trigger screen shake when killing enemies
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 200);
        
        const now = Date.now();
        setSpirits((prev) => {
          const next = [...prev];
          for (const [y, x] of died) {
            const key = `${y},${x}`;
            const id = `${key}-${now}-${Math.random()
              .toString(36)
              .slice(2, 7)}`;
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
    [gameState, playerPosition, isDailyChallenge]
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
        case "r":
        case "R":
          // Throw a rock
          handleThrowRock();
          return; // do not also move
        case "t":
        case "T":
          // Use a rune
          handleThrowRune();
          return;
        case "f":
        case "F":
          // Use food
          handleUseFood();
          return;
        case "p":
        case "P":
          // Use potion
          handleUsePotion();
          return;
      }

      if (direction !== null) {
        handlePlayerMove(direction);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    gameState,
    handlePlayerMove,
    handleThrowRock,
    handleThrowRune,
    handleUseFood,
    handleUsePotion,
  ]);

  return (
    <div className="relative">
      <ScreenShake isShaking={isShaking} intensity={4} duration={300}>
        <div
          className="relative flex justify-center"
          data-testid="tilemap-grid-wrapper"
        >
        {/* Vertically center the entire game UI within the viewport */}
        <div className="w-full mt-12 flex items-center justify-center">
          <div className="game-scale" data-testid="game-scale">
            {/* Responsive HUD top bar: wraps on small screens. Each panel takes 1/2 width. */}
            <div
              className={`${styles.hudBar} absolute top-2 left-2 right-2 z-10 flex flex-wrap items-start gap-2`}
            >
            {/* Health + visible enemies - Left side */}
            <div
              className="p-2 bg-[#1B1B1B] rounded-md shadow-md text-white"
              style={{ flex: "1" }}
            >
              <div className="text-xs font-medium mb-1">Health</div>
              <HealthDisplay
                health={gameState.heroHealth}
                className="mb-2"
                isPoisoned={Boolean(gameState.conditions?.poisoned?.active)}
              />
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
                      <div className="text-xs font-medium mb-1">
                        Enemies in sight
                      </div>
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
                                backgroundImage: `url(${getEnemyIcon(
                                  e.kind,
                                  "front"
                                )})`,
                                backgroundSize: "contain",
                                backgroundRepeat: "no-repeat",
                                backgroundPosition: "center",
                              }}
                              aria-hidden="true"
                            />
                            <EnemyHealthDisplay
                              health={e.health}
                              maxHealth={EnemyRegistry[e.kind].base.health}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
            </div>
            {/* Inventory - Right side, grows with content */}
            <div
              className="p-2 bg-[#1B1B1B] rounded-md shadow-md text-white"
              style={{ flex: "1" }}
            >
              <h3 className="text-xs font-medium mb-1">Inventory</h3>
              <div className="flex flex-wrap gap-1">
                {gameState.hasKey && (
                  <div className="px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0 flex items-center gap-1">
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        width: 20,
                        height: 20,
                        backgroundImage: "url(/images/items/key.png)",
                        backgroundSize: "contain",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center",
                      }}
                    />
                    <span>Key</span>
                  </div>
                )}
                {gameState.hasExitKey && (
                  <div className="px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0 flex items-center gap-1">
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        width: 20,
                        height: 20,
                        backgroundImage: "url(/images/items/exit-key.png)",
                        backgroundSize: "contain",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center",
                      }}
                    />
                    <span>Exit Key</span>
                  </div>
                )}
                {gameState.hasSword && (
                  <div className="px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0 flex items-center gap-1">
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        width: 24,
                        height: 24,
                        backgroundImage: "url(/images/items/sword.png)",
                        backgroundSize: "contain",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center",
                      }}
                    />
                    <span>Sword</span>
                  </div>
                )}
                {gameState.hasShield && (
                  <div className="px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0 flex items-center gap-1">
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        width: 20,
                        height: 20,
                        backgroundImage: "url(/images/items/shield.png)",
                        backgroundSize: "contain",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center",
                      }}
                    />
                    <span>Shield</span>
                  </div>
                )}
                {(gameState.rockCount ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={handleThrowRock}
                    className="relative px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0 flex items-center gap-1"
                    title={`Throw rock (${gameState.rockCount}) — tap or press R`}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        width: 32,
                        height: 32,
                        backgroundImage: "url(/images/items/rock-1.png)",
                        backgroundSize: "contain",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center",
                      }}
                    />
                    <span>Rock x{gameState.rockCount}</span>
                    <span className="ml-1 text-[10px] text-gray-300/80 whitespace-nowrap hidden sm:inline">
                      (tap or R)
                    </span>
                  </button>
                )}
                {(gameState.runeCount ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={handleThrowRune}
                    className="px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0 flex items-center gap-1"
                    title={`Use rune (${gameState.runeCount}) — tap or press T`}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        width: 32,
                        height: 32,
                        backgroundImage: "url(/images/items/rune1.png)",
                        backgroundSize: "contain",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center",
                      }}
                    />
                    <span>Rune x{gameState.runeCount}</span>
                    <span className="ml-1 text-[10px] text-gray-300/80 whitespace-nowrap hidden sm:inline">
                      (tap or T)
                    </span>
                  </button>
                )}
                {(gameState.foodCount ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={handleUseFood}
                    className="px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0 flex items-center gap-1"
                    title={`Use food (${gameState.foodCount}) — tap or press F`}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        width: 32,
                        height: 32,
                        backgroundImage: "url(/images/items/food-1.png)",
                        backgroundSize: "contain",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center",
                      }}
                    />
                    <span>Food x{gameState.foodCount}</span>
                    <span className="ml-1 text-[10px] text-gray-300/80 whitespace-nowrap hidden sm:inline">
                      (tap or F)
                    </span>
                  </button>
                )}
                {(gameState.potionCount ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={handleUsePotion}
                    className="px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0 flex items-center gap-1"
                    title={`Use potion (${gameState.potionCount}) — tap or press P`}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        width: 32,
                        height: 32,
                        backgroundImage: "url(/images/items/meds-1.png)",
                        backgroundSize: "contain",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center",
                      }}
                    />
                    <span>Potion x{gameState.potionCount}</span>
                    <span className="ml-1 text-[10px] text-gray-300/80 whitespace-nowrap hidden sm:inline">
                      (tap or P)
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
          {/* Spacer matching HUD height: pushes grid down until viewport is short */}
          <div className="hud-spacer" aria-hidden="true" />

          {/* Centered map container */}
          <div className="flex justify-center items-center">
            <div
              className={`${styles.viewportContainer} max-w-full overflow-auto`}
              data-testid="tilemap-grid-container"
              style={{
                gridTemplateColumns:
                  process.env.NODE_ENV === "test"
                    ? "repeat(25, 1fr)"
                    : undefined,
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
                {rockEffect &&
                  (() => {
                    const tileSize = 40;
                    const pxLeft = (rockEffect.x + 0.5) * tileSize;
                    const pxTop = (rockEffect.y + 0.5) * tileSize;
                    const size = 28;
                    return (
                      <div
                        aria-hidden="true"
                        className="absolute pointer-events-none"
                        style={{
                          left: `${pxLeft - size / 2}px`,
                          top: `${pxTop - size / 2}px`,
                          width: `${size}px`,
                          height: `${size}px`,
                          zIndex: 11900,
                          backgroundImage: "url(/images/items/rock-1.png)",
                          backgroundSize: "contain",
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "center",
                          filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.5))",
                          transition: `left 50ms linear, top 50ms linear`,
                        }}
                      />
                    );
                  })()}
                {runeEffect &&
                  (() => {
                    const tileSize = 40;
                    const pxLeft = (runeEffect.x + 0.5) * tileSize;
                    const pxTop = (runeEffect.y + 0.5) * tileSize;
                    const size = 28;
                    return (
                      <div
                        aria-hidden="true"
                        className="absolute pointer-events-none"
                        style={{
                          left: `${pxLeft - size / 2}px`,
                          top: `${pxTop - size / 2}px`,
                          width: `${size}px`,
                          height: `${size}px`,
                          zIndex: 11900,
                          backgroundImage: "url(/images/items/rune1.png)",
                          backgroundSize: "contain",
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "center",
                          filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.5))",
                          transition: `left 50ms linear, top 50ms linear`,
                        }}
                      />
                    );
                  })()}
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
                {floating.length > 0 &&
                  (() => {
                    const tileSize = 40; // px
                    return floating.map((f) => {
                      const pxLeft = (f.x + 0.5) * tileSize;
                      const pxTop = (f.y + 0.5) * tileSize;
                      return (
                        <div
                          key={f.id}
                          data-testid="floating-damage"
                          data-target={f.target}
                          data-y={String(f.y)}
                          data-x={String(f.x)}
                          data-amount={String(f.amount)}
                          data-color={f.color}
                          aria-hidden="true"
                          className="absolute pointer-events-none"
                          style={{
                            left: `${pxLeft}px`,
                            top: `${pxTop}px`,
                            transform: "translate(-50%, -50%)",
                            zIndex: 11500,
                            color: f.color === "red" ? "#ff4242" : "#6afc7a",
                            fontWeight: 800,
                            textShadow: "0 1px 0 rgba(0,0,0,0.6)",
                            // Match spirit effect speed/distance: rise ~100px over ~1800ms
                            animation:
                              "spiritRiseFade 1800ms ease-out forwards",
                          }}
                        >
                          {f.sign}
                          {f.amount}
                        </div>
                      );
                    });
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
                              backgroundImage: "url(/images/items/spirit.png)",
                              backgroundSize: "contain",
                              backgroundRepeat: "no-repeat",
                              backgroundPosition: "center",
                              width: "100%",
                              height: "100%",
                            }}
                          />
                        </div>
                      );
                    });
                  })()}
                <div
                  className={styles.gridContainer}
                  style={{
                    gridTemplateRows: `repeat(${gameState.mapData.tiles.length}, 40px)`,
                    gridTemplateColumns: `repeat(${(gameState.mapData.tiles[0]?.length ?? 0)}, 40px)`,
                    // When the hero's torch is OFF, force a pure black background behind tiles
                    // to avoid any hue from module CSS (e.g., --forest-dark) bleeding through
                    // the transparent center of the vignette.
                    backgroundColor: gameState.heroTorchLit
                      ? undefined
                      : "#000",
                  }}
                  tabIndex={0} // Make div focusable for keyboard events
                >
                  {renderTileGrid(
                    gameState.mapData.tiles,
                    tileTypes,
                    gameState.mapData.subtypes,
                    gameState.showFullMap ||
                      (forceDaylight && (gameState.heroTorchLit ?? true)),
                    gameState.playerDirection,
                    gameState.enemies,
                    gameState.hasSword,
                    gameState.hasShield,
                    gameState.heroTorchLit ?? true,
                    gameState.hasExitKey,
                    Boolean(gameState.conditions?.poisoned?.active)
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Close centering wrapper */}
        </div>
      </div>
      
      {/* Item pickup animations */}
      {itemPickupAnimations.map((animation) => (
        <ItemPickupAnimation
          key={animation.id}
          isTriggered={true}
          itemType={animation.itemType}
          onAnimationComplete={() => handleItemPickupComplete(animation.id)}
        />
      ))}
      </ScreenShake>
      
      {/* Mobile controls - Outside ScreenShake to prevent displacement */}
      <MobileControls
        onMove={handleMobileMove}
        onThrowRock={handleThrowRock}
        rockCount={gameState.rockCount ?? 0}
        onUseRune={handleThrowRune}
        runeCount={gameState.runeCount ?? 0}
      />
    </div>
  );
};

// Calculate visibility based on player position
function calculateVisibility(
  grid: number[][],
  playerPosition: [number, number] | null,
  showFullMap: boolean = false,
  heroTorchLit: boolean = true
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
  // If hero torch is out, only reveal the hero's own tile; rely on wall torches for the rest
  if (!heroTorchLit) {
    // Center tile fully visible
    visibility[playerY][playerX] = 3;
    // Adjacent (orthogonal and diagonal) tiles dimly visible (tier 1)
    const neighbors: Array<[number, number]> = [
      // orthogonal
      [playerY - 1, playerX],
      [playerY + 1, playerX],
      [playerY, playerX - 1],
      [playerY, playerX + 1],
      // diagonals
      [playerY - 1, playerX - 1],
      [playerY - 1, playerX + 1],
      [playerY + 1, playerX - 1],
      [playerY + 1, playerX + 1],
    ];
    for (const [y, x] of neighbors) {
      if (y >= 0 && y < gridHeight && x >= 0 && x < gridWidth) {
        visibility[y][x] = Math.max(visibility[y][x], 1);
      }
    }
    return visibility;
  }

  // Full-visibility radius when torch is lit
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
  enemies?: Enemy[],
  hasSword?: boolean,
  hasShield?: boolean,
  heroTorchLit: boolean = true,
  hasExitKey?: boolean,
  heroPoisoned: boolean = false
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

  // Calculate visibility for each tile, honoring hero torch state
  const visibility = calculateVisibility(
    grid,
    playerPosition,
    showFullMap,
    heroTorchLit
  );

  // Precompute torch glow positions by scanning for WALL_TORCH subtypes
  const glowMap = new Map<string, number>();
  if (subtypes) {
    for (let y = 0; y < subtypes.length; y++) {
      for (let x = 0; x < subtypes[y].length; x++) {
        const st = subtypes[y][x];
        if (st && st.includes(TileSubtype.WALL_TORCH)) {
          const m = computeTorchGlow(y, x, grid);
          for (const [k, v] of m.entries()) {
            // If overlapping glows occur, keep the stronger one
            const prev = glowMap.get(k) ?? 0;
            glowMap.set(k, Math.max(prev, v));
          }
        }
      }
    }
  }

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

  // Poison status passed in by caller

  const tiles = grid.flatMap((row, rowIndex) =>
    row.map((tileId, colIndex) => {
      const tileType = tileTypes[tileId];
      const subtype =
        subtypes && subtypes[rowIndex] ? subtypes[rowIndex][colIndex] : [];
      let tier = visibility[rowIndex][colIndex];
      // Torch-driven illumination: use smaller radius similar to FOV tiers
      const glowKey = `${rowIndex},${colIndex}`;
      const g = glowMap.get(glowKey);
      const isSelfTorch =
        Array.isArray(subtype) && subtype.includes(TileSubtype.WALL_TORCH);
      // Torch tile itself should always be at least tier 3 (fully visible)
      if (isSelfTorch) tier = Math.max(tier, 3);
      // Neighbor illumination based on glow strength
      if (g === ADJACENT_GLOW) {
        tier = Math.max(tier, 2);
      } else if (g === DIAGONAL_GLOW) {
        tier = Math.max(tier, 1);
      }
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
          style={(() => {
            // Raise z-index so lit tiles appear above the dark vignette overlay
            if (g != null || isSelfTorch) {
              return { zIndex: 10050 as number };
            }
            return undefined;
          })()}
          data-row={rowIndex}
          data-col={colIndex}
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
            heroTorchLit={heroTorchLit}
            heroPoisoned={isPlayerTile ? heroPoisoned : false}
            hasEnemy={hasEnemy}
            enemyVisible={isVisible}
            enemyFacing={enemyAtTile?.facing}
            enemyKind={
              enemyAtTile?.kind as
                | "goblin"
                | "ghost"
                | "stone-exciter"
                | "snake"
                | undefined
            }
            enemyMoved={Boolean(
              (enemyAtTile?.behaviorMemory as Record<string, unknown> | undefined)?.[
                "moved"
              ]
            )}
            enemyAura={(() => {
              if (!enemyAtTile) return false;
              if (enemyAtTile.kind !== "stone-exciter") return false;
              if (!playerPosition) return false;
              const d =
                Math.abs(enemyAtTile.y - playerPosition[0]) +
                Math.abs(enemyAtTile.x - playerPosition[1]);
              return d <= 2;
            })()}
            hasSword={hasSword}
            hasShield={hasShield}
            invisibleClassName={
              process.env.NODE_ENV === "test"
                ? "bg-gray-900"
                : !heroTorchLit
                ? "bg-black"
                : undefined
            }
            playerHasExitKey={hasExitKey}
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

    // When the hero's torch is OFF, use a pure black vignette to avoid gray tint.
    // Otherwise, keep the dark gray for a softer ambiance.
    const gradient = heroTorchLit
      ? `radial-gradient(circle at ${centerX}px ${centerY}px,
      rgba(26,26,26,0) ${r0}px,
      rgba(26,26,26,0.25) ${r1}px,
      rgba(26,26,26,0.50) ${r2}px,
      rgba(26,26,26,0.75) ${r3}px,
      rgba(26,26,26,0.90) ${r4}px,
      rgba(26,26,26,1) ${r5}px
    )`
      : `radial-gradient(circle at ${centerX}px ${centerY}px,
      rgba(0,0,0,0) ${r0}px,
      rgba(0,0,0,0.25) ${r1}px,
      rgba(0,0,0,0.50) ${r2}px,
      rgba(0,0,0,0.75) ${r3}px,
      rgba(0,0,0,0.90) ${r4}px,
      rgba(0,0,0,1) ${r5}px
    )`;

    // Push the warm torch glow first (lower z) ONLY if the hero's torch is lit,
    // then the dark vignette (higher z) ONLY when torch is lit as well.
    if (heroTorchLit) {
      tiles.push(
        <div
          key="torch-glow"
          className={`${styles.torchGlow}`}
          style={{ backgroundImage: torchGradient, zIndex: 9000 }}
        />
      );
    }
    if (heroTorchLit) {
      tiles.push(
        <div
          key="fov-radial-overlay"
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: gradient, zIndex: 10000 }}
        />
      );
    }
    // Add a subtle green vignette when poisoned to suggest corrupted vision
    if (heroPoisoned) {
      tiles.push(
        <div
          key="poison-vignette"
          className="poison-vignette"
          style={{ zIndex: 10020 }}
        />
      );
    }
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
