import {
  ACTOR_KNEE,
  LIGHT_PASS_STORAGE_KEY,
  actorToneCurve,
  actorToneTable,
  ambientRgb,
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
