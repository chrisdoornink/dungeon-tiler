import {
  buildStoryModeState,
  buildStoryStateFromConfig,
  collectStoryCheckpointOptions,
  type StoryResetConfig,
} from "../../../lib/story/story_mode";
import {
  detonateLiveBombs,
  findPlayerPosition,
  performThrowBomb,
  TileSubtype,
  type GameState,
} from "../../../lib/map";

function countSubtype(state: GameState, subtype: TileSubtype): number {
  let total = 0;
  for (const row of state.mapData.subtypes) {
    for (const cell of row) {
      if ((cell || []).includes(subtype)) total += 1;
    }
  }
  return total;
}

describe("story reset helpers", () => {
  it("lists checkpoints including the outdoor clearing", () => {
    const state = buildStoryModeState();
    const options = collectStoryCheckpointOptions(state);
    const checkpointRooms = options
      .filter((opt) => opt.kind === "checkpoint")
      .map((opt) => opt.roomId);
    expect(checkpointRooms).toContain("story-outdoor-clearing");
    expect(checkpointRooms).not.toContain("story-sanctum");
  });

  it("builds a configured state at the target checkpoint", () => {
    const base = buildStoryModeState();
    const options = collectStoryCheckpointOptions(base);
    const outdoor = options.find(
      (opt) => opt.roomId === "story-outdoor-clearing" && opt.kind === "checkpoint"
    );
    expect(outdoor).toBeDefined();
    const config: StoryResetConfig = {
      targetRoomId: outdoor!.roomId,
      targetPosition: outdoor!.position,
      heroHealth: 4,
      heroTorchLit: true,
      hasSword: true,
      hasShield: false,
      hasKey: true,
      hasExitKey: false,
      hasSnakeMedallion: false,
      rockCount: 3,
      runeCount: 2,
      bombCount: 7,
      foodCount: 1,
      potionCount: 0,
    };

    const configured = buildStoryStateFromConfig(config);
    expect(configured.currentRoomId).toBe("story-outdoor-clearing");
    expect(findPlayerPosition(configured.mapData)).toEqual(config.targetPosition);
    expect(configured.heroHealth).toBe(4);
    expect(configured.hasSword).toBe(true);
    expect(configured.hasKey).toBe(true);
    expect(configured.rockCount).toBe(3);
    expect(configured.bombCount).toBe(7);
    expect(configured.lastCheckpoint).toBeTruthy();
    expect(configured.lastCheckpoint?.currentRoomId).toBe("story-outdoor-clearing");
  });

  it("starts a fresh story run with no bombs", () => {
    expect(buildStoryModeState().bombCount).toBe(0);
  });

  it("lets a story hero throw and detonate a configured bomb", () => {
    const base = buildStoryModeState();
    const options = collectStoryCheckpointOptions(base);
    const start = options.find((opt) => opt.roomId === "story-hall-entrance");
    expect(start).toBeDefined();

    const state = buildStoryStateFromConfig({
      targetRoomId: start!.roomId,
      targetPosition: start!.position,
      heroHealth: 5,
      heroTorchLit: true,
      hasSword: false,
      hasShield: false,
      hasKey: false,
      hasExitKey: false,
      hasSnakeMedallion: false,
      rockCount: 0,
      runeCount: 0,
      bombCount: 2,
      foodCount: 0,
      potionCount: 0,
    });

    const thrown = performThrowBomb(state);
    expect(thrown.bombCount).toBe(1);
    expect(countSubtype(thrown, TileSubtype.BOMB_LIVE)).toBe(1);

    const blown = detonateLiveBombs(thrown);
    expect(countSubtype(blown, TileSubtype.BOMB_LIVE)).toBe(0);
    expect(blown.recentBombBlasts?.length).toBe(1);
    expect(countSubtype(blown, TileSubtype.SINGED)).toBeGreaterThan(0);
  });
});
