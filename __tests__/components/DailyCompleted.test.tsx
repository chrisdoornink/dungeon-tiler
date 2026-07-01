import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import DailyCompleted, {
  buildInventoryEntries,
} from "../../components/daily/DailyCompleted";
import type { DailyChallengeData } from "../../lib/daily_challenge_storage";

// Keep the screen isolated: no real analytics/network and no poll modal noise.
jest.mock("../../lib/posthog_analytics", () => ({
  trackDailyChallenge: jest.fn(),
  trackShare: jest.fn(),
  trackFeedback: jest.fn(),
}));
jest.mock("../../components/DailyPollModal", () => ({
  __esModule: true,
  default: () => null,
}));

const baseData: DailyChallengeData = {
  hasSeenIntro: true,
  currentStreak: 1,
  totalGamesPlayed: 1,
  totalGamesWon: 1,
  lastPlayedDate: "2026-07-01",
  todayCompleted: true,
  todayResult: "won",
  streakHistory: [],
  migratedToLocalTime: true,
};

const baseStats = {
  damageDealt: 10,
  damageTaken: 2,
  enemiesDefeated: 3,
  steps: 42,
  byKind: { "fire-goblin": 2, ghost: 1 },
};

function setLastGame(extra: Record<string, unknown>) {
  const payload = {
    completedAt: new Date().toISOString(),
    outcome: "win",
    streak: 1,
    currentFloor: 3,
    stats: baseStats,
    heroHealth: 5,
    ...extra,
  };
  window.localStorage.setItem("lastGame", JSON.stringify(payload));
}

async function renderScreen() {
  const utils = render(<DailyCompleted data={baseData} />);
  // Flush the daily-stats fetch effect so no state update lands after assertions.
  await waitFor(() => {});
  return utils;
}

describe("buildInventoryEntries", () => {
  it("returns [] for a missing snapshot", () => {
    expect(buildInventoryEntries(null)).toEqual([]);
    expect(buildInventoryEntries(undefined)).toEqual([]);
  });

  it("lists unique gear without a count and stackables with their count", () => {
    const entries = buildInventoryEntries({
      hasSword: true,
      hasShield: true,
      hasSnakeMedallion: true,
      rockCount: 3,
      bombCount: 2,
      foodCount: 1,
      potionCount: 0, // zero is omitted
    });
    const byKey = Object.fromEntries(entries.map((e) => [e.key, e]));

    expect(byKey.sword.count).toBeUndefined();
    expect(byKey.shield.count).toBeUndefined();
    expect(byKey.medallion.count).toBeUndefined();
    expect(byKey.rock.count).toBe(3);
    expect(byKey.bomb.count).toBe(2);
    expect(byKey.food.count).toBe(1);
    expect(byKey.potion).toBeUndefined();
  });

  it("omits items the player never carried", () => {
    expect(buildInventoryEntries({ rockCount: 0, bombCount: 0 })).toEqual([]);
  });
});

describe("DailyCompleted inventory row", () => {
  beforeEach(() => {
    window.localStorage.clear();
    global.fetch = jest.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({}) })
    ) as unknown as typeof fetch;
  });

  it("shows medallion, rocks and bombs with visible ×N counts", async () => {
    setLastGame({
      hasSword: true,
      hasSnakeMedallion: true,
      rockCount: 3,
      bombCount: 2,
    });
    await renderScreen();

    expect(screen.getByLabelText("Travel Medallion")).toBeInTheDocument();
    expect(screen.getByLabelText("Rock x3")).toBeInTheDocument();
    expect(screen.getByLabelText("Bomb x2")).toBeInTheDocument();
    // The visible "×N" count sits next to its own icon (scoped by title so it
    // doesn't collide with the enemy-summary counts elsewhere on the screen).
    expect(within(screen.getByTitle("Rock x3")).getByText("×3")).toBeInTheDocument();
    expect(within(screen.getByTitle("Bomb x2")).getByText("×2")).toBeInTheDocument();
    // Unique gear renders no count badge.
    expect(within(screen.getByTitle("Travel Medallion")).queryByText(/×/)).toBeNull();
  });
});

describe("DailyCompleted hearts", () => {
  beforeEach(() => {
    window.localStorage.clear();
    global.fetch = jest.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({}) })
    ) as unknown as typeof fetch;
  });

  it("renders a 6th heart when an Extra Heart was collected (6/6)", async () => {
    setLastGame({ heroHealth: 6, heroMaxHealth: 6 });
    await renderScreen();

    expect(screen.getAllByLabelText(/^Heart$/)).toHaveLength(6);
    expect(screen.queryAllByLabelText("Empty Heart")).toHaveLength(0);
  });

  it("shows empty hearts up to the raised max when health was lost (4/6)", async () => {
    setLastGame({ heroHealth: 4, heroMaxHealth: 6 });
    await renderScreen();

    expect(screen.getAllByLabelText(/^Heart$/)).toHaveLength(4);
    expect(screen.getAllByLabelText("Empty Heart")).toHaveLength(2);
  });

  it("falls back to 5 hearts for older snapshots without heroMaxHealth (3/5)", async () => {
    setLastGame({ heroHealth: 3 });
    await renderScreen();

    expect(screen.getAllByLabelText(/^Heart$/)).toHaveLength(3);
    expect(screen.getAllByLabelText("Empty Heart")).toHaveLength(2);
  });

  it("does not truncate a pre-migration 6/6 snapshot that lacks heroMaxHealth", async () => {
    // Older snapshots wrote heroHealth (6 after an Extra Heart) but no heroMaxHealth.
    setLastGame({ heroHealth: 6 });
    await renderScreen();

    expect(screen.getAllByLabelText(/^Heart$/)).toHaveLength(6);
    expect(screen.queryAllByLabelText("Empty Heart")).toHaveLength(0);
  });
});
