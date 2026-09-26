"use client";

// Render side of the torchlight light pass (see lib/light_pass.ts for the why).
//
// Three map-sized layers sit inside the map container, above the wall tops (12000) and
// below the bomb/boss effects (12100+), so they light sprites and walls alike:
//
//   multiply   the light map: an ambient grey-blue fill with a white hole at each light.
//              White multiplies to "unchanged", so lights keep the scene at full
//              brightness and the far field dims to `ambient`.
//   soft-light warm amber pools. Soft-light leaves black at black, so pixel-art outlines
//              stay crisp while the midtones around a flame warm up.
//   screen     a small hot core right at the hero's torch and each sconce.
//
// Each layer is its own blend group (mix-blend-mode on the clipping wrapper), and
// inside the group the pools composite normally. The wrappers are clipped to the map so
// the fill never paints past the map edge on maps smaller than the viewport. The hero's
// pools follow `--lp-hx` / `--lp-hy` on the container, which the smooth-movement rAF
// loop writes every frame, so the light stays in his hand mid-step.

// The same layers draw both lighting states, and only two things differ between them:
// the far field and the hero's own light. Sconces, lava, torch-carrying goblins and the
// portal are fixed lamps that look the same either way. Every pool's size and strength is
// a CSS width/height and opacity with a transition, so when the torch snuffs, the hero's
// long falloff shrinks to a faint glow and the lamps are left as the room's light (and
// back again on a relight) instead of the room cutting between two looks.

import React from "react";
import { EnemyRegistry, type EnemyKind } from "../lib/enemies/registry";
import { TileSubtype } from "../lib/map";
import { assetUrl } from "../lib/asset_url";
import {
  HOLE_STOPS,
  actorToneTable,
  ambientRgb,
  holeFor,
  type LightBackdrop,
  type LightPassConfig,
  type LightPoint,
  type LightSourceKind,
  type PoolSize,
} from "../lib/light_pass";

const TILE = 40;

// How long a pool takes to grow, shrink or fade when the torch changes state.
const LIGHT_TRANSITION = "600ms ease-in-out";

export interface LightSource extends LightPoint {
  key: string;
}

/** The hero's light center in map px for a (possibly fractional) [row, col]. */
export function lightPassHeroPx(pos: [number, number]): [number, number] {
  // The flame is held at chest height, not at the tile center.
  return [pos[1] * TILE + TILE / 2, pos[0] * TILE + TILE * 0.35];
}

// Snuffed, his glow sits on his tile's center rather than at the (absent) flame; this
// shifts it down from the chest-height anchor (matches darkRevealsTile).
const HERO_DARK_DROP = TILE * 0.15;

/** Wall torches, lava, the dark portal and torch-carrying enemies, in map px. */
export function collectLightSources(
  subtypes: number[][][] | undefined,
  enemies: ReadonlyArray<{ id: string; kind: string; x: number; y: number }> | undefined
): LightSource[] {
  const out: LightSource[] = [];
  if (subtypes) {
    for (let y = 0; y < subtypes.length; y++) {
      const row = subtypes[y];
      for (let x = 0; x < row.length; x++) {
        const st = row[x];
        if (!st || st.length === 0) continue;
        if (st.includes(TileSubtype.WALL_TORCH)) {
          // The sconce hangs low on the wall's front face and throws its light onto the
          // floor in front of it.
          out.push({ key: `wall-${y}-${x}`, kind: "wall", x: (x + 0.5) * TILE, y: (y + 0.9) * TILE });
        } else if (st.includes(TileSubtype.LAVA)) {
          out.push({ key: `lava-${y}-${x}`, kind: "lava", x: (x + 0.5) * TILE, y: (y + 0.5) * TILE });
        } else if (st.includes(TileSubtype.DARK_PORTAL)) {
          out.push({ key: `portal-${y}-${x}`, kind: "portal", x: (x + 0.5) * TILE, y: (y + 0.5) * TILE });
        }
      }
    }
  }
  for (const e of enemies ?? []) {
    if (!EnemyRegistry[e.kind as EnemyKind]?.carriesTorch) continue;
    out.push({ key: `carrier-${e.id}`, kind: "carrier", x: (e.x + 0.5) * TILE, y: (e.y + 0.4) * TILE });
  }
  return out;
}

