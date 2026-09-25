// Sprite paths a saved game may still hold after the file behind them was renamed.
//
// Art is cached under a stable URL, so a sprite whose pixels change ships under a new filename
// (CLAUDE.md, "Art assets"). Code references move with the rename, but a save stores NPC and
// Hearth & Home family sprite paths verbatim (npc.sprite, metadata.directionalSprites,
// heroSprite / heroSpriteBack / heroSpriteSide). A save from before a rename would name a file
// that no longer exists and the character would render invisible, so loading rewrites them.
//
// Explicit list rather than a pattern: a rule like "anything under npcs/ gains -clean" would also
// rewrite a sprite added later under its own (never renamed) name and break it.

// 2026-09-24: cut-out edges cleaned by scripts/clean-sprites.py; each file gained "-clean".
const CLEANED_2026_09 = [
  "/images/dog-golden/dog-back-1.png",
  "/images/dog-golden/dog-back-2.png",
  "/images/dog-golden/dog-front-1.png",
  "/images/dog-golden/dog-front-2.png",
  "/images/dog-golden/dog-front-3.png",
  "/images/dog-golden/dog-front-4.png",
  "/images/family/annie-back.png",
  "/images/family/annie-front.png",
  "/images/family/annie-girl1-back.png",
  "/images/family/annie-side.png",
  "/images/family/chris-back.png",
  "/images/family/chris-front.png",
  "/images/family/chris-side.png",
  "/images/family/claire-back.png",
  "/images/family/claire-front.png",
  "/images/family/claire-girl2-back.png",
  "/images/family/claire-girl2-front.png",
  "/images/family/claire-side.png",
  "/images/family/emerson-back.png",
  "/images/family/emerson-boy3-back.png",
  "/images/family/emerson-front.png",
  "/images/family/emerson-side.png",
  "/images/npcs/boy-1.png",
  "/images/npcs/boy-2.png",
  "/images/npcs/boy-3.png",
  "/images/npcs/boy-4.png",
  "/images/npcs/girl-1.png",
  "/images/npcs/girl-2.png",
  "/images/npcs/girl-3.png",
  "/images/npcs/girl-4.png",
  "/images/npcs/old-man-1.png",
  "/images/npcs/torch-town/arin.png",
  "/images/npcs/torch-town/captain-bren.png",
  "/images/npcs/torch-town/dara.png",
  "/images/npcs/torch-town/eldra.png",
  "/images/npcs/torch-town/haro.png",
  "/images/npcs/torch-town/jorin.png",
  "/images/npcs/torch-town/kira.png",
  "/images/npcs/torch-town/len.png",
  "/images/npcs/torch-town/lio.png",
  "/images/npcs/torch-town/maro.png",
  "/images/npcs/torch-town/mira.png",
  "/images/npcs/torch-town/old-fenna.png",
  "/images/npcs/torch-town/rhett.png",
  "/images/npcs/torch-town/sela.png",
  "/images/npcs/torch-town/serin.png",
  "/images/npcs/torch-town/tavi.png",
  "/images/npcs/torch-town/thane.png",
  "/images/npcs/torch-town/torin.png",
  "/images/npcs/torch-town/yanna.png",
];

/** Old path -> current path. */
export const LEGACY_SPRITE_PATHS: ReadonlyMap<string, string> = new Map(
  CLEANED_2026_09.map((p) => [p, p.replace(/\.png$/, "-clean.png")])
);

const SPRITE_PATH = /\/images\/[A-Za-z0-9_./-]+\.png/g;

/** Rewrite every renamed sprite path inside a serialized save. Unknown paths pass through. */
export function migrateLegacySpritePaths(raw: string): string {
  return raw.replace(SPRITE_PATH, (p) => LEGACY_SPRITE_PATHS.get(p) ?? p);
}
