// Torchlight "light pass" for the cave: on by default, `?light=0` opts out (and persists),
// tuned on /test-lighting.
//
// The problem it answers: with the torch lit, `forceDaylight` switches every lighting
// layer off, so the cave renders flat, and the actors are drawn in a much brighter,
// more saturated range than the room they stand in. Measured from the source art:
//
//   cave floor    luminance p95  45 (max  57)   median saturation 0.37
//   cave walls    luminance p95  60 (max  84)   median saturation 0.43-0.52
//   hero          luminance p95 175 (max 219)   median saturation 0.67
//   blue goblin   luminance p95 138 (max 236)   median saturation 0.95
//
// So the scene is lit like night and the characters like noon, which is what makes
// them read as pasted on. The pass does two things:
//
// 1. Grades the actors into the room: a tone curve that is the identity below the
//    environment's brightest pixels (KNEE) and eases highlights down to a ceiling, plus
//    a saturation cut. Floors and walls never reach the knee, so the curve is aimed at
//    exactly the pixels that are too bright for the room.
// 2. Lights the scene from above the actors: a multiply "light map" (ambient falloff
//    with holes at each light) and warm soft-light/screen pools at the hero's torch,
//    the wall torches, lava and torch-carrying goblins. Because the light sits above the
//    sprites, they are lit by the same pools as the floor, so their brightness comes
//    from how close they stand to a light.
//
// With the torch OUT the same light map runs in its "dark" form instead of the old
// per-tile glow tiers (a hard plus of lit tiles around each sconce): a near-black far
// field, a dim glow at the hero, and smooth pools at every wall torch, lava tile,
// torch-carrying goblin and the douse-to-see portal. Enemies outside the light are not
// rendered at all, so hiding in the dark still works (see lightLevelAt).

export interface LightPassConfig {
  /** Brightness of the unlit far field as a multiply level (1 = no falloff). */
  ambient: number;
  /** 0-2: how far the unlit far field leans cool (blue-green) rather than neutral. */
  coolness: number;
  /** Tiles from the hero at which his light has fully faded to ambient. */
  heroRadius: number;
  /** 0-1: strength of the warm amber soft-light pool around the hero. */
  heroWarmth: number;
  /** 0-1: strength of the hot screen-blended glow right at the torch. */
  heroGlow: number;
  /** Tiles a wall torch's light reaches. */
  wallRadius: number;
  /** 0-1: warmth of a wall torch's pool. */
  wallWarmth: number;
  /** 0.4-1: the brightest an actor highlight may be after grading (1 = ungraded). */
  actorCeiling: number;
  /** 0-1.2: saturation applied to actors after the tone curve (1 = unchanged). */
  actorSaturation: number;
  /** 0-1: opacity of the soft contact shadow under hero and enemies (0 = none). */
  shadows: number;
  /** Torch pools breathe and flicker. */
  flicker: boolean;
  /** Torch out: brightness of the unlit far field (0 = pure black). */
  darkAmbient: number;
  /** Torch out: tiles the hero's own faint glow reaches. */
  darkHeroRadius: number;
  /** Torch out: brightness at the hero's feet (his glow's peak). */
  darkHeroLevel: number;
  /** Torch out: tiles a wall torch lights, now that it is the only light. */
  darkWallRadius: number;
}

// Tuned by eye on /test-lighting (2026-09-25): a dark, cool far field with one long,
// nearly neutral torch falloff rather than a warm amber pool, tight sconce pools, and
// actors pulled down to the room's range. Torch out: a faint far field, the hero barely
// there, and the sconces reaching about three tiles as the room's only real light.
export const DEFAULT_LIGHT_PASS: LightPassConfig = {
  ambient: 0.44,
  coolness: 1,
  heroRadius: 10,
  heroWarmth: 0.03,
  heroGlow: 0.1,
  wallRadius: 1,
  wallWarmth: 0.45,
  actorCeiling: 0.65,
  actorSaturation: 0.86,
  shadows: 0.37,
  flicker: true,
  darkAmbient: 0.06,
  darkHeroRadius: 1.6,
  darkHeroLevel: 0.2,
  darkWallRadius: 3.1,
};

