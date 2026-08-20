import { Direction } from "./map/constants";

/**
 * Picks the hero-override sprite for the current facing (Hearth & Home).
 *
 * heroSprite is the front view and the fallback for every direction; back and
 * side are optional upgrades. Side art faces RIGHT — both hero render paths
 * already mirror the sprite for LEFT, so one side image covers both.
 * Returns undefined when no override is active (default hero art).
 */
export function resolveHeroSpriteOverride(
  direction: Direction,
  state: {
    heroSprite?: string;
    heroSpriteBack?: string;
    heroSpriteSide?: string;
  }
): string | undefined {
  if (!state.heroSprite) return undefined;
  switch (direction) {
    case Direction.UP:
      return state.heroSpriteBack ?? state.heroSprite;
    case Direction.LEFT:
    case Direction.RIGHT:
      return state.heroSpriteSide ?? state.heroSprite;
    default:
      return state.heroSprite;
  }
}
