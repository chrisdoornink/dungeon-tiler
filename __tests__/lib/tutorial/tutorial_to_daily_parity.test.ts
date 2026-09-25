import {
  advanceToNextFloor,
  initializeGameStateForMultiTier,
  SWITCH_GATE_START_DATE,
  dailyTuningV2ForDate,
  fisherRetiredForDate,
  snakeSpawnBufferForDate,
  SNAKE_SPAWN_BUFFER_START_DATE,
  type GameState,
} from "../../../lib/map";
import { DAILY_TUNING_V2_START_DATE } from "../../../lib/map/daily_tuning";
import { hashStringToSeed, mulberry32, withPatchedMathRandom } from "../../../lib/rng";
import { DateUtils } from "../../../lib/date_utils";
import { buildTutorialState } from "../../../lib/tutorial/tutorial_state";
import { buildDailyFloor2FromTutorial } from "../../../lib/tutorial/tutorial_to_daily";

// The tutorial hand-off drops a new player straight onto today's daily floor 2. The daily map
// is generated client-side from the date seed, so that floor has to be the one everybody else
// on the date plays: same date gates, same draws. These tests rebuild the normal daily route
// (as components/GameView.tsx + TilemapGrid.tsx run it) and compare.

/** Floor 1 -> 2 exactly as the live daily route builds it for `date`. */
function dailyRouteFloor2(date: string): GameState {
  const seed = hashStringToSeed(date);
  const f1 = withPatchedMathRandom(mulberry32(seed), () =>
    initializeGameStateForMultiTier(1, {
      switchGates: date >= SWITCH_GATE_START_DATE,
      tuningV2: dailyTuningV2ForDate(date),
      fisherRetired: fisherRetiredForDate(date),
      snakeSpawnBuffer: snakeSpawnBufferForDate(date),
    })
  );
  return advanceToNextFloor(f1, seed);
}

function tutorialRouteFloor2(date: string): GameState {
  jest.spyOn(DateUtils, "getTodayString").mockReturnValue(date);
  return buildDailyFloor2FromTutorial(buildTutorialState());
}

/** The generated floor, stripped of anything the hand-off legitimately changes (inventory). */
function mapFingerprint(s: GameState) {
  return {
    tiles: s.mapData.tiles,
    subtypes: s.mapData.subtypes,
    enemies: (s.enemies ?? []).map((e) => ({ kind: e.kind, y: e.y, x: e.x })),
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("buildDailyFloor2FromTutorial matches the daily route's floor 2", () => {
  // The gate day itself, plus later days so one lucky seed can't hide a split. The snake spawn
  // buffer's gate day checks that gate on the tutorial path too.
  const postGateDates = [
    DAILY_TUNING_V2_START_DATE,
    "2026-09-10",
    "2026-09-25",
    SNAKE_SPAWN_BUFFER_START_DATE,
    "2026-10-08",
  ];

  it.each(postGateDates)("tuning-v2 date %s: same floor 2", (date) => {
    const tutorial = tutorialRouteFloor2(date);
    const daily = dailyRouteFloor2(date);

    expect(mapFingerprint(tutorial)).toEqual(mapFingerprint(daily));
    // Carried forward by advanceToNextFloor, so floor 3 depends on it too.
    expect(tutorial.tuningV2Enabled).toBe(true);
  });

  it.each(postGateDates)("tuning-v2 date %s: same floor 3", (date) => {
    const seed = hashStringToSeed(date);
    const tutorial = advanceToNextFloor(tutorialRouteFloor2(date), seed);
    const daily = advanceToNextFloor(dailyRouteFloor2(date), seed);

    expect(mapFingerprint(tutorial)).toEqual(mapFingerprint(daily));
  });

  it("pre-v2 date: same floor 2, v2 stays off", () => {
    const date = "2026-08-20";
    const tutorial = tutorialRouteFloor2(date);
    const daily = dailyRouteFloor2(date);

    expect(tutorial.tuningV2Enabled).toBeUndefined();
    expect(mapFingerprint(tutorial)).toEqual(mapFingerprint(daily));
  });
});
