import {
  summarizeMonsters,
  monsterShareLines,
  shareEmojiForKind,
} from "../../lib/enemies/monster_summary";
import { EnemyKind } from "../../lib/enemies/registry";

describe("summarizeMonsters", () => {
  it("collapses every goblin variant into a single Goblin group", () => {
    const summary = summarizeMonsters({
      "fire-goblin": 2,
      "water-goblin": 1,
      "water-goblin-spear": 1,
      "earth-goblin": 1,
      "earth-goblin-knives": 1,
      "white-goblin": 4,
    });
    expect(summary.total).toBe(10);
    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0]).toMatchObject({
      key: "goblin",
      label: "Goblin",
      emoji: "👹",
      count: 10,
    });
  });

  it("keeps magician, stone, snake, and wisp as their own groups in canonical order", () => {
    const summary = summarizeMonsters({
      snake: 2,
      ghost: 1,
      "stone-goblin": 1,
      "pink-goblin": 3,
      "fire-goblin": 5,
    });
    expect(summary.total).toBe(12);
    expect(summary.groups.map((g) => g.key)).toEqual([
      "goblin",
      "magician",
      "stone",
      "snake",
      "wisp",
    ]);
    const magician = summary.groups.find((g) => g.key === "magician");
    expect(magician).toMatchObject({ emoji: "🔮", count: 3, label: "Magician" });
    const stone = summary.groups.find((g) => g.key === "stone");
    expect(stone).toMatchObject({ emoji: "🗿", count: 1 });
  });

  it("omits groups with zero kills", () => {
    const summary = summarizeMonsters({ "fire-goblin": 2, "stone-goblin": 0 });
    expect(summary.groups.map((g) => g.key)).toEqual(["goblin"]);
    expect(summary.total).toBe(2);
  });

  it("provides a representative sprite path for each group", () => {
    const summary = summarizeMonsters({ "pink-goblin": 1, snake: 1 });
    for (const group of summary.groups) {
      expect(group.spriteSrc).toMatch(/\.png$/);
    }
  });

  it("falls back to generic goblins when only an aggregate total is known", () => {
    const summary = summarizeMonsters(undefined, 7);
    expect(summary.total).toBe(7);
    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0].key).toBe("goblin");
  });

  it("returns an empty summary when nothing was defeated", () => {
    expect(summarizeMonsters({}).total).toBe(0);
    expect(summarizeMonsters(undefined, 0).total).toBe(0);
    expect(summarizeMonsters(null).groups).toHaveLength(0);
  });
});

describe("monsterShareLines", () => {
  it("renders a single line combining the total and the grouped breakdown", () => {
    const summary = summarizeMonsters({
      "fire-goblin": 10,
      "pink-goblin": 1,
      "stone-goblin": 1,
      snake: 2,
    });
    expect(monsterShareLines(summary)).toEqual([
      "⚔️ 14: 👹×10 🔮×1 🗿×1 🐍×2",
    ]);
  });

  it("returns no lines when nothing was defeated", () => {
    expect(monsterShareLines(summarizeMonsters({}))).toEqual([]);
  });
});

describe("shareEmojiForKind", () => {
  it("maps each kind to its group emoji", () => {
    const cases: Array<[EnemyKind, string]> = [
      ["fire-goblin", "👹"],
      ["water-goblin-spear", "👹"],
      ["white-goblin", "👹"],
      ["pink-goblin", "🔮"],
      ["stone-goblin", "🗿"],
      ["snake", "🐍"],
      ["ghost", "👻"],
    ];
    for (const [kind, emoji] of cases) {
      expect(shareEmojiForKind(kind)).toBe(emoji);
    }
  });
});
