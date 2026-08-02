import {
  buildQuarrymasterArena,
  QUARRYMASTER_LAYOUTS,
} from "../../lib/bosses/quarrymaster_arena";
import { TileSubtype } from "../../lib/map/constants";

/**
 * The Quarrymaster arena has to be navigable by a hero who arrives with a DOUSED torch.
 *
 * enterBossRoom carries the live run's torch state into the arena, and the douse-to-see
 * DARK_PORTAL entrance only appears while the torch is OUT — so on those days the hero
 * lands in the arena blind. Every layout used to put both wall torches at the chamber
 * mouth, ~9 tiles away across the crack field, which made that arrival a death sentence.
 * Each layout now carries lava pools by the door: they glow (so they are visible with no
 * torch), ending a move in their glow relights the torch, and they kill on contact.
 *
 * See lib/bosses/quarrymaster_arena.ts, assertLayout checks 5b/5c.
 */

/** Mirrors computeTorchGlow: Chebyshev 2, minus the four far corners. */
const GLOW_RADIUS = 2;
function insideGlow(
  [ay, ax]: [number, number],
  [by, bx]: [number, number]
): boolean {
  const dy = Math.abs(ay - by);
  const dx = Math.abs(ax - bx);
  return (
    Math.max(dy, dx) <= GLOW_RADIUS &&
    !(dy === GLOW_RADIUS && dx === GLOW_RADIUS)
  );
}

function lavaTiles(subtypes: number[][][]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < subtypes.length; y++) {
    for (let x = 0; x < subtypes[y].length; x++) {
      if (subtypes[y][x].includes(TileSubtype.LAVA)) out.push([y, x]);
    }
  }
  return out;
}

describe("Quarrymaster arena — light at the door", () => {
  QUARRYMASTER_LAYOUTS.forEach((layout, layoutIndex) => {
    describe(layout.name, () => {
      const arena = buildQuarrymasterArena({ layoutIndex });
      const lava = lavaTiles(arena.state.mapData.subtypes);

      it("actually places lava on the map", () => {
        // Guards against the whole feature silently not parsing: if the `L` characters were
        // dropped, every assertion below would pass vacuously and the policy sim would show
        // unchanged numbers for the wrong reason.
        expect(lava.length).toBeGreaterThan(0);
        // ...and the builder reports the same pools it painted.
        expect([...arena.lava].sort()).toEqual([...lava].sort());
      });

      it("puts a light source within a doused hero's glow of the start", () => {
        const lit = [...lava, ...arena.torches].filter((pos) =>
          insideGlow(pos, arena.hero)
        );
        expect(lit.length).toBeGreaterThan(0);
      });

      it("keeps lava off the tiles orthogonally adjacent to the start", () => {
        // Movement is orthogonal-only, so an adjacent pool means the first keypress out of
        // the gate — pressed in the dark, before any relight — is instant death with no tell.
        for (const [ly, lx] of lava) {
          const manhattan =
            Math.abs(ly - arena.hero[0]) + Math.abs(lx - arena.hero[1]);
          expect(manhattan).not.toBe(1);
        }
      });

      it("never puts lava on the hero, the boss, the exit, a switch or a pod", () => {
        const reserved = [
          arena.hero,
          arena.boss,
          ...arena.plates,
          ...arena.pods,
        ].map(([y, x]) => `${y},${x}`);
        for (const [ly, lx] of lava) {
          expect(reserved).not.toContain(`${ly},${lx}`);
        }
      });

      it("still satisfies every other layout invariant", () => {
        // assertLayout runs inside the builder and now treats lava as impassable when it
        // walks the room, so building at all proves no pool blocks the only route to a
        // switch or the exit.
        expect(() => buildQuarrymasterArena({ layoutIndex })).not.toThrow();
      });
    });
  });

  it("fails loudly if a layout has no light near the hero start", () => {
    // Reproduces the exact pre-fix state by stripping the lava back out of a shipped
    // layout: valid in every other respect, torches only at the chamber mouth. Built from
    // a real map rather than hand-authored on purpose — an earlier version of this test
    // used a hand-made board and passed on an unrelated "switch has no gate row" error,
    // which would have kept passing even if check 5b were deleted. Hence matching the
    // message, not just .toThrow().
    const unlit = QUARRYMASTER_LAYOUTS[0].map.map((row) => row.replace(/L/g, "."));
    expect(() => buildQuarrymasterArena({ map: unlit })).toThrow(
      /no light source \(L or T\) within 2 tiles of the hero start/
    );
  });

  it("fails loudly if lava sits orthogonally adjacent to the hero start", () => {
    const cruel = QUARRYMASTER_LAYOUTS[0].map.map((row, y) =>
      // The hero is on row 15 col 8; drop lava directly above them.
      y === 14 ? row.slice(0, 8) + "L" + row.slice(9) : row
    );
    expect(() => buildQuarrymasterArena({ map: cruel })).toThrow(
      /orthogonally adjacent to the hero start/
    );
  });
});
