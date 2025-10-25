import React, { useState, useEffect, useCallback, useRef } from "react";
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
  reviveFromLastCheckpoint,
  type TimeOfDayState,
  createInitialTimeOfDay,
  DAY_PHASE_CONFIG,
} from "../lib/map";
import type { Enemy } from "../lib/enemy";
import type { NPC, NPCInteractionEvent } from "../lib/npc";
import { canSee, calculateDistance } from "../lib/line_of_sight";
import { Tile, type HeroDeathPhase, type HeroDeathState } from "./Tile";
import {
  getEnemyIcon,
  createEmptyByKind,
  EnemyRegistry,
  type EnemyKind,
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
import { CurrentGameStorage, type GameStorageSlot } from "../lib/current_game_storage";
import {
  DEFAULT_ENVIRONMENT,
  type EnvironmentId,
  getEnvironmentConfig,
} from "../lib/environment";
import HealthDisplay from "./HealthDisplay";
import EnemyHealthDisplay from "./EnemyHealthDisplay";
import { ScreenShake } from "./ScreenShake";
import ItemPickupAnimation from "./ItemPickupAnimation";
import DialogueOverlay from "./DialogueOverlay";
import { useTypewriter } from "../lib/dialogue/useTypewriter";
import { BookshelfMenu } from "./BookshelfMenu";
import { DeathScreen } from "./DeathScreen";
import {
  getDialogueScript,
  type DialogueChoice,
  type DialogueLine,
  type DialogueEffect,
} from "../lib/story/dialogue_registry";
import { resolveNpcDialogueScript } from "../lib/story/npc_script_registry";
import { createInitialStoryFlags, type StoryEffect } from "../lib/story/event_registry";
import { performExchange } from "../lib/story/exchange_registry";
import { applyStoryEffectsWithDiary } from "../lib/story/event_registry";
import { updateConditionalNpcs } from "../lib/story/story_mode";
import { HeroDiaryModal } from "./HeroDiaryModal";
import DayNightMeter from "./DayNightMeter";

type DialogueSession = {
  event: NPCInteractionEvent;
  script: DialogueLine[];
  lineIndex: number;
  dialogueId: string;
  consumedScriptIds: string[];
};

const TORCH_CARRIER_ENEMIES = new Set<EnemyKind>(["goblin"]);

function cloneDialogueLines(lines: DialogueLine[]): DialogueLine[] {
  return lines.map((line) => ({
    ...line,
    options: line.options
      ? line.options.map((option) => ({
          ...option,
          response: option.response
            ? cloneDialogueLines(option.response)
            : undefined,
        }))
      : undefined,
  }));
}

// Grid dimensions will be derived from provided map data

interface TilemapGridProps {
  tilemap?: number[][];
  tileTypes: Record<number, TileType>;
  subtypes?: number[][][];
  initialGameState?: GameState;
  forceDaylight?: boolean; // when true, override lighting to full visibility
  isDailyChallenge?: boolean; // when true, handle daily challenge completion
  onDailyComplete?: (result: "won" | "lost") => void; // when daily, signal result instead of routing
  storageSlot?: GameStorageSlot;
}

export const TilemapGrid: React.FC<TilemapGridProps> = ({
  tilemap,
  tileTypes,
  subtypes,
  initialGameState,
  forceDaylight = process.env.NODE_ENV !== "test",
  isDailyChallenge = false,
  onDailyComplete,
  storageSlot,
}) => {
  const router = useRouter();

  const resolvedStorageSlot: GameStorageSlot = storageSlot
    ? storageSlot
    : isDailyChallenge
    ? 'daily'
    : 'default';

  const shouldAnimateHeroDeath = resolvedStorageSlot === 'story';

  // Router removed; daily flow handled via onDailyComplete callback

  // Initialize game state
  const [gameState, setGameState] = useState<GameState>(() => {
    if (initialGameState) {
      return initialGameState.timeOfDay
        ? initialGameState
        : { ...initialGameState, timeOfDay: createInitialTimeOfDay() };
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
        diaryEntries: [],
        stats: {
          damageDealt: 0,
          damageTaken: 0,
          enemiesDefeated: 0,
          steps: 0,
          byKind: createEmptyByKind(),
        },
        timeOfDay: createInitialTimeOfDay(),
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
  
  // Track if death screen should be shown
  const [showDeathScreen, setShowDeathScreen] = useState(false);

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

  const [isHeroDiaryOpen, setHeroDiaryOpen] = useState(false);

  // Room label visibility (auto-hide after a few seconds)
  const [showRoomLabel, setShowRoomLabel] = useState(true);

  // Developer hover coordinates for story mode (dev only)
  const [hoverTile, setHoverTile] = useState<[number, number] | null>(null);

  // Portal travel animation state
  const [travelAnimation, setTravelAnimation] = useState<{
    phase: 'sparkle-out' | 'transition' | 'sparkle-in' | 'complete';
    startTime: number;
  } | null>(null);

  const [dialogueSession, setDialogueSession] = useState<DialogueSession | null>(null);
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState<number>(0);
  const [activeBookshelfId, setActiveBookshelfId] = useState<string | null>(null);
  const activeDialogueLine = dialogueSession
    ? dialogueSession.script[dialogueSession.lineIndex] ?? null
    : null;
  const {
    rendered: dialogueRendered,
    isTyping: dialogueTyping,
    skip: revealDialogueImmediately,
    reset: resetDialogue,
  } = useTypewriter(activeDialogueLine?.text ?? "", 16);
  const dialogueActive = Boolean(dialogueSession);
  const activeDialogueChoices: DialogueChoice[] | undefined =
    activeDialogueLine?.options && activeDialogueLine.options.length > 0
      ? activeDialogueLine.options
      : undefined;

  const diaryEntries = gameState.diaryEntries ?? [];
  const incompleteDiaryCount = diaryEntries.reduce(
    (count, entry) => (entry.completed ? count : count + 1),
    0
  );

  useEffect(() => {
    if (!activeDialogueChoices || activeDialogueChoices.length === 0) {
      setSelectedChoiceIndex(0);
      return;
    }
    setSelectedChoiceIndex((prev) => {
      if (prev < 0 || prev >= activeDialogueChoices.length) {
        return 0;
      }
      return prev;
    });
  }, [activeDialogueChoices]);

  // Auto-hide room label after 3 seconds when room changes
  useEffect(() => {
    if (gameState.mode === 'story' && gameState.currentRoomId) {
      setShowRoomLabel(true);
      const timer = setTimeout(() => {
        setShowRoomLabel(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [gameState.mode, gameState.currentRoomId]);

  // Handle portal travel animation phases
  useEffect(() => {
    if (!travelAnimation) return undefined;
    
    const checkPhase = () => {
      const elapsed = Date.now() - travelAnimation.startTime;
      
      if (travelAnimation.phase === 'sparkle-out') {
        // Show sparkle animation for 600ms
        if (elapsed >= 600) {
          setTravelAnimation({ phase: 'transition', startTime: Date.now() });
        }
      } else if (travelAnimation.phase === 'transition') {
        // Perform the actual teleportation
        if (gameState.portalLocation && playerPosition) {
          const targetRoomId = gameState.portalLocation.roomId;
          const targetPos = gameState.portalLocation.position;
          const currentRoomId = gameState.currentRoomId ?? '__base__';
          
          if (targetRoomId !== currentRoomId && gameState.rooms) {
            // Cross-room travel - use room transition logic
            // This would need to integrate with the existing room transition system
            // For now, just move to sparkle-in phase
            setTravelAnimation({ phase: 'sparkle-in', startTime: Date.now() });
          } else {
            // Same room travel - just move player
            setGameState((prev) => {
              const newMapData = JSON.parse(JSON.stringify(prev.mapData));
              const [oldY, oldX] = playerPosition;
              const [newY, newX] = targetPos;
              
              // Remove player from old position
              const oldSubs = newMapData.subtypes[oldY][oldX] || [];
              newMapData.subtypes[oldY][oldX] = oldSubs.filter(
                (s: number) => s !== TileSubtype.PLAYER
              );
              
              // Add player to new position
              const newSubs = newMapData.subtypes[newY][newX] || [];
              if (!newSubs.includes(TileSubtype.PLAYER)) {
                newMapData.subtypes[newY][newX] = [...newSubs, TileSubtype.PLAYER];
              }
              
              const nextState: GameState = {
                ...prev,
                mapData: newMapData,
              };
              CurrentGameStorage.saveCurrentGame(nextState, resolvedStorageSlot);
              return nextState;
            });
            setTravelAnimation({ phase: 'sparkle-in', startTime: Date.now() });
          }
        }
      } else if (travelAnimation.phase === 'sparkle-in') {
        // Show sparkle animation for 600ms
        if (elapsed >= 600) {
          setTravelAnimation({ phase: 'complete', startTime: Date.now() });
        }
      } else if (travelAnimation.phase === 'complete') {
        // Clean up
        setTravelAnimation(null);
      }
    };
    
    // Check immediately
    checkPhase();
    
    // Then check every 100ms
    const interval = setInterval(checkPhase, 100);
    
    return () => clearInterval(interval);
  }, [travelAnimation, gameState.portalLocation, gameState.currentRoomId, gameState.rooms, playerPosition, resolvedStorageSlot]);

  const consumeNpcInteraction = useCallback(
    (timestamp: number) => {
      setGameState((prev) => {
        const queue = prev.npcInteractionQueue;
        if (!queue || queue.length === 0) {
          return prev;
        }
        const filtered = queue.filter((event) => event.timestamp !== timestamp);
        if (filtered.length === queue.length) {
          return prev;
        }
        const next: GameState = {
          ...prev,
          npcInteractionQueue: filtered,
        };
        try {
          CurrentGameStorage.saveCurrentGame(next, resolvedStorageSlot);
        } catch {}
        return next;
      });
    },
    [resolvedStorageSlot]
  );

  // Handle using food from inventory
  const handleUseFood = useCallback(() => {
    try {
      trackUse("food");
    } catch {}
    setGameState((prev) => {
      const newState = performUseFood(prev);
      CurrentGameStorage.saveCurrentGame(newState, resolvedStorageSlot);
      return newState;
    });
  }, [resolvedStorageSlot]);

  // Handle using potion from inventory
  const handleUsePotion = useCallback(() => {
    try {
      trackUse("potion");
    } catch {}
    setGameState((prev) => {
      const newState = performUsePotion(prev);
      CurrentGameStorage.saveCurrentGame(newState, resolvedStorageSlot);
      return newState;
    });
  }, [resolvedStorageSlot]);

  // Handle snake medallion click - place portal or show travel dialogue
  const handleSnakeMedallionClick = useCallback(() => {
    if (!playerPosition) return;
    
    // Check current state synchronously
    const hasPortal = gameState.portalLocation !== undefined;
    
    if (!hasPortal) {
      // Place portal
      setGameState((prev) => {
        if (!prev.hasSnakeMedallion) return prev;
        
        const [py, px] = playerPosition;
        const currentRoomId = prev.currentRoomId ?? '__base__';
        const newMapData = JSON.parse(JSON.stringify(prev.mapData));
        const subs = newMapData.subtypes[py][px] || [];
        if (!subs.includes(TileSubtype.PORTAL)) {
          newMapData.subtypes[py][px] = [...subs, TileSubtype.PORTAL];
        }
        
        const nextState: GameState = {
          ...prev,
          mapData: newMapData,
          portalLocation: {
            roomId: currentRoomId,
            position: [py, px],
          },
        };
        CurrentGameStorage.saveCurrentGame(nextState, resolvedStorageSlot);
        return nextState;
      });
    } else {
      // Portal exists - show dialogue for travel or replace
      const portalScript: DialogueLine[] = [
        {
          speaker: "System",
          text: "What would you like to do with the portal?",
          options: [
            {
              id: "travel",
              prompt: "Travel to the portal",
            },
            {
              id: "replace",
              prompt: "Replace portal location",
            },
            {
              id: "cancel",
              prompt: "Cancel",
            },
          ],
        },
      ];
      
      setDialogueSession({
        event: {
          type: "dialogue",
          timestamp: Date.now(),
          npcId: "portal-medallion",
          npcName: "Portal",
          availableHooks: [],
          hookId: undefined,
          trigger: "action",
        },
        script: portalScript,
        lineIndex: 0,
        dialogueId: "portal-medallion-menu",
        consumedScriptIds: ["portal-medallion-menu"],
      });
    }
  }, [playerPosition, gameState.portalLocation, resolvedStorageSlot]);

  const handleDiaryToggle = useCallback(
    (entryId: string, completed: boolean) => {
      const timestamp = Date.now();
      setGameState((prev) => {
        const entries = prev.diaryEntries ?? [];
        const index = entries.findIndex((entry) => entry.id === entryId);
        if (index === -1) {
          return prev;
        }
        const current = entries[index];
        if (Boolean(current.completed) === completed) {
          return prev;
        }
        const nextEntries = entries.map((entry, idx) =>
          idx === index
            ? {
                ...entry,
                completed,
                completedAt: completed ? timestamp : undefined,
              }
            : entry
        );
        const nextState: GameState = { ...prev, diaryEntries: nextEntries };
        try {
          CurrentGameStorage.saveCurrentGame(nextState, resolvedStorageSlot);
        } catch {}
        return nextState;
      });
    },
    [resolvedStorageSlot]
  );

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

      // Apply game logic immediately for collisions or early stops
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
  }, [playerPosition, resolvedStorageSlot]);

  const applyDialogueCompletionEffects = useCallback(
    (session: DialogueSession) => {
      const consumedIds = session.consumedScriptIds?.length
        ? session.consumedScriptIds
        : [session.dialogueId];
      const seen = new Set<string>();
      const pendingEffects = consumedIds.flatMap((id) => {
        if (!id || seen.has(id)) return [];
        seen.add(id);
        const script = getDialogueScript(id);
        if (!script?.onCompleteEffects) return [];
        return script.onCompleteEffects;
      });
      if (pendingEffects.length === 0) return;
      setGameState((prev) => {
        const result = applyStoryEffectsWithDiary(
          prev.storyFlags,
          prev.diaryEntries,
          pendingEffects
        );
        if (!result.flagsChanged && !result.diaryChanged) {
          return prev;
        }
        const nextState: GameState = {
          ...prev,
          storyFlags: result.flags ?? prev.storyFlags,
          diaryEntries: result.diaryEntries ?? prev.diaryEntries ?? [],
        };
        // Update conditional NPCs when story flags change
        updateConditionalNpcs(nextState);
        try {
          CurrentGameStorage.saveCurrentGame(nextState, resolvedStorageSlot);
        } catch {}
        return nextState;
      });
    },
    [resolvedStorageSlot, setGameState]
  );

  const handleDialogueAdvance = useCallback(() => {
    if (!dialogueSession) return;
    if (dialogueTyping) {
      revealDialogueImmediately();
      return;
    }
    if (activeDialogueChoices && activeDialogueChoices.length > 0) {
      return;
    }
    if (dialogueSession.lineIndex < dialogueSession.script.length - 1) {
      setDialogueSession({
        ...dialogueSession,
        lineIndex: dialogueSession.lineIndex + 1,
      });
      return;
    }
    applyDialogueCompletionEffects(dialogueSession);
    setDialogueSession(null);
    setSelectedChoiceIndex(0);
    resetDialogue();
  }, [
    dialogueSession,
    dialogueTyping,
    activeDialogueChoices,
    revealDialogueImmediately,
    resetDialogue,
    applyDialogueCompletionEffects,
  ]);

  const handleDialogueChoiceSelect = useCallback(
    (choiceId: string) => {
      // Handle portal medallion special choices
      if (dialogueSession?.dialogueId === "portal-medallion-menu") {
        if (choiceId === "travel") {
          // Initiate portal travel
          if (gameState.portalLocation && playerPosition) {
            // Start travel animation
            setTravelAnimation({ phase: 'sparkle-out', startTime: Date.now() });
            // Close dialogue
            setDialogueSession(null);
            setSelectedChoiceIndex(0);
            resetDialogue();
          }
          return;
        } else if (choiceId === "replace") {
          // Replace portal location
          if (playerPosition) {
            setGameState((prev) => {
              const [py, px] = playerPosition;
              const currentRoomId = prev.currentRoomId ?? '__base__';
              
              // Remove old portal from old location
              if (prev.portalLocation && prev.rooms) {
                const oldRoomId = prev.portalLocation.roomId;
                const oldPos = prev.portalLocation.position;
                
                if (oldRoomId === currentRoomId) {
                  // Same room - update current map
                  const newMapData = JSON.parse(JSON.stringify(prev.mapData));
                  const oldSubs = newMapData.subtypes[oldPos[0]][oldPos[1]] || [];
                  newMapData.subtypes[oldPos[0]][oldPos[1]] = oldSubs.filter(
                    (s: number) => s !== TileSubtype.PORTAL
                  );
                  
                  // Add portal to new location
                  const newSubs = newMapData.subtypes[py][px] || [];
                  if (!newSubs.includes(TileSubtype.PORTAL)) {
                    newMapData.subtypes[py][px] = [...newSubs, TileSubtype.PORTAL];
                  }
                  
                  const nextState: GameState = {
                    ...prev,
                    mapData: newMapData,
                    portalLocation: {
                      roomId: currentRoomId,
                      position: [py, px],
                    },
                  };
                  CurrentGameStorage.saveCurrentGame(nextState, resolvedStorageSlot);
                  return nextState;
                }
              }
              
              // Different room or no rooms - just update current location
              const newMapData = JSON.parse(JSON.stringify(prev.mapData));
              const newSubs = newMapData.subtypes[py][px] || [];
              if (!newSubs.includes(TileSubtype.PORTAL)) {
                newMapData.subtypes[py][px] = [...newSubs, TileSubtype.PORTAL];
              }
              
              const nextState: GameState = {
                ...prev,
                mapData: newMapData,
                portalLocation: {
                  roomId: currentRoomId,
                  position: [py, px],
                },
              };
              CurrentGameStorage.saveCurrentGame(nextState, resolvedStorageSlot);
              return nextState;
            });
          }
          setDialogueSession(null);
          setSelectedChoiceIndex(0);
          resetDialogue();
          return;
        } else if (choiceId === "cancel") {
          setDialogueSession(null);
          setSelectedChoiceIndex(0);
          resetDialogue();
          return;
        }
      }
      
      setDialogueSession((prev) => {
        if (!prev) return prev;
        const currentLine = prev.script[prev.lineIndex];
        if (!currentLine || !currentLine.options) return prev;
        const choice = currentLine.options.find((option) => option.id === choiceId);
        if (!choice) return prev;

        if (choice.effects && choice.effects.length > 0) {
          setGameState((state) => {
            let nextState = { ...state };
            
            // Separate story effects from exchange effects
            const storyEffects: StoryEffect[] = [];
            const exchangeEffects: string[] = [];
            
            for (const effect of choice.effects!) {
              if ('type' in effect && effect.type === 'exchange') {
                exchangeEffects.push(effect.exchangeId);
              } else {
                storyEffects.push(effect as StoryEffect);
              }
            }
            
            // Apply exchange effects first (they modify game state)
            for (const exchangeId of exchangeEffects) {
              nextState = performExchange(exchangeId, nextState);
            }
            
            // Then apply story effects (flags and diary)
            if (storyEffects.length > 0) {
              const result = applyStoryEffectsWithDiary(
                nextState.storyFlags,
                nextState.diaryEntries,
                storyEffects
              );
              if (result.flagsChanged || result.diaryChanged) {
                nextState = {
                  ...nextState,
                  storyFlags: result.flags ?? nextState.storyFlags,
                  diaryEntries: result.diaryEntries ?? nextState.diaryEntries ?? [],
                };
              }
            }
            
            // Update conditional NPCs when story flags change
            updateConditionalNpcs(nextState);
            try {
              CurrentGameStorage.saveCurrentGame(nextState, resolvedStorageSlot);
            } catch {}
            return nextState;
          });
        }

        const updatedCurrentLine: DialogueLine = {
          ...currentLine,
          options: undefined,
        };

        const newScript: DialogueLine[] = [
          ...prev.script.slice(0, prev.lineIndex),
          updatedCurrentLine,
        ];

        if (choice.response && choice.response.length > 0) {
          newScript.push(...cloneDialogueLines(choice.response));
        }

        const consumedIds = new Set(prev.consumedScriptIds);

        if (choice.nextDialogueId) {
          const nextScript = getDialogueScript(choice.nextDialogueId);
          if (nextScript) {
            newScript.push(...cloneDialogueLines(nextScript.lines));
            consumedIds.add(choice.nextDialogueId);
          }
        }

        const nextIndex = Math.min(prev.lineIndex + 1, newScript.length - 1);

        return {
          ...prev,
          script: newScript,
          lineIndex: nextIndex,
          consumedScriptIds: Array.from(consumedIds),
        };
      });
      setSelectedChoiceIndex(0);
      resetDialogue();
    },
    [dialogueSession, gameState, playerPosition, resetDialogue, resolvedStorageSlot, setGameState]
  );

  const handleDialogueChoiceNavigate = useCallback(
    (delta: number) => {
      if (!activeDialogueChoices || activeDialogueChoices.length === 0) {
        return;
      }
      setSelectedChoiceIndex((prev) => {
        const length = activeDialogueChoices.length;
        const next = (prev + delta + length) % length;
        return next;
      });
    },
    [activeDialogueChoices]
  );

  const handleDialogueChoiceConfirm = useCallback(() => {
    if (!activeDialogueChoices || activeDialogueChoices.length === 0) {
      return;
    }
    const choice = activeDialogueChoices[selectedChoiceIndex];
    if (choice) {
      handleDialogueChoiceSelect(choice.id);
    }
  }, [activeDialogueChoices, selectedChoiceIndex, handleDialogueChoiceSelect]);

  const handleTextInputSubmit = useCallback(
    (value: string) => {
      if (!dialogueSession || !activeDialogueLine?.textInput) return;
      
      const stateKey = activeDialogueLine.textInput.stateKey;
      
      // Update game state with the input value
      setGameState((prev) => {
        const nextState = {
          ...prev,
          [stateKey]: value,
        };
        try {
          CurrentGameStorage.saveCurrentGame(nextState, resolvedStorageSlot);
        } catch {}
        return nextState;
      });
      
      // Advance to next dialogue line
      handleDialogueAdvance();
    },
    [dialogueSession, activeDialogueLine, resolvedStorageSlot, handleDialogueAdvance, setGameState]
  );

  const handleInteract = useCallback(() => {
    if (dialogueActive) {
      handleDialogueAdvance();
      return;
    }
    setGameState((prev) => {
      const npcs = prev.npcs;
      if (!npcs || npcs.length === 0) return prev;
      if (!playerPosition) return prev;
      const [py, px] = playerPosition;
      let targetY = py;
      let targetX = px;
      switch (prev.playerDirection) {
        case Direction.UP:
          targetY = py - 1;
          break;
        case Direction.RIGHT:
          targetX = px + 1;
          break;
        case Direction.DOWN:
          targetY = py + 1;
          break;
        case Direction.LEFT:
          targetX = px - 1;
          break;
      }

      const npc = npcs.find(
        (candidate) =>
          candidate.y === targetY && candidate.x === targetX && !candidate.isDead()
      );
      if (!npc) return prev;

      const dy = py - npc.y;
      const dx = px - npc.x;
      let faceDir = npc.facing;
      // Only change facing for left/right interactions to avoid "laying down" bug
      // when NPCs face UP (which rotates them -90deg in the renderer)
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 0) {
        // Player is left/right of NPC - face toward player
        // dx > 0 means player is to the right (higher X), so NPC faces RIGHT
        // dx < 0 means player is to the left (lower X), so NPC faces LEFT
        faceDir = dx > 0 ? Direction.RIGHT : Direction.LEFT;
        npc.face(faceDir);
      }
      // Don't change facing for vertical interactions (keeps NPC from laying down)
      npc.setMemory("lastManualInteract", Date.now());
      npc.setMemory("lastHeroDirection", prev.playerDirection);

      const updatedNpcs = npcs.map((entry) =>
        entry.id === npc.id ? npc : entry
      );
      const queue = prev.npcInteractionQueue
        ? [...prev.npcInteractionQueue]
        : [];
      const flags = prev.storyFlags ?? createInitialStoryFlags();
      // Default script resolution via registry (story mode only)
      const scriptId = prev.mode === 'story' 
        ? resolveNpcDialogueScript(npc.id, flags, prev)
        : undefined;
      if (process.env.NODE_ENV === "development") {
        try {
          console.info("[Story][NPC]", npc.id, {
            flags,
            selected: scriptId,
          });
        } catch {}
      }
      const dynamicHook = scriptId
        ? {
            id: `story-dialogue:${scriptId}`,
            type: "dialogue" as const,
            description: `Talk to ${npc.name}`,
            payload: { dialogueId: scriptId },
          }
        : undefined;
      if (dynamicHook) {
        const existingDialogueHooks = npc.interactionHooks?.filter(
          (h) => h.type !== "dialogue"
        ) ?? [];
        npc.interactionHooks = [dynamicHook, ...existingDialogueHooks];
      }
      queue.push(npc.createInteractionEvent("action", dynamicHook));
      const MAX_QUEUE = 20;
      const trimmedQueue =
        queue.length > MAX_QUEUE ? queue.slice(queue.length - MAX_QUEUE) : queue;

      const next: GameState = {
        ...prev,
        npcs: updatedNpcs,
        npcInteractionQueue: trimmedQueue,
        storyFlags: flags,
      };
      CurrentGameStorage.saveCurrentGame(next, resolvedStorageSlot);
      return next;
    });
  }, [
    dialogueActive,
    handleDialogueAdvance,
    playerPosition,
    resolvedStorageSlot,
  ]);

  // Handle restarting from last checkpoint
  const handleRestartFromCheckpoint = useCallback(() => {
    const revivedState = reviveFromLastCheckpoint(gameState);
    if (revivedState) {
      setShowDeathScreen(false);
      setGameCompletionProcessed(false);
      setGameState(revivedState);
      CurrentGameStorage.saveCurrentGame(revivedState, resolvedStorageSlot);
    } else {
      // No checkpoint exists - clear storage and reload to start over
      CurrentGameStorage.clearCurrentGame(resolvedStorageSlot);
      window.location.reload();
    }
  }, [gameState, resolvedStorageSlot]);

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
              CurrentGameStorage.saveCurrentGame(next, resolvedStorageSlot);
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
      CurrentGameStorage.saveCurrentGame(next, resolvedStorageSlot);
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
  }, [playerPosition, resolvedStorageSlot]);

  // Handle bookshelf interactions
  useEffect(() => {
    if (dialogueSession || activeBookshelfId) return;
    const queue = gameState.bookshelfInteractionQueue;
    if (!queue || queue.length === 0) return;
    const nextBookshelf = queue[0];
    if (!nextBookshelf) return;

    setActiveBookshelfId(nextBookshelf.bookshelfId);
    
    // Clear the queue and save
    setGameState((prev) => {
      const next = {
        ...prev,
        bookshelfInteractionQueue: [],
      };
      CurrentGameStorage.saveCurrentGame(next, resolvedStorageSlot);
      return next;
    });
  }, [gameState.bookshelfInteractionQueue, dialogueSession, activeBookshelfId, resolvedStorageSlot]);

  useEffect(() => {
    if (dialogueSession) return;
    const queue = gameState.npcInteractionQueue;
    if (!queue || queue.length === 0) return;
    const nextEvent = queue.find((entry) => entry.type === "dialogue");
    if (!nextEvent) return;

    let hook = nextEvent.availableHooks.find((h) => h.id === nextEvent.hookId);
    if (!hook && nextEvent.availableHooks.length > 0) {
      hook = nextEvent.availableHooks[0];
    }
    const dialogueId = (hook?.payload?.dialogueId ?? hook?.id) as string | undefined;
    if (!dialogueId) {
      consumeNpcInteraction(nextEvent.timestamp);
      return;
    }
    const script = getDialogueScript(dialogueId);
    if (!script || script.lines.length === 0) {
      consumeNpcInteraction(nextEvent.timestamp);
      return;
    }

    const scriptLines = cloneDialogueLines(script.lines);
    setDialogueSession({
      event: nextEvent,
      script: scriptLines,
      lineIndex: 0,
      dialogueId,
      consumedScriptIds: [dialogueId],
    });
    setSelectedChoiceIndex(0);
    consumeNpcInteraction(nextEvent.timestamp);
    resetDialogue();
  }, [
    gameState.npcInteractionQueue,
    dialogueSession,
    consumeNpcInteraction,
    resetDialogue,
  ]);

  const currentDialogueHasMore = dialogueSession
    ? dialogueSession.lineIndex < dialogueSession.script.length - 1
    : false;
  const activeDialogueSpeaker = activeDialogueLine?.speaker ?? dialogueSession?.event.npcName ?? "";
  const activeDialogueFullText = activeDialogueLine?.text ?? "";
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
  // Transient heart effect (petting dogs)
  const [heartEffect, setHeartEffect] = useState<null | {
    y: number;
    x: number;
    createdAt: number;
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
  const [heroDeathPhase, setHeroDeathPhase] = useState<HeroDeathPhase>("idle");
  const [heroDeathOrientation, setHeroDeathOrientation] = useState<Direction>(Direction.RIGHT);
  const heroDeathPositionRef = useRef<[number, number] | null>(null);
  const heroDeathTimeouts = useRef<number[]>([]);
  const previousHeroHealth = useRef<number>(gameState.heroHealth);
  const clearHeroDeathTimeouts = useCallback(() => {
    if (typeof window === "undefined") return;
    heroDeathTimeouts.current.forEach((id) => window.clearTimeout(id));
    heroDeathTimeouts.current = [];
  }, []);
  const spawnHeroSpirit = useCallback(() => {
    const pos = heroDeathPositionRef.current;
    if (!pos) return;
    const [y, x] = pos;
    const now = Date.now();
    setSpirits((prev) => {
      const id = `hero-${y},${x}-${now}-${Math.random().toString(36).slice(2, 7)}`;
      const next = [
        ...prev,
        {
          id,
          y,
          x,
          createdAt: now,
        },
      ];
      if (typeof window !== "undefined") {
        const timeoutId = window.setTimeout(() => {
          setSpirits((curr) => curr.filter((s) => s.id !== id));
        }, 2000);
        heroDeathTimeouts.current.push(timeoutId);
      }
      return next;
    });
  }, [setSpirits]);
  const lastCheckpointSignature = useRef<string | null>(null);
  const [checkpointFlash, setCheckpointFlash] = useState<number | null>(null);
  const environment: EnvironmentId =
    (gameState.mapData.environment as EnvironmentId | undefined) ??
    DEFAULT_ENVIRONMENT;
  const timeOfDayState: TimeOfDayState =
    gameState.timeOfDay ?? createInitialTimeOfDay();
  const environmentConfig = getEnvironmentConfig(environment);
  const environmentDaylight = environmentConfig.daylight;
  // Visually treat dawn/dusk as day for outdoor visibility
  const visualPhaseId =
    timeOfDayState.phase === "dawn" || timeOfDayState.phase === "dusk"
      ? "day"
      : timeOfDayState.phase;
  const visualPhaseAllowsFull = DAY_PHASE_CONFIG[visualPhaseId]?.allowsFullVisibility ?? false;
  const autoPhaseVisibility =
    environment === "outdoor" ? visualPhaseAllowsFull : environmentDaylight;
  const heroTorchLitState = gameState.heroTorchLit ?? true;
  const suppressDarknessOverlay =
    autoPhaseVisibility || (forceDaylight && heroTorchLitState);
  const heroTorchLitForVisibility = suppressDarknessOverlay ? true : heroTorchLitState;
  const lastCheckpoint = gameState.lastCheckpoint;
  const heroDeathStateForTiles: HeroDeathState | undefined =
    shouldAnimateHeroDeath && heroDeathPhase !== "idle"
      ? { phase: heroDeathPhase, orientation: heroDeathOrientation }
      : undefined;

  useEffect(() => {
    return () => {
      clearHeroDeathTimeouts();
    };
  }, [clearHeroDeathTimeouts]);

  useEffect(() => {
    if (gameState.heroHealth > 0 && heroDeathPhase !== "idle") {
      clearHeroDeathTimeouts();
      heroDeathPositionRef.current = null;
      setHeroDeathPhase("idle");
      const facing =
        gameState.playerDirection === Direction.LEFT ? Direction.LEFT : Direction.RIGHT;
      setHeroDeathOrientation(facing);
    }
  }, [gameState.heroHealth, heroDeathPhase, clearHeroDeathTimeouts, gameState.playerDirection]);

  useEffect(() => {
    const prev = previousHeroHealth.current;
    if (
      gameState.heroHealth <= 0 &&
      prev > 0 &&
      heroDeathPhase === "idle"
    ) {
      heroDeathPositionRef.current = playerPosition ?? null;
      const initialFacing =
        gameState.playerDirection === Direction.LEFT ? Direction.LEFT : Direction.RIGHT;
      setHeroDeathOrientation(initialFacing);

      if (!shouldAnimateHeroDeath || !playerPosition || typeof window === "undefined") {
        setHeroDeathPhase("complete");
      } else {
        clearHeroDeathTimeouts();
        setHeroDeathPhase("spinning");
        const opposite =
          initialFacing === Direction.LEFT ? Direction.RIGHT : Direction.LEFT;
        const sequence: Direction[] = [
          opposite,
          initialFacing,
          opposite,
          initialFacing,
        ];
        const stepMs = 160;
        sequence.forEach((dir, index) => {
          const timeoutId = window.setTimeout(() => {
            setHeroDeathOrientation(dir);
          }, (index + 1) * stepMs);
          heroDeathTimeouts.current.push(timeoutId);
        });
        const fallDelay = sequence.length * stepMs + 220;
        heroDeathTimeouts.current.push(
          window.setTimeout(() => {
            setHeroDeathOrientation(Direction.RIGHT);
            setHeroDeathPhase("fallen");
          }, fallDelay)
        );
        const spiritDelay = fallDelay + 350;
        heroDeathTimeouts.current.push(
          window.setTimeout(() => {
            setHeroDeathPhase("spirit");
            spawnHeroSpirit();
          }, spiritDelay)
        );
        const completeDelay = spiritDelay + 900;
        heroDeathTimeouts.current.push(
          window.setTimeout(() => {
            setHeroDeathPhase("complete");
          }, completeDelay)
        );
      }
    }
    previousHeroHealth.current = gameState.heroHealth;
  }, [
    gameState.heroHealth,
    gameState.playerDirection,
    playerPosition,
    heroDeathPhase,
    shouldAnimateHeroDeath,
    clearHeroDeathTimeouts,
    spawnHeroSpirit,
  ]);

  useEffect(() => {
    if (!shouldAnimateHeroDeath) return;
    if (heroDeathPhase === "spirit") {
      setShowDeathScreen(true);
    }
  }, [heroDeathPhase, shouldAnimateHeroDeath]);

  // Determine the currently active checkpoint tile from the lastCheckpoint snapshot
  const activeCheckpoint: [number, number] | null = React.useMemo(() => {
    const cp = gameState.lastCheckpoint;
    if (!cp || !cp.mapData || !cp.mapData.subtypes) return null;
    const subs = cp.mapData.subtypes as number[][][];
    for (let y = 0; y < subs.length; y++) {
      const row = subs[y];
      if (!row) continue;
      for (let x = 0; x < row.length; x++) {
        const cell = row[x];
        if (Array.isArray(cell) && cell.includes(TileSubtype.CHECKPOINT)) {
          return [y, x];
        }
      }
    }
    return null;
  }, [gameState.lastCheckpoint]);

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
    if (suppressDarknessOverlay) return; // do not auto-disable when daylight override is on
    if (gameState.showFullMap) {
      const timer = setTimeout(() => {
        setGameState((prev) => ({ ...prev, showFullMap: false }));
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [gameState.showFullMap, suppressDarknessOverlay]);

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
          CurrentGameStorage.clearCurrentGame(resolvedStorageSlot);
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
    resolvedStorageSlot,
  ]);

  useEffect(() => {
    const queue = gameState.npcInteractionQueue;
    if (!queue || queue.length === 0) return;
    const last = queue[queue.length - 1];
    
    // Handle petting interaction
    if (last.type === "custom" && last.hookId?.startsWith("pet-")) {
      const payload = last.availableHooks[0]?.payload as { action?: string; position?: [number, number] } | undefined;
      if (payload?.action === "pet" && payload.position) {
        const [y, x] = payload.position;
        setHeartEffect({ y, x, createdAt: Date.now() });
        // Clear heart effect after animation completes
        setTimeout(() => setHeartEffect(null), 1000);
      }
    }
    
    try {
      console.info(
        `[NPC Interaction] ${last.npcName} -> ${last.type} (${last.trigger})`,
        last
      );
    } catch {
      // Silently ignore logging issues (e.g., no console in environment)
    }
  }, [gameState.npcInteractionQueue]);

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
    const changed =
      nextInv.key !== prevInv.key ||
      nextInv.exitKey !== prevInv.exitKey ||
      nextInv.sword !== prevInv.sword ||
      nextInv.shield !== prevInv.shield ||
      nextInv.rocks !== prevInv.rocks ||
      nextInv.runes !== prevInv.runes ||
      nextInv.food !== prevInv.food;
    if (changed) {
      setPrevInv(nextInv);
    }
  }, [gameState, prevInv]);

  useEffect(() => {
    const snapshot = lastCheckpoint;
    if (!snapshot) return;
    const roomId = snapshot.currentRoomId ?? "base";
    const steps = snapshot.stats?.steps ?? 0;
    const hp = snapshot.heroHealth ?? 0;
    const signature = `${roomId}:${steps}:${hp}`;
    if (lastCheckpointSignature.current === signature) return;
    lastCheckpointSignature.current = signature;
    setCheckpointFlash(Date.now());
  }, [lastCheckpoint]);

  useEffect(() => {
    if (checkpointFlash === null) return;
    const timer = setTimeout(() => setCheckpointFlash(null), 2200);
    return () => clearTimeout(timer);
  }, [checkpointFlash]);

  // Show death screen when hero dies (heroHealth <= 0)
  useEffect(() => {
    if (gameState.heroHealth > 0 || gameCompletionProcessed) {
      return;
    }

    if (shouldAnimateHeroDeath && heroDeathPhase !== "complete") {
      return;
    }

    // Check if there's a checkpoint to revive from
    const hasCheckpoint = !!gameState.lastCheckpoint;

    if (hasCheckpoint) {
      // Show death screen with option to restart from checkpoint
      setGameCompletionProcessed(true);
      triggerScreenShake(400);
      setShowDeathScreen(true);
      
      // Track death analytics
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
      return;
    }

    // No checkpoint available
    setGameCompletionProcessed(true);
    triggerScreenShake(400);
    
    // In story mode, always show death screen (even without checkpoint)
    if (gameState.mode === "story") {
      setShowDeathScreen(true);
      // Track death analytics
      try {
        const mode = "normal";
        const mapId = computeMapId(gameState.mapData);
        trackGameComplete({
          outcome: "dead",
          mode,
          mapId,
          heroHealth: 0,
          steps: gameState.stats.steps,
          enemiesDefeated: gameState.stats.enemiesDefeated,
          damageDealt: gameState.stats.damageDealt,
          damageTaken: gameState.stats.damageTaken,
          byKind: gameState.stats.byKind,
          deathCause: gameState.deathCause?.type,
        });
      } catch {}
      return;
    }
    
    // For non-story modes, handle permanent death with redirect
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
          CurrentGameStorage.clearCurrentGame(resolvedStorageSlot);
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
          CurrentGameStorage.clearCurrentGame(resolvedStorageSlot);
        }
      } catch {
        // ignore storage errors
      }
      router.push("/end");
    }
  }, [
    gameState,
    gameState.heroHealth,
    gameState.lastCheckpoint,
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
    resolvedStorageSlot,
    heroDeathPhase,
    shouldAnimateHeroDeath,
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
      CurrentGameStorage.saveCurrentGame(newGameState, resolvedStorageSlot);
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
        // onEnemyDefeat processing is now handled directly in game-state.ts
        // Clear defeated enemies after processing
        if (newGameState.defeatedEnemies) {
          newGameState.defeatedEnemies = [];
        }
        
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
    [gameState, playerPosition, resolvedStorageSlot]
  );

  const handleMoveInput = useCallback(
    (direction: Direction) => {
      if (gameState.heroHealth <= 0 || heroDeathPhase !== "idle") {
        return;
      }
      if (dialogueActive) {
        handleDialogueAdvance();
        return;
      }
      handlePlayerMove(direction);
    },
    [
      dialogueActive,
      handleDialogueAdvance,
      handlePlayerMove,
      gameState.heroHealth,
      heroDeathPhase,
    ]
  );

  // Handle mobile control button clicks
  const handleMobileMove = useCallback(
    (directionStr: string) => {
      switch (directionStr) {
        case "UP":
          handleMoveInput(Direction.UP);
          break;
        case "RIGHT":
          handleMoveInput(Direction.RIGHT);
          break;
        case "DOWN":
          handleMoveInput(Direction.DOWN);
          break;
        case "LEFT":
          handleMoveInput(Direction.LEFT);
          break;
      }
    },
    [handleMoveInput]
  );

  // Add keyboard event listener
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (gameState.heroHealth <= 0 || heroDeathPhase !== "idle") {
        return;
      }
      if (dialogueActive) {
        if (activeDialogueChoices && activeDialogueChoices.length > 0) {
          if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
            event.preventDefault();
            handleDialogueChoiceNavigate(-1);
            return;
          }
          if (event.key === "ArrowDown" || event.key === "ArrowRight") {
            event.preventDefault();
            handleDialogueChoiceNavigate(1);
            return;
          }
          if (
            event.key === "Enter" ||
            event.key === " " ||
            event.key === "Spacebar" ||
            event.key === "e" ||
            event.key === "E"
          ) {
            event.preventDefault();
            handleDialogueChoiceConfirm();
          }
          return;
        }
        if (
          event.key === "Enter" ||
          event.key === " " ||
          event.key === "Spacebar" ||
          event.key === "ArrowDown" ||
          event.key === "ArrowUp" ||
          event.key === "ArrowRight" ||
          event.key === "ArrowLeft" ||
          event.key === "e" ||
          event.key === "E"
        ) {
          event.preventDefault();
          handleDialogueAdvance();
        }
        return;
      }
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
        case "e":
        case "E":
          handleInteract();
          return;
      }

      if (direction !== null) {
        handleMoveInput(direction);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    gameState,
    dialogueActive,
    activeDialogueChoices,
    handleDialogueAdvance,
    handleMoveInput,
    handleThrowRock,
    handleThrowRune,
    handleUseFood,
    handleUsePotion,
    handleInteract,
    handleDialogueChoiceNavigate,
    handleDialogueChoiceConfirm,
    heroDeathPhase,
  ]);

  return (
    <div className="relative">
      {showDeathScreen && (
        <DeathScreen
          deathCause={gameState.deathCause}
          onRestart={handleRestartFromCheckpoint}
          hasCheckpoint={!!gameState.lastCheckpoint}
        />
      )}
      {isHeroDiaryOpen && (
        <HeroDiaryModal
          entries={diaryEntries}
          onClose={() => setHeroDiaryOpen(false)}
          onToggleComplete={handleDiaryToggle}
        />
      )}
      {/* Portal travel sparkle animation */}
      {travelAnimation && (travelAnimation.phase === 'sparkle-out' || travelAnimation.phase === 'sparkle-in') && (
        <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center">
          <div className="relative w-64 h-64">
            <img
              src="/images/items/travel-sparkle-large.png"
              alt=""
              className="absolute inset-0 w-full h-full animate-pulse"
              style={{ animationDuration: '0.3s' }}
            />
            <img
              src="/images/items/travel-sparkle-small.png"
              alt=""
              className="absolute inset-0 w-full h-full animate-ping"
              style={{ animationDuration: '0.6s' }}
            />
          </div>
        </div>
      )}
      <ScreenShake isShaking={isShaking} intensity={4} duration={300}>
        <div className="relative flex justify-center" data-testid="tilemap-grid-wrapper">
          {checkpointFlash && (
            <div className="absolute top-4 right-4 z-50">
              <div className="rounded-md bg-emerald-600/90 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-900/50">
                Game saved
              </div>
            </div>
          )}
        {/* Vertically center the entire game UI within the viewport */}
        <div className="w-full mt-12 flex items-center justify-center">
          <div className="game-scale relative" data-testid="game-scale">
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
                    .sort((a, b) => a.d - b.d)
                    .slice(0, 5);
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
              {(() => {
                // Count total inventory items
                const inventoryCount =
                  (diaryEntries.length > 0 ? 1 : 0) +
                  (gameState.hasKey ? 1 : 0) +
                  (gameState.hasExitKey ? 1 : 0) +
                  (gameState.hasSword ? 1 : 0) +
                  (gameState.hasShield ? 1 : 0) +
                  (gameState.hasSnakeMedallion ? 1 : 0) +
                  ((gameState.rockCount ?? 0) > 0 ? 1 : 0) +
                  ((gameState.runeCount ?? 0) > 0 ? 1 : 0) +
                  ((gameState.foodCount ?? 0) > 0 ? 1 : 0) +
                  ((gameState.potionCount ?? 0) > 0 ? 1 : 0);

                const isCompact = inventoryCount > 2;

                return (
                  <div className="flex flex-wrap gap-1">
                    {diaryEntries.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setHeroDiaryOpen(true)}
                        aria-haspopup="dialog"
                        className={
                          isCompact
                            ? "relative flex h-10 w-10 items-center justify-center rounded bg-[#333333] text-lg transition-colors hover:bg-[#444444]"
                            : "flex items-center gap-2 rounded bg-[#333333] px-2 py-0.5 text-xs text-white transition-colors hover:bg-[#444444]"
                        }
                        title={
                          isCompact
                            ? `Hero Diary${incompleteDiaryCount > 0 ? ` (${incompleteDiaryCount})` : ""}`
                            : "Open hero diary"
                        }
                      >
                        <span
                          aria-hidden="true"
                          className={
                            isCompact
                              ? ""
                              : "flex h-8 w-8 items-center justify-center rounded bg-[#2f2a25]/80 text-lg shadow-inner"
                          }
                        >
                          📖
                        </span>
                        {!isCompact && (
                          <span className="whitespace-nowrap">
                            Hero Diary
                            {incompleteDiaryCount > 0
                              ? ` (${incompleteDiaryCount})`
                              : ""}
                          </span>
                        )}
                        {isCompact && incompleteDiaryCount > 0 && (
                          <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">
                            {incompleteDiaryCount}
                          </span>
                        )}
                      </button>
                    )}
                    {gameState.hasKey && (
                      <div
                        className={
                          isCompact
                            ? "relative flex h-10 w-10 items-center justify-center rounded bg-[#333333] transition-colors hover:bg-[#444444]"
                            : "px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0 flex items-center gap-1"
                        }
                        title="Key"
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            display: "inline-block",
                            width: isCompact ? 28 : 20,
                            height: isCompact ? 28 : 20,
                            backgroundImage: "url(/images/items/key.png)",
                            backgroundSize: "contain",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                          }}
                        />
                        {!isCompact && <span>Key</span>}
                      </div>
                    )}
                    {gameState.hasExitKey && (
                      <div
                        className={
                          isCompact
                            ? "relative flex h-10 w-10 items-center justify-center rounded bg-[#333333] transition-colors hover:bg-[#444444]"
                            : "px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0 flex items-center gap-1"
                        }
                        title="Exit Key"
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            display: "inline-block",
                            width: isCompact ? 28 : 20,
                            height: isCompact ? 28 : 20,
                            backgroundImage: "url(/images/items/exit-key.png)",
                            backgroundSize: "contain",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                          }}
                        />
                        {!isCompact && <span>Exit Key</span>}
                      </div>
                    )}
                    {gameState.hasSword && (
                      <div
                        className={
                          isCompact
                            ? "relative flex h-10 w-10 items-center justify-center rounded bg-[#333333] transition-colors hover:bg-[#444444]"
                            : "px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0 flex items-center gap-1"
                        }
                        title="Sword"
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            display: "inline-block",
                            width: isCompact ? 32 : 24,
                            height: isCompact ? 32 : 24,
                            backgroundImage: "url(/images/items/sword.png)",
                            backgroundSize: "contain",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                          }}
                        />
                        {!isCompact && <span>Sword</span>}
                      </div>
                    )}
                    {gameState.hasShield && (
                      <div
                        className={
                          isCompact
                            ? "relative flex h-10 w-10 items-center justify-center rounded bg-[#333333] transition-colors hover:bg-[#444444]"
                            : "px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0 flex items-center gap-1"
                        }
                        title="Shield"
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            display: "inline-block",
                            width: isCompact ? 28 : 20,
                            height: isCompact ? 28 : 20,
                            backgroundImage: "url(/images/items/shield.png)",
                            backgroundSize: "contain",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                          }}
                        />
                        {!isCompact && <span>Shield</span>}
                      </div>
                    )}
                    {gameState.hasSnakeMedallion && (
                      <button
                        type="button"
                        onClick={handleSnakeMedallionClick}
                        className={
                          isCompact
                            ? "relative flex h-10 w-10 items-center justify-center rounded bg-[#333333] transition-colors hover:bg-[#444444]"
                            : "px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0 flex items-center gap-1"
                        }
                        title="Snake Medallion — Place or travel to portal"
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            display: "inline-block",
                            width: isCompact ? 28 : 20,
                            height: isCompact ? 28 : 20,
                            backgroundImage: "url(/images/items/snake-medalion.png)",
                            backgroundSize: "contain",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                          }}
                        />
                        {!isCompact && <span>Snake Medallion</span>}
                      </button>
                    )}
                    {(gameState.rockCount ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={handleThrowRock}
                        className={
                          isCompact
                            ? "relative flex h-10 w-10 items-center justify-center rounded bg-[#333333] transition-colors hover:bg-[#444444]"
                            : "relative px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0 flex items-center gap-1"
                        }
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
                        {isCompact ? (
                          <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">
                            {gameState.rockCount}
                          </span>
                        ) : (
                          <>
                            <span>Rock x{gameState.rockCount}</span>
                            <span className="ml-1 text-[10px] text-gray-300/80 whitespace-nowrap hidden sm:inline">
                              (tap or R)
                            </span>
                          </>
                        )}
                      </button>
                    )}
                    {(gameState.runeCount ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={handleThrowRune}
                        className={
                          isCompact
                            ? "relative flex h-10 w-10 items-center justify-center rounded bg-[#333333] transition-colors hover:bg-[#444444]"
                            : "px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0 flex items-center gap-1"
                        }
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
                        {isCompact ? (
                          <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">
                            {gameState.runeCount}
                          </span>
                        ) : (
                          <>
                            <span>Rune x{gameState.runeCount}</span>
                            <span className="ml-1 text-[10px] text-gray-300/80 whitespace-nowrap hidden sm:inline">
                              (tap or T)
                            </span>
                          </>
                        )}
                      </button>
                    )}
                    {(gameState.foodCount ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={handleUseFood}
                        className={
                          isCompact
                            ? "relative flex h-10 w-10 items-center justify-center rounded bg-[#333333] transition-colors hover:bg-[#444444]"
                            : "px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0 flex items-center gap-1"
                        }
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
                        {isCompact ? (
                          <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">
                            {gameState.foodCount}
                          </span>
                        ) : (
                          <>
                            <span>Food x{gameState.foodCount}</span>
                            <span className="ml-1 text-[10px] text-gray-300/80 whitespace-nowrap hidden sm:inline">
                              (tap or F)
                            </span>
                          </>
                        )}
                      </button>
                    )}
                    {(gameState.potionCount ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={handleUsePotion}
                        className={
                          isCompact
                            ? "relative flex h-10 w-10 items-center justify-center rounded bg-[#333333] transition-colors hover:bg-[#444444]"
                            : "px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0 flex items-center gap-1"
                        }
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
                        {isCompact ? (
                          <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">
                            {gameState.potionCount}
                          </span>
                        ) : (
                          <>
                            <span>Potion x{gameState.potionCount}</span>
                            <span className="ml-1 text-[10px] text-gray-300/80 whitespace-nowrap hidden sm:inline">
                              (tap or P)
                            </span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })()}
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
                {/* Death vignette overlay - darkens everything except spotlight on hero */}
                {shouldAnimateHeroDeath && heroDeathPhase !== "idle" && heroDeathPhase !== "complete" && heroDeathPositionRef.current && (
                  <div
                    aria-hidden="true"
                    className={styles.deathVignette}
                    style={{
                      opacity: heroDeathPhase === "spirit" ? 0 : 1,
                      transition: heroDeathPhase === "spirit" ? "opacity 900ms ease-out" : "opacity 400ms ease-in",
                    }}
                  />
                )}
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
                {heartEffect && (() => {
                  const tileSize = 40;
                  const pxLeft = (heartEffect.x + 0.5) * tileSize;
                  const pxTop = (heartEffect.y + 0.5) * tileSize;
                  const size = 11; // About 1/3 of original 32px
                  return (
                    <div
                      key={`heart-${heartEffect.createdAt}`}
                      aria-hidden="true"
                      className="absolute pointer-events-none"
                      style={{
                        left: `${pxLeft - size / 2}px`,
                        top: `${pxTop - size / 2}px`,
                        width: `${size}px`,
                        height: `${size}px`,
                        zIndex: 11000,
                        animation: "heartFloat 1s ease-out forwards",
                      }}
                    >
                      <img
                        src="/images/presentational/heart-red.png"
                        alt=""
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                        }}
                      />
                    </div>
                  );
                })()}
                <div
                  className={styles.gridContainer}
                  style={{
                    gridTemplateRows: `repeat(${gameState.mapData.tiles.length}, 40px)`,
                    gridTemplateColumns: `repeat(${(gameState.mapData.tiles[0]?.length ?? 0)}, 40px)`,
                    // When the hero's torch is OFF, force a pure black background behind tiles
                    // to avoid any hue from module CSS (e.g., --forest-dark) bleeding through
                    // the transparent center of the vignette.
                    backgroundColor: heroTorchLitForVisibility ? undefined : "#000",
                  }}
                  tabIndex={0} // Make div focusable for keyboard events
                  onMouseMove={(e) => {
                    if (process.env.NODE_ENV !== 'development') return;
                    if (gameState.mode !== 'story') return;
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const tileSize = 40;
                    const x = Math.floor((e.clientX - rect.left) / tileSize);
                    const y = Math.floor((e.clientY - rect.top) / tileSize);
                    const h = gameState.mapData.tiles.length;
                    const w = gameState.mapData.tiles[0]?.length ?? 0;
                    if (y >= 0 && y < h && x >= 0 && x < w) {
                      setHoverTile([y, x]);
                    } else {
                      setHoverTile(null);
                    }
                  }}
                  onMouseLeave={() => {
                    if (process.env.NODE_ENV !== 'development') return;
                    setHoverTile(null);
                  }}
                >
                {renderTileGrid(
                    gameState.mapData.tiles,
                    tileTypes,
                    gameState.mapData.subtypes,
                    environment,
                    gameState.showFullMap || suppressDarknessOverlay,
                    gameState.playerDirection,
                    gameState.enemies,
                    gameState.npcs,
                    gameState.hasSword,
                    gameState.hasShield,
                    heroTorchLitState,
                    suppressDarknessOverlay,
                    gameState.hasExitKey,
                    Boolean(gameState.conditions?.poisoned?.active),
                    timeOfDayState,
                    activeCheckpoint,
                    heroDeathStateForTiles
                  )}
                </div>
              </div>
            </div>
          </div>
          {!isDailyChallenge && (
            <div
              className="absolute bottom-4 left-4 pointer-events-none"
              style={{ zIndex: 12000 }}
            >
              <DayNightMeter
                timeOfDay={timeOfDayState}
                className="pointer-events-auto"
                variant={gameState.mode === 'story' ? 'story' : 'rich'}
                sunIconUrl={gameState.mode === 'story' ? '/images/presentational/sun.png' : undefined}
                moonIconUrl={gameState.mode === 'story' ? '/images/presentational/moon.png' : undefined}
              />
            </div>
          )}
        </div>
        {/* Close centering wrapper */}
        </div>
      </div>

      {gameState.mode === 'story' && gameState.currentRoomId && showRoomLabel && (() => {
        const roomId = gameState.currentRoomId;
        const room = gameState.rooms?.[roomId];
        const label = room?.metadata?.displayLabel as string | undefined;
        if (!label) return null;
        return (
          <div
            className="fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-black/80 text-white text-sm font-semibold pointer-events-none shadow-lg border border-white/20 transition-opacity duration-300"
            style={{ zIndex: 14000 }}
          >
            {label}
          </div>
        );
      })()}

      {process.env.NODE_ENV === 'development' && gameState.mode === 'story' && hoverTile && (
        <div
          aria-live="polite"
          className="fixed bottom-4 right-4 text-xs px-2 py-1 rounded bg-black/70 text-white pointer-events-none shadow"
          style={{ zIndex: 14000 }}
        >
          y {hoverTile[0]}, x {hoverTile[1]}
        </div>
      )}

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
      {dialogueActive && activeDialogueLine && (
        <DialogueOverlay
          speaker={activeDialogueSpeaker}
          text={activeDialogueFullText}
          renderedText={dialogueRendered}
          isTyping={dialogueTyping}
          hasMore={currentDialogueHasMore}
          onAdvance={handleDialogueAdvance}
          choices={activeDialogueChoices?.map((choice) => ({
            id: choice.id,
            label: choice.prompt,
          }))}
          selectedChoiceIndex={selectedChoiceIndex}
          onSelectChoice={handleDialogueChoiceSelect}
          textInput={activeDialogueLine.textInput ? {
            prompt: activeDialogueLine.textInput.prompt,
            placeholder: activeDialogueLine.textInput.placeholder,
            maxLength: activeDialogueLine.textInput.maxLength,
          } : undefined}
          onTextInputSubmit={handleTextInputSubmit}
        />
      )}

      {activeBookshelfId && (
        <BookshelfMenu
          bookshelfId={activeBookshelfId}
          storyFlags={gameState.storyFlags ?? {}}
          onClose={() => setActiveBookshelfId(null)}
          onReadExcerpt={(eventId) => {
            setGameState((prev) => {
              const next = applyStoryEffectsWithDiary(
                prev.storyFlags,
                prev.diaryEntries,
                [{ eventId, value: true }]
              );
              const updated = {
                ...prev,
                storyFlags: next.flags,
                diaryEntries: next.diaryEntries,
              };
              CurrentGameStorage.saveCurrentGame(updated, resolvedStorageSlot);
              return updated;
            });
          }}
        />
      )}
      
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
  activeCheckpoint?: [number, number] | null,
  heroDeathState?: HeroDeathState
) {
  const resolvedEnvironment = environment ?? DEFAULT_ENVIRONMENT;
  const resolvedTimeOfDay = timeOfDay ?? createInitialTimeOfDay();
  const timeOfDayVisual = DAY_PHASE_CONFIG[resolvedTimeOfDay.phase];
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
  const heroTorchLitForVisibility = suppressDarknessOverlay ? true : heroTorchLit;

  const visibility = calculateVisibility(
    grid,
    playerPosition,
    showFullMap,
    heroTorchLitForVisibility
  );

  // Precompute torch glow positions by scanning for WALL_TORCH subtypes
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

  const npcMap = new Map<string, NPC>();
  if (npcs) {
    for (const npc of npcs) {
      npcMap.set(`${npc.y},${npc.x}`, npc);
    }
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
      const isTorchCarrier = torchCarrierPositions.has(`${rowIndex},${colIndex}`);
      if (isSelfTorch || isTorchCarrier) tier = Math.max(tier, 3);
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
            heroDeathState={isPlayerTile ? heroDeathState : undefined}
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

    // Push the warm torch glow first (lower z) ONLY if the hero's torch is lit,
    // then the dark vignette (higher z) ONLY when torch is lit as well.
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
