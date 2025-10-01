import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  TileType,
  GameState,
  Direction,
  movePlayer,
  TileSubtype,
  reviveFromLastCheckpoint,
  type TimeOfDayState,
  createInitialTimeOfDay,
  DAY_PHASE_CONFIG,
} from "../../lib/map";
import type { Enemy } from "../../lib/enemy";
import { canSee, calculateDistance } from "../../lib/line_of_sight";
import {
  getEnemyIcon,
  createEmptyByKind,
  EnemyRegistry,
} from "../../lib/enemies/registry";
import MobileControls from "../MobileControls";
import styles from "../TilemapGrid.module.css";
import { useRouter } from "next/navigation";
// Daily flow is handled by parent via onDailyComplete when isDailyChallenge is true
import { trackGameComplete, trackPickup } from "../../lib/analytics";
import { DateUtils } from "../../lib/date_utils";
import { computeMapId } from "../../lib/map";
import { CurrentGameStorage, type GameStorageSlot } from "../../lib/current_game_storage";
import {
  DEFAULT_ENVIRONMENT,
  type EnvironmentId,
  getEnvironmentConfig,
} from "../../lib/environment";
import HealthDisplay from "../HealthDisplay";
import EnemyHealthDisplay from "../EnemyHealthDisplay";
import { ScreenShake } from "../ScreenShake";
import ItemPickupAnimation from "../ItemPickupAnimation";
import DialogueOverlay from "../DialogueOverlay";
import { useTypewriter } from "../../lib/dialogue/useTypewriter";
import {
  getDialogueScript,
  type DialogueChoice,
  type DialogueLine,
} from "../../lib/story/dialogue_registry";
import { resolveNpcDialogueScript } from "../../lib/story/npc_script_registry";
import { createInitialStoryFlags } from "../../lib/story/event_registry";
import { applyStoryEffectsWithDiary } from "../../lib/story/event_registry";
import { updateConditionalNpcs } from "../../lib/story/story_mode";
import { HeroDiaryModal } from "../HeroDiaryModal";
import DayNightMeter from "../DayNightMeter";

import { renderTileGrid, calculateMapTransform } from "./visuals";

import { cloneDialogueLines, type DialogueSession } from "./dialogue";
import { useProjectileHandlers } from "./hooks/useProjectileHandlers";
import { useInventoryActions } from "./hooks/useInventoryActions";
// Grid dimensions will be derived from provided map data

export interface TilemapGridProps {
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

  // Screen shake state
  const [isShaking, setIsShaking] = useState(false);

  const triggerScreenShake = useCallback((duration = 200) => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), duration);
  }, [setIsShaking]);

  // Item pickup animation state
  const [itemPickupAnimations, setItemPickupAnimations] = useState<Array<{
    id: string;
    itemType: string;
  }>>([]);

  const [isHeroDiaryOpen, setHeroDiaryOpen] = useState(false);

  // Developer hover coordinates for story mode (dev only)
  const [hoverTile, setHoverTile] = useState<[number, number] | null>(null);

  const [dialogueSession, setDialogueSession] = useState<DialogueSession | null>(null);
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState<number>(0);
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

  const {
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
  } = useProjectileHandlers({
    playerPosition,
    resolvedStorageSlot,
    setGameState,
    triggerScreenShake,
  });

  const { handleUseFood, handleUsePotion, handleDiaryToggle } =
    useInventoryActions({ setGameState, resolvedStorageSlot });

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
      setDialogueSession((prev) => {
        if (!prev) return prev;
        const currentLine = prev.script[prev.lineIndex];
        if (!currentLine || !currentLine.options) return prev;
        const choice = currentLine.options.find((option) => option.id === choiceId);
        if (!choice) return prev;

        if (choice.effects && choice.effects.length > 0) {
          setGameState((state) => {
            const result = applyStoryEffectsWithDiary(
              state.storyFlags,
              state.diaryEntries,
              choice.effects
            );
            if (!result.flagsChanged && !result.diaryChanged) {
              return state;
            }
            const nextState: GameState = {
              ...state,
              storyFlags: result.flags ?? state.storyFlags,
              diaryEntries: result.diaryEntries ?? state.diaryEntries ?? [],
            };
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
    [resetDialogue, resolvedStorageSlot, setGameState]
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
      if (Math.abs(dy) > Math.abs(dx)) {
        faceDir = dy > 0 ? Direction.DOWN : Direction.UP;
      } else if (Math.abs(dx) > 0) {
        faceDir = dx > 0 ? Direction.RIGHT : Direction.LEFT;
      }
      npc.face(faceDir);
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
        ? resolveNpcDialogueScript(npc.id, flags)
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
    triggerScreenShake,
  ]);

  useEffect(() => {
    const queue = gameState.npcInteractionQueue;
    if (!queue || queue.length === 0) return;
    const last = queue[queue.length - 1];
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

  // Redirect to end page OR signal completion (daily) and persist snapshot on death (heroHealth <= 0)
  useEffect(() => {
    if (gameState.heroHealth > 0 || gameCompletionProcessed) {
      return;
    }

    const revivedState = reviveFromLastCheckpoint(gameState);
    if (revivedState) {
      triggerScreenShake(400);
      setGameState(revivedState);
      CurrentGameStorage.saveCurrentGame(revivedState, resolvedStorageSlot);
      return;
    }

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
    triggerScreenShake,
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
    [
      gameState,
      playerPosition,
      resolvedStorageSlot,
      setBamEffect,
      setFloating,
      setSpirits,
    ]
  );

  const handleMoveInput = useCallback(
    (direction: Direction) => {
      if (dialogueActive) {
        handleDialogueAdvance();
        return;
      }
      handlePlayerMove(direction);
    },
    [dialogueActive, handleDialogueAdvance, handlePlayerMove]
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
  ]);

  return (
    <div className="relative">
      {isHeroDiaryOpen && (
        <HeroDiaryModal
          entries={diaryEntries}
          onClose={() => setHeroDiaryOpen(false)}
          onToggleComplete={handleDiaryToggle}
        />
      )}
      <ScreenShake isShaking={isShaking} intensity={4} duration={300}>
        <div
          className="relative flex justify-center"
          data-testid="tilemap-grid-wrapper"
        >
        {checkpointFlash && (
          <div className="absolute top-4 right-4 z-50">
            <div className="rounded-md bg-emerald-600/90 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-900/50">
              Checkpoint reached
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
              <div className="flex flex-wrap gap-1">
                {diaryEntries.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setHeroDiaryOpen(true)}
                    aria-haspopup="dialog"
                    className="flex items-center gap-2 rounded bg-[#333333] px-2 py-0.5 text-xs text-white transition-colors hover:bg-[#444444]"
                    title="Open hero diary"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 items-center justify-center rounded bg-[#2f2a25]/80 text-lg shadow-inner"
                    >
                      📖
                    </span>
                    <span className="whitespace-nowrap">
                      Hero Diary
                      {incompleteDiaryCount > 0
                        ? ` (${incompleteDiaryCount})`
                        : ""}
                    </span>
                  </button>
                )}
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
                    activeCheckpoint
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

      {gameState.mode === 'story' && gameState.currentRoomId && (() => {
        const roomId = gameState.currentRoomId;
        const room = gameState.rooms?.[roomId];
        const label = room?.metadata?.displayLabel as string | undefined;
        if (!label) return null;
        return (
          <div
            className="fixed top-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-black/80 text-white text-sm font-semibold pointer-events-none shadow-lg border border-white/20"
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