/**
 * The actor grade, referenced as `url(#torchboy-actor-grade)` through the
 * `--lp-actor-filter` variable. Mount it whenever that variable is set: a filter url that
 * points at nothing is handled differently per browser.
 */
export function LightPassGradeFilter({ config }: { config: LightPassConfig }) {
  const table = actorToneTable(config.actorCeiling);
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      style={{ position: "absolute", width: 0, height: 0 }}
    >
      <filter id="torchboy-actor-grade" colorInterpolationFilters="sRGB">
        <feComponentTransfer>
          <feFuncR type="table" tableValues={table} />
          <feFuncG type="table" tableValues={table} />
          <feFuncB type="table" tableValues={table} />
        </feComponentTransfer>
        <feColorMatrix type="saturate" values={String(config.actorSaturation)} />
      </filter>
    </svg>
  );
}

// Gradients are drawn at full strength; a pool's strength is its opacity, which is what
// lets it fade smoothly (gradients themselves don't transition).
const HOLE_GRADIENT = `radial-gradient(circle closest-side, ${HOLE_STOPS.map(
  ([t, v]) => `rgba(255,255,255,${v}) ${Math.round(t * 100)}%`
).join(", ")})`;

function warmGradient(rgb: string): string {
  return `radial-gradient(circle closest-side, rgba(${rgb},1) 0%, rgba(${rgb},0.75) 30%, rgba(${rgb},0.35) 65%, rgba(${rgb},0) 100%)`;
}

const GLOW_GRADIENT =
  "radial-gradient(circle closest-side, rgba(255,185,105,1) 0%, rgba(255,170,90,0.45) 45%, rgba(255,160,80,0) 100%)";

// The hero's light, drawn into the soft-light group as neutral grey over the lamps' warm
// pools. Soft-light with 50% grey is the identity, so this changes nothing on its own; it
// only thins the amber beneath it. Light mixes in proportion: where the hero's torch is as
// bright as a sconce, half the light there is the sconce's, so it keeps half its tint.
const WASH_GRADIENT = `radial-gradient(circle closest-side, ${HOLE_STOPS.map(
  ([t, v]) => `rgba(128,128,128,${v}) ${Math.round(t * 100)}%`
).join(", ")})`;
const HERO_WASH = 0.5;

const AMBER_GRADIENT = warmGradient("255,150,60");
const LAVA_GRADIENT = warmGradient("255,100,40");
const PORTAL_GRADIENT = warmGradient("120,200,255");

interface Look {
  hole: PoolSize;
  warm: PoolSize & { gradient: string };
  glow: PoolSize;
}

function lookFor(kind: LightSourceKind | "hero", c: LightPassConfig, dark: boolean): Look {
  const hole = holeFor(kind, c, dark);
  switch (kind) {
    case "hero":
      // Snuffed, the hero is a faint presence, not a light: no warmth, no flame core.
      return {
        hole,
        warm: { radius: c.heroRadius * 0.72, strength: dark ? 0 : c.heroWarmth, gradient: AMBER_GRADIENT },
        glow: { radius: 1.6, strength: dark ? 0 : c.heroGlow },
      };
    case "wall":
      return {
        hole,
        warm: { radius: hole.radius * 0.9, strength: c.wallWarmth, gradient: AMBER_GRADIENT },
        glow: { radius: 0.9, strength: c.heroGlow * 0.9 },
      };
    case "carrier":
      return {
        hole,
        warm: { radius: hole.radius * 0.9, strength: c.wallWarmth * 0.9, gradient: AMBER_GRADIENT },
        glow: { radius: 0.9, strength: c.heroGlow * 0.8 },
      };
    case "lava":
      // Lava already paints its own glow; it only needs to push back the falloff and
      // tint its surroundings red.
      return {
        hole,
        warm: { radius: 1.5, strength: c.wallWarmth * 0.8, gradient: LAVA_GRADIENT },
        glow: { radius: 0, strength: 0 },
      };
    case "portal":
      return {
        hole,
        warm: { radius: 1.6, strength: dark ? 0.35 : 0, gradient: PORTAL_GRADIENT },
        glow: { radius: 0, strength: 0 },
      };
  }
}