/**
 * Where the actor tone curve starts bending. 0.35 of full scale is luminance ~89, just
 * above the cave walls' brightest pixel (84), so floors and walls pass through untouched.
 */
export const ACTOR_KNEE = 0.35;

/**
 * Highlight-compressing tone curve for actor sprites (input and output 0-1, sRGB).
 * Identity up to the knee, then an ease-out toward `ceiling` whose slope at the knee is
 * 1, so there is no visible band where the curve bends.
 */
export function actorToneCurve(x: number, ceiling: number, knee: number = ACTOR_KNEE): number {
  const v = Math.min(1, Math.max(0, x));
  if (ceiling >= 1 || v <= knee) return v;
  const c = Math.max(ceiling, knee + 0.01);
  const t = (v - knee) / (1 - knee);
  // f(t) = 1 - (1 - t)^p has f'(0) = p; p = (1 - knee) / (c - knee) makes the joined
  // curve's slope exactly 1 at the knee. Never below 1, or the curve would overshoot.
  const p = Math.max(1, (1 - knee) / (c - knee));
  return knee + (c - knee) * (1 - Math.pow(1 - t, p));
}

/** The tone curve sampled for an SVG `<feFuncX type="table">`. */
export function actorToneTable(ceiling: number, samples = 17): string {
  const out: string[] = [];
  for (let i = 0; i < samples; i++) {
    out.push(actorToneCurve(i / (samples - 1), ceiling).toFixed(4));
  }
  return out.join(" ");
}

