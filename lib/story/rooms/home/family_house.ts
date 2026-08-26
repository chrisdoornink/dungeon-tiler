/**
 * The Doornink House (Hearth & Home)
 *
 * Chris's real floor plan as one continuous walkable interior. Single story:
 * laundry / kitchen / dining / living down the left, bathroom + three bedrooms
 * down the right, a back hall between laundry and bathroom, and a closet nook
 * off Chris & Annie's bedroom. Interior doorways are open floor gaps; the
 * front and back doors are visual-only 'd' wall tiles until the yard exists.
 *
 * Scale: 12x17 (Chris trimmed a hall row from the halved 12x18 pass).
 *
 * Character toggle: FAMILY_MEMBERS is the single source of truth for the
 * playable cast. Whoever is the active hero is excluded from the NPC roster
 * and enters through the front door; everyone else is home. Sprites are
 * placeholders until the real family set is generated.
 */

import { Direction, TileSubtype } from "../../../map"
import type { StoryRoom } from "../types"
import { buildRoom, type RoomConfig } from "../room-builder"
import { NPC } from "../../../npc"

const WIDTH = 12;
const HEIGHT = 17;

export const FAMILY_HOUSE_ROOM_ID = "home-family-house";

/**
 * Rows 0-3:   laundry | back hall (back door up top) | bathroom | closet
 * Rows 4-7:   kitchen (pot 'p') | Chris & Annie's bedroom (beds 'a','b')
 * Rows 8-11:  dining room | Claire's room (bed 'c')
 * Rows 12-15: living room (bookshelf 'k') | Emerson's room (bed 'e'), front door bottom
 */
const VISUAL_MAP = [
  "# # w # # d # w # # # #",
  "# . . # . . # . . # . #",
  "# . . . . . . . . # . #",
  "# # w # . . # # w # . #",
  "# . . . . . . . . . . #",
  "w . . . . . . # . a b #",
  "# . p . . . . # . . . #",
  "# . . . . . . # . . . #",
  "# # w # . . # # w # # #",
  "# . . . . . # . . c # #",
  "# . . . . . # . . . # #",
  "# . . . . . . . . . # #",
  "# # . . # w # # w # # #",
  "# k . . . . # . . e # #",
  "# . . . . . . . . . # #",
  "# . . . . . # . . . # #",
  "# # # # d # # # # # # #",
];

/**
 * Hero spawn: derived from the map so map edits can't strand the hero —
 * the tile directly above the front door ('d') in the bottom wall row.
 */
const FRONT_DOOR_ROW = VISUAL_MAP.length - 1;
const FRONT_DOOR_COL = VISUAL_MAP[FRONT_DOOR_ROW]
  .split(" ")
  .filter((token) => token !== "")
  .indexOf("d");

export const FAMILY_HOUSE_SPAWN: [number, number] = [
  FRONT_DOOR_ROW - 1,
  FRONT_DOOR_COL,
];

export type FamilyMemberId = "chris" | "annie" | "emerson" | "claire" | "opal";

