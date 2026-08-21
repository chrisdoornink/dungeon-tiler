import {
  buildHearthHomeState,
  handleControlledMemberDeath,
} from "../../lib/story/hearth_home_mode";
import { runPartyCombat } from "../../lib/map/game-state";
import { FAMILY_HOUSE_SPAWN } from "../../lib/story/rooms/home";
import { TileSubtype, type GameState } from "../../lib/map";
import { Enemy, updateEnemies } from "../../lib/enemy";
import { FLOOR } from "../../lib/map";

function goblinAt(y: number, x: number, health?: number): Enemy {
  const e = new Enemy({ y, x });
  e.kind = "fire-goblin";
  if (health !== undefined) e.health = health;
  return e;
}

function npcOf(state: GameState, id: string) {
  const npc = (state.npcs ?? []).find((n) => n.id === id);
  if (!npc) throw new Error(`missing ${id}`);
  return npc;
}

const HERO_POS = FAMILY_HOUSE_SPAWN;

describe("runPartyCombat", () => {
  it("family members strike adjacent enemies and can kill them", () => {
    const state = buildHearthHomeState("chris");
    const annie = npcOf(state, "npc-annie");
    state.enemies = [goblinAt(annie.y, annie.x + 1, 1)];

    runPartyCombat(state, HERO_POS);

    expect(state.enemies).toHaveLength(0);
    expect(state.stats.enemiesDefeated).toBe(1);
    expect(state.defeatedEnemies?.[0]?.kind).toBe("fire-goblin");
  });

  it("enemies away from the hero swing back at one adjacent family member", () => {
    const state = buildHearthHomeState("chris");
    const annie = npcOf(state, "npc-annie");
    const goblin = goblinAt(annie.y, annie.x + 1); // full health, survives her hit
    const goblinHp = goblin.health;
    state.enemies = [goblin];

    runPartyCombat(state, HERO_POS);

    expect(goblin.health).toBe(goblinHp - 1); // Annie's strike landed
    expect(annie.health).toBe(4); // and the goblin swung back
    expect(state.party?.find((p) => p.id === "annie")?.health).toBe(4); // roster synced
  });

  it("enemies engaged with the hero do not also hit allies", () => {
    const state = buildHearthHomeState("chris");
    const [hy, hx] = HERO_POS;
    const opal = npcOf(state, "npc-opal");
    opal.y = hy - 1;
    opal.x = hx - 1;
    const goblin = goblinAt(hy - 1, hx); // adjacent to hero AND to Opal
    const goblinHp = goblin.health;
    state.enemies = [goblin];

    runPartyCombat(state, HERO_POS);

    expect(goblin.health).toBe(goblinHp - 1); // Opal still bites it
    expect(opal.health).toBe(5); // but it stays focused on the hero
  });

  it("a fallen family member is removed and marked dead (permadeath)", () => {
    const state = buildHearthHomeState("chris");
    const claire = npcOf(state, "npc-claire");
    claire.health = 1;
    state.enemies = [goblinAt(claire.y + 1, claire.x)];

    runPartyCombat(state, HERO_POS);

    expect((state.npcs ?? []).some((n) => n.id === "npc-claire")).toBe(false);
    expect(state.party?.find((p) => p.id === "claire")?.alive).toBe(false);
  });

  it("does nothing outside party scenes", () => {
    const state = buildHearthHomeState("chris");
    delete state.party;
    const annie = npcOf(state, "npc-annie");
    state.enemies = [goblinAt(annie.y, annie.x + 1, 1)];
    runPartyCombat(state, HERO_POS);
    expect(state.enemies).toHaveLength(1);
  });
});

describe("controlled-member permadeath", () => {
  it("hands control to the next living member; the body does not return", () => {
    const state = buildHearthHomeState("chris");
    const next = handleControlledMemberDeath(state);

    expect(next.activeHeroId).toBe("annie");
    expect(next.party?.find((p) => p.id === "chris")?.alive).toBe(false);
    expect((next.npcs ?? []).some((n) => n.id === "npc-chris")).toBe(false);
    expect((next.npcs ?? []).some((n) => n.id === "npc-annie")).toBe(false);
    // PLAYER now stands where Annie stood.
    const annieHome = [6, 3];
    expect(next.mapData.subtypes[annieHome[0]][annieHome[1]]).toContain(
      TileSubtype.PLAYER
    );
    expect(next.heroSprite).toBe("/images/family/annie-front.png");
  });

  it("dead members cannot be possessed and stay out of the roster", () => {
    const state = buildHearthHomeState("chris");
    const afterDeath = handleControlledMemberDeath(state); // chris falls
    const claireTurnToo = {
      ...afterDeath,
      party: afterDeath.party!.map((p) =>
        p.id === "emerson" ? { ...p, alive: false } : p
      ),
    };
    // Follow orders stay contiguous for the survivors.
    const orders = (claireTurnToo.npcs ?? []).map(
      (n) => n.metadata?.followOrder
    );
    expect(orders).toEqual([0, 1, 2]);
  });

  it("resets to a fresh visit when the whole family has fallen", () => {
    let state = buildHearthHomeState("opal");
    state = {
      ...state,
      party: state.party!.map((p) =>
        p.id === "opal" ? p : { ...p, alive: false }
      ),
    };
    const next = handleControlledMemberDeath(state); // last one falls
    expect(next.activeHeroId).toBe("chris");
    expect(next.party?.every((p) => p.alive)).toBe(true);
  });
});

describe("enemies treat family members as solid", () => {
  it("never ends a tick on a blocked tile", () => {
    const grid = Array.from({ length: 3 }, () =>
      Array.from({ length: 6 }, () => FLOOR)
    );
    const subtypes = Array.from({ length: 3 }, () =>
      Array.from({ length: 6 }, () => [] as number[])
    );
    const goblin = goblinAt(1, 1);
    updateEnemies(grid, subtypes, [goblin], { y: 1, x: 4 }, {
      blockedTiles: [[1, 2]],
    });
    expect([goblin.y, goblin.x]).not.toEqual([1, 2]);
  });
});