// Stable per-source phase so neighbouring sconces never flicker in sync.
function flickerDelay(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return `${-((Math.abs(h) % 3100) / 1000)}s`;
}

function Pool({
  size,
  gradient,
  x,
  y,
  follow,
  flicker,
  flickerKey,
  moving,
  dropY = 0,
}: {
  size: PoolSize;
  gradient: string;
  x?: number;
  y?: number;
  follow?: boolean;
  flicker: boolean;
  flickerKey: string;
  moving?: boolean;
  /** Shift the pool down from its anchor (px), transitioned with its size. */
  dropY?: number;
}) {
  const r = size.radius * TILE;
  // Three nodes, each owning one kind of motion so none of them fight:
  //   anchor  a zero-size point at the light (per frame for the hero via the container's
  //           CSS variables; eased after a torch-carrying goblin's step)
  //   sizer   the pool's extent and strength, both transitioned
  //   flicker the breathing animation, scaling about the pool's own center
  const anchor: React.CSSProperties = follow
    ? { transform: "translate3d(var(--lp-hx), var(--lp-hy), 0)", willChange: "transform" }
    : {
        transform: `translate3d(${x ?? 0}px, ${y ?? 0}px, 0)`,
        transition: moving ? "transform 220ms ease-out" : undefined,
      };
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, ...anchor }}>
      <div
        style={{
          position: "absolute",
          left: -r,
          top: -r + dropY,
          width: r * 2,
          height: r * 2,
          opacity: Math.max(0, Math.min(1, size.strength)),
          transition: `left ${LIGHT_TRANSITION}, top ${LIGHT_TRANSITION}, width ${LIGHT_TRANSITION}, height ${LIGHT_TRANSITION}, opacity ${LIGHT_TRANSITION}`,
        }}
      >
        <div
          className={flicker ? "lp-flicker" : undefined}
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: gradient,
            ...(flicker ? ({ ["--lp-delay" as string]: flickerDelay(flickerKey) } as React.CSSProperties) : null),
          }}
        />
      </div>
    </div>
  );
}

export interface LightPassLayersProps {
  rows: number;
  cols: number;
  /** The hero's current [row, col] (fractional mid-step); null hides his light. */
  hero: [number, number] | null;
  sources: LightSource[];
  config: LightPassConfig;
  /** Torch out: the near-black far field, the hero's faint glow, sconces at full reach. */
  dark: boolean;
  containerRef?: React.Ref<HTMLDivElement>;
}

