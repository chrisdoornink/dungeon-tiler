import {
  ACTOR_KNEE,
  DEFAULT_LIGHT_PASS,
  HOLE_STOPS,
  LIGHT_PASS_STORAGE_KEY,
  actorToneCurve,
  actorToneTable,
  ambientRgb,
  darkRevealThreshold,
  darkRevealsTile,
  holeFor,
  holeProfile,
  lightLevelAt,
  readBackdropFlag,
  readLightPassFlag,
} from "../../lib/light_pass";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("actorToneCurve", () => {
  it("leaves everything up to the knee alone, so floors and walls are untouched", () => {
    // The cave walls' brightest pixel is 84/255; the floor's is 57/255.
    for (const v of [0, 57 / 255, 84 / 255, ACTOR_KNEE]) {
      expect(actorToneCurve(v, 0.66)).toBeCloseTo(v, 10);
    }
  });

  it("brings full white down to the ceiling", () => {
    expect(actorToneCurve(1, 0.66)).toBeCloseTo(0.66, 10);
    expect(actorToneCurve(1, 0.5)).toBeCloseTo(0.5, 10);
  });

  it("is monotonic and never brightens", () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const x = i / 100;
      const y = actorToneCurve(x, 0.66);
      expect(y).toBeGreaterThanOrEqual(prev);
      expect(y).toBeLessThanOrEqual(x + 1e-12);
      prev = y;
    }
  });

  it("has no kink at the knee (slope ~1 on both sides)", () => {
    const e = 1e-4;
    const below = (actorToneCurve(ACTOR_KNEE, 0.66) - actorToneCurve(ACTOR_KNEE - e, 0.66)) / e;
    const above = (actorToneCurve(ACTOR_KNEE + e, 0.66) - actorToneCurve(ACTOR_KNEE, 0.66)) / e;
    expect(below).toBeCloseTo(1, 2);
    expect(above).toBeCloseTo(1, 2);
  });

  it("is the identity at ceiling 1 (grade off)", () => {
    for (let i = 0; i <= 10; i++) expect(actorToneCurve(i / 10, 1)).toBeCloseTo(i / 10, 10);
  });

  it("samples into an SVG table from 0 to the ceiling", () => {
    const values = actorToneTable(0.66).split(" ").map(Number);
    expect(values).toHaveLength(17);
    expect(values[0]).toBe(0);
    expect(values[16]).toBeCloseTo(0.66, 4);
  });
});

describe("ambientRgb", () => {
  it("is neutral grey with no coolness and leans blue as coolness rises", () => {
    expect(ambientRgb({ ambient: 0.8, coolness: 0 })).toBe("rgb(204, 204, 204)");
    const [r, g, b] = ambientRgb({ ambient: 0.8, coolness: 1 })
      .match(/\d+/g)!
      .map(Number);
    expect(r).toBeLessThan(g);
    expect(b).toBeGreaterThan(g);
  });

  it("is white (no falloff) at ambient 1 with no coolness", () => {
    expect(ambientRgb({ ambient: 1, coolness: 0 })).toBe("rgb(255, 255, 255)");
  });
});

describe("readLightPassFlag", () => {
  it("is on by default", () => {
    expect(readLightPassFlag("", memoryStorage())).toBe(true);
  });

  it("turns on with ?light=1 and remembers it", () => {
    const storage = memoryStorage();
    expect(readLightPassFlag("?light=1", storage)).toBe(true);
    expect(storage.getItem(LIGHT_PASS_STORAGE_KEY)).toBe("1");
    expect(readLightPassFlag("", storage)).toBe(true);
  });

  it("turns off with ?light=0 and remembers that too", () => {
    const storage = memoryStorage({ [LIGHT_PASS_STORAGE_KEY]: "1" });
    expect(readLightPassFlag("?light=0", storage)).toBe(false);
    expect(readLightPassFlag("", storage)).toBe(false);
  });

  it("still honours the param when storage is unavailable", () => {
    expect(readLightPassFlag("?light=0", null)).toBe(false);
    expect(readLightPassFlag("", null)).toBe(true);
  });
});

describe("readBackdropFlag", () => {
  it("defaults to the dark backdrop and accepts the three names", () => {
    expect(readBackdropFlag("")).toBe("dark");
    expect(readBackdropFlag("?bg=distant")).toBe("distant");
    expect(readBackdropFlag("?bg=classic")).toBe("classic");
    expect(readBackdropFlag("?bg=nonsense")).toBe("dark");
  });
});

