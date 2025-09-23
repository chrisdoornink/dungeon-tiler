import {
  buildStoryModeState,
  buildStoryStateFromConfig,
  collectStoryCheckpointOptions,
  type StoryResetConfig,
} from "../../../lib/story/story_mode";
import { findPlayerPosition } from "../../../lib/map";

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
      rockCount: 3,
      runeCount: 2,
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
    expect(configured.lastCheckpoint).toBeTruthy();
    expect(configured.lastCheckpoint?.currentRoomId).toBe("story-outdoor-clearing");
  });
});