export interface FamilyMember {
  id: FamilyMemberId;
  npcId: string;
  name: string;
  /** Front view — used as the NPC sprite, the hero override, and the fallback for all facings. */
  sprite: string;
  /** Back view (facing UP). Optional; front is the fallback. */
  spriteBack?: string;
  /** Side view facing RIGHT (mirrored for left). Optional; front is the fallback. */
  spriteSide?: string;
  /** Render height as % of the tile when playing as this member (85 = NPC standard, 51 = dog). */
  heroSpriteScale?: number;
  /** Tiles per turn as an NPC (fractional; accumulates). Emerson is quick,
   * Claire unhurried. Default 1. */
  speed?: number;
  /** This member's locked bedroom chest (holds a sword). Omitted for Opal. */
  chest?: [number, number];
  /** Where they hang out when they're an NPC. */
  home: [number, number];
  facing: Direction;
  canMove: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export const FAMILY_MEMBERS: FamilyMember[] = [
  // Chris — living room, working on a riff by the bookshelf.
  // Real assets (raw art in public/images/family/raw/, processed by
  // scripts/prepare-family-sprites.mjs).
  {
    id: "chris",
    npcId: "npc-chris",
    name: "Chris",
    sprite: "/images/family/chris-front.png",
    spriteBack: "/images/family/chris-back.png",
    spriteSide: "/images/family/chris-side.png",
    heroSpriteScale: 126,
    speed: 1.15,
    home: [13, 2],
    chest: [6, 10],
    facing: Direction.DOWN,
    canMove: true,
    // metadata.scale is the NPC-layer size (heroSpriteScale / 85, the NPC standard)
    metadata: { scale: 1.48 },
  },
  // Annie — kitchen, mid-project as always. Real assets.
  {
    id: "annie",
    npcId: "npc-annie",
    name: "Annie",
    // Town-NPC look (Chris's pick): girl-1 front, generated back (see
    // scripts/make-family-npc-variants.mjs). No side art — front is the fallback.
    sprite: "/images/npcs/girl-1.png",
    spriteBack: "/images/family/annie-girl1-back.png",
    heroSpriteScale: 126,
    speed: 1.15,
    home: [6, 3],
    // Annie has NO chest — there are only three swords for four hands, so she
    // ends up empty-handed and says so (the intro's "...none for me?" beat).
    facing: Direction.DOWN,
    canMove: true,
    metadata: { scale: 1.48 },
  },
  // Emerson — his room, never standing still. Real assets; 12 and a little
  // small, so he renders below the kid baseline.
  {
    id: "emerson",
    npcId: "npc-emerson",
    name: "Emerson",
    // Town-NPC look (Chris's pick): boy-3 front, generated back.
    sprite: "/images/npcs/boy-3.png",
    spriteBack: "/images/family/emerson-boy3-back.png",
    heroSpriteScale: 110,
    speed: 1.4,
    home: [13, 8],
    chest: [15, 9],
    facing: Direction.LEFT,
    canMove: true,
    metadata: { scale: 1.29 },
  },
  // Claire — her room, calm and still. Real assets; 14, ~75% of the adults.
  {
    id: "claire",
    npcId: "npc-claire",
    name: "Claire",
    // Town-NPC look (Chris's pick): girl-2 recolored to Claire (her hair
    // color, dark shirt, blue shorts) + generated back.
    sprite: "/images/family/claire-girl2-front.png",
    spriteBack: "/images/family/claire-girl2-back.png",
    heroSpriteScale: 116,
    speed: 0.85,
    home: [10, 8],
    chest: [11, 9],
    facing: Direction.DOWN,
    canMove: true,
    metadata: { scale: 1.36 },
  },
  // Opal — starts in the living room, roams the house
  {
    id: "opal",
    npcId: "npc-opal",
    name: "Opal",
    sprite: "/images/dog-golden/dog-front-1.png",
    // Opal is 6lbs in real life: 30% under the standard dog render (51).
    heroSpriteScale: 36,
    speed: 1.25,
    home: [15, 2],
    facing: Direction.DOWN,
    canMove: true,
    tags: ["dog", "pet"],
    // NPC dogs already render at 51% via their own CSS class; scale is relative to that.
    metadata: { scale: 0.7 },
  },
];

export function getFamilyMember(id: FamilyMemberId): FamilyMember {
  const member = FAMILY_MEMBERS.find((m) => m.id === id);
  if (!member) throw new Error(`Unknown family member: ${id}`);
  return member;
}

/**
 * Build one family member's NPC at a given spot. Used for the initial roster
 * and by the control switch (the ex-hero re-enters the world as an NPC).
 */
export function createFamilyNpc(
  member: FamilyMember,
  at: {
    y: number;
    x: number;
    facing: Direction;
    followOrder: number;
    health?: number;
    maxHealth?: number;
    armed?: boolean;
  }
): NPC {
  return new NPC({
    id: member.npcId,
    name: member.name,
    sprite: member.sprite,
    y: at.y,
    x: at.x,
    facing: at.facing,
    canMove: member.canMove,
    maxHealth: at.maxHealth,
    health: at.health,
    tags: member.tags,
    metadata: {
      ...member.metadata,
      // Marks this NPC as a combat-capable party member and links it back to
      // its roster entry (game-state's party combat keys off this).
      partyId: member.id,
      // Movement pace for goto/follow (see takeMovementBudget).
      ...(member.speed ? { speed: member.speed } : {}),
      // Family members hold their own space by default — they do NOT trail the
      // hero (that trapped you in the house). The combat AI wakes them when an
      // enemy comes near; scenarios can assign "goto"/"follow" for a specific
      // job. followOrder is retained for any future party-line use.
      behavior: "idle",
      followOrder: at.followOrder,
      // Drives the code-driven sword overlay on armed family members.
      ...(at.armed ? { armed: true } : {}),
      // Members with real directional art render it by facing; the NPC
      // layer falls back to legacy single-sprite behavior otherwise.
      ...(member.spriteBack || member.spriteSide
        ? {
            directionalSprites: {
              back: member.spriteBack,
              side: member.spriteSide,
            },
          }
        : {}),
    },
  });
}

function buildFamilyNpcs(excludeId?: FamilyMemberId): NPC[] {
  return FAMILY_MEMBERS.filter((m) => m.id !== excludeId).map((m, index) =>
    createFamilyNpc(m, {
      y: m.home[0],
      x: m.home[1],
      facing: m.facing,
      followOrder: index,
    })
  );
}

/**
 * Build the house. The active hero (if given) is left out of the NPC roster —
 * they're the one holding the controller.
 */
export function buildFamilyHouse(activeHeroId?: FamilyMemberId): StoryRoom {
  const config: RoomConfig = {
    id: FAMILY_HOUSE_ROOM_ID,
    size: [WIDTH, HEIGHT],
    visualMap: VISUAL_MAP,
    transitions: {},
    metadata: {
      displayLabel: "The Doornink House",
      description: "Home of Chris, Annie, Emerson, Claire, and Opal the dog.",
    },
    environment: "house",
    npcs: buildFamilyNpcs(activeHeroId),
  };
  const room = buildRoom(config);

  // Intro beat 1: one locked, sword-filled chest per human, at their assigned
  // tile (FamilyMember.chest). Once the keys are found, each family member
  // opens their own — the hero by hand, the NPCs autonomously (see
  // lib/story/hearth_scenario.ts). Opal has none.
  for (const member of FAMILY_MEMBERS) {
    if (!member.chest) continue;
    const [y, x] = member.chest;
    room.mapData.subtypes[y][x] = [
      TileSubtype.CHEST,
      TileSubtype.LOCK,
      TileSubtype.SWORD,
    ];
  }
  return room;
}
