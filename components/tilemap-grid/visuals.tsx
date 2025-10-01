import React from "react";
import {
  TileSubtype,
  type TileType,
  type TimeOfDayState,
  Direction,
  createInitialTimeOfDay,
  DAY_PHASE_CONFIG,
} from "../../lib/map";
import type { EnvironmentId } from "../../lib/environment";
import { DEFAULT_ENVIRONMENT } from "../../lib/environment";
import type { Enemy } from "../../lib/enemy";
import type { NPC } from "../../lib/npc";
import { computeTorchGlow, ADJACENT_GLOW, DIAGONAL_GLOW } from "../../lib/torch_glow";
import { Tile } from "../Tile";
import styles from "../TilemapGrid.module.css";
import { type EnemyKind } from "../../lib/enemies/registry";
import { TORCH_CARRIER_ENEMIES } from "./constants";

export function calculateVisibility(
  grid: number[][],
  playerPosition: [number, number] | null,
  showFullMap: boolean = false,
  heroTorchLit: boolean = true
): number[][] {
  const gridHeight = grid.length;
  const gridWidth = grid[0].length;

  if (showFullMap || !playerPosition) {
    return Array(gridHeight)
      .fill(0)
      .map(() => Array(gridWidth).fill(3));
  }

  const visibility: number[][] = Array(gridHeight)
    .fill(0)
    .map(() => Array(gridWidth).fill(0));

  const [playerY, playerX] = playerPosition;
  if (!heroTorchLit) {
    visibility[playerY][playerX] = 3;
    const neighbors: Array<[number, number]> = [
      [playerY - 1, playerX],
      [playerY + 1, playerX],
      [playerY, playerX - 1],
      [playerY, playerX + 1],
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

  const fullRadius = 4;

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const dy = y - playerY;
      const dx = x - playerX;
      const d = Math.sqrt(dx * dx + dy * dy);

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

export function renderTileGrid(
  grid: number[][],
  tileTypes: Record<number, TileType>,
  subtypes: number[][][] | undefined,
  environment: EnvironmentId | undefined,
  showFullMap: boolean = false,
  playerDirection: Direction = Direction.DOWN,
  enemies?: Enemy[],
  npcs?: NPC[],
  hasSword?: boolean,
  hasShield?: boolean,
  heroTorchLit: boolean = true,
  suppressDarknessOverlay: boolean = false,
  hasExitKey?: boolean,
  heroPoisoned: boolean = false,
  timeOfDay?: TimeOfDayState,
  activeCheckpoint?: [number, number] | null
) {
  const resolvedEnvironment = environment ?? DEFAULT_ENVIRONMENT;
  const resolvedTimeOfDay = timeOfDay ?? createInitialTimeOfDay();
  const timeOfDayVisual = DAY_PHASE_CONFIG[resolvedTimeOfDay.phase];

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

  const heroTorchLitForVisibility = suppressDarknessOverlay ? true : heroTorchLit;

  const visibility = calculateVisibility(
    grid,
    playerPosition,
    showFullMap,
    heroTorchLitForVisibility
  );

  const glowMap = new Map<string, number>();
  const torchCarrierPositions = new Set<string>();
  if (!suppressDarknessOverlay) {
    if (subtypes) {
      for (let y = 0; y < subtypes.length; y++) {
        for (let x = 0; x < subtypes[y].length; x++) {
          const st = subtypes[y][x];
          if (st && st.includes(TileSubtype.WALL_TORCH)) {
            const m = computeTorchGlow(y, x, grid);
            for (const [k, v] of m.entries()) {
              const prev = glowMap.get(k) ?? 0;
              glowMap.set(k, Math.max(prev, v));
            }
          }
        }
      }
    }

    if (enemies) {
      for (const enemy of enemies) {
        if (!TORCH_CARRIER_ENEMIES.has(enemy.kind as EnemyKind)) continue;
        torchCarrierPositions.add(`${enemy.y},${enemy.x}`);
        const m = computeTorchGlow(enemy.y, enemy.x, grid);
        for (const [k, v] of m.entries()) {
          const prev = glowMap.get(k) ?? 0;
          glowMap.set(k, Math.max(prev, v));
        }
      }
    }
  }

  const getTileAt = (row: number, col: number): number | null => {
    if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) {
      return null;
    }
    return grid[row][col];
  };

  const enemyMap = new Map<string, Enemy>();
  if (enemies) {
    for (const e of enemies) enemyMap.set(`${e.y},${e.x}`, e);
  }

  const npcMap = new Map<string, NPC>();
  if (npcs) {
    for (const npc of npcs) {
      npcMap.set(`${npc.y},${npc.x}`, npc);
    }
  }

  const tiles = grid.flatMap((row, rowIndex) =>
    row.map((tileId, colIndex) => {
      const tileType = tileTypes[tileId];
      const subtype =
        subtypes && subtypes[rowIndex] ? subtypes[rowIndex][colIndex] : [];
      let tier = visibility[rowIndex][colIndex];
      const glowKey = `${rowIndex},${colIndex}`;
      const g = glowMap.get(glowKey);
      const isSelfTorch =
        Array.isArray(subtype) && subtype.includes(TileSubtype.WALL_TORCH);
      const isTorchCarrier = torchCarrierPositions.has(`${rowIndex},${colIndex}`);
      if (isSelfTorch || isTorchCarrier) tier = Math.max(tier, 3);
      if (g === ADJACENT_GLOW) {
        tier = Math.max(tier, 2);
      } else if (g === DIAGONAL_GLOW) {
        tier = Math.max(tier, 1);
      }
      const isVisible = tier > 0;

      const neighbors = {
        top: getTileAt(rowIndex - 1, colIndex),
        right: getTileAt(rowIndex, colIndex + 1),
        bottom: getTileAt(rowIndex + 1, colIndex),
        left: getTileAt(rowIndex, colIndex - 1),
      };

      const isPlayerTile = subtype && subtype.includes(TileSubtype.PLAYER);

      const enemyAtTile = enemyMap.get(`${rowIndex},${colIndex}`);
      const hasEnemy = !!enemyAtTile;
      const npcAtTile = npcMap.get(`${rowIndex},${colIndex}`);
      const npcInteractable = (() => {
        if (!npcAtTile || !playerPosition) return false;
        if (npcAtTile.isDead()) return false;
        const [py, px] = playerPosition;
        return Math.abs(npcAtTile.y - py) + Math.abs(npcAtTile.x - px) === 1;
      })();

      return (
        <div
          key={`${rowIndex}-${colIndex}`}
          className={`relative ${styles.tileWrapper}`}
          style={(() => {
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
              (enemyAtTile?.behaviorMemory as Record<string, unknown> | undefined)?.["moved"]
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
            npc={npcAtTile}
            npcVisible={npcAtTile ? isVisible : undefined}
            npcInteractable={npcInteractable}
            hasSword={hasSword}
            hasShield={hasShield}
            invisibleClassName={
              process.env.NODE_ENV === "test"
                ? "bg-gray-900"
                : !heroTorchLitForVisibility
                ? "bg-black"
                : undefined
            }
            playerHasExitKey={hasExitKey}
            environment={resolvedEnvironment}
            suppressDarknessOverlay={suppressDarknessOverlay}
            activeCheckpoint={activeCheckpoint}
          />
        </div>
      );
    })
  );

  if (playerPosition && !showFullMap) {
    const [py, px] = playerPosition;
    const tileSize = 40;
    const centerX = (px + 0.5) * tileSize;
    const centerY = (py + 0.5) * tileSize;
    const r0 = 3.8 * tileSize;
    const r1 = 4.4 * tileSize;
    const r2 = 5.0 * tileSize;
    const r3 = 5.6 * tileSize;
    const r4 = 6.2 * tileSize;
    const r5 = 7.0 * tileSize;

    const t0 = 2.5 * tileSize;
    const t1 = 3.8 * tileSize;
    const t2 = 5.2 * tileSize;
    const t3 = 6.5 * tileSize;
    const t4 = 7.5 * tileSize;

    const torchGradient = `radial-gradient(circle at ${centerX}px ${centerY}px,
      var(--torch-core) ${t0}px,
      var(--torch-mid) ${t1}px,
      var(--torch-falloff) ${t2}px,
      var(--torch-outer) ${t3}px,
      rgba(0,0,0,0) ${t4}px
    )`;

    const gradient = heroTorchLitForVisibility
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

    if (!suppressDarknessOverlay && heroTorchLitForVisibility) {
      tiles.push(
        <div
          key="torch-glow"
          className={`${styles.torchGlow}`}
          style={{ backgroundImage: torchGradient, zIndex: 9000 }}
        />
      );
    }
    if (!suppressDarknessOverlay && heroTorchLitForVisibility) {
      tiles.push(
        <div
          key="fov-radial-overlay"
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: gradient, zIndex: 10000 }}
        />
      );
    }
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

  if (timeOfDayVisual?.overlay) {
    const overlayStyle: React.CSSProperties = {
      background: timeOfDayVisual.overlay.color,
      opacity: timeOfDayVisual.overlay.opacity,
      zIndex: 8800,
    };
    if (timeOfDayVisual.overlay.blendMode) {
      overlayStyle.mixBlendMode = timeOfDayVisual.overlay.blendMode;
    }
    tiles.push(
      <div
        key="time-of-day-overlay"
        className="pointer-events-none absolute inset-0"
        style={overlayStyle}
      />
    );
  }

  return tiles;
}



export function calculateMapTransform(playerPosition: [number, number]): string {
  if (!playerPosition) return "0px, 0px";

  const tileSize = 40;
  const viewportWidth = 600;
  const viewportHeight = 600;

  const playerX = (playerPosition[1] + 0.5) * tileSize;
  const playerY = (playerPosition[0] + 0.5) * tileSize;

  const translateX = viewportWidth / 2 - playerX;
  const translateY = viewportHeight / 2 - playerY;

  return `${translateX}px, ${translateY}px`;
}
