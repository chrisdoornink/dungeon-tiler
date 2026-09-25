import fs from "fs";
import path from "path";
import {
  LEGACY_SPRITE_PATHS,
  migrateLegacySpritePaths,
} from "../../lib/legacy_sprite_paths";
import { CurrentGameStorage } from "../../lib/current_game_storage";
import { FLOOR, TileSubtype } from "../../lib/map/constants";

const PUBLIC = path.resolve(__dirname, "../../public");

describe("legacy sprite path migration", () => {
  it("points every renamed sprite at a file that exists, and the old file is gone", () => {
    for (const [oldPath, newPath] of LEGACY_SPRITE_PATHS) {
      expect(fs.existsSync(path.join(PUBLIC, newPath))).toBe(true);
      expect(fs.existsSync(path.join(PUBLIC, oldPath))).toBe(false);
    }
  });

  it("rewrites NPC and family sprite fields in a serialized save and leaves others alone", () => {
    const save = JSON.stringify({
      npcs: [
        {
          sprite: "/images/npcs/torch-town/eldra.png",
          metadata: {
            directionalSprites: {
              back: "/images/family/claire-back.png",
              side: "/images/family/claire-side.png",
            },
          },
        },
        { sprite: "/images/dog-golden/dog-front-1.png" },
      ],
      heroSprite: "/images/family/chris-front.png",
      alreadyNew: "/images/npcs/boy-1-clean.png",
      untouched: "/images/wall/wall-0000.png",
    });
    const migrated = JSON.parse(migrateLegacySpritePaths(save));
    expect(migrated.npcs[0].sprite).toBe("/images/npcs/torch-town/eldra-clean.png");
    expect(migrated.npcs[0].metadata.directionalSprites).toEqual({
      back: "/images/family/claire-back-clean.png",
      side: "/images/family/claire-side-clean.png",
    });
    expect(migrated.npcs[1].sprite).toBe("/images/dog-golden/dog-front-1-clean.png");
    expect(migrated.heroSprite).toBe("/images/family/chris-front-clean.png");
    expect(migrated.alreadyNew).toBe("/images/npcs/boy-1-clean.png");
    expect(migrated.untouched).toBe("/images/wall/wall-0000.png");
  });

  it("is applied when a save loads", () => {
    const state = {
      mapData: { tiles: [[FLOOR]], subtypes: [[[TileSubtype.PLAYER]]] },
      stats: {},
      heroHealth: 5,
      heroSprite: "/images/family/annie-front.png",
      lastSaved: Date.now(),
    };
    window.localStorage.setItem("currentHomeGame", JSON.stringify(state));
    const loaded = CurrentGameStorage.loadCurrentGame("home");
    expect(loaded?.heroSprite).toBe("/images/family/annie-front-clean.png");
    window.localStorage.removeItem("currentHomeGame");
  });
});