describe("holeProfile", () => {
  it("hits every stop exactly and is full inside, zero at and past the radius", () => {
    for (const [t, v] of HOLE_STOPS) expect(holeProfile(t)).toBeCloseTo(v, 10);
    expect(holeProfile(0.1)).toBe(1);
    expect(holeProfile(1)).toBe(0);
    expect(holeProfile(1.5)).toBe(0);
  });

  it("only ever falls off with distance", () => {
    let prev = Infinity;
    for (let i = 0; i <= 100; i++) {
      const v = holeProfile(i / 100);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("lightLevelAt (torch out)", () => {
  const c = DEFAULT_LIGHT_PASS;
  const tile = 40;
  const at = (col: number, row: number) => [(col + 0.5) * tile, (row + 0.5) * tile] as const;

  it("is the dark ambient far from every light", () => {
    const [x, y] = at(20, 20);
    expect(lightLevelAt(x, y, [], null, c, true)).toBe(c.darkAmbient);
  });

  it("is fully lit beside a wall torch and fades out by its dark reach", () => {
    const torch = { kind: "wall" as const, x: 5.5 * tile, y: 5.9 * tile };
    const [nx, ny] = at(5, 6);
    expect(lightLevelAt(nx, ny, [torch], null, c, true)).toBe(1);
    const [fx, fy] = at(5, 6 + Math.ceil(c.darkWallRadius) + 1);
    expect(lightLevelAt(fx, fy, [torch], null, c, true)).toBe(c.darkAmbient);
  });

  it("peaks at the snuffed hero's own level on his tile", () => {
    const hero = [10.5 * tile, 10.5 * tile] as const;
    expect(lightLevelAt(hero[0], hero[1], [], hero, c, true)).toBeCloseTo(c.darkHeroLevel, 10);
  });

  it("uses the lit torch's long reach when the torch is lit", () => {
    const hero = [10.5 * tile, 10.35 * tile] as const;
    const [x, y] = at(14, 10); // four tiles away: dark there when snuffed, lit when not
    expect(lightLevelAt(x, y, [], hero, c, false)).toBeGreaterThan(0.5);
    expect(lightLevelAt(x, y, [], hero, c, true)).toBe(c.darkAmbient);
  });
});

describe("holeFor", () => {
  it("only lights the dark portal while the torch is out", () => {
    expect(holeFor("portal", DEFAULT_LIGHT_PASS, false).strength).toBe(0);
    expect(holeFor("portal", DEFAULT_LIGHT_PASS, true).strength).toBeGreaterThan(0);
  });
});

describe("darkRevealThreshold", () => {
  it("stays a step above the dark ambient, so brightening the room never reveals enemies in it", () => {
    expect(darkRevealThreshold({ ...DEFAULT_LIGHT_PASS, darkAmbient: 0 })).toBe(0.12);
    expect(darkRevealThreshold({ ...DEFAULT_LIGHT_PASS, darkAmbient: 0.25 })).toBeCloseTo(0.33, 10);
  });
});

describe("darkRevealsTile", () => {
  const hero = [10, 10] as const;

  it("always reveals all eight neighbours of the snuffed hero, even with a tiny glow", () => {
    const tiny = { ...DEFAULT_LIGHT_PASS, darkHeroRadius: 1, darkHeroLevel: 0.2 };
    for (const c of [DEFAULT_LIGHT_PASS, tiny]) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          expect(darkRevealsTile(10 + dr, 10 + dc, hero, [], c)).toBe(true);
        }
      }
    }
  });

  it("hides enemies in the dark beyond the hero's glow", () => {
    expect(darkRevealsTile(10, 13, hero, [], DEFAULT_LIGHT_PASS)).toBe(false);
    expect(darkRevealsTile(3, 3, hero, [], DEFAULT_LIGHT_PASS)).toBe(false);
  });

  it("reveals enemies standing in a wall torch's pool far from the hero", () => {
    const torch = { kind: "wall" as const, x: 3.5 * 40, y: 2.9 * 40 };
    expect(darkRevealsTile(3, 3, hero, [torch], DEFAULT_LIGHT_PASS)).toBe(true);
    expect(darkRevealsTile(4, 4, hero, [torch], DEFAULT_LIGHT_PASS)).toBe(true);
    expect(darkRevealsTile(3, 8, hero, [torch], DEFAULT_LIGHT_PASS)).toBe(false);
  });
});
