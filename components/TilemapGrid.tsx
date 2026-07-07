import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  TileType,
  GameState,
  Direction,
  movePlayer,
  TileSubtype,
  performThrowRock,
  performThrowRune,
  performThrowBomb,
  performUseFood,
  performUsePotion,
  performUsePinkHeart,
  performUseBerry,
  reviveFromLastCheckpoint,
  serializeEnemies,
  serializeNPCs,
  type RoomSnapshot,
} from "../lib/map";
import { findPlayerPosition, removePlayerFromMapData } from "../lib/map/player";
import type { Enemy } from "../lib/enemy";
import { rehydrateEnemies } from "../lib/enemy";
import type { NPC, NPCInteractionEvent } from "../lib/npc";
import { rehydrateNPCs } from "../lib/npc";
import { canSee, calculateDistance } from "../lib/line_of_sight";
import {
  Tile,
  combatLungeStyle,
  type CombatLunge,
  type HeroDeathPhase,
  type HeroDeathState,
} from "./Tile";
import {
  getEnemyIcon,
  createEmptyByKind,
  EnemyRegistry,
  type EnemyKind,
} from "../lib/enemies/registry";
import MobileControls from "./MobileControls";
import PixelFlame, { HERO_FLAME_ANCHOR } from "./PixelFlame";
import styles from "./TilemapGrid.module.css";
import {
  computeTorchGlow,
  ADJACENT_GLOW,
  DIAGONAL_GLOW,
  SECOND_RING_GLOW,
} from "../lib/torch_glow";
import {
  SMOOTH_TUNING,
  isSmoothMovementEnabled,
  heroSpritePath,
  smoothEaseInOut,
  type SmoothEntityStep,
} from "../lib/smooth_movement";

// One tile-step camera tween (smooth movement).
type SmoothStepTween = {
  fromR: number;
  fromC: number;
  toR: number;
  toC: number;
  start: number;
  dur: number;
  running: boolean;
};
import { useRouter } from "next/navigation";
// Daily flow is handled by parent via onDailyComplete when isDailyChallenge is true
import {
  trackGameComplete,
  trackUse,
  trackPickup,
  trackPinkRealmReached,
  trackOutsideWorldReached,
  trackOutsideTreeDestroyed,
  trackFloorAdvance,
} from "../lib/analytics";
import { DateUtils } from "../lib/date_utils";
import { hashStringToSeed } from "../lib/rng";
import { computeMapId, advanceToNextFloor, advanceToNextEndlessFloor } from "../lib/map";
import { EndlessStorage } from "../lib/endless_storage";
import {
  startEndlessRun,
  reportEndlessCheckpoint,
  submitEndlessRun,
} from "../lib/endless_leaderboard";
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
import { BedInteractionModal } from "./BedInteractionModal";
import { DeathScreen } from "./DeathScreen";
import {
  getDialogueScript,
  type DialogueChoice,
  type DialogueLine,
} from "../lib/story/dialogue_registry";
import { resolveNpcDialogueScript } from "../lib/story/npc_script_registry";
import { trackTutorialBeat } from "../lib/posthog_analytics";
import { createInitialStoryFlags, type StoryEffect } from "../lib/story/event_registry";
import { performExchange } from "../lib/story/exchange_registry";
import { applyStoryEffectsWithDiary } from "../lib/story/event_registry";
import { updateConditionalNpcs } from "../lib/story/story_mode";
import { HeroDiaryModal } from "./HeroDiaryModal";
import { FloorTransition } from "./FloorTransition";
import { PinkRealmSparkles } from "./PinkRealmSparkles";

type DialogueSession = {
  event: NPCInteractionEvent;
  script: DialogueLine[];
  lineIndex: number;
  dialogueId: string;
  consumedScriptIds: string[];
};

// Enemies whose registry config flags them as carrying a lit torch: they render
// glowing in darkness, and melee-striking them relights the hero's torch.
const TORCH_CARRIER_ENEMIES = new Set<EnemyKind>(
  (Object.keys(EnemyRegistry) as EnemyKind[]).filter(
    (k) => EnemyRegistry[k].carriesTorch
  )
);

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

// Floating combat-number colors. Each entity's HP change is shown in that
// entity's own color so it's instantly clear WHO took the hit: enemy damage
// uses the enemy's body color, hero damage uses the hero's skin tone, and
// healing stays green (the one intuitive "good" color).
const ENEMY_NUMBER_COLOR: Record<string, string> = {
  "fire-goblin": "#ff6b4a",
  "water-goblin": "#5aa9ff",
  "water-goblin-spear": "#5aa9ff",
  "earth-goblin": "#c5894f",
  "earth-goblin-knives": "#c5894f",
  "pink-goblin": "#ff77d6",
  "stone-goblin": "#aeb6bd",
  "white-goblin": "#eaeaea",
  snake: "#74e06f",
  ghost: "#c3eeff",
};
const HERO_DAMAGE_COLOR = "#f1c27d"; // hero skin tone — clearly "the hero lost HP"
const HERO_HEAL_COLOR = "#6afc7a"; // green = healing
const MISS_COLOR = "#c9c9c9"; // muted gray for a 0-damage "miss"

type FloatingNumber = {
  id: string;
  y: number;
  x: number;
  amount: number;
  target: "enemy" | "hero";
  sign: "+" | "-";
  kind?: string; // enemy kind (for enemy-colored numbers)
  miss?: boolean; // true => render "miss" instead of a value
  createdAt: number;
};

function floatingColor(f: Pick<FloatingNumber, "target" | "sign" | "kind" | "miss">): string {
  if (f.miss) return MISS_COLOR;
  if (f.target === "hero") return f.sign === "+" ? HERO_HEAL_COLOR : HERO_DAMAGE_COLOR;
  return (f.kind && ENEMY_NUMBER_COLOR[f.kind]) || ENEMY_NUMBER_COLOR["fire-goblin"];
}

/**
 * Run-level progress properties attached to every game_complete event so
 * completions can be sliced by completionist behaviour (chests), loadout
 * (sword/shield), and hidden-area exploration (outside world / pink realm).
 * total_chests is summed from the pre-computed per-floor allocation.
 */
function runProgressProps(gs: GameState) {
  const totalChests = Object.values(gs.floorChestAllocation ?? {}).reduce(
    (sum, alloc) => sum + (alloc?.chests ?? 0),
    0
  );
  return {
    chestsOpened: gs.stats?.chestsOpened ?? 0,
    totalChests,
    hasSword: !!gs.hasSword,
    hasShield: !!gs.hasShield,
    treesDestroyed: gs.stats?.treesDestroyed ?? 0,
    wallsDestroyed: gs.stats?.wallsDestroyed ?? 0,
    reachedOutsideWorld: !!gs.reachedOutsideWorld,
    reachedPinkRealm: !!gs.reachedPinkRealm,
  };
}

interface TilemapGridProps {
  tilemap?: number[][];
  tileTypes: Record<number, TileType>;
  subtypes?: number[][][];
  initialGameState?: GameState;
  forceDaylight?: boolean; // when true, override lighting to full visibility
  isDailyChallenge?: boolean; // when true, handle daily challenge completion
  onDailyComplete?: (result: "won" | "lost") => void; // when daily, signal result instead of routing
  /**
   * Non-daily win hook. Fires once when the player wins outside daily mode.
   * When provided, suppresses the default `/end` redirect + lastGame save —
   * the parent takes full responsibility for what comes next (e.g. /new
   * uses this to hand off to /daily-new floor 2 with carried inventory).
   */
  onWin?: (finalState: GameState) => void;
  storageSlot?: GameStorageSlot;
  // Notify parent where the hero is (floor number + pink realm status) so it
  // can render a location title. Fires on mount and whenever either changes.
  onLocationChange?: (loc: { floor?: number; inPinkRealm: boolean }) => void;
}

