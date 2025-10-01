import { useState, useCallback } from "react";
import { Direction, TileSubtype, performThrowRock, performThrowRune } from "../../../lib/map";
import type { GameState } from "../../../lib/map";
import { trackUse } from "../../../lib/analytics";
import { CurrentGameStorage, type GameStorageSlot } from "../../../lib/current_game_storage";

interface ProjectileEffect {
  y: number;
  x: number;
  id: string;
}

interface BamEffect {
  y: number;
  x: number;
  src: string;
}

interface Spirit {
  id: string;
  y: number;
  x: number;
  createdAt: number;
}

interface FloatingDamage {
  id: string;
  y: number;
  x: number;
  amount: number;
  color: string;
  target: "hero" | "enemy";
  sign: "+" | "-";
  createdAt: number;
}

interface UseProjectileHandlersParams {
  playerPosition: [number, number] | null;
  resolvedStorageSlot: GameStorageSlot;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  triggerScreenShake: (duration?: number) => void;
}

export function useProjectileHandlers({
  playerPosition,
  resolvedStorageSlot,
  setGameState,
  triggerScreenShake,
}: UseProjectileHandlersParams) {
  const [rockEffect, setRockEffect] = useState<ProjectileEffect | null>(null);
  const [runeEffect, setRuneEffect] = useState<ProjectileEffect | null>(null);
  const [bamEffect, setBamEffect] = useState<BamEffect | null>(null);
  const [spirits, setSpirits] = useState<Spirit[]>([]);
  const [floating, setFloating] = useState<FloatingDamage[]>([]);

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

      const path: Array<[number, number]> = [];
      let ty = py,
        tx = px;
      let impact: { y: number; x: number } | null = null;
      for (let step = 1; step <= 4; step++) {
        ty += vy;
        tx += vx;
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
        if (prev.mapData.tiles[ty][tx] !== 0) {
          const last = path[path.length - 1];
          if (last) impact = { y: last[0], x: last[1] };
          break;
        }
        path.push([ty, tx]);
        const enemies = prev.enemies ?? [];
        const enemyAt = enemies.find((e) => e.y === ty && e.x === tx);
        if (enemyAt) {
          impact = { y: ty, x: tx };
          break;
        }
        const subs = prev.mapData.subtypes[ty][tx] || [];
        if (subs.includes(TileSubtype.POT)) {
          impact = { y: ty, x: tx };
          break;
        }
      }

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
        setTimeout(() => {
          setRuneEffect((cur) => (cur && cur.id === id ? null : cur));
        }, 1000);

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

        if (!impact && path.length === 4) {
          setTimeout(() => {
            setGameState((p2) => {
              const next = performThrowRune(p2);
              CurrentGameStorage.saveCurrentGame(next, resolvedStorageSlot);
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

      const next = performThrowRune(prev);
      CurrentGameStorage.saveCurrentGame(next, resolvedStorageSlot);
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
  }, [playerPosition, resolvedStorageSlot, setGameState, triggerScreenShake]);

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

      const path: Array<[number, number]> = [];
      let ty = py,
        tx = px;
      let impact: { y: number; x: number } | null = null;
      let preEnemyAtImpact: { y: number; x: number; health: number } | undefined;
      let preEnemyHealth = 0;
      for (let step = 1; step <= 4; step++) {
        ty += vy;
        tx += vx;
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
        if (prev.mapData.tiles[ty][tx] !== 0) {
          const last = path[path.length - 1];
          if (last) impact = { y: last[0], x: last[1] };
          break;
        }
        path.push([ty, tx]);
        const enemies = prev.enemies ?? [];
        const enemyAt = enemies.find((e) => e.y === ty && e.x === tx);
        if (enemyAt) {
          impact = { y: ty, x: tx };
          preEnemyAtImpact = {
            y: enemyAt.y,
            x: enemyAt.x,
            health: enemyAt.health,
          };
          preEnemyHealth = enemyAt.health;
          break;
        }
        const subs = prev.mapData.subtypes[ty][tx] || [];
        if (subs.includes(TileSubtype.POT)) {
          impact = { y: ty, x: tx };
          break;
        }
      }

      if (path.length > 0) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        let idx = 0;
        setRockEffect({ y: path[0][0], x: path[0][1], id });
        const stepMs = 50;
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
        setTimeout(() => {
          setRockEffect((cur) => (cur && cur.id === id ? null : cur));
        }, 1000);

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

        if (!impact && path.length === 4) {
          setTimeout(() => {
            setGameState((p2) => {
              const next = performThrowRock(p2);
              CurrentGameStorage.saveCurrentGame(next, resolvedStorageSlot);
              return next;
            });
          }, path.length * stepMs + 10);
          return prev;
        }
      }

      const next = performThrowRock(prev);
      CurrentGameStorage.saveCurrentGame(next, resolvedStorageSlot);
      if (preEnemyAtImpact) {
        const postEnemy = next.enemies?.find(
          (e) => e.y === preEnemyAtImpact?.y && e.x === preEnemyAtImpact?.x
        );
        const postHealth = postEnemy?.health ?? 0;
        const damage = Math.max(0, preEnemyHealth - postHealth);
        if (damage > 0) {
          const now = Date.now();
          const id = `${preEnemyAtImpact.y},${preEnemyAtImpact.x}-${now}-${Math.random()
            .toString(36)
            .slice(2, 7)}`;
          setFloating((prevF) => {
            const nextF = [
              ...prevF,
              {
                id,
                y: preEnemyAtImpact!.y,
                x: preEnemyAtImpact!.x,
                amount: damage,
                color: "red",
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
        }
      }
      return next;
    });
  }, [playerPosition, resolvedStorageSlot, setGameState, triggerScreenShake]);

  return {
    rockEffect,
    runeEffect,
    bamEffect,
    setBamEffect,
    spirits,
    setSpirits,
    floating,
    setFloating,
    handleThrowRune,
    handleThrowRock,
  };
}
