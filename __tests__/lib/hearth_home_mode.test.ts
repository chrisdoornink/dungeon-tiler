import {
  buildHearthHomeState,
  switchPartyMember,
} from "../../lib/story/hearth_home_mode";
import {
  FAMILY_HOUSE_ROOM_ID,
  FAMILY_HOUSE_SPAWN,
  FAMILY_MEMBERS,
} from "../../lib/story/rooms/home";
import { Direction, FLOOR, TileSubtype } from "../../lib/map";
import { resolveHeroSpriteOverride } from "../../lib/hero_sprite";
import { resolveNpcDialogueScript } from "../../lib/story/npc_script_registry";
import { getDialogueScript } from "../../lib/story/dialogue_registry";

describe("buildHearthHomeState", () => {
  const state = buildHearthHomeState();

  it("boots into the family house with no enemies and no transitions", () => {
    expect(state.currentRoomId).toBe(FAMILY_HOUSE_ROOM_ID);
    expect(state.rooms?.[FAMILY_HOUSE_ROOM_ID]).toBeDefined();
    expect(state.enemies).toHaveLength(0);
    expect(state.roomTransitions).toHaveLength(0);
    expect(state.mode).toBe("story");
    expect(state.allowCheckpoints).toBe(false);
  });

  it("spawns the hero on the floor tile directly inside the front door", () => {
    const [sy, sx] = FAMILY_HOUSE_SPAWN;
    const height = state.mapData.tiles.length;
    expect(sy).toBe(height - 2);
    expect(state.mapData.tiles[sy][sx]).toBe(FLOOR);
    expect(state.mapData.subtypes[sy][sx]).toContain(TileSubtype.PLAYER);
    // The tile below the spawn is the front door in the bottom wall.
    expect(state.mapData.subtypes[sy + 1][sx]).toContain(TileSubtype.DOOR);
  });

  it("defaults to Chris: he is the hero (his own sprite), not an NPC", () => {
    expect(state.activeHeroId).toBe("chris");
    expect(state.heroSprite).toBe("/images/family/chris-front.png");
    const ids = (state.npcs ?? []).map((npc) => npc.id).sort();
    expect(ids).toEqual(["npc-annie", "npc-claire", "npc-emerson", "npc-opal"]);
  });

  it("places every NPC on a distinct floor tile", () => {
    const seen = new Set<string>();
    for (const npc of state.npcs ?? []) {
      expect(state.mapData.tiles[npc.y][npc.x]).toBe(FLOOR);
      const key = `${npc.y},${npc.x}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("keeps the house sealed (no walkable tile on the outer border)", () => {
    const tiles = state.mapData.tiles;
    const height = tiles.length;
    const width = tiles[0].length;
    for (let x = 0; x < width; x++) {
      expect(tiles[0][x]).not.toBe(FLOOR);
      expect(tiles[height - 1][x]).not.toBe(FLOOR);
    }
    for (let y = 0; y < height; y++) {
      expect(tiles[y][0]).not.toBe(FLOOR);
      expect(tiles[y][width - 1]).not.toBe(FLOOR);
    }
  });
});

describe("character toggle", () => {
  it("swaps the chosen member out of the NPC roster and into the hero", () => {
    for (const member of FAMILY_MEMBERS) {
      const state = buildHearthHomeState(member.id);
      expect(state.activeHeroId).toBe(member.id);
      expect(state.heroSprite).toBe(member.sprite);
      const ids = (state.npcs ?? []).map((npc) => npc.id);
      expect(ids).not.toContain(member.npcId);
      expect(ids).toHaveLength(FAMILY_MEMBERS.length - 1);
      // Hero still enters through the front door.
      const [sy, sx] = FAMILY_HOUSE_SPAWN;
      expect(state.mapData.subtypes[sy][sx]).toContain(TileSubtype.PLAYER);
    }
  });

  it("puts Chris home as an NPC when someone else plays", () => {
    const state = buildHearthHomeState("emerson");
    const ids = (state.npcs ?? []).map((npc) => npc.id);
    expect(ids).toContain("npc-chris");
    expect(ids).not.toContain("npc-emerson");
    expect(state.heroSprite).toBe("/images/family/emerson-front.png");
  });

  it("renders the kids at kid size", () => {
    expect(buildHearthHomeState("emerson").heroSpriteScale).toBe(110);
    expect(buildHearthHomeState("claire").heroSpriteScale).toBe(116);
  });

  it("supports dog mode at dog size", () => {
    const state = buildHearthHomeState("opal");
    expect(state.heroSprite).toBe("/images/dog-golden/dog-front-1.png");
    expect(state.heroSpriteScale).toBe(36);
    // Humans with real art render larger than the NPC standard.
    expect(buildHearthHomeState("chris").heroSpriteScale).toBe(126);
    const ids = (state.npcs ?? []).map((npc) => npc.id).sort();
    expect(ids).toEqual(["npc-annie", "npc-chris", "npc-claire", "npc-emerson"]);
  });
});

describe("directional sprites", () => {
  it("resolves hero art by facing, falling back to front", () => {
    const chris = buildHearthHomeState("chris");
    expect(resolveHeroSpriteOverride(Direction.UP, chris)).toBe(
      "/images/family/chris-back.png"
    );
    expect(resolveHeroSpriteOverride(Direction.LEFT, chris)).toBe(
      "/images/family/chris-side.png"
    );
    expect(resolveHeroSpriteOverride(Direction.DOWN, chris)).toBe(
      "/images/family/chris-front.png"
    );
    const emerson = buildHearthHomeState("emerson");
    expect(resolveHeroSpriteOverride(Direction.UP, emerson)).toBe(
      "/images/family/emerson-back.png"
    );
    // No directional art (Opal): every facing falls back to the front sprite.
    const opal = buildHearthHomeState("opal");
    expect(resolveHeroSpriteOverride(Direction.UP, opal)).toBe(
      "/images/dog-golden/dog-front-1.png"
    );
    // Daily/story/endless states carry no override at all.
    expect(resolveHeroSpriteOverride(Direction.UP, {})).toBeUndefined();
  });

  it("puts the whole family in the party line, in roster order", () => {
    const state = buildHearthHomeState("chris");
    const party = (state.npcs ?? []).map((npc) => [
      npc.metadata?.behavior,
      npc.metadata?.followOrder,
    ]);
    expect(party).toEqual([
      ["follow", 0],
      ["follow", 1],
      ["follow", 2],
      ["follow", 3],
    ]);
  });

  it("gives family NPCs their directional art via metadata", () => {
    const state = buildHearthHomeState("chris");
    const annie = (state.npcs ?? []).find((npc) => npc.id === "npc-annie");
    expect(annie?.metadata?.directionalSprites).toEqual({
      back: "/images/family/annie-back.png",
      side: "/images/family/annie-side.png",
    });
  });
});

describe("possession (switchPartyMember)", () => {
  it("initializes the full party roster", () => {
    const state = buildHearthHomeState("chris");
    expect(state.party?.map((p) => p.id)).toEqual([
      "chris",
      "annie",
      "emerson",
      "claire",
      "opal",
    ]);
    expect(state.party?.every((p) => p.alive && p.health === 5)).toBe(true);
  });

  it("swaps control to a living member where they stand", () => {
    const state = buildHearthHomeState("chris");
    const annie = (state.npcs ?? []).find((n) => n.id === "npc-annie")!;
    const next = switchPartyMember(state, "annie");

    expect(next.activeHeroId).toBe("annie");
    expect(next.mapData.subtypes[annie.y][annie.x]).toContain(
      TileSubtype.PLAYER
    );
    expect(
      next.mapData.subtypes[FAMILY_HOUSE_SPAWN[0]][FAMILY_HOUSE_SPAWN[1]]
    ).not.toContain(TileSubtype.PLAYER);

    // The ex-hero re-enters the world standing where the hero was.
    const chrisNpc = (next.npcs ?? []).find((n) => n.id === "npc-chris")!;
    expect([chrisNpc.y, chrisNpc.x]).toEqual(FAMILY_HOUSE_SPAWN);
    expect((next.npcs ?? []).some((n) => n.id === "npc-annie")).toBe(false);

    expect(next.heroSprite).toBe("/images/family/annie-front.png");
    expect(next.playerDirection).toBe(annie.facing);
    expect((next.npcs ?? []).map((n) => n.metadata?.followOrder)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it("round-trips stats and inventory through the roster", () => {
    let state = buildHearthHomeState("chris");
    state = { ...state, heroHealth: 3, rockCount: 2, hasSword: true };

    state = switchPartyMember(state, "opal");
    const chris = state.party!.find((p) => p.id === "chris")!;
    expect([chris.health, chris.rockCount, chris.hasSword]).toEqual([
      3, 2, true,
    ]);
    expect(state.heroHealth).toBe(5); // Opal's own fresh stats
    expect(state.hasSword).toBe(false);

    state = switchPartyMember(state, "chris");
    expect(state.heroHealth).toBe(3);
    expect(state.rockCount).toBe(2);
    expect(state.hasSword).toBe(true);
  });

  it("refuses no-op and dead-member switches", () => {
    const state = buildHearthHomeState("claire");
    expect(switchPartyMember(state, "claire")).toBe(state);
    const withDeadOpal = {
      ...state,
      party: state.party!.map((p) =>
        p.id === "opal" ? { ...p, alive: false } : p
      ),
    };
    expect(switchPartyMember(withDeadOpal, "opal")).toBe(withDeadOpal);
  });
});

describe("hero-aware dialogue", () => {
  it("kids call you Dad only when Chris is playing", () => {
    // Past the intro's chest-hint stage, so the everyday lines resolve.
    const asChris = {
      ...buildHearthHomeState("chris"),
      scenarioFlags: { hearthKeysFound: true },
    };
    const asClaire = {
      ...buildHearthHomeState("claire"),
      scenarioFlags: { hearthKeysFound: true },
    };

    expect(
      resolveNpcDialogueScript("npc-emerson", asChris.storyFlags, asChris)
    ).toBe("home-emerson-dad");
    expect(
      resolveNpcDialogueScript("npc-emerson", asClaire.storyFlags, asClaire)
    ).toBe("home-emerson-default");
    expect(
      resolveNpcDialogueScript("npc-claire", asChris.storyFlags, asChris)
    ).toBe("home-claire-dad");
    expect(
      resolveNpcDialogueScript("npc-opal", asChris.storyFlags, asChris)
    ).toBe("home-opal-default");
    expect(
      resolveNpcDialogueScript("npc-chris", asClaire.storyFlags, asClaire)
    ).toBe("home-chris-default");
  });

  it("every family script resolves to real dialogue with lines", () => {
    const state = buildHearthHomeState("annie");
    for (const member of FAMILY_MEMBERS.filter((m) => m.id !== "annie")) {
      const scriptId = resolveNpcDialogueScript(
        member.npcId,
        state.storyFlags,
        state
      );
      expect(scriptId).toBeDefined();
      const script = getDialogueScript(scriptId!);
      expect(script).toBeDefined();
      expect(script!.lines.length).toBeGreaterThan(0);
    }
  });
});