export const TilemapGrid: React.FC<TilemapGridProps> = ({
  tilemap,
  tileTypes,
  subtypes,
  initialGameState,
  forceDaylight = process.env.NODE_ENV !== "test",
  isDailyChallenge = false,
  onDailyComplete,
  onWin,
  storageSlot,
  onLocationChange,
}) => {
  const router = useRouter();

  const resolvedStorageSlot: GameStorageSlot = storageSlot
    ? storageSlot
    : isDailyChallenge
    ? 'daily-new'
    : 'default';

  // Endless mode: unbounded floors, per-run seed, floor-reached scorekeeping.
  const isEndless = resolvedStorageSlot === 'endless';

  // Play the death cinematic (spin/topple or abyss-sink -> spirit) in story AND
  // daily/endless, so death reads as a transition instead of an instant cut to results.
  const shouldAnimateHeroDeath =
    resolvedStorageSlot === 'story' || isDailyChallenge || isEndless;

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
        heroMaxHealth: 5,
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
  // Daily death: fade to black during the spirit phase, bridging into the results screen.
  const [deathFade, setDeathFade] = useState(false);

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
  // Transient flying bomb effect (travels to its resting tile before it arms)
  const [bombThrowEffect, setBombThrowEffect] = useState<null | {
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

  // Floor transition iris wipe state
  const [floorTransition, setFloorTransition] = useState<{
    closeCenter: { x: number; y: number };
    openCenter: { x: number; y: number } | null; // null until floor swap happens
    pendingGameState: GameState | null; // the next-floor state, computed eagerly
  } | null>(null);
  // When true, the hero sprite flickers (dematerializes) during the active iris transition.
  // Set only for pink-realm warps, not ordinary floor changes.
  const [warpFlicker, setWarpFlicker] = useState(false);

  const [dialogueSession, setDialogueSession] = useState<DialogueSession | null>(null);
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState<number>(0);
  // Brightness A/B prototype: `?bright=1` opts into the lifted lighting defined
  // under `.bright-mode` in globals.css. Default (no param) is untouched. Read
  // on mount to avoid an SSR/client class mismatch.
  const [brightMode, setBrightMode] = useState<boolean>(false);
  useEffect(() => {
    try {
      setBrightMode(
        new URLSearchParams(window.location.search).get("bright") === "1"
      );
    } catch {}
  }, []);
  const [activeBookshelfId, setActiveBookshelfId] = useState<string | null>(null);
  const [activeBedInteraction, setActiveBedInteraction] = useState<{
    bedId: string;
    position: [number, number];
    isOccupied: boolean;
  } | null>(null);
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
            // Cross-room travel - save current room and load target room
            setGameState((prev) => {
              const updatedRooms: Record<string, RoomSnapshot> = { ...prev.rooms };
              
              // Save current room state
              if (currentRoomId && updatedRooms[currentRoomId]) {
                updatedRooms[currentRoomId] = {
                  ...updatedRooms[currentRoomId],
                  mapData: removePlayerFromMapData(prev.mapData),
                  enemies: serializeEnemies(prev.enemies),
                  npcs: serializeNPCs(prev.npcs),
                  potOverrides: prev.potOverrides ? { ...prev.potOverrides } : undefined,
                };
              }
              
              // Load target room
              const targetRoom = updatedRooms[targetRoomId];
              if (!targetRoom) {
                return prev; // Room doesn't exist, abort
              }
              
              // Clone target room map and place player at portal location
              const nextMapData = JSON.parse(JSON.stringify(targetRoom.mapData));
              const [newY, newX] = targetPos;
              const dest = nextMapData.subtypes[newY][newX] || [];
              const filtered = dest.filter((t: number) => t !== TileSubtype.PLAYER);
              if (!filtered.includes(TileSubtype.PLAYER)) {
                filtered.push(TileSubtype.PLAYER);
              }
              nextMapData.subtypes[newY][newX] = filtered;
              
              // Rehydrate enemies and NPCs from target room
              const nextEnemies = rehydrateEnemies(targetRoom.enemies || []);
              const nextNpcs = rehydrateNPCs(targetRoom.npcs || []);
              
              const nextState: GameState = {
                ...prev,
                mapData: nextMapData,
                currentRoomId: targetRoomId,
                rooms: updatedRooms,
                enemies: nextEnemies,
                npcs: nextNpcs,
                potOverrides: targetRoom.potOverrides ? { ...targetRoom.potOverrides } : undefined,
              };
              
              CurrentGameStorage.saveCurrentGame(nextState, resolvedStorageSlot);
              return nextState;
            });
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

  // Handle using the pink flaming heart prize (full heal + 3 temporary pink hearts)
  const handleUsePinkHeart = useCallback(() => {
    try {
      trackUse("pink_heart");
    } catch {}
    setGameState((prev) => {
      const newState = performUsePinkHeart(prev);
      CurrentGameStorage.saveCurrentGame(newState, resolvedStorageSlot);
      return newState;
    });
  }, [resolvedStorageSlot]);

  // Handle using a belted berry (heal 2-3)
  const handleUseBerry = useCallback(() => {
    try {
      trackUse("berry");
    } catch {}
    setGameState((prev) => {
      const newState = performUseBerry(prev);
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
    const prev = gameState;
    const count = prev.runeCount ?? 0;
    if (count <= 0) return;
    const pos = playerPosition;
    if (!pos) return;
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

    // Resolve the throw FIRST so we know exactly which enemies died, then keep
    // the current (pre-move) board on screen until the rune lands. The target
    // may move during its own turn, but the projectile should still connect
    // with the goblin the player SEES — and its ghost should rise there, at the
    // same instant the bang appears. So we line the projectile, the bang, and
    // the ghost all up on the pre-move tile rather than popping the goblin early
    // and dropping its ghost on the tile it had walked to.
    const next = performThrowRune(prev);
    const nextIds = new Set((next.enemies ?? []).map((e) => e.id));
    // Ghosts rise at each killed enemy's LAST VISIBLE (pre-move) tile.
    const killedGhosts: Array<[number, number]> = (prev.enemies ?? [])
      .filter((e) => !nextIds.has(e.id))
      .map((e) => [e.y, e.x] as [number, number]);

    // Compute the projectile path against PRE-move positions (what is on screen
    // during the flight). Stop at the first enemy / pot / wall.
    const path: Array<[number, number]> = [];
    let ty = py,
      tx = px;
    let impact: { y: number; x: number } | null = null;
    const preEnemies = prev.enemies ?? [];
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
      // If wall, stop before entering wall (rune drops on the last floor tile)
      if (prev.mapData.tiles[ty][tx] !== 0) {
        const last = path[path.length - 1];
        if (last) impact = { y: last[0], x: last[1] };
        break;
      }
      path.push([ty, tx]);
      if (preEnemies.some((e) => e.y === ty && e.x === tx)) {
        impact = { y: ty, x: tx };
        break;
      }
      const subs = prev.mapData.subtypes[ty][tx] || [];
      if (subs.includes(TileSubtype.POT)) {
        impact = { y: ty, x: tx };
        break;
      }
    }

    // Commit the resolved outcome AND fire the impact VFX together, so the rune
    // landing, the bang, the goblin vanishing, and its ghost all happen at the
    // same instant on the same tile.
    const commitAndImpact = () => {
      CurrentGameStorage.saveCurrentGame(next, resolvedStorageSlot);
      setGameState(next);
      if (impact) {
        const bamIdx = 1 + Math.floor(Math.random() * 3);
        setBamEffect({
          y: impact.y,
          x: impact.x,
          src: `/images/items/bam${bamIdx}.png`,
        });
        setTimeout(() => setBamEffect(null), 300);
        triggerScreenShake();
      }
      if (killedGhosts.length > 0) {
        const now = Date.now();
        setSpirits((prevS) => {
          const out = [...prevS];
          for (const [gy, gx] of killedGhosts) {
            const id = `${gy},${gx}-${now}-${Math.random()
              .toString(36)
              .slice(2, 7)}`;
            out.push({ id, y: gy, x: gx, createdAt: now });
            setTimeout(() => {
              setSpirits((curr) => curr.filter((s) => s.id !== id));
            }, 2000);
          }
          return out;
        });
      }
    };

    // Animate the rune, then land everything as it reaches the impact tile.
    const stepMs = 50;
    if (path.length > 0) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let idx = 0;
      setRuneEffect({ y: path[0][0], x: path[0][1], id });
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
      // Land the outcome + VFX exactly as the rune reaches the impact tile.
      setTimeout(commitAndImpact, path.length * stepMs + 10);
    } else {
      // No travel (blocked immediately) — resolve now.
      commitAndImpact();
    }
  }, [gameState, playerPosition, resolvedStorageSlot]);

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
              let updatedRooms = prev.rooms;
              if (prev.portalLocation) {
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
                } else if (prev.rooms) {
                  // Different room - remove portal from old room's snapshot
                  updatedRooms = { ...prev.rooms };
                  const oldRoomSnapshot = updatedRooms[oldRoomId];
                  if (oldRoomSnapshot && oldRoomSnapshot.mapData) {
                    const oldRoomMapData = JSON.parse(JSON.stringify(oldRoomSnapshot.mapData));
                    const oldSubs = oldRoomMapData.subtypes[oldPos[0]][oldPos[1]] || [];
                    oldRoomMapData.subtypes[oldPos[0]][oldPos[1]] = oldSubs.filter(
                      (s: number) => s !== TileSubtype.PORTAL
                    );
                    updatedRooms[oldRoomId] = {
                      ...oldRoomSnapshot,
                      mapData: oldRoomMapData,
                    };
                  }
                }
              }
              
              // Add portal to new location in current map
              const newMapData = JSON.parse(JSON.stringify(prev.mapData));
              const newSubs = newMapData.subtypes[py][px] || [];
              if (!newSubs.includes(TileSubtype.PORTAL)) {
                newMapData.subtypes[py][px] = [...newSubs, TileSubtype.PORTAL];
              }
              
              const nextState: GameState = {
                ...prev,
                mapData: newMapData,
                rooms: updatedRooms,
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

  // Handle throwing a bomb. Unlike a rock it does not detonate on impact: it comes to
  // rest on the floor tile before the wall and arms a 1-turn fuse (see performThrowBomb).
  // The detonation + explosion VFX fire on the player's next turn.
  //
  // NOTE: all side effects (flight animation + arming) run in the handler body and arm
  // the bomb by setting a VALUE (not a function updater). React StrictMode double-invokes
  // state *updater functions* in dev; doing the work here instead keeps it to a single
  // throw (an earlier version set up the flight inside an updater, so StrictMode ran it
  // twice — detonating the first bomb on impact and arming a second).
  const handleThrowBomb = useCallback(() => {
    try {
      trackUse("bomb");
    } catch {}
    if ((gameState.bombCount ?? 0) <= 0) return;
    const pos = playerPosition;
    if (!pos) return;
    const [py, px] = pos;

    // Direction vector
    let vx = 0,
      vy = 0;
    switch (gameState.playerDirection) {
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

    // Mirror performThrowBomb's resting logic: travel over floor up to 4 tiles, stopping
    // before the first wall/obstacle/edge OR enemy. The path is the floor tiles the flying
    // bomb visibly crosses before it comes to rest.
    const bombEnemies = gameState.enemies ?? [];
    const path: Array<[number, number]> = [];
    for (let step = 1; step <= 4; step++) {
      const ny = py + vy * step;
      const nx = px + vx * step;
      if (
        ny < 0 ||
        ny >= gameState.mapData.tiles.length ||
        nx < 0 ||
        nx >= gameState.mapData.tiles[0].length
      )
        break;
      const tile = gameState.mapData.tiles[ny][nx];
      if (tile !== 0 && tile !== 5) break; // not FLOOR/FLOWERS
      if (bombEnemies.some((e) => e.y === ny && e.x === nx)) break; // stop in front of enemy
      path.push([ny, nx]);
    }

    // Arm the bomb (this is the throw "turn"). Computing a value and setting it — rather
    // than passing an updater function — is the StrictMode-safe pattern used by movePlayer,
    // so performThrowBomb's enemy tick runs exactly once.
    const arm = () => {
      const next = performThrowBomb(gameState);
      CurrentGameStorage.saveCurrentGame(next, resolvedStorageSlot);
      setGameState(next);
    };

    // No travel (a wall is right in front) — the bomb rests at the player's feet, arm now.
    if (path.length === 0) {
      arm();
      return;
    }

    // Animate the bomb flying to its resting tile, then arm it.
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let idx = 0;
    setBombThrowEffect({ y: path[0][0], x: path[0][1], id });
    const stepMs = 45;
    const interval = setInterval(() => {
      idx += 1;
      if (idx >= path.length || !path[idx]) {
        clearInterval(interval);
        setBombThrowEffect((cur) => (cur && cur.id === id ? null : cur));
        arm();
        return;
      }
      const [ny, nx] = path[idx];
      setBombThrowEffect((cur) =>
        cur && cur.id === id ? { ...cur, y: ny, x: nx } : cur
      );
    }, stepMs);
    // Safety: clear the effect after 1s in case the interval is interrupted.
    setTimeout(() => {
      setBombThrowEffect((cur) => (cur && cur.id === id ? null : cur));
    }, 1000);
  }, [gameState, playerPosition, resolvedStorageSlot]);

  // Handle throwing a rock: animate a rock moving up to 4 tiles, then update game state via
  // performThrowRock. All side effects run in the handler body and state is applied as a
  // VALUE (not a function updater), so React StrictMode's dev double-invoke can't double-throw.
  const handleThrowRock = useCallback(() => {
    try {
      trackUse("rock");
    } catch {}
    const prev = gameState;
    const count = prev.rockCount ?? 0;
    if (count <= 0) return;
    const pos = playerPosition;
    if (!pos) return;
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

    // Capture pre-throw enemy snapshots by id: the engine mutates Enemy
    // instances in place (they move and take damage during the throw's enemy
    // turn), so this is the only reliable "before" view for the floating
    // damage number.
    const preHealthById = new Map<string, number>();
    const preKindById = new Map<string, string>();
    for (const e of prev.enemies ?? []) {
      preHealthById.set(e.id, e.health);
      preKindById.set(e.id, e.kind);
    }

    // Resolve the throw FIRST so we know exactly what the rock hit and which
    // enemies died — but keep the current (pre-move) board on screen until the
    // rock actually lands. The enemy the engine moved + killed this turn should
    // stay visible under the incoming rock, then vanish as the bang hits, so the
    // ghost lines up with the impact instead of dying on the tile it walked to.
    const next = performThrowRock(prev);
    const nextIds = new Set((next.enemies ?? []).map((e) => e.id));
    // Ghosts rise at each killed enemy's LAST VISIBLE (pre-move) tile.
    const killedGhosts: Array<[number, number]> = (prev.enemies ?? [])
      .filter((e) => !nextIds.has(e.id))
      .map((e) => [e.y, e.x] as [number, number]);

    // Build the projectile path against PRE-move positions (what is on screen
    // during the flight). Stop at the first enemy / pot / wall along the ray.
    const path: Array<[number, number]> = [];
    let ty = py,
      tx = px;
    let impact: { y: number; x: number } | null = null;
    let impactEnemyId: string | null = null;
    const preEnemies = prev.enemies ?? [];
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
      // First enemy on the ray at its VISIBLE (pre-move) tile.
      const enemyPre = preEnemies.find((e) => e.y === ty && e.x === tx);
      if (enemyPre) {
        impact = { y: ty, x: tx };
        impactEnemyId = enemyPre.id;
        break;
      }
      const preSubs = prev.mapData.subtypes[ty]?.[tx] || [];
      if (preSubs.includes(TileSubtype.POT)) {
        impact = { y: ty, x: tx };
        break;
      }
    }

    // A surviving enemy the rock hit ALSO moved this turn. Rock KILLS (<=2 HP)
    // are frozen by the engine so they read cleanly, but a survivor walks first
    // and then takes the hit. If we kept the pre-move impact above, the bang
    // would land on the tile it left and it would appear to "jump" to where it
    // walked. Instead: commit the move up front so the enemy visibly takes its
    // step, and home the rock to its POST-move tile so the bang connects where
    // it actually ends up. Gameplay is unchanged — only the timing/target of
    // the VFX. The rock deals a flat 2, so the survivor is the enemy whose HP
    // dropped by exactly 2 this turn.
    // Only worth doing in smooth mode: the homing relies on the enemy sliding
    // to its post-move tile. Without smooth movement there is no slide (the
    // sprite renders at its logical tile), so committing up front would just
    // teleport it early — keep the pre-move impact path in that case.
    let earlyCommit = false;
    const rockDamaged = (next.enemies ?? []).find((e) => {
      const preH = preHealthById.get(e.id);
      return preH != null && preH - (e.health ?? 0) === 2;
    });
    if (rockDamaged && smoothEnabled) {
      const colinear = vy === 0 ? rockDamaged.y === py : rockDamaged.x === px;
      const forward =
        vy !== 0
          ? Math.sign(rockDamaged.y - py) === vy
          : Math.sign(rockDamaged.x - px) === vx;
      const dist = Math.abs(rockDamaged.y - py) + Math.abs(rockDamaged.x - px);
      if (colinear && forward && dist >= 1 && dist <= 4) {
        earlyCommit = true;
        impact = { y: rockDamaged.y, x: rockDamaged.x };
        impactEnemyId = rockDamaged.id;
        // Re-aim the projectile path straight to the post-move tile.
        path.length = 0;
        let cy = py;
        let cx = px;
        for (let s = 0; s < dist; s++) {
          cy += vy;
          cx += vx;
          path.push([cy, cx]);
        }
      }
    }

    const applyState = () => {
      // Enemies that stepped into a freshly-opened pit during this throw's enemy
      // turn dive in with the same shrink/fall as on a movement turn (the move
      // handler owns that spawn, so replicate it here). Clear the transient after
      // so the dive isn't replayed on the next turn.
      const fell = (next.defeatedEnemies ?? []).filter((d) =>
        next.mapData.subtypes[d.y]?.[d.x]?.includes(TileSubtype.OPEN_ABYSS)
      );
      if (fell.length > 0) {
        const nowTs = Date.now();
        const entries = fell.map((f) => {
          let fallFrom: string | undefined;
          let dir: "up" | "down" | "left" | "right" | undefined;
          if (smoothEnabled && f.id) {
            const p = smoothEntityPrevRef.current.get(`e:${f.id}`);
            if (p && Math.abs(p[0] - f.y) + Math.abs(p[1] - f.x) === 1) {
              fallFrom = `translate(${(p[1] - f.x) * 40}px, ${(p[0] - f.y) * 40}px) scale(1)`;
              const dy = f.y - p[0];
              const dx = f.x - p[1];
              dir = dy < 0 ? "up" : dy > 0 ? "down" : dx < 0 ? "left" : "right";
            }
          }
          return {
            id: `fall-${f.y},${f.x}-${nowTs}-${Math.random().toString(36).slice(2, 7)}`,
            y: f.y,
            x: f.x,
            kind: f.kind,
            fallFrom,
            dir,
          };
        });
        setEnemyAbyssFalls((prev) => [...prev, ...entries]);
        for (const e of entries) {
          setTimeout(() => {
            setEnemyAbyssFalls((curr) => curr.filter((c) => c.id !== e.id));
          }, 800);
        }
        next.defeatedEnemies = [];
      }
      CurrentGameStorage.saveCurrentGame(next, resolvedStorageSlot);
      setGameState(next);
    };
    // Survivor-hit: start the enemy's step now so it slides toward its post-move
    // tile as the rock flies in, rather than popping there after the bang.
    if (earlyCommit) applyState();

    // Identifies THIS throw's projectile so clearing it never wipes a newer
    // throw's rock (rapid taps / key autorepeat can overlap two flights).
    const rockId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Commit the resolved outcome AND fire the impact VFX together, so the rock
    // landing, the bang, the floating damage, and any ghost all happen at the
    // same instant on the same tile. (State already applied above when
    // earlyCommit is set.)
    const commitAndImpact = () => {
      if (!earlyCommit) applyState();
      // The rock has reached the impact tile — clear it as the bang lands, but
      // only if it's still THIS throw's rock on screen.
      setRockEffect((cur) => (cur && cur.id === rockId ? null : cur));
      if (impact) {
        const bamIdx = 1 + Math.floor(Math.random() * 3);
        setBamEffect({
          y: impact.y,
          x: impact.x,
          src: `/images/items/bam${bamIdx}.png`,
        });
        setTimeout(() => setBamEffect(null), 300);
        triggerScreenShake();
      }
      try {
        // Floating damage for the enemy the rock hit — matched by id, shown on
        // the tile where the rock visibly connected (post-move for a survivor
        // that stepped this turn, otherwise its resting tile).
        if (impactEnemyId && impact) {
          const imp = impact;
          const hitId = impactEnemyId;
          const postEnemy = (next.enemies || []).find((e) => e.id === hitId);
          const preHP = preHealthById.get(hitId) ?? 0;
          const dmg = postEnemy
            ? Math.max(0, preHP - Math.max(0, postEnemy.health ?? 0))
            : Math.max(0, preHP); // no post-move enemy => it died this throw
          if (dmg > 0 && Number.isFinite(dmg)) {
            const now = Date.now();
            const id = `fd-enemy-${imp.y},${imp.x}-${now}-${Math.random()
              .toString(36)
              .slice(2, 7)}`;
            setFloating((prevF) => {
              const nextF: FloatingNumber[] = [
                ...prevF,
                {
                  id,
                  y: imp.y,
                  x: imp.x,
                  amount: dmg,
                  target: "enemy",
                  sign: "-",
                  kind: preKindById.get(hitId),
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
      } catch (err) {
        // Prevent any exception here from freezing input handling
        console.error("Rock hit damage popup error:", err);
      }
      if (killedGhosts.length > 0) {
        const now = Date.now();
        setSpirits((prevS) => {
          const out = [...prevS];
          for (const [gy, gx] of killedGhosts) {
            const id = `${gy},${gx}-${now}-${Math.random()
              .toString(36)
              .slice(2, 7)}`;
            out.push({ id, y: gy, x: gx, createdAt: now });
            setTimeout(() => {
              setSpirits((curr) => curr.filter((s) => s.id !== id));
            }, 2000);
          }
          return out;
        });
      }
    };

    // Animate the rock, then land everything as it reaches the impact tile.
    const stepMs = 50; // faster animation per tile
    const flightMs = path.length * stepMs;
    // On a survivor-hit we committed the enemy's move up front; give its slide
    // (walkStepMs) time to finish so the bang doesn't beat it to the tile. The
    // rock rests on the impact tile during that beat.
    const impactDelay = earlyCommit
      ? Math.max(flightMs, SMOOTH_TUNING.walkStepMs) + 10
      : flightMs + 10;
    if (path.length > 0) {
      let idx = 0;
      setRockEffect({ y: path[0][0], x: path[0][1], id: rockId });
      const interval = setInterval(() => {
        idx += 1;
        if (idx >= path.length || !path[idx]) {
          // Reached the impact tile — stop advancing but leave the rock resting
          // there; commitAndImpact clears it as the bang lands.
          clearInterval(interval);
          return;
        }
        const [ny, nx] = path[idx];
        setRockEffect((cur) =>
          cur && cur.id === rockId ? { ...cur, y: ny, x: nx } : cur
        );
      }, stepMs);
      // Safety: clear after 1s
      setTimeout(() => {
        setRockEffect((cur) => (cur && cur.id === rockId ? null : cur));
      }, 1000);
      // Land the outcome + VFX as the rock reaches the impact tile.
      setTimeout(commitAndImpact, impactDelay);
    } else {
      // No travel (e.g., wall adjacent) — resolve now.
      commitAndImpact();
    }
  }, [gameState, playerPosition, resolvedStorageSlot]);

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

  // Handle bed interactions
  useEffect(() => {
    if (dialogueSession || activeBookshelfId || activeBedInteraction) return;
    const queue = gameState.bedInteractionQueue;
    if (!queue || queue.length === 0) return;
    const nextBed = queue[0];
    if (!nextBed) return;

    setActiveBedInteraction(nextBed);
    
    // Clear the queue and save
    setGameState((prev) => {
      const next = {
        ...prev,
        bedInteractionQueue: [],
      };
      CurrentGameStorage.saveCurrentGame(next, resolvedStorageSlot);
      return next;
    });
  }, [gameState.bedInteractionQueue, dialogueSession, activeBookshelfId, activeBedInteraction, resolvedStorageSlot]);

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
    // Tutorial funnel: a scripted beat just became visible, meaning the
    // player reached this far. Fires once per dialogue since the queue
    // entry is consumed immediately below.
    if (dialogueId.startsWith("tutorial-")) {
      trackTutorialBeat(dialogueId);
    }
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

  // --- Smooth movement (Phase 1 port of /test-animation; see lib/smooth_movement.ts) ---
  // false during SSR/first paint, then resolved from the flag after mount so
  // server and client markup agree (the flag reads URL/localStorage).
  const [smoothEnabled, setSmoothEnabled] = useState(false);
  useEffect(() => {
    setSmoothEnabled(isSmoothMovementEnabled());
  }, []);
  // In-flight camera step tween (one tile per turn).
  const smoothStepRef = useRef<SmoothStepTween | null>(null);
  // Fractional [row, col] the camera is currently showing.
  const smoothVisualRef = useRef<[number, number] | null>(null);
  // Run momentum: consecutive chained steps + when the last one ended.
  const smoothChainRef = useRef({ count: 0, lastStepEnd: 0 });
  // Step parity drives the alternating weight-shift tilt.
  const smoothParityRef = useRef(0);
  // Input buffered while a step tween is in flight (last input wins).
  const smoothQueuedRef = useRef<Direction | null>(null);
  // Direction keys currently held (most recent last).
  const smoothHeldRef = useRef<Direction[]>([]);
  // Held-to-run timers for the on-screen d-pad when smooth mode is off (smooth
  // mode chains held inputs via the rAF loop instead).
  const mobileHoldTimeoutRef = useRef<number | null>(null);
  const mobileHoldIntervalRef = useRef<number | null>(null);
  const smoothMapNodeRef = useRef<HTMLDivElement | null>(null);
  // Map-space anchor for the hero (inside mapContainer so walls/trees occlude
  // him via the map's z-order); the rAF loop moves it with the camera.
  const smoothHeroAnchorRef = useRef<HTMLDivElement | null>(null);
  const smoothHeroSpriteRef = useRef<HTMLDivElement | null>(null);
  // Latest handleMoveInput for the rAF loop (assigned after its definition).
  const latestMoveInputRef = useRef<(d: Direction) => void>(() => {});
  const playerPositionRef = useRef<[number, number] | null>(null);
  playerPositionRef.current = playerPosition;
  // Current map dimensions in tiles, for clamping the camera at map edges.
  const mapRows = gameState.mapData.tiles.length;
  const mapCols = gameState.mapData.tiles[0]?.length ?? 0;
  const mapDimsRef = useRef<[number, number]>([mapRows, mapCols]);
  mapDimsRef.current = [mapRows, mapCols];
  // Smooth-mode light overlay anchor; the rAF loop drags it with the hero.
  const smoothLightAnchorRef = useRef<HTMLDivElement | null>(null);

  // --- Phase 2: enemies/NPCs slide one tile per turn ---
  // id -> [y, x] as of the previously diffed gameState.
  const smoothEntityPrevRef = useRef<Map<string, [number, number]>>(new Map());
  // Cache keyed by gameState identity so StrictMode double-renders (and any
  // unrelated re-render) reuse the same diff instead of eating it.
  const smoothEntityCacheRef = useRef<{
    state: GameState | null;
    steps: Map<string, SmoothEntityStep>;
  }>({ state: null, steps: new Map() });
  const smoothEntitySeqRef = useRef(0);

  // Diff entity positions against the previous gameState; entries keyed by
  // destination tile ("e:y,x" / "n:y,x") describe the one-tile slide-in.
  const smoothEntitySteps: Map<string, SmoothEntityStep> | undefined = (() => {
    if (!smoothEnabled) return undefined;
    const cache = smoothEntityCacheRef.current;
    if (cache.state === gameState) return cache.steps;
    const prev = smoothEntityPrevRef.current;
    const nextPos = new Map<string, [number, number]>();
    const steps = new Map<string, SmoothEntityStep>();
    // Match the hero's step tween when one is in flight (rock/rune/item turns
    // advance enemies without a hero step — walk pace reads right for those).
    const dur = smoothStepRef.current?.dur ?? SMOOTH_TUNING.walkStepMs;
    const ease: SmoothEntityStep["ease"] = smoothStepRef.current?.running
      ? "linear"
      : "ease-in-out";
    smoothEntitySeqRef.current += 1;
    const seq = smoothEntitySeqRef.current;
    const visit = (
      id: string,
      y: number,
      x: number,
      keyPrefix: "e" | "n",
      kind?: string
    ) => {
      nextPos.set(id, [y, x]);
      const p = prev.get(id);
      if (!p) return;
      const dy = p[0] - y;
      const dx = p[1] - x;
      const dist = Math.abs(dy) + Math.abs(dx);
      if (dist === 0) return; // stood still
      if (kind === "ghost") {
        // Ghosts glide their whole phase move — drifting through walls reads
        // exactly right for them. Cap it so cross-map warps still snap.
        if (dist > 6) return;
      } else if (dist !== 1) {
        // Non-ghosts animate single-tile steps only; pink-ninja slides/blinks
        // and room warps snap.
        return;
      }
      steps.set(`${keyPrefix}:${y},${x}`, { dy, dx, dur, ease, seq });
    };
    for (const e of gameState.enemies ?? []) {
      if (typeof e.id === "string" && e.id) visit(`e:${e.id}`, e.y, e.x, "e", e.kind);
    }
    for (const n of gameState.npcs ?? []) {
      if (n?.id) visit(`n:${n.id}`, n.y, n.x, "n");
    }
    smoothEntityPrevRef.current = nextPos;
    cache.state = gameState;
    cache.steps = steps;
    return steps;
  })();
  // Transient BAM effect state
  const [bamEffect, setBamEffect] = useState<null | {
    y: number;
    x: number;
    src: string;
    size?: number;
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
  // Transient "enemy fell into the abyss" dives (spawn when a defeated
  // enemy's tile just became an open abyss). fallFrom is the smooth-mode
  // slide-in offset from the tile it fell from, when known; dir is the
  // direction it stepped in (drives which facing sprite we show as it drops).
  const [enemyAbyssFalls, setEnemyAbyssFalls] = useState<
    Array<{
      id: string;
      y: number;
      x: number;
      kind: string;
      fallFrom?: string;
      dir?: "up" | "down" | "left" | "right";
    }>
  >([]);
  // Transient floating damage numbers (hero/enemy hits)
  const [floating, setFloating] = useState<FloatingNumber[]>([]);
  // Transient pink-goblin ranged-attack VFX: a fast beam from the attacker to
  // the hero plus a brief bang flash on the hero. Spawned from the engine's
  // recentEnemyAttacks transient; deduped by array identity so state spreads
  // that carry the same array along don't re-fire it.
  const [pinkBeams, setPinkBeams] = useState<
    Array<{ id: string; fromY: number; fromX: number; toY: number; toX: number }>
  >([]);
  const [heroBangs, setHeroBangs] = useState<Array<{ id: string; y: number; x: number }>>([]);
  // Combat lunges: hard shake toward the opponent when a melee hit lands.
  // Keyed "hero" or "e:y,x"; entries clear themselves once the shake is done.
  const [combatLunges, setCombatLunges] = useState<Map<string, CombatLunge>>(
    () => new Map()
  );
  const lungeSeqRef = useRef(0);
  const fireCombatLunges = useCallback(
    (entries: Array<[string, { dy: number; dx: number }]>) => {
      const seq = ++lungeSeqRef.current;
      setCombatLunges((prev) => {
        const next = new Map(prev);
        for (const [key, dir] of entries) next.set(key, { ...dir, seq });
        return next;
      });
      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          setCombatLunges((prev) => {
            const next = new Map(prev);
            for (const [key] of entries) {
              if (next.get(key)?.seq === seq) next.delete(key);
            }
            return next;
          });
        }, 300);
      }
    },
    []
  );
  // Seed with the initial state's array so a rehydrated save doesn't replay
  // its last tick's beam on load.
  const lastProcessedAttacksRef = useRef<unknown>(gameState.recentEnemyAttacks ?? null);
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
  const environmentConfig = getEnvironmentConfig(environment);
  const environmentDaylight = environmentConfig.daylight;
  const autoPhaseVisibility = environmentDaylight;
  const heroTorchLitState = gameState.heroTorchLit ?? true;
  // The nightmare room is always pitch black: never suppress its darkness regardless of
  // environment, forceDaylight, or torch state, so it renders dark from the first frame.
  const inNightmare = !!gameState.inNightmare;
  const suppressDarknessOverlay =
    !inNightmare && (autoPhaseVisibility || (forceDaylight && heroTorchLitState));
  const heroTorchLitForVisibility = suppressDarknessOverlay ? true : heroTorchLitState;
  const lastCheckpoint = gameState.lastCheckpoint;
  const heroDeathStateForTiles: HeroDeathState | undefined =
    shouldAnimateHeroDeath && heroDeathPhase !== "idle"
      ? {
          phase: heroDeathPhase,
          orientation: heroDeathOrientation,
          variant:
            gameState.deathCause?.type === "faulty_floor" ? "abyss" : "topple",
        }
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
      setDeathFade(false);
      const facing =
        gameState.playerDirection === Direction.LEFT ? Direction.LEFT : Direction.RIGHT;
      setHeroDeathOrientation(facing);
    }
  }, [gameState.heroHealth, heroDeathPhase, clearHeroDeathTimeouts, gameState.playerDirection]);

  // Pink goblin ranged-attack VFX: watch the engine's per-tick attack list and
  // spawn a beam (attacker tile -> hero tile) plus a bang flash on the hero.
  useEffect(() => {
    const attacks = gameState.recentEnemyAttacks;
    if (!attacks || attacks.length === 0) return;
    if (lastProcessedAttacksRef.current === attacks) return;
    lastProcessedAttacksRef.current = attacks;
    const ranged = attacks.filter((a) => a.kind === "pink-goblin" && a.ranged);
    if (ranged.length === 0) return;
    const pos = findPlayerInState(gameState);
    if (!pos) return;
    const [py, px] = pos;
    const now = Date.now();
    const beams = ranged.map((a, i) => ({
      id: `beam-${a.y},${a.x}-${now}-${i}`,
      fromY: a.y,
      fromX: a.x,
      toY: py,
      toX: px,
    }));
    const beamIds = new Set(beams.map((b) => b.id));
    setPinkBeams((prev) => [...prev, ...beams]);
    const bang = { id: `bang-${py},${px}-${now}`, y: py, x: px };
    setHeroBangs((prev) => [...prev, bang]);
    window.setTimeout(() => {
      setPinkBeams((curr) => curr.filter((b) => !beamIds.has(b.id)));
    }, 160);
    window.setTimeout(() => {
      setHeroBangs((curr) => curr.filter((b) => b.id !== bang.id));
    }, 240);
  }, [gameState]);

  // Melee enemy attacks: both combatants shake hard toward each other, same
  // as when the hero lands a hit. Same engine transient as the beams above,
  // but deduped separately so neither effect starves the other.
  const lastProcessedMeleeRef = useRef<unknown>(
    gameState.recentEnemyAttacks ?? null
  );
  useEffect(() => {
    const attacks = gameState.recentEnemyAttacks;
    if (!attacks || attacks.length === 0) return;
    if (lastProcessedMeleeRef.current === attacks) return;
    lastProcessedMeleeRef.current = attacks;
    const melee = attacks.filter((a) => !a.ranged);
    if (melee.length === 0) return;
    const pos = findPlayerInState(gameState);
    if (!pos) return;
    const [py, px] = pos;
    const entries: Array<[string, { dy: number; dx: number }]> = melee.map(
      (a) => [
        `e:${a.y},${a.x}`,
        { dy: Math.sign(py - a.y), dx: Math.sign(px - a.x) },
      ]
    );
    // The hero shakes back toward the (first) attacker — skip if this hit
    // killed him so the shake can't fight the death animation.
    if (gameState.heroHealth > 0) {
      const first = melee[0];
      entries.push([
        "hero",
        { dy: Math.sign(first.y - py), dx: Math.sign(first.x - px) },
      ]);
    }
    fireCombatLunges(entries);
  }, [gameState, fireCombatLunges]);

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
      } else if (gameState.deathCause?.type === "faulty_floor") {
        // Abyss death: skip the spin/topple. The hero turns toward the way he was
        // headed and shrinks into the revealed hole; a spirit rises ~1s later.
        // Use the full heading (not just L/R) so Tile can rotate the back sprite.
        setHeroDeathOrientation(gameState.playerDirection);
        clearHeroDeathTimeouts();
        setHeroDeathPhase("sinking");
        const spiritDelay = 1000;
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
    gameState.deathCause,
    playerPosition,
    heroDeathPhase,
    shouldAnimateHeroDeath,
    clearHeroDeathTimeouts,
    spawnHeroSpirit,
  ]);

  useEffect(() => {
    if (!shouldAnimateHeroDeath) return;
    if (heroDeathPhase === "spirit") {
      // Daily/endless bridge to their own results screens with a fade; story
      // shows the full death overlay (with restart). Don't show that overlay here.
      if (isDailyChallenge || isEndless) {
        setDeathFade(true);
      } else {
        setShowDeathScreen(true);
      }
    }
  }, [heroDeathPhase, shouldAnimateHeroDeath, isDailyChallenge, isEndless]);

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

        // Delay updating the player position to match the grid transition.
        // Smooth mode drives the camera itself (rAF tween), so the position
        // state must update immediately — the 150ms lag is legacy-only.
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
        }, smoothEnabled ? 0 : 150); // Half of the CSS transition time for a smooth effect
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
  }, [gameState, prevGameState, isMoving, smoothEnabled]);

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

  // Report the hero's location (floor + pink realm) up to the parent for the
  // header title. Keyed on committed game state, so it covers floor swaps,
  // pink-realm warps in and out, and the initial mount.
  useEffect(() => {
    onLocationChange?.({
      floor: gameState.currentFloor,
      inPinkRealm: !!gameState.inPinkRealm,
    });
  }, [gameState.currentFloor, gameState.inPinkRealm, onLocationChange]);

  // Endless: register the run with the server so floor checkpoints can be
  // attested (anti-fraud for the leaderboard). Fail-soft — a run that can't
  // register still plays normally, it just ends up unverified.
  const runRegistrationStarted = useRef(false);
  useEffect(() => {
    if (!isEndless || gameState.endlessRunId || runRegistrationStarted.current) return;
    runRegistrationStarted.current = true;
    void startEndlessRun().then((runId) => {
      if (runId) {
        setGameState((prev) => {
          const next = { ...prev, endlessRunId: runId };
          // Persist immediately: the autosave only fires on gameplay changes,
          // and a mid-run reload must not orphan the server attestation.
          try {
            CurrentGameStorage.saveCurrentGame(next, resolvedStorageSlot);
          } catch {
            // ignore storage errors
          }
          return next;
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEndless, gameState.endlessRunId]);

  // Handle floor transition for multi-tier daily and endless modes — start iris wipe animation
  useEffect(() => {
    const isMultiTierDaily = isDailyChallenge && resolvedStorageSlot === 'daily-new';
    if (gameState.needsFloorTransition && (isMultiTierDaily || isEndless) && !floorTransition) {
      // Pre-compute the next floor state so it's ready when the screen goes black
      const localToday = DateUtils.getTodayString();
      const nextFloorState = isEndless
        ? advanceToNextEndlessFloor(gameState)
        : advanceToNextFloor(gameState, hashStringToSeed(localToday));
      nextFloorState.needsFloorTransition = false;

      // Endless anti-fraud: report the floor entry so the server can attest it.
      // Fire-and-forget — never blocks the wipe animation.
      if (isEndless && nextFloorState.currentFloor != null) {
        reportEndlessCheckpoint(nextFloorState, nextFloorState.currentFloor);
      }

      // Telemetry: record the loadout carried UP a floor, so we can see e.g. how
      // many people rush to level 2 without grabbing the sword/shield.
      try {
        const fromFloor = gameState.currentFloor ?? 1;
        trackFloorAdvance({
          mode: isEndless ? "endless" : "daily",
          fromFloor,
          toFloor: fromFloor + 1,
          hasSword: !!gameState.hasSword,
          hasShield: !!gameState.hasShield,
          hasKey: !!gameState.hasKey,
          dateSeed: isEndless ? undefined : localToday,
        });
      } catch {}

      // Close on the hero's actual viewport position (off-center when the
      // camera is clamped at a map edge), and open on his next-floor spawn.
      const closeCenter = playerPosition
        ? heroViewportPosition(playerPosition, mapRows, mapCols)
        : { x: 300, y: 300 };
      const nextTiles = nextFloorState.mapData.tiles;
      const nextSpawn = findPlayerPosition(nextFloorState.mapData);
      const openCenter = nextSpawn
        ? heroViewportPosition(
            nextSpawn,
            nextTiles.length,
            nextTiles[0]?.length ?? 0
          )
        : { x: 300, y: 300 };

      setFloorTransition({
        closeCenter,
        openCenter,
        pendingGameState: nextFloorState,
      });
    }
  }, [gameState.needsFloorTransition, isDailyChallenge, isEndless, resolvedStorageSlot, floorTransition]);

  // One-off exploration milestones (hidden, bomb-gated actions). The ref is
  // seeded from the state at mount so a mid-run reload — where the flag is
  // already set — doesn't re-fire; we only report milestones newly reached in
  // this session. Tutorial runs are excluded to keep the funnels clean.
  const explorationFiredRef = useRef({
    outsideWorld: !!gameState.reachedOutsideWorld,
    outsideTrees: (gameState.stats?.treesDestroyed ?? 0) > 0,
  });
  useEffect(() => {
    if (gameState.mode === "tutorial") return;
    const mode = isDailyChallenge ? "daily" : "normal";
    const dateSeed = isDailyChallenge ? DateUtils.getTodayString() : undefined;
    if (gameState.reachedOutsideWorld && !explorationFiredRef.current.outsideWorld) {
      explorationFiredRef.current.outsideWorld = true;
      try {
        trackOutsideWorldReached({ mode, floor: gameState.currentFloor, dateSeed });
      } catch {}
    }
    const trees = gameState.stats?.treesDestroyed ?? 0;
    if (trees > 0 && !explorationFiredRef.current.outsideTrees) {
      explorationFiredRef.current.outsideTrees = true;
      try {
        trackOutsideTreeDestroyed({ mode, count: trees, floor: gameState.currentFloor, dateSeed });
      } catch {}
    }
  }, [
    gameState.reachedOutsideWorld,
    gameState.stats?.treesDestroyed,
    gameState.mode,
    gameState.currentFloor,
    isDailyChallenge,
  ]);

  // Redirect to end page OR signal completion (daily) and persist game snapshot on win
  useEffect(() => {
    if (gameState.win && !gameCompletionProcessed) {
      setGameCompletionProcessed(true);
      // The tutorial "win" is just the handoff into the real daily run — it
      // isn't a completed game, has no floor, and would log as "None::win".
      // Keep tutorial runs out of game_complete; the tutorial funnel
      // (tutorial_completed) covers them.
      if (gameState.mode !== "tutorial") {
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
            currentFloor: gameState.currentFloor,
            ...runProgressProps(gameState),
          });
        } catch {}
      }
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
            currentFloor: gameState.currentFloor,
            reachedPinkRealm: !!gameState.reachedPinkRealm,
            pinkHeartCount: gameState.pinkHeartCount ?? 0,
            berryCount: gameState.berryCount ?? 0,
            bonusHearts: gameState.bonusHearts ?? 0,
            heroMaxHealth: gameState.heroMaxHealth ?? 5,
            hasSnakeMedallion: !!gameState.hasSnakeMedallion,
            rockCount: gameState.rockCount ?? 0,
            runeCount: gameState.runeCount ?? 0,
            bombCount: gameState.bombCount ?? 0,
            foodCount: gameState.foodCount ?? 0,
            potionCount: gameState.potionCount ?? 0,
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
          router.push("/daily-new");
        }
      } else if (onWin) {
        // Custom non-daily win flow (e.g. /new tutorial → daily floor 2
        // handoff). The parent takes responsibility for what happens next:
        // we skip the default /end redirect and the lastGame snapshot, but
        // still clear our own slot so a refresh can't resume a won run.
        try {
          if (typeof window !== "undefined") {
            CurrentGameStorage.clearCurrentGame(resolvedStorageSlot);
          }
        } catch {
          // ignore storage errors
        }
        onWin(gameState);
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
            currentFloor: gameState.currentFloor,
            reachedPinkRealm: !!gameState.reachedPinkRealm,
            pinkHeartCount: gameState.pinkHeartCount ?? 0,
            berryCount: gameState.berryCount ?? 0,
            bonusHearts: gameState.bonusHearts ?? 0,
            heroMaxHealth: gameState.heroMaxHealth ?? 5,
            hasSnakeMedallion: !!gameState.hasSnakeMedallion,
            rockCount: gameState.rockCount ?? 0,
            runeCount: gameState.runeCount ?? 0,
            bombCount: gameState.bombCount ?? 0,
            foodCount: gameState.foodCount ?? 0,
            potionCount: gameState.potionCount ?? 0,
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
    onWin,
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
    bombs: 0,
    food: 0,
    pinkHearts: 0,
    berry: 0,
    chestKeys: 0,
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

  // Shake the screen once whenever a bomb detonates this turn.
  const lastBombBlastKeyRef = useRef<string>("");
  useEffect(() => {
    const blasts = gameState?.recentBombBlasts ?? [];
    if (blasts.length === 0) {
      lastBombBlastKeyRef.current = "";
      return;
    }
    const key = blasts.map(([y, x]) => `${y},${x}`).join("|");
    if (key === lastBombBlastKeyRef.current) return;
    lastBombBlastKeyRef.current = key;
    triggerScreenShake(360);
  }, [gameState?.recentBombBlasts]);

  useEffect(() => {
    try {
      if (!gameState) return;
      // Keys
      if (gameState.hasKey && !prevInv.key) {
        trackPickup("key");
        triggerItemPickupAnimation("key");
      }
      if ((gameState.chestKeyCount ?? 0) > prevInv.chestKeys) {
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
      if ((gameState.bombCount ?? 0) > prevInv.bombs) {
        trackPickup("bomb");
        triggerItemPickupAnimation("bomb");
      }
      if ((gameState.foodCount ?? 0) > prevInv.food) {
        trackPickup("food");
        triggerItemPickupAnimation("food");
      }
      if ((gameState.pinkHeartCount ?? 0) > prevInv.pinkHearts) {
        trackPickup("pink_heart");
        triggerItemPickupAnimation("pinkHeart");
      }
      if ((gameState.berryCount ?? 0) > prevInv.berry) {
        trackPickup("berry");
        triggerItemPickupAnimation("berry");
      }
    } catch {}
    const nextInv = {
      key: gameState.hasKey,
      exitKey: gameState.hasExitKey,
      sword: !!gameState.hasSword,
      shield: !!gameState.hasShield,
      rocks: gameState.rockCount ?? 0,
      runes: gameState.runeCount ?? 0,
      bombs: gameState.bombCount ?? 0,
      food: gameState.foodCount ?? 0,
      pinkHearts: gameState.pinkHeartCount ?? 0,
      berry: gameState.berryCount ?? 0,
      chestKeys: gameState.chestKeyCount ?? 0,
    };
    const changed =
      nextInv.key !== prevInv.key ||
      nextInv.exitKey !== prevInv.exitKey ||
      nextInv.sword !== prevInv.sword ||
      nextInv.shield !== prevInv.shield ||
      nextInv.rocks !== prevInv.rocks ||
      nextInv.runes !== prevInv.runes ||
      nextInv.bombs !== prevInv.bombs ||
      nextInv.food !== prevInv.food ||
      nextInv.pinkHearts !== prevInv.pinkHearts ||
      nextInv.berry !== prevInv.berry ||
      nextInv.chestKeys !== prevInv.chestKeys;
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
          deathCauseEnemyKind: gameState.deathCause?.enemyKind,
          currentFloor: gameState.currentFloor,
          ...runProgressProps(gameState),
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
          deathCauseEnemyKind: gameState.deathCause?.enemyKind,
          currentFloor: gameState.currentFloor,
          ...runProgressProps(gameState),
        });
      } catch {}
      return;
    }
    
    // For non-story modes, handle permanent death with redirect
    try {
      const mode = isEndless ? "endless" : isDailyChallenge ? "daily" : "normal";
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
        deathCauseEnemyKind: gameState.deathCause?.enemyKind,
        currentFloor: gameState.currentFloor,
      });
    } catch {}

    if (isEndless) {
      // Endless run over: the floor reached is the score. Persist the record,
      // clear the run save, and hand off to the page's game-over screen.
      try {
        EndlessStorage.recordRun({
          floor: gameState.currentFloor ?? 1,
          enemiesDefeated: gameState.stats.enemiesDefeated,
          steps: gameState.stats.steps,
          damageDealt: gameState.stats.damageDealt,
          damageTaken: gameState.stats.damageTaken,
          hasSword: !!gameState.hasSword,
          hasShield: !!gameState.hasShield,
          diedAt: new Date().toISOString(),
          deathCause: gameState.deathCause?.type,
        });
      } catch {
        // ignore storage errors
      }
      try {
        if (typeof window !== "undefined") {
          CurrentGameStorage.clearCurrentGame(resolvedStorageSlot);
        }
      } catch {
        // ignore storage errors
      }
      // Submit the run for its server-verified leaderboard score, then hand
      // off to the game-over screen. Capped at 3s so a dead network can never
      // hold the results screen hostage.
      {
        const finish = () => {
          if (onDailyComplete) onDailyComplete("lost");
        };
        const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
        Promise.race([submitEndlessRun(gameState).then(() => undefined), timeout]).then(
          finish,
          finish
        );
      }
      return;
    }

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
          currentFloor: gameState.currentFloor,
          reachedPinkRealm: !!gameState.reachedPinkRealm,
          pinkHeartCount: gameState.pinkHeartCount ?? 0,
          berryCount: gameState.berryCount ?? 0,
          bonusHearts: gameState.bonusHearts ?? 0,
          heroMaxHealth: gameState.heroMaxHealth ?? 5,
          hasSnakeMedallion: !!gameState.hasSnakeMedallion,
          rockCount: gameState.rockCount ?? 0,
          runeCount: gameState.runeCount ?? 0,
          bombCount: gameState.bombCount ?? 0,
          foodCount: gameState.foodCount ?? 0,
          potionCount: gameState.potionCount ?? 0,
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
        router.push("/daily-new");
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
          currentFloor: gameState.currentFloor,
          reachedPinkRealm: !!gameState.reachedPinkRealm,
          pinkHeartCount: gameState.pinkHeartCount ?? 0,
          berryCount: gameState.berryCount ?? 0,
          bonusHearts: gameState.bonusHearts ?? 0,
          heroMaxHealth: gameState.heroMaxHealth ?? 5,
          hasSnakeMedallion: !!gameState.hasSnakeMedallion,
          rockCount: gameState.rockCount ?? 0,
          runeCount: gameState.runeCount ?? 0,
          bombCount: gameState.bombCount ?? 0,
          foodCount: gameState.foodCount ?? 0,
          potionCount: gameState.potionCount ?? 0,
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
          // Both combatants shake hard toward each other as the bang lands
          const lungeDy = Math.sign(enemy.y - py);
          const lungeDx = Math.sign(enemy.x - px);
          fireCombatLunges([
            ["hero", { dy: lungeDy, dx: lungeDx }],
            [`e:${enemy.y},${enemy.x}`, { dy: -lungeDy, dx: -lungeDx }],
          ]);
        }
      }

      const preDamageDealt = gameState.stats?.damageDealt ?? 0;
      const newGameState = movePlayer(gameState, direction);

      // Smashing a pot by hand should read as an impact, just like breaking it
      // with a thrown rock: flash a "bam" over the pot as it shatters to reveal
      // its contents, instead of the pot silently vanishing. Detect it by the pot
      // tag disappearing from the tile the player moved into.
      if (playerPosition) {
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
        const preHadPot = (gameState.mapData.subtypes?.[ty]?.[tx] || []).includes(
          TileSubtype.POT
        );
        const postHasPot = (
          newGameState.mapData.subtypes?.[ty]?.[tx] || []
        ).includes(TileSubtype.POT);
        if (preHadPot && !postHasPot) {
          const bamIdx = 1 + Math.floor(Math.random() * 3);
          // A hand-smashed pot should read as a small ping on the pot itself,
          // not an explosion: keep the bam compact and skip the screen shake.
          setBamEffect({ y: ty, x: tx, src: `/images/items/bam${bamIdx}.png`, size: 20 });
          setTimeout(() => setBamEffect(null), 300);
        }
      }

      // Pink-realm warp: first show the hero step ONTO the ring tile, then flicker
      // (dematerialize) and run the iris transition into the realm — rather than swapping
      // the map instantly (which made the hero flicker on the tile beside the ring).
      if (!!newGameState.inPinkRealm !== !!gameState.inPinkRealm) {
        // Telemetry: record the first time the player finds the pink realm this run.
        if (newGameState.inPinkRealm && !gameState.reachedPinkRealm) {
          try {
            trackPinkRealmReached({
              mode: isDailyChallenge ? "daily" : "normal",
              floor: gameState.currentFloor,
              dateSeed: isDailyChallenge ? DateUtils.getTodayString() : undefined,
            });
          } catch {}
        }
        if (playerPosition) {
          const [py, px] = playerPosition;
          let dy = 0,
            dx = 0;
          switch (direction) {
            case Direction.UP: dy = -1; break;
            case Direction.RIGHT: dx = 1; break;
            case Direction.DOWN: dy = 1; break;
            case Direction.LEFT: dx = -1; break;
          }
          const destY = py + dy;
          const destX = px + dx;
          const interMap = JSON.parse(JSON.stringify(gameState.mapData)) as typeof gameState.mapData;
          if (interMap.subtypes[py]?.[px]) {
            interMap.subtypes[py][px] = interMap.subtypes[py][px].filter(
              (t) => t !== TileSubtype.PLAYER
            );
          }
          if (
            interMap.subtypes[destY]?.[destX] &&
            !interMap.subtypes[destY][destX].includes(TileSubtype.PLAYER)
          ) {
            interMap.subtypes[destY][destX].push(TileSubtype.PLAYER);
          }
          // Show the hero standing on the ring for a beat before it dissolves.
          setGameState({ ...gameState, mapData: interMap, playerDirection: direction });
        }
        setTimeout(() => {
          setWarpFlicker(true);
          const closeCenter = playerPosition
            ? heroViewportPosition(playerPosition, mapRows, mapCols)
            : { x: 300, y: 300 };
          const warpTiles = newGameState.mapData.tiles;
          const warpSpawn = findPlayerPosition(newGameState.mapData);
          const openCenter = warpSpawn
            ? heroViewportPosition(
                warpSpawn,
                warpTiles.length,
                warpTiles[0]?.length ?? 0
              )
            : { x: 300, y: 300 };
          setFloorTransition({
            closeCenter,
            openCenter,
            pendingGameState: newGameState,
          });
        }, 160);
        return;
      }

      CurrentGameStorage.saveCurrentGame(newGameState, resolvedStorageSlot);
      // Compute floating damage numbers from what the engine actually did.
      // 1) Hero attacking an enemy. movePlayer ticks enemies BEFORE resolving the
      //    player's attack, so guessing from pre-move tile positions is unreliable
      //    (phantom or missing numbers, wrong amounts when enemies swap tiles).
      //    Instead use the exact damage the engine recorded — stats.damageDealt
      //    delta; the hero hits at most one enemy per move — and treat the attack
      //    as having happened iff the target tile still holds an enemy or one just
      //    died there. A 0-damage attack renders as "miss".
      if (typeof targetY === "number" && typeof targetX === "number") {
        const dealt = Math.max(
          0,
          (newGameState.stats?.damageDealt ?? 0) - preDamageDealt
        );
        const enemyAtTargetPost = (newGameState.enemies || []).find(
          (e) => e.y === targetY && e.x === targetX
        );
        const diedAtTarget = (newGameState.recentDeaths || []).some(
          ([dy, dx]) => dy === targetY && dx === targetX
        );
        if (enemyAtTargetPost || diedAtTarget) {
          const hitKind =
            enemyAtTargetPost?.kind ||
            (newGameState.defeatedEnemies || []).find(
              (d) => d.y === targetY && d.x === targetX
            )?.kind ||
            preEnemyAtTarget?.kind ||
            "fire-goblin";
          const spawn = () => {
            const now = Date.now();
            const id = `fd-enemy-${targetY},${targetX}-${now}-${Math.random()
              .toString(36)
              .slice(2, 7)}`;
            setFloating((prev) => {
              const next: FloatingNumber[] = [
                ...prev,
                {
                  id,
                  y: targetY as number,
                  x: targetX as number,
                  amount: dealt,
                  target: "enemy",
                  sign: "-",
                  kind: hitKind,
                  miss: dealt === 0,
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
            setTimeout(spawn, 120); // let the BAM flash land first
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
        // Enemies whose tile just became an open abyss fell into the pit —
        // show them dropping face-first into the hole (mirrors the hero's
        // dive). Enemies can never die ON an abyss tile any other way, so
        // this cleanly separates falls from combat deaths. Read BEFORE
        // defeatedEnemies is cleared below.
        const fell = (newGameState.defeatedEnemies ?? []).filter((d) =>
          newGameState.mapData.subtypes[d.y]?.[d.x]?.includes(
            TileSubtype.OPEN_ABYSS
          )
        );
        if (fell.length > 0) {
          const nowTs = Date.now();
          const entries = fell.map((f) => {
            // Smooth mode: slide in from the tile it fell from. The entity
            // diff hasn't rebuilt yet, so the prev map still holds pre-move
            // positions for this turn. The same prev->abyss delta tells us
            // which way it was walking, so we can show the matching facing.
            let fallFrom: string | undefined;
            let dir: "up" | "down" | "left" | "right" | undefined;
            if (smoothEnabled && f.id) {
              const p = smoothEntityPrevRef.current.get(`e:${f.id}`);
              if (p && Math.abs(p[0] - f.y) + Math.abs(p[1] - f.x) === 1) {
                fallFrom = `translate(${(p[1] - f.x) * 40}px, ${(p[0] - f.y) * 40}px) scale(1)`;
                const dy = f.y - p[0];
                const dx = f.x - p[1];
                dir = dy < 0 ? "up" : dy > 0 ? "down" : dx < 0 ? "left" : "right";
              }
            }
            return {
              id: `fall-${f.y},${f.x}-${nowTs}-${Math.random()
                .toString(36)
                .slice(2, 7)}`,
              y: f.y,
              x: f.x,
              kind: f.kind,
              fallFrom,
              dir,
            };
          });
          setEnemyAbyssFalls((prev) => [...prev, ...entries]);
          for (const e of entries) {
            setTimeout(() => {
              setEnemyAbyssFalls((curr) => curr.filter((c) => c.id !== e.id));
            }, 800);
          }
        }
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
      // Smooth mode reads the post-move player position off the returned state
      // to start the camera tween synchronously.
      return newGameState;
    },
    [gameState, playerPosition, resolvedStorageSlot, fireCombatLunges]
  );

  const handleMoveInput = useCallback(
    (direction: Direction) => {
      if (gameState.heroHealth <= 0 || heroDeathPhase !== "idle") {
        return;
      }
      if (floorTransition) return;
      if (dialogueActive) {
        handleDialogueAdvance();
        return;
      }
      if (smoothEnabled) {
        // A step tween is in flight: buffer the input (last one wins); the rAF
        // loop dispatches it the moment the current step lands.
        if (smoothStepRef.current) {
          smoothQueuedRef.current = direction;
          return;
        }
        // Run momentum: chained steps (gap <= decayMs) past the threshold run.
        const now = performance.now();
        const chain = smoothChainRef.current;
        if (chain.count > 0 && now - chain.lastStepEnd <= SMOOTH_TUNING.decayMs) {
          chain.count += 1;
        } else {
          chain.count = 1;
        }
        const running = chain.count > SMOOTH_TUNING.runThreshold;
        const from = smoothVisualRef.current ?? playerPositionRef.current;
        // The move itself is the game's normal synchronous turn (enemies and
        // all); only the camera glide below is new.
        const newState = handlePlayerMove(direction);
        const after = newState ? findPlayerInState(newState) : null;
        if (!after || !from) return;
        const dr = Math.abs(after[0] - Math.round(from[0]));
        const dc = Math.abs(after[1] - Math.round(from[1]));
        if (dr + dc === 0) {
          // Blocked: a facing-only turn. No tween, no run momentum.
          chain.count = 0;
          return;
        }
        if (dr + dc > 1) {
          // Teleport (portal/warp): snap the camera, don't glide across the map.
          smoothVisualRef.current = [after[0], after[1]];
          return;
        }
        smoothParityRef.current ^= 1;
        smoothStepRef.current = {
          fromR: from[0],
          fromC: from[1],
          toR: after[0],
          toC: after[1],
          start: now,
          dur: running ? SMOOTH_TUNING.runStepMs : SMOOTH_TUNING.walkStepMs,
          running,
        };
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
      floorTransition,
      smoothEnabled,
    ]
  );
  // Keep the rAF loop pointed at the latest gated input handler.
  latestMoveInputRef.current = handleMoveInput;

  // Smooth-movement rAF loop: tweens the camera one tile per turn, applies the
  // hero's procedural walk/run gait, and chains held/queued inputs into the
  // next turn the moment a step lands.
  useEffect(() => {
    if (!smoothEnabled) return;
    let raf = 0;
    const frame = (now: number) => {
      const step = smoothStepRef.current;
      let moving = false;
      let progress = 0;
      let running = false;
      if (step) {
        const raw = Math.min(1, Math.max(0, (now - step.start) / step.dur));
        // Linear while running so back-to-back steps chain without a hitch.
        const e = step.running ? raw : smoothEaseInOut(raw);
        smoothVisualRef.current = [
          step.fromR + (step.toR - step.fromR) * e,
          step.fromC + (step.toC - step.fromC) * e,
        ];
        moving = true;
        progress = raw;
        running = step.running;
        if (raw >= 1) {
          smoothStepRef.current = null;
          smoothChainRef.current.lastStepEnd = now;
          moving = false;
          // Chain the next turn immediately while input is held or queued.
          const held = smoothHeldRef.current;
          const dir =
            smoothQueuedRef.current ??
            (held.length ? held[held.length - 1] : null);
          smoothQueuedRef.current = null;
          if (dir !== null) latestMoveInputRef.current(dir);
          // The dispatch above may have started the next step already; TS's
          // control-flow narrowing can't see the ref mutation through the
          // call, so launder the re-read with a cast.
          const next = smoothStepRef.current as SmoothStepTween | null;
          if (next) {
            moving = true;
            progress = 0;
            running = next.running;
          }
        }
      } else {
        if (now - smoothChainRef.current.lastStepEnd > SMOOTH_TUNING.decayMs) {
          smoothChainRef.current.count = 0;
        }
        // Track non-move position changes (floor swaps, warps, revives) by
        // snapping the camera to the logical position.
        const lp = playerPositionRef.current;
        const v = smoothVisualRef.current;
        if (
          lp &&
          (!v || Math.abs(v[0] - lp[0]) + Math.abs(v[1] - lp[1]) > 0.001)
        ) {
          smoothVisualRef.current = [lp[0], lp[1]];
        }
      }

      const v = smoothVisualRef.current;
      if (v && smoothMapNodeRef.current) {
        const [rows, cols] = mapDimsRef.current;
        smoothMapNodeRef.current.style.transform = `translate(${calculateMapTransform(
          [v[0], v[1]],
          rows,
          cols
        )})`;
        // Keep the torch/vignette glued to the hero: he leaves viewport
        // center whenever the camera is clamped at a map edge.
        if (smoothLightAnchorRef.current) {
          const hero = heroViewportPosition([v[0], v[1]], rows, cols);
          smoothLightAnchorRef.current.style.transform = `translate3d(${
            hero.x - LIGHT_BOX_CENTER
          }px, ${hero.y - LIGHT_BOX_CENTER}px, 0)`;
        }
      }
      // Hero anchor rides the same visual position, so camera + hero cancel
      // out and he stays pinned at the viewport center.
      if (v && smoothHeroAnchorRef.current) {
        smoothHeroAnchorRef.current.style.transform = `translate3d(${v[1] * 40}px, ${v[0] * 40}px, 0)`;
      }

      // Hero gait: bob + weight-shift tilt + squash while stepping.
      const spriteEl = smoothHeroSpriteRef.current;
      if (spriteEl) {
        if (moving) {
          const arc = Math.sin(Math.PI * progress);
          const lift =
            (running ? SMOOTH_TUNING.bobRun : SMOOTH_TUNING.bobWalk) * arc;
          const tilt =
            SMOOTH_TUNING.tiltDeg * (smoothParityRef.current ? 1 : -1) * arc;
          const sy = 1 + SMOOTH_TUNING.squash * arc;
          const sx = 1 - SMOOTH_TUNING.squash * 0.5 * arc;
          spriteEl.style.transform = `translateY(${-lift}px) rotate(${tilt}deg) scale(${sx}, ${sy})`;
        } else {
          spriteEl.style.transform = "";
        }
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [smoothEnabled]);

  // On-screen d-pad hold-to-run. Press fires a move immediately; holding keeps
  // moving in that direction the same way a held keyboard arrow does.
  const directionFromString = (directionStr: string): Direction | null => {
    switch (directionStr) {
      case "UP":
        return Direction.UP;
      case "RIGHT":
        return Direction.RIGHT;
      case "DOWN":
        return Direction.DOWN;
      case "LEFT":
        return Direction.LEFT;
      default:
        return null;
    }
  };

  const clearMobileHold = useCallback(() => {
    if (mobileHoldTimeoutRef.current !== null) {
      window.clearTimeout(mobileHoldTimeoutRef.current);
      mobileHoldTimeoutRef.current = null;
    }
    if (mobileHoldIntervalRef.current !== null) {
      window.clearInterval(mobileHoldIntervalRef.current);
      mobileHoldIntervalRef.current = null;
    }
  }, []);

  const handleMobileMoveStart = useCallback(
    (directionStr: string) => {
      const direction = directionFromString(directionStr);
      if (direction === null) return;
      if (smoothEnabled) {
        // Mirror a keyboard keydown: mark the direction held so the rAF loop
        // chains steps into a run, then kick off the first step now.
        smoothHeldRef.current = smoothHeldRef.current.filter(
          (d) => d !== direction
        );
        smoothHeldRef.current.push(direction);
        handleMoveInput(direction);
      } else {
        // No rAF chaining without smooth mode, so emulate keyboard key-repeat.
        clearMobileHold();
        handleMoveInput(direction);
        mobileHoldTimeoutRef.current = window.setTimeout(() => {
          mobileHoldIntervalRef.current = window.setInterval(() => {
            handleMoveInput(direction);
          }, 130);
        }, 180);
      }
    },
    [smoothEnabled, handleMoveInput, clearMobileHold]
  );

  const handleMobileMoveEnd = useCallback(
    (directionStr: string) => {
      const direction = directionFromString(directionStr);
      if (direction === null) return;
      if (smoothEnabled) {
        smoothHeldRef.current = smoothHeldRef.current.filter(
          (d) => d !== direction
        );
      } else {
        clearMobileHold();
      }
    },
    [smoothEnabled, clearMobileHold]
  );

  // Stop any held-to-run repeat if the component unmounts mid-press.
  useEffect(() => clearMobileHold, [clearMobileHold]);

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
        case "b":
        case "B":
          // Throw a bomb
          handleThrowBomb();
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
        case "h":
        case "H":
          // Use the pink flaming heart prize
          handleUsePinkHeart();
          return;
        case "g":
        case "G":
          // Use a belted berry
          handleUseBerry();
          return;
        case "m":
        case "M":
          // Use snake medallion (place/travel portal)
          handleSnakeMedallionClick();
          return;
        case "e":
        case "E":
          handleInteract();
          return;
      }

      if (direction !== null) {
        if (smoothEnabled) {
          // Smooth mode paces held keys itself (the rAF loop chains steps), so
          // ignore OS key-repeat and track which direction keys are down.
          if (event.repeat) return;
          smoothHeldRef.current = smoothHeldRef.current.filter(
            (d) => d !== direction
          );
          smoothHeldRef.current.push(direction);
        }
        handleMoveInput(direction);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      let released: Direction | null = null;
      switch (event.key) {
        case "ArrowUp":
          released = Direction.UP;
          break;
        case "ArrowRight":
          released = Direction.RIGHT;
          break;
        case "ArrowDown":
          released = Direction.DOWN;
          break;
        case "ArrowLeft":
          released = Direction.LEFT;
          break;
      }
      if (released !== null) {
        smoothHeldRef.current = smoothHeldRef.current.filter(
          (d) => d !== released
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    gameState,
    dialogueActive,
    activeDialogueChoices,
    handleDialogueAdvance,
    handleMoveInput,
    handleThrowRock,
    handleThrowRune,
    handleThrowBomb,
    handleUseFood,
    handleUsePotion,
    handleUsePinkHeart,
    handleUseBerry,
    handleSnakeMedallionClick,
    handleInteract,
    handleDialogueChoiceNavigate,
    handleDialogueChoiceConfirm,
    heroDeathPhase,
    smoothEnabled,
  ]);

  return (
    <div className={`relative${brightMode ? " bright-mode" : ""}`}>
      {/* Brightness A/B prototype: highlight-safe shadow-lift curve referenced
          by `.bright-mode .game-scale` in globals.css. Gamma < 1 raises dark
          values toward mid while leaving near-white (candles) almost fixed.
          Only mounted when the `?bright=1` flag is on. */}
      {brightMode && (
        <svg
          width="0"
          height="0"
          aria-hidden="true"
          style={{ position: "absolute", width: 0, height: 0 }}
        >
          <filter id="torchboy-lift" colorInterpolationFilters="sRGB">
            <feComponentTransfer>
              <feFuncR type="gamma" amplitude="1" exponent="0.7" offset="0" />
              <feFuncG type="gamma" amplitude="1" exponent="0.7" offset="0" />
              <feFuncB type="gamma" amplitude="1" exponent="0.7" offset="0" />
            </feComponentTransfer>
          </filter>
        </svg>
      )}
      {showDeathScreen && (
        <DeathScreen
          deathCause={gameState.deathCause}
          onRestart={handleRestartFromCheckpoint}
          hasCheckpoint={!!gameState.lastCheckpoint}
        />
      )}
      {/* Daily death: fade to black under the rising spirit, bridging to results */}
      {deathFade && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[9998] pointer-events-none"
          style={{ backgroundColor: "#000", animation: "deathFadeIn 800ms ease-in forwards" }}
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
        <div className="w-full mt-12 max-[600px]:mt-1 flex items-center justify-center">
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
                maxHealth={gameState.heroMaxHealth ?? 5}
                bonusHearts={gameState.bonusHearts ?? 0}
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
                const chestKeys = gameState.chestKeyCount ?? 0;
                const inventoryCount =
                  (diaryEntries.length > 0 ? 1 : 0) +
                  (gameState.hasKey || chestKeys > 0 ? 1 : 0) +
                  (gameState.hasExitKey ? 1 : 0) +
                  (gameState.hasSword ? 1 : 0) +
                  (gameState.hasShield ? 1 : 0) +
                  (gameState.hasSnakeMedallion ? 1 : 0) +
                  ((gameState.rockCount ?? 0) > 0 ? 1 : 0) +
                  ((gameState.runeCount ?? 0) > 0 ? 1 : 0) +
                  ((gameState.foodCount ?? 0) > 0 ? 1 : 0) +
                  ((gameState.potionCount ?? 0) > 0 ? 1 : 0) +
                  ((gameState.pinkHeartCount ?? 0) > 0 ? 1 : 0) +
                  ((gameState.berryCount ?? 0) > 0 ? 1 : 0);

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
                    {(gameState.hasKey || chestKeys > 0) && (
                      <div
                        className={
                          isCompact
                            ? "relative flex h-10 w-10 items-center justify-center rounded bg-[#333333] transition-colors hover:bg-[#444444]"
                            : "px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0 flex items-center gap-1"
                        }
                        title={chestKeys > 0 ? `Keys (${chestKeys})` : "Key"}
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
                        {!isCompact && <span>{chestKeys > 0 ? `Key x${chestKeys}` : "Key"}</span>}
                        {isCompact && chestKeys > 1 && (
                          <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">
                            {chestKeys}
                          </span>
                        )}
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
                        title="Snake Medallion — Place or travel to portal (press M)"
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
                        {isCompact ? (
                          <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">
                            M
                          </span>
                        ) : (
                          <>
                            <span>Snake Medallion</span>
                            <span className="ml-1 text-[10px] text-gray-300/80 whitespace-nowrap hidden sm:inline">
                              (M)
                            </span>
                          </>
                        )}
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
                          <>
                            <span className="absolute top-0 left-0 rounded-br bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">
                              R
                            </span>
                            <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">
                              {gameState.rockCount}
                            </span>
                          </>
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
                          <>
                            <span className="absolute top-0 left-0 rounded-br bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">
                              T
                            </span>
                            <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">
                              {gameState.runeCount}
                            </span>
                          </>
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
                    {(gameState.bombCount ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={handleThrowBomb}
                        className={
                          isCompact
                            ? "relative flex h-10 w-10 items-center justify-center rounded bg-[#333333] transition-colors hover:bg-[#444444]"
                            : "px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0 flex items-center gap-1"
                        }
                        title={`Throw bomb (${gameState.bombCount}) — tap or press B`}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            display: "inline-block",
                            width: 32,
                            height: 32,
                            backgroundImage: "url(/images/items/bomb-black.png)",
                            backgroundSize: "contain",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                          }}
                        />
                        {isCompact ? (
                          <>
                            <span className="absolute top-0 left-0 rounded-br bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">
                              B
                            </span>
                            <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">
                              {gameState.bombCount}
                            </span>
                          </>
                        ) : (
                          <>
                            <span>Bomb x{gameState.bombCount}</span>
                            <span className="ml-1 text-[10px] text-gray-300/80 whitespace-nowrap hidden sm:inline">
                              (tap or B)
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
                          <>
                            <span className="absolute top-0 left-0 rounded-br bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">
                              F
                            </span>
                            <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">
                              {gameState.foodCount}
                            </span>
                          </>
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
                          <>
                            <span className="absolute top-0 left-0 rounded-br bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">
                              P
                            </span>
                            <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">
                              {gameState.potionCount}
                            </span>
                          </>
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
                    {(gameState.berryCount ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={handleUseBerry}
                        className={
                          isCompact
                            ? "relative flex h-10 w-10 items-center justify-center rounded bg-[#333333] transition-colors hover:bg-[#444444]"
                            : "px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0 flex items-center gap-1"
                        }
                        title={`Use berry (${gameState.berryCount}) — heals 2-3 — tap or press G`}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            display: "inline-block",
                            width: 32,
                            height: 32,
                            backgroundImage: "url(/images/items/berry.png)",
                            backgroundSize: "contain",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                          }}
                        />
                        {isCompact ? (
                          <>
                            <span className="absolute top-0 left-0 rounded-br bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">
                              G
                            </span>
                            <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">
                              {gameState.berryCount}
                            </span>
                          </>
                        ) : (
                          <>
                            <span>Berry x{gameState.berryCount}</span>
                            <span className="ml-1 text-[10px] text-gray-300/80 whitespace-nowrap hidden sm:inline">
                              (tap or G)
                            </span>
                          </>
                        )}
                      </button>
                    )}
                    {(gameState.pinkHeartCount ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={handleUsePinkHeart}
                        className={
                          isCompact
                            ? "relative flex h-10 w-10 items-center justify-center rounded bg-[#333333] transition-colors hover:bg-[#444444]"
                            : "px-2 py-0.5 text-xs bg-[#333333] text-white rounded hover:bg-[#444444] transition-colors border-0 flex items-center gap-1"
                        }
                        title={`Use pink heart (${gameState.pinkHeartCount}) — full heal + 3 hearts — tap or press H`}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            display: "inline-block",
                            width: 32,
                            height: 32,
                            backgroundImage: "url(/images/items/pink-heart.png)",
                            backgroundSize: "contain",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                          }}
                        />
                        {isCompact ? (
                          <>
                            <span className="absolute top-0 left-0 rounded-br bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">
                              H
                            </span>
                            <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[9px] font-bold leading-tight text-white">
                              {gameState.pinkHeartCount}
                            </span>
                          </>
                        ) : (
                          <>
                            <span>Pink Heart x{gameState.pinkHeartCount}</span>
                            <span className="ml-1 text-[10px] text-gray-300/80 whitespace-nowrap hidden sm:inline">
                              (tap or H)
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
              // .smooth-movement scopes CSS overrides that keep per-tile FOV
              // classes from creating stacking contexts (see globals.css).
              className={`${styles.viewportContainer} max-w-full overflow-auto${smoothEnabled ? " smooth-movement" : ""}`}
              data-testid="tilemap-grid-container"
              style={{
                gridTemplateColumns:
                  process.env.NODE_ENV === "test"
                    ? "repeat(25, 1fr)"
                    : undefined,
              }}
            >
              <div
                ref={smoothMapNodeRef}
                className={styles.mapContainer}
                style={{
                  // Smooth mode: the rAF loop owns this transform (per-frame
                  // writes); render the current visual position so re-renders
                  // mid-tween don't snap the camera. Legacy: CSS transition.
                  transform: smoothEnabled
                    ? smoothVisualRef.current
                      ? `translate(${calculateMapTransform(smoothVisualRef.current, mapRows, mapCols)})`
                      : playerPosition
                      ? `translate(${calculateMapTransform(playerPosition, mapRows, mapCols)})`
                      : "none"
                    : playerPosition
                    ? `translate(${calculateMapTransform(playerPosition, mapRows, mapCols)})`
                    : "none",
                  transition: smoothEnabled ? "none" : undefined,
                }}
              >
                {environment === "pink_realm" && (
                  <PinkRealmSparkles
                    tiles={gameState.mapData.tiles}
                    dark={inNightmare}
                  />
                )}
                {/* Death vignette overlay - darkens everything except spotlight on hero */}
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
                {bombThrowEffect &&
                  (() => {
                    const tileSize = 40;
                    const pxLeft = (bombThrowEffect.x + 0.5) * tileSize;
                    const pxTop = (bombThrowEffect.y + 0.5) * tileSize;
                    const size = 26;
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
                          backgroundImage: "url(/images/items/bomb-black.png)",
                          backgroundSize: "contain",
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "center",
                          filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.5))",
                          transition: `left 45ms linear, top 45ms linear`,
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
                    const size = bamEffect.size ?? 48; // effect image size in px
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
                {/* Bomb detonation: the three BAM frames layered and scaled up over the
                    3x3 blast, triggered in a staggered sequence for a big cartoon boom. */}
                {(gameState.recentBombBlasts ?? []).length > 0 &&
                  (() => {
                    const tileSize = 40; // px
                    const size = Math.round(tileSize * 3.6); // ~144px, covers 3x3 + spill
                    const bamSrcs = [
                      "/images/items/bam1.png",
                      "/images/items/bam2.png",
                      "/images/items/bam3.png",
                    ];
                    const rots = [-12, 10, 0];
                    const out: React.ReactNode[] = [];
                    (gameState.recentBombBlasts ?? []).forEach(([by, bx], i) => {
                      const pxLeft = (bx + 0.5) * tileSize;
                      const pxTop = (by + 0.5) * tileSize;
                      bamSrcs.forEach((src, k) => {
                        out.push(
                          <div
                            key={`bomb-bam-${by}-${bx}-${i}-${k}`}
                            data-testid="bomb-blast-effect"
                            aria-hidden="true"
                            className="absolute pointer-events-none"
                            style={
                              {
                                left: `${pxLeft - size / 2}px`,
                                top: `${pxTop - size / 2}px`,
                                width: `${size}px`,
                                height: `${size}px`,
                                backgroundImage: `url(${src})`,
                                backgroundSize: "contain",
                                backgroundRepeat: "no-repeat",
                                backgroundPosition: "center",
                                zIndex: 12500 + k,
                                opacity: 0,
                                "--bam-rot": `${rots[k]}deg`,
                                animation: `bombBam 480ms ease-out ${k * 90}ms forwards`,
                              } as React.CSSProperties
                            }
                          />
                        );
                      });
                    });
                    return out;
                  })()}
                {floating.length > 0 &&
                  (() => {
                    const tileSize = 40; // px
                    return floating.map((f) => {
                      const pxLeft = (f.x + 0.5) * tileSize;
                      const pxTop = (f.y + 0.5) * tileSize;
                      const cssColor = floatingColor(f);
                      return (
                        <div
                          key={f.id}
                          data-testid="floating-damage"
                          data-target={f.target}
                          data-y={String(f.y)}
                          data-x={String(f.x)}
                          data-amount={String(f.amount)}
                          data-color={cssColor}
                          data-kind={f.kind ?? ""}
                          data-miss={f.miss ? "true" : "false"}
                          aria-hidden="true"
                          className="absolute pointer-events-none"
                          style={{
                            left: `${pxLeft}px`,
                            top: `${pxTop}px`,
                            zIndex: 11500,
                            color: cssColor,
                            fontWeight: 800,
                            fontSize: f.miss ? "0.78em" : "1em",
                            fontStyle: f.miss ? "italic" : "normal",
                            letterSpacing: f.miss ? "0.02em" : "0",
                            textShadow:
                              "0 1px 2px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,0.6)",
                            // Pop, rise, and fade (centered via the keyframes' translate).
                            animation: "damageFloat 1100ms ease-out forwards",
                          }}
                        >
                          {f.miss ? "miss" : `${f.sign}${f.amount}`}
                        </div>
                      );
                    });
                  })()}
                {/* Enemies dropping into a freshly opened abyss, facing the way
                    they stepped, shrinking to nothing as they fall. */}
                {enemyAbyssFalls.length > 0 &&
                  (() => {
                    const tileSize = 40; // px
                    return enemyAbyssFalls.map((f) => {
                      const pxLeft = (f.x + 0.5) * tileSize;
                      const pxTop = (f.y + 0.5) * tileSize;
                      // Show the sprite for the direction it walked in: toward the
                      // viewer (down) = front, away (up) = back, sideways = the
                      // right-facing asset mirrored for left.
                      const facing =
                        f.dir === "up"
                          ? "back"
                          : f.dir === "left" || f.dir === "right"
                          ? "right"
                          : "front";
                      const flip = f.dir === "left";
                      return (
                        <div
                          key={f.id}
                          aria-hidden="true"
                          className="absolute pointer-events-none"
                          style={{
                            left: `${pxLeft - tileSize / 2}px`,
                            top: `${pxTop - tileSize / 2}px`,
                            width: `${tileSize}px`,
                            height: `${tileSize}px`,
                            zIndex: 10500, // same layer as live enemies
                            // The animation owns `transform` (slide + shrink);
                            // the horizontal flip lives on the inner sprite so
                            // the two never clobber each other.
                            animation: "enemyAbyssFall 640ms forwards",
                            ...(f.fallFrom
                              ? ({ ["--fall-from" as string]: f.fallFrom } as React.CSSProperties)
                              : null),
                          }}
                        >
                          <div
                            style={{
                              width: "100%",
                              height: "100%",
                              backgroundImage: `url(${getEnemyIcon(
                                f.kind as EnemyKind,
                                facing
                              )})`,
                              backgroundSize: "contain",
                              backgroundRepeat: "no-repeat",
                              backgroundPosition: "center",
                              transform: flip ? "scaleX(-1)" : undefined,
                            }}
                          />
                        </div>
                      );
                    });
                  })()}
                {/* Pink goblin ranged-attack beam (attacker -> hero) */}
                {pinkBeams.length > 0 &&
                  (() => {
                    const tileSize = 40; // px
                    return pinkBeams.map((b) => {
                      const x1 = (b.fromX + 0.5) * tileSize;
                      const y1 = (b.fromY + 0.5) * tileSize;
                      const x2 = (b.toX + 0.5) * tileSize;
                      const y2 = (b.toY + 0.5) * tileSize;
                      const len = Math.hypot(x2 - x1, y2 - y1);
                      const ang = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
                      return (
                        <div
                          key={b.id}
                          aria-hidden="true"
                          className="absolute pointer-events-none"
                          style={{
                            left: `${x1}px`,
                            top: `${y1 - 2}px`,
                            width: `${len}px`,
                            height: "4px",
                            transformOrigin: "0 50%",
                            transform: `rotate(${ang}deg)`,
                            background:
                              "linear-gradient(90deg, rgba(255,105,220,0.95), rgba(255,182,235,0.7))",
                            borderRadius: "2px",
                            boxShadow: "0 0 6px 2px rgba(255,105,220,0.55)",
                            zIndex: 10800, // over enemies, under the hero
                            animation: "pinkBeamFlash 100ms ease-out forwards",
                          }}
                        />
                      );
                    });
                  })()}
                {/* Bang flash on the hero when a pink beam connects */}
                {heroBangs.length > 0 &&
                  (() => {
                    const tileSize = 40; // px
                    const size = 28;
                    return heroBangs.map((b) => (
                      <div
                        key={b.id}
                        aria-hidden="true"
                        className="absolute pointer-events-none"
                        style={{
                          left: `${(b.x + 0.5) * tileSize - size / 2}px`,
                          top: `${(b.y + 0.5) * tileSize - size / 2}px`,
                          width: `${size}px`,
                          height: `${size}px`,
                          backgroundImage: "url(/images/items/bam2.png)",
                          backgroundSize: "contain",
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "center",
                          zIndex: 11200, // just above the hero sprite
                          animation: "heroBangPop 200ms ease-out forwards",
                        }}
                      />
                    ));
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
                            className="w-full h-full spirit-drift"
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
                    backgroundColor:
                      heroTorchLitForVisibility && !inNightmare ? undefined : "#000",
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
                    // The nightmare is always dark — never let showFullMap (or a brief
                    // map-reveal on entry) light it up, which caused a delayed darken.
                    (gameState.showFullMap || suppressDarknessOverlay) && !inNightmare,
                    gameState.playerDirection,
                    gameState.enemies,
                    gameState.npcs,
                    gameState.hasSword,
                    gameState.hasShield,
                    heroTorchLitState,
                    suppressDarknessOverlay,
                    gameState.hasExitKey,
                    Boolean(gameState.conditions?.poisoned?.active),
                    activeCheckpoint,
                    heroDeathStateForTiles,
                    warpFlicker,
                    new Set((gameState.mist ?? []).map(([my, mx]) => `${my},${mx}`)),
                    inNightmare,
                    // Smooth movement: overlay hero + viewport-fixed vignette.
                    smoothEnabled && heroDeathPhase === "idle" && !warpFlicker,
                    smoothEnabled,
                    smoothEntitySteps,
                    combatLunges
                  )}
                </div>
                {/* Smooth-movement hero: lives INSIDE the map container at the
                    camera's fractional map position (so it stays visually
                    pinned at viewport center) and shares the map's stacking
                    context at the legacy hero z — above enemies (10500), BELOW
                    wall-top overlays (12000) and trees (11500), so walls and
                    canopies occlude him exactly like the in-tile hero did.
                    Death and warp animations still render in-tile. */}
                {smoothEnabled &&
                  playerPosition &&
                  heroDeathPhase === "idle" &&
                  !warpFlicker && (
                    <div
                      ref={smoothHeroAnchorRef}
                      data-testid="smooth-hero-overlay"
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: 40,
                        height: 40,
                        zIndex: 11000, // matches legacy .heroImage
                        pointerEvents: "none",
                        willChange: "transform",
                        transform: (() => {
                          const v = smoothVisualRef.current ?? playerPosition;
                          return `translate3d(${v[1] * 40}px, ${v[0] * 40}px, 0)`;
                        })(),
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          transform:
                            gameState.playerDirection === Direction.LEFT
                              ? "scaleX(-1)"
                              : undefined,
                          // Combat lunge: standalone `translate` composes
                          // BEFORE `transform`, so the shake direction stays
                          // in world coords even when the sprite is flipped.
                          ...combatLungeStyle(combatLunges.get("hero")),
                        }}
                      >
                        <div
                          ref={smoothHeroSpriteRef}
                          style={{
                            position: "absolute",
                            inset: 0,
                            backgroundImage: `url(${heroSpritePath(
                              gameState.playerDirection,
                              Boolean(gameState.hasSword),
                              Boolean(gameState.hasShield),
                              heroTorchLitState
                            )})`,
                            backgroundSize: "contain",
                            backgroundPosition: "center",
                            backgroundRepeat: "no-repeat",
                            transformOrigin: "50% 100%",
                          }}
                        >
                          {/* Torch flame rides inside the sprite div so the
                              procedural step animation carries it along */}
                          {heroTorchLitState && (() => {
                            const dirKey =
                              gameState.playerDirection === Direction.UP
                                ? ("back" as const)
                                : gameState.playerDirection === Direction.DOWN
                                ? ("front" as const)
                                : ("right" as const);
                            const anchor = HERO_FLAME_ANCHOR[dirKey];
                            return (
                              <PixelFlame
                                cell={1.4}
                                seed={5}
                                style={{
                                  ...anchor,
                                  transform: "translateX(-50%)",
                                }}
                              />
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
              </div>
              {/* Smooth-movement light overlays. The hero is always at the
                  viewport center, so the torch glow + vignette can be fixed
                  there (they normally live in map space; renderTileGrid skips
                  them in smooth mode). isolation keeps these z-indexes from
                  competing with page-level modals; FloorTransition is a later
                  sibling, so the iris wipe still paints above everything. */}
              {smoothEnabled && playerPosition && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    isolation: "isolate",
                    overflow: "hidden",
                  }}
                  aria-hidden="true"
                >
                  {!gameState.showFullMap &&
                    !suppressDarknessOverlay &&
                    heroTorchLitState &&
                    !inNightmare &&
                    (() => {
                      // Gradients bake centered into an oversized box that
                      // follows the hero (the rAF loop updates the transform
                      // mid-step), so the light stays on him even when the
                      // clamped camera parks him off-center at map edges.
                      const v = smoothVisualRef.current ?? playerPosition;
                      const hero = heroViewportPosition(v, mapRows, mapCols);
                      const g = buildHeroLightGradients(
                        LIGHT_BOX_CENTER,
                        LIGHT_BOX_CENTER,
                        true
                      );
                      return (
                        <div
                          ref={smoothLightAnchorRef}
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            width: LIGHT_BOX_SIZE,
                            height: LIGHT_BOX_SIZE,
                            willChange: "transform",
                            transform: `translate3d(${
                              hero.x - LIGHT_BOX_CENTER
                            }px, ${hero.y - LIGHT_BOX_CENTER}px, 0)`,
                          }}
                        >
                          <div
                            className={styles.torchGlow}
                            style={{
                              backgroundImage: g.torchGradient,
                              zIndex: 9000,
                            }}
                          />
                          <div
                            className="pointer-events-none absolute inset-0"
                            style={{
                              backgroundImage: g.vignetteGradient,
                              zIndex: 10000,
                            }}
                          />
                        </div>
                      );
                    })()}
                </div>
              )}
              {/* Floor transition iris wipe overlay */}
              {floorTransition && (
                <FloorTransition
                  closeCenter={floorTransition.closeCenter}
                  openCenter={floorTransition.openCenter ?? floorTransition.closeCenter}
                  onSwapFloor={() => {
                    if (floorTransition.pendingGameState) {
                      const nextState = floorTransition.pendingGameState;
                      setGameState(nextState);
                      CurrentGameStorage.saveCurrentGame(nextState, resolvedStorageSlot);
                    }
                  }}
                  onComplete={() => {
                    setFloorTransition(null);
                    setWarpFlicker(false);
                  }}
                />
              )}
            </div>
          </div>
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

      {activeBedInteraction && (
        <BedInteractionModal
          isOccupied={activeBedInteraction.isOccupied}
          onSleep={() => {
            // Restore health to full
            setGameState((prev) => {
              const next = {
                ...prev,
                heroHealth: 6, // Full health
              };
              CurrentGameStorage.saveCurrentGame(next, resolvedStorageSlot);
              return next;
            });
            setActiveBedInteraction(null);
          }}
          onCancel={() => setActiveBedInteraction(null)}
        />
      )}
      
      {/* Mobile controls - Outside ScreenShake to prevent displacement */}
      <MobileControls
        onMove={handleMobileMoveStart}
        onMoveEnd={handleMobileMoveEnd}
        onThrowRock={handleThrowRock}
        rockCount={gameState.rockCount ?? 0}
        onUseRune={handleThrowRune}
        runeCount={gameState.runeCount ?? 0}
        onThrowBomb={handleThrowBomb}
        bombCount={gameState.bombCount ?? 0}
        inventoryItems={[
          ...((gameState.rockCount ?? 0) > 0
            ? [{
                key: "rock",
                label: "Rock",
                icon: "/images/items/rock-1.png",
                count: gameState.rockCount,
                onUse: handleThrowRock,
              }]
            : []),
          ...((gameState.runeCount ?? 0) > 0
            ? [{
                key: "rune",
                label: "Rune",
                icon: "/images/items/rune1.png",
                count: gameState.runeCount,
                onUse: handleThrowRune,
              }]
            : []),
          ...((gameState.bombCount ?? 0) > 0
            ? [{
                key: "bomb",
                label: "Bomb",
                icon: "/images/items/bomb-black.png",
                count: gameState.bombCount,
                onUse: handleThrowBomb,
              }]
            : []),
          ...((gameState.foodCount ?? 0) > 0
            ? [{
                key: "food",
                label: "Food",
                icon: "/images/items/food-1.png",
                count: gameState.foodCount,
                onUse: handleUseFood,
              }]
            : []),
          ...((gameState.potionCount ?? 0) > 0
            ? [{
                key: "potion",
                label: "Potion",
                icon: "/images/items/meds-1.png",
                count: gameState.potionCount,
                onUse: handleUsePotion,
              }]
            : []),
          ...((gameState.berryCount ?? 0) > 0
            ? [{
                key: "berry",
                label: "Berry",
                icon: "/images/items/berry.png",
                count: gameState.berryCount,
                onUse: handleUseBerry,
              }]
            : []),
          ...((gameState.pinkHeartCount ?? 0) > 0
            ? [{
                key: "pink-heart",
                label: "Pink Heart",
                icon: "/images/items/pink-heart.png",
                count: gameState.pinkHeartCount,
                onUse: handleUsePinkHeart,
              }]
            : []),
          ...(gameState.hasSnakeMedallion
            ? [{
                key: "medallion",
                label: "Medallion",
                icon: "/images/items/snake-medalion.png",
                onUse: handleSnakeMedallionClick,
              }]
            : []),
          ...(diaryEntries.length > 0
            ? [{ key: "diary", label: "Diary", emoji: "📖", onUse: () => setHeroDiaryOpen(true) }]
            : []),
          ...(gameState.hasKey || (gameState.chestKeyCount ?? 0) > 0
            ? [{
                key: "key",
                label: (gameState.chestKeyCount ?? 0) > 1 ? "Keys" : "Key",
                icon: "/images/items/key.png",
                count: (gameState.chestKeyCount ?? 0) > 0 ? gameState.chestKeyCount : undefined,
              }]
            : []),
          ...(gameState.hasExitKey
            ? [{ key: "exit-key", label: "Exit Key", icon: "/images/items/exit-key.png" }]
            : []),
          ...(gameState.hasSword
            ? [{ key: "sword", label: "Sword", icon: "/images/items/sword.png" }]
            : []),
          ...(gameState.hasShield
            ? [{ key: "shield", label: "Shield", icon: "/images/items/shield.png" }]
            : []),
        ]}
      />
    </div>
  );
};

// Calculate visibility based on player position
function calculateVisibility(
  grid: number[][],
  playerPosition: [number, number] | null,
  showFullMap: boolean = false,
  heroTorchLit: boolean = true,
  nightmare: boolean = false
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

  // Nightmare room: the dark smothers the torch — only the hero's own tile and the four
  // orthogonally-adjacent tiles are lit, regardless of torch state.
  if (nightmare) {
    visibility[playerY][playerX] = 3;
    const orth: Array<[number, number]> = [
      [playerY - 1, playerX],
      [playerY + 1, playerX],
      [playerY, playerX - 1],
      [playerY, playerX + 1],
    ];
    for (const [y, x] of orth) {
      if (y >= 0 && y < gridHeight && x >= 0 && x < gridWidth) {
        visibility[y][x] = 1;
      }
    }
    return visibility;
  }

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
  activeCheckpoint?: [number, number] | null,
  heroDeathState?: HeroDeathState,
  heroWarping: boolean = false,
  mistKeys: Set<string> = new Set(),
  inNightmare: boolean = false,
  // Smooth movement: hero renders as a viewport overlay instead of in-tile,
  // and the torch glow / vignette render viewport-fixed (skip them here).
  suppressHeroSprite: boolean = false,
  viewportCenteredVignette: boolean = false,
  // Phase 2: one-tile slide-in animations, keyed "e:y,x" / "n:y,x" by
  // destination tile (see smoothEntitySteps in the component).
  entitySteps?: Map<string, SmoothEntityStep>,
  // Combat lunges keyed "hero" / "e:y,x" (see combatLunges in the component).
  combatLunges?: Map<string, CombatLunge>
) {
  const resolvedEnvironment = environment ?? DEFAULT_ENVIRONMENT;
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
    heroTorchLitForVisibility,
    inNightmare
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
      } else if (g === SECOND_RING_GLOW) {
        tier = Math.max(tier, 1);
      }
      // Classify a tile by its strongest torch contribution so that, while the
      // hero's own torch is out, wall torches cast a soft flickering falloff:
      // orthogonal arms brightest (.fov-tier-torch-adj), diagonal corners dimmer
      // (.fov-tier-torch-diag), and the rounded second ring faintest
      // (.fov-tier-torch-far) — instead of a hard cross with black corners.
      const isTorchAdjacentGlow = g === ADJACENT_GLOW;
      const isTorchDiagonalGlow = g === DIAGONAL_GLOW;
      const isTorchSecondRingGlow = g === SECOND_RING_GLOW;
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
      // For white goblins: count ALL white goblins on this tile (asset reflects how many are present)
      const swarmCountAtTile = (() => {
        if (!enemyAtTile || enemyAtTile.kind !== 'white-goblin') return undefined;
        if (!enemies) return 1;
        return enemies.filter(
          e => e.kind === 'white-goblin' && e.y === rowIndex && e.x === colIndex
        ).length || 1;
      })();
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
            const wrapperStyle: React.CSSProperties = {};
            // Raise z-index so lit tiles appear above the dark vignette overlay
            if (g != null || isSelfTorch) {
              wrapperStyle.zIndex = 10050;
            }
            // Desync each torch tile's flicker so neighbors don't pulse in
            // lockstep. Deterministic from coords (stable across renders); the
            // CSS var cascades into the tile's torch-glow flicker animation.
            if (
              (isTorchDiagonalGlow ||
                isTorchAdjacentGlow ||
                isTorchSecondRingGlow) &&
              !heroTorchLit
            ) {
              const delayMs = ((rowIndex * 53 + colIndex * 97) % 13) * 130;
              (wrapperStyle as Record<string, string | number>)[
                "--flicker-delay"
              ] = `${delayMs}ms`;
            }
            return Object.keys(wrapperStyle).length > 0
              ? wrapperStyle
              : undefined;
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
            torchDiagonalGlow={isTorchDiagonalGlow}
            torchAdjacentGlow={isTorchAdjacentGlow}
            torchSecondRingGlow={isTorchSecondRingGlow}
            neighbors={neighbors}
            playerDirection={isPlayerTile ? playerDirection : undefined}
            heroTorchLit={heroTorchLit}
            heroPoisoned={isPlayerTile ? heroPoisoned : false}
            hasEnemy={hasEnemy}
            enemyVisible={isVisible}
            enemyFacing={enemyAtTile?.facing}
            enemyKind={
              enemyAtTile?.kind as
                | "fire-goblin"
                | "water-goblin"
                | "water-goblin-spear"
                | "earth-goblin"
                | "earth-goblin-knives"
                | "pink-goblin"
                | "ghost"
                | "stone-goblin"
                | "snake"
                | "white-goblin"
                | undefined
            }
            enemySwarmCount={swarmCountAtTile}
            enemyMoved={Boolean(
              (enemyAtTile?.behaviorMemory as Record<string, unknown> | undefined)?.["moved"]
            )}
            enemyAura={(() => {
              if (!enemyAtTile) return false;
              if (enemyAtTile.kind !== "stone-goblin") return false;
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
            inNightmare={inNightmare}
            activeCheckpoint={activeCheckpoint}
            heroDeathState={isPlayerTile ? heroDeathState : undefined}
            heroWarping={!!isPlayerTile && heroWarping}
            suppressHeroSprite={!!isPlayerTile && suppressHeroSprite}
            enemyStep={
              hasEnemy ? entitySteps?.get(`e:${rowIndex},${colIndex}`) : undefined
            }
            npcStep={
              npcAtTile ? entitySteps?.get(`n:${rowIndex},${colIndex}`) : undefined
            }
            heroLunge={isPlayerTile ? combatLunges?.get("hero") : undefined}
            enemyLunge={
              hasEnemy ? combatLunges?.get(`e:${rowIndex},${colIndex}`) : undefined
            }
            // viewportCenteredVignette is set exactly when smooth mode is on
            smoothMode={viewportCenteredVignette}
            enemyRingUnder={
              enemyAtTile?.kind === "pink-goblin" &&
              typeof (
                enemyAtTile.behaviorMemory as
                  | { ringY?: unknown }
                  | undefined
              )?.ringY !== "number"
            }
          />
          {/* Pink-realm mist: a soft drifting haze over the tile (above the floor + actors,
              semi-transparent), shown only where the tile is currently visible. */}
          {isVisible && mistKeys.has(`${rowIndex},${colIndex}`) && (
            <div className={styles.mistOverlay} aria-hidden="true" />
          )}
        </div>
      );
    })
  );

  // Add a smooth radial gradient overlay centered on the player for continuous
  // fade. In smooth-movement mode these are rendered viewport-fixed by the
  // component instead (the hero is always at viewport center there).
  if (playerPosition && !showFullMap && !viewportCenteredVignette) {
    const [py, px] = playerPosition; // grid coords
    const tileSize = 40; // px (w-10/h-10)
    const centerX = (px + 0.5) * tileSize;
    const centerY = (py + 0.5) * tileSize;
    const { torchGradient, vignetteGradient: gradient } =
      buildHeroLightGradients(centerX, centerY, heroTorchLitForVisibility);

    // Push the warm torch glow first (lower z) ONLY if the hero's torch is lit,
    // then the dark vignette (higher z) ONLY when torch is lit as well.
    if (!suppressDarknessOverlay && heroTorchLitForVisibility && !inNightmare) {
      tiles.push(
        <div
          key="torch-glow"
          className={`${styles.torchGlow}`}
          style={{ backgroundImage: torchGradient, zIndex: 9000 }}
        />
      );
    }
    if (!suppressDarknessOverlay && heroTorchLitForVisibility && !inNightmare) {
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

// Locate the player in a (possibly not-yet-committed) game state. Smooth
// movement uses this to read the post-move position synchronously.
function findPlayerInState(state: GameState): [number, number] | null {
  const subs = state.mapData.subtypes;
  if (!subs) return null;
  for (let y = 0; y < subs.length; y++) {
    for (let x = 0; x < subs[y].length; x++) {
      if (subs[y][x].includes(TileSubtype.PLAYER)) return [y, x];
    }
  }
  return null;
}

// Torch glow + darkness vignette gradients centered on (centerX, centerY) px.
// Shared by renderTileGrid (map-space, legacy) and the smooth-movement
// viewport overlay (fixed at viewport center) so the two never drift.
function buildHeroLightGradients(
  centerX: number,
  centerY: number,
  torchLit: boolean
): { torchGradient: string; vignetteGradient: string } {
  const tileSize = 40;
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
  const vignetteGradient = torchLit
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

  return { torchGradient, vignetteGradient };
}

// Camera offsets that center the player where possible, clamped so the
// 600px viewport never slides past the map edges (which would show the page
// background through the empty part of the viewport). Maps smaller than the
// viewport stay centered.
function calculateMapOffsets(
  playerPosition: [number, number],
  mapRows?: number,
  mapCols?: number
): { tx: number; ty: number } {
  const tileSize = 40; // px
  const viewportWidth = 600; // px (from CSS)
  const viewportHeight = 600; // px (from CSS)

  // Calculate the center position of the player in pixels
  const playerX = (playerPosition[1] + 0.5) * tileSize;
  const playerY = (playerPosition[0] + 0.5) * tileSize;

  // Calculate the transform to center the player in the viewport
  let tx = viewportWidth / 2 - playerX;
  let ty = viewportHeight / 2 - playerY;

  if (mapCols) {
    const mapWidth = mapCols * tileSize;
    tx =
      mapWidth <= viewportWidth
        ? (viewportWidth - mapWidth) / 2
        : Math.min(0, Math.max(viewportWidth - mapWidth, tx));
  }
  if (mapRows) {
    const mapHeight = mapRows * tileSize;
    ty =
      mapHeight <= viewportHeight
        ? (viewportHeight - mapHeight) / 2
        : Math.min(0, Math.max(viewportHeight - mapHeight, ty));
  }

  return { tx, ty };
}

// Calculate the transform to center the map on the player
export function calculateMapTransform(
  playerPosition: [number, number],
  mapRows?: number,
  mapCols?: number
): string {
  if (!playerPosition) return "0px, 0px";
  const { tx, ty } = calculateMapOffsets(playerPosition, mapRows, mapCols);
  return `${tx}px, ${ty}px`;
}

// Where the hero lands inside the 600px viewport under the clamped camera:
// dead center normally, off-center when the camera is pinned at a map edge.
export function heroViewportPosition(
  playerPosition: [number, number],
  mapRows?: number,
  mapCols?: number
): { x: number; y: number } {
  const { tx, ty } = calculateMapOffsets(playerPosition, mapRows, mapCols);
  return {
    x: tx + (playerPosition[1] + 0.5) * 40,
    y: ty + (playerPosition[0] + 0.5) * 40,
  };
}

// Oversized backing box for the smooth-mode torch/vignette overlay: the
// gradients are baked centered in this box and the box itself is translated
// to follow the hero, so per-frame updates are transform-only. Past the
// gradient's last stop the vignette continues as solid black, so the extra
// 320px margin keeps the viewport covered even when the clamped camera lets
// the hero drift up to ~300px from center.
const LIGHT_BOX_SIZE = 1240;
const LIGHT_BOX_CENTER = LIGHT_BOX_SIZE / 2;
