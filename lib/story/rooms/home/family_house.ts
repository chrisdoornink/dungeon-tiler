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

import { Direction } from "../../../map"
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
    heroSpriteScale: 114,
    home: [13, 2],
    facing: Direction.DOWN,
    canMove: false,
    // metadata.scale is the NPC-layer size (heroSpriteScale / 85, the NPC standard)
    metadata: { scale: 1.34 },
  },
  // Annie — kitchen, mid-project as always. Real assets.
  {
    id: "annie",
    npcId: "npc-annie",
    name: "Annie",
    sprite: "/images/family/annie-front.png",
    spriteBack: "/images/family/annie-back.png",
    spriteSide: "/images/family/annie-side.png",
    heroSpriteScale: 114,
    home: [6, 3],
    facing: Direction.DOWN,
    canMove: true,
    metadata: {
      behavior: "wander",
      wanderBounds: { minY: 4, maxY: 7, minX: 3, maxX: 5 },
      scale: 1.34,
    },
  },
  // Emerson — his room, never standing still. Real assets; 12 and a little
  // small, so he renders below the kid baseline.
  {
    id: "emerson",
    npcId: "npc-emerson",
    name: "Emerson",
    sprite: "/images/family/emerson-front.png",
    spriteBack: "/images/family/emerson-back.png",
    spriteSide: "/images/family/emerson-side.png",
    heroSpriteScale: 95,
    home: [13, 8],
    facing: Direction.LEFT,
    canMove: true,
    metadata: {
      behavior: "wander",
      wanderBounds: { minY: 13, maxY: 15, minX: 7, maxX: 8 },
      scale: 1.12,
    },
  },
  // Claire — her room, calm and still. Real assets; 14, ~75% of the adults.
  {
    id: "claire",
    npcId: "npc-claire",
    name: "Claire",
    sprite: "/images/family/claire-front.png",
    spriteBack: "/images/family/claire-back.png",
    spriteSide: "/images/family/claire-side.png",
    heroSpriteScale: 101,
    home: [10, 8],
    facing: Direction.DOWN,
    canMove: false,
    metadata: { scale: 1.19 },
  },
  // Opal — starts in the living room, roams the house
  {
    id: "opal",
    npcId: "npc-opal",
    name: "Opal",
    sprite: "/images/dog-golden/dog-front-1.png",
    // Opal is 6lbs in real life: 30% under the standard dog render (51).
    heroSpriteScale: 36,
    home: [15, 2],
    facing: Direction.DOWN,
    canMove: true,
    tags: ["dog", "pet"],
    // NPC dogs already render at 51% via their own CSS class; scale is relative to that.
    metadata: { behavior: "dog", scale: 0.7 },
  },
];

export function getFamilyMember(id: FamilyMemberId): FamilyMember {
  const member = FAMILY_MEMBERS.find((m) => m.id === id);
  if (!member) throw new Error(`Unknown family member: ${id}`);
  return member;
}

function buildFamilyNpcs(excludeId?: FamilyMemberId): NPC[] {
  return FAMILY_MEMBERS.filter((m) => m.id !== excludeId).map(
    (m) =>
      new NPC({
        id: m.npcId,
        name: m.name,
        sprite: m.sprite,
        y: m.home[0],
        x: m.home[1],
        facing: m.facing,
        canMove: m.canMove,
        tags: m.tags,
        metadata: {
          ...m.metadata,
          // Members with real directional art render it by facing; the NPC
          // layer falls back to legacy single-sprite behavior otherwise.
          ...(m.spriteBack || m.spriteSide
            ? {
                directionalSprites: { back: m.spriteBack, side: m.spriteSide },
              }
            : {}),
        },
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
  return buildRoom(config);
}
