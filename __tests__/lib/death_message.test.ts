import { deathCauseMessage } from "../../lib/death_message";

describe("deathCauseMessage", () => {
  it("falls back when no cause is given", () => {
    expect(deathCauseMessage()).toBe("You have fallen");
    expect(deathCauseMessage(null)).toBe("You have fallen");
  });

  it("names the enemy that landed the killing blow, title-cased", () => {
    expect(deathCauseMessage({ type: "enemy", enemyKind: "fire-goblin" })).toBe(
      "Slain by Fire Goblin"
    );
    expect(deathCauseMessage({ type: "enemy", enemyKind: "water-goblin-spear" })).toBe(
      "Slain by Water Goblin Spear"
    );
  });

  it("handles an enemy death with no recorded kind", () => {
    expect(deathCauseMessage({ type: "enemy" })).toBe("Slain by Enemy");
  });

  it("has distinct wording for the non-enemy causes", () => {
    expect(deathCauseMessage({ type: "faulty_floor" })).toBe("You fell into the abyss");
    expect(deathCauseMessage({ type: "poison" })).toBe("The poison consumed you");
    expect(deathCauseMessage({ type: "darkness" })).toBe("You were swallowed by the dark");
    expect(deathCauseMessage({ type: "bomb" })).toBe("Caught in your own bomb blast");
  });
});