/** The multiply level of the unlit far field, tinted cool by `coolness`. */
export function ambientRgb(config: Pick<LightPassConfig, "ambient" | "coolness">): string {
  const a = Math.min(1, Math.max(0, config.ambient));
  const c = Math.min(2, Math.max(0, config.coolness));
  const ch = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgb(${ch(a * (1 - 0.1 * c))}, ${ch(a)}, ${ch(a * (1 + 0.12 * c))})`;
}

// --- Light pools ---------------------------------------------------------------

export type LightSourceKind = "wall" | "lava" | "carrier" | "portal";

/** A light in map px (the renderer's coordinates). */
export interface LightPoint {
  kind: LightSourceKind;
  x: number;
  y: number;
}

/**
 * Radial falloff of a light's multiply "hole", as [fraction of radius, brightness] stops.
 * The renderer draws its gradient from these and lightLevelAt samples them, so what the
 * player sees and which enemies get revealed can never disagree.
 */
export const HOLE_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0.22, 1],
  [0.45, 0.8],
  [0.65, 0.45],
  [0.85, 0.15],
  [1, 0],
];

/** Hole brightness at `t` = distance / radius (0 at the light, 0 beyond the radius). */
export function holeProfile(t: number): number {
  if (t <= 0) return HOLE_STOPS[0][1];
  for (let i = 1; i < HOLE_STOPS.length; i++) {
    const [t1, v1] = HOLE_STOPS[i];
    if (t <= t1) {
      const [t0, v0] = HOLE_STOPS[i - 1];
      return v0 + ((t - t0) / (t1 - t0)) * (v1 - v0);
    }
  }
  return 0;
}

/** A pool's reach in tiles and its peak strength (0 = off). */
export interface PoolSize {
  radius: number;
  strength: number;
}

/**
 * The multiply hole for a light, lit or dark. Strength 0 keeps a pool mounted but unseen,
 * so the renderer can fade it in and out when the torch snuffs or relights.
 */
export function holeFor(kind: LightSourceKind | "hero", c: LightPassConfig, dark: boolean): PoolSize {
  switch (kind) {
    case "hero":
      return dark
        ? { radius: c.darkHeroRadius, strength: c.darkHeroLevel }
        : { radius: c.heroRadius, strength: 1 };
    case "wall":
      return { radius: dark ? c.darkWallRadius : c.wallRadius, strength: 1 };
    case "carrier":
      return { radius: (dark ? c.darkWallRadius : c.wallRadius) * 0.9, strength: 1 };
    case "lava":
      return { radius: dark ? Math.max(1.6, c.darkWallRadius * 0.6) : 1.6, strength: 1 };
    case "portal":
      // The douse-to-see portal only exists in the dark.
      return { radius: 1.4, strength: dark ? 0.9 : 0 };
  }
}

/**
 * Light-map brightness at a map-px point: the brightest hole covering it, or the ambient
 * far field. Used to decide which enemies the dark reveals.
 */
export function lightLevelAt(
  x: number,
  y: number,
  sources: ReadonlyArray<LightPoint>,
  hero: readonly [number, number] | null,
  c: LightPassConfig,
  dark: boolean,
  tile = 40
): number {
  let level = dark ? c.darkAmbient : c.ambient;
  const consider = (kind: LightSourceKind | "hero", sx: number, sy: number) => {
    const { radius, strength } = holeFor(kind, c, dark);
    if (strength <= 0 || radius <= 0) return;
    const d = Math.hypot(x - sx, y - sy) / (radius * tile);
    if (d >= 1) return;
    level = Math.max(level, strength * holeProfile(d));
  };
  for (const s of sources) consider(s.kind, s.x, s.y);
  if (hero) consider("hero", hero[0], hero[1]);
  return level;
}

/**
 * Torch out: the light level an enemy's tile needs before it is drawn. Always a clear step
 * above the far field, so raising darkAmbient to see the room never reveals the enemies
 * standing in the dark.
 */
export function darkRevealThreshold(c: LightPassConfig): number {
  return Math.max(0.12, c.darkAmbient + 0.08);
}

/**
 * Torch out: whether an enemy or NPC on [row, col] is drawn. The eight tiles around the
 * hero always are, whatever the knobs say (the old tiers showed them too, and anything
 * that can hit you must be visible); beyond that, only where a light reaches. The hero's
 * dark glow is centred on his tile (no flame to hold up).
 */
export function darkRevealsTile(
  row: number,
  col: number,
  hero: readonly [number, number] | null,
  sources: ReadonlyArray<LightPoint>,
  c: LightPassConfig,
  tile = 40
): boolean {
  if (hero && Math.max(Math.abs(row - hero[0]), Math.abs(col - hero[1])) <= 1) return true;
  const heroPx = hero ? ([(hero[1] + 0.5) * tile, (hero[0] + 0.5) * tile] as const) : null;
  return (
    lightLevelAt((col + 0.5) * tile, (row + 0.5) * tile, sources, heroPx, c, true, tile) >=
    darkRevealThreshold(c)
  );
}

export const LIGHT_PASS_STORAGE_KEY = "tb_light_pass";

/**
 * Whether the light pass is on. `?light=1` / `?light=0` is an explicit choice that
 * persists (like `?smooth=`); otherwise the persisted choice applies, and the default is
 * on (shipped 2026-09-25), so only a stored "0" turns it off.
 */
export function readLightPassFlag(search: string, storage?: Storage | null): boolean {
  const qp = new URLSearchParams(search).get("light");
  if (qp === "0" || qp === "1") {
    try {
      storage?.setItem(LIGHT_PASS_STORAGE_KEY, qp);
    } catch {
      // storage unavailable (private mode etc.): the param still applies now
    }
    return qp === "1";
  }
  try {
    return storage?.getItem(LIGHT_PASS_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * The page behind the playfield.
 * - classic: the tiled close-up wall under a 40% black veil (today's look).
 * - dark: near-black with a faint glow spreading out from the playfield, so the room is
 *   the only lit thing in the dark.
 * - distant: the same brick scaled down toward the playfield's pixel size, blurred and
 *   darkened so it reads as far-off cave rather than a second foreground.
 */
export type LightBackdrop = "classic" | "dark" | "distant";

export const LIGHT_BACKDROPS: LightBackdrop[] = ["classic", "dark", "distant"];

/** `?bg=classic|dark|distant`; the light pass defaults to "dark". */
export function readBackdropFlag(search: string): LightBackdrop {
  const qp = new URLSearchParams(search).get("bg");
  return LIGHT_BACKDROPS.includes(qp as LightBackdrop) ? (qp as LightBackdrop) : "dark";
}