export function LightPassLayers({
  rows,
  cols,
  hero,
  sources,
  config,
  dark,
  containerRef,
}: LightPassLayersProps) {
  const width = cols * TILE;
  const height = rows * TILE;
  const heroPx = hero ? lightPassHeroPx(hero) : null;
  const heroLook = lookFor("hero", config, dark);
  const looks = sources.map((s) => ({ s, look: lookFor(s.kind, config, dark) }));

  const wrapper = (
    blend: React.CSSProperties["mixBlendMode"],
    zIndex: number,
    background?: string
  ): React.CSSProperties => ({
    position: "absolute",
    left: 0,
    top: 0,
    width,
    height,
    overflow: "hidden",
    mixBlendMode: blend,
    zIndex,
    background,
    transition: background ? `background-color ${LIGHT_TRANSITION}` : undefined,
    pointerEvents: "none",
  });

  const gradientOf = (which: "hole" | "warm" | "glow", look: Look) =>
    which === "hole" ? HOLE_GRADIENT : which === "warm" ? look.warm.gradient : GLOW_GRADIENT;

  const layer = (which: "hole" | "warm" | "glow") => (
    <>
      {looks.map(({ s, look }) => {
        const size = look[which];
        if (size.radius <= 0) return null;
        return (
          <Pool
            key={s.key}
            size={size}
            gradient={gradientOf(which, look)}
            x={s.x}
            y={s.y}
            moving={s.kind === "carrier"}
            flicker={config.flicker && s.kind !== "lava" && s.kind !== "portal"}
            flickerKey={`${which}-${s.key}`}
          />
        );
      })}
      {heroPx && which === "warm" && (
        <Pool
          size={{
            radius: heroLook.hole.radius,
            strength: heroLook.hole.strength * HERO_WASH,
          }}
          gradient={WASH_GRADIENT}
          follow
          dropY={dark ? HERO_DARK_DROP : 0}
          flicker={config.flicker && !dark}
          flickerKey="wash-hero"
        />
      )}
      {heroPx && (
        <Pool
          size={heroLook[which]}
          gradient={gradientOf(which, heroLook)}
          follow
          dropY={dark ? HERO_DARK_DROP : 0}
          // A torch flickers; a snuffed hero's own faint presence holds steady.
          flicker={config.flicker && !dark}
          flickerKey={`${which}-hero`}
        />
      )}
    </>
  );

  return (
    // Deliberately no z-index, transform, opacity or filter here: any of them would make
    // this node a stacking context and the blend layers would only blend with each other.
    <div
      ref={containerRef}
      aria-hidden="true"
      data-testid="light-pass-layers"
      data-light-dark={dark ? "1" : "0"}
      style={
        {
          position: "absolute",
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          pointerEvents: "none",
          ["--lp-hx" as string]: `${heroPx?.[0] ?? 0}px`,
          ["--lp-hy" as string]: `${heroPx?.[1] ?? 0}px`,
        } as React.CSSProperties
      }
    >
      <div
        style={wrapper(
          "multiply",
          12050,
          ambientRgb({ ambient: dark ? config.darkAmbient : config.ambient, coolness: config.coolness })
        )}
      >
        {layer("hole")}
      </div>
      <div style={wrapper("soft-light", 12060)}>{layer("warm")}</div>
      <div style={wrapper("screen", 12070)}>{layer("glow")}</div>
    </div>
  );
}

/**
 * The page behind the playfield for the non-classic backdrops (see LightBackdrop). Fills
 * its positioned parent; render it as the first child so page content sits above it.
 */
export function LightPassBackdrop({ kind }: { kind: Exclude<LightBackdrop, "classic"> }) {
  if (kind === "dark") {
    return (
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          // A faint warm spill around where the playfield sits, falling off to black.
          background:
            "radial-gradient(ellipse 55% 45% at 50% 36%, rgba(72, 64, 42, 0.30) 0%, rgba(38, 42, 32, 0.16) 45%, rgba(0, 0, 0, 0) 75%), #090c0a",
        }}
      />
    );
  }
  return (
    <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden">
      <div
        style={{
          position: "absolute",
          // Overscan so the blur never shows a soft edge at the page border.
          inset: -16,
          backgroundImage: `url(${assetUrl("/images/presentational/wall-up-close.png")})`,
          backgroundRepeat: "repeat",
          // Down from 1024px so its chunky pixels shrink toward the playfield's scale.
          backgroundSize: "224px",
          filter: "blur(2.5px) brightness(0.3) saturate(0.6)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 70% 60% at 50% 38%, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.6) 100%)",
        }}
      />
    </div>
  );
}
