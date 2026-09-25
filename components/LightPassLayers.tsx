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

import React from "react";
import { EnemyRegistry, type EnemyKind } from "../lib/enemies/registry";
import { TileSubtype } from "../lib/map";
import { assetUrl } from "../lib/asset_url";
import {
  actorToneTable,
  ambientRgb,
  type LightBackdrop,
  type LightPassConfig,
} from "../lib/light_pass";

const TILE = 40;

export type LightSourceKind = "wall" | "lava" | "carrier";

export interface LightSource {
  key: string;
  kind: LightSourceKind;
  /** Light center in map px. */
  x: number;
  y: number;
}

/** The hero's light center in map px for a (possibly fractional) [row, col]. */
export function lightPassHeroPx(pos: [number, number]): [number, number] {
  // The flame is held at chest height, not at the tile center.
  return [pos[1] * TILE + TILE / 2, pos[0] * TILE + TILE * 0.35];
}

/** Wall torches, lava and torch-carrying enemies, as light sources in map px. */
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

// Multiply hole: white holds the scene at full brightness, fading to the ambient fill.
const HOLE_GRADIENT =
  "radial-gradient(circle closest-side, #fff 0%, #fff 22%, rgba(255,255,255,0.8) 45%, rgba(255,255,255,0.45) 65%, rgba(255,255,255,0.15) 85%, rgba(255,255,255,0) 100%)";

function warmGradient(rgb: string, strength: number): string {
  const a = Math.max(0, Math.min(1, strength));
  return `radial-gradient(circle closest-side, rgba(${rgb},${a}) 0%, rgba(${rgb},${(a * 0.75).toFixed(3)}) 30%, rgba(${rgb},${(a * 0.35).toFixed(3)}) 65%, rgba(${rgb},0) 100%)`;
}

function glowGradient(strength: number): string {
  const a = Math.max(0, Math.min(1, strength));
  return `radial-gradient(circle closest-side, rgba(255,185,105,${a}) 0%, rgba(255,170,90,${(a * 0.45).toFixed(3)}) 45%, rgba(255,160,80,0) 100%)`;
}

const AMBER = "255,150,60";
const LAVA_RED = "255,100,40";

interface PoolSpec {
  radius: number; // px
  background: string;
}

interface SourceLook {
  hole: PoolSpec;
  warm: PoolSpec | null;
  glow: PoolSpec | null;
}

function sourceLook(kind: LightSourceKind | "hero", c: LightPassConfig): SourceLook {
  switch (kind) {
    case "hero":
      return {
        hole: { radius: c.heroRadius * TILE, background: HOLE_GRADIENT },
        warm: { radius: c.heroRadius * 0.72 * TILE, background: warmGradient(AMBER, c.heroWarmth) },
        glow: { radius: 1.6 * TILE, background: glowGradient(c.heroGlow) },
      };
    case "wall":
      return {
        hole: { radius: c.wallRadius * TILE, background: HOLE_GRADIENT },
        warm: { radius: c.wallRadius * 0.9 * TILE, background: warmGradient(AMBER, c.wallWarmth) },
        glow: { radius: 0.9 * TILE, background: glowGradient(c.heroGlow * 0.9) },
      };
    case "carrier":
      return {
        hole: { radius: c.wallRadius * 0.9 * TILE, background: HOLE_GRADIENT },
        warm: { radius: c.wallRadius * 0.8 * TILE, background: warmGradient(AMBER, c.wallWarmth * 0.9) },
        glow: { radius: 0.9 * TILE, background: glowGradient(c.heroGlow * 0.8) },
      };
    case "lava":
      // Lava already paints its own glow; it only needs to push back the falloff and
      // tint its surroundings red.
      return {
        hole: { radius: 1.6 * TILE, background: HOLE_GRADIENT },
        warm: { radius: 1.5 * TILE, background: warmGradient(LAVA_RED, c.wallWarmth * 0.8) },
        glow: null,
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
  spec,
  x,
  y,
  follow,
  flicker,
  flickerKey,
  moving,
}: {
  spec: PoolSpec;
  x?: number;
  y?: number;
  follow?: boolean;
  flicker: boolean;
  flickerKey: string;
  moving?: boolean;
}) {
  const d = spec.radius * 2;
  // Outer node positions the pool (per frame for the hero, via the container's CSS
  // variables); the inner node flickers. Kept apart so the flicker's scale is about the
  // pool's own center instead of multiplying its translate.
  const position: React.CSSProperties = follow
    ? {
        transform: `translate3d(calc(var(--lp-hx) - ${spec.radius}px), calc(var(--lp-hy) - ${spec.radius}px), 0)`,
        willChange: "transform",
      }
    : {
        transform: `translate3d(${(x ?? 0) - spec.radius}px, ${(y ?? 0) - spec.radius}px, 0)`,
        // Torch-carrying goblins step a tile per turn; ease the light after them.
        transition: moving ? "transform 220ms ease-out" : undefined,
      };
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: d,
        height: d,
        ...position,
      }}
    >
      <div
        className={flicker ? "lp-flicker" : undefined}
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: spec.background,
          ...(flicker ? ({ ["--lp-delay" as string]: flickerDelay(flickerKey) } as React.CSSProperties) : null),
        }}
      />
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
  containerRef?: React.Ref<HTMLDivElement>;
}

export function LightPassLayers({
  rows,
  cols,
  hero,
  sources,
  config,
  containerRef,
}: LightPassLayersProps) {
  const width = cols * TILE;
  const height = rows * TILE;
  const heroPx = hero ? lightPassHeroPx(hero) : null;
  const heroLook = sourceLook("hero", config);
  const looks = sources.map((s) => ({ s, look: sourceLook(s.kind, config) }));

  const wrapper = (blend: React.CSSProperties["mixBlendMode"], zIndex: number, background?: string): React.CSSProperties => ({
    position: "absolute",
    left: 0,
    top: 0,
    width,
    height,
    overflow: "hidden",
    mixBlendMode: blend,
    zIndex,
    background,
    pointerEvents: "none",
  });

  const layer = (which: "hole" | "warm" | "glow") => (
    <>
      {looks.map(({ s, look }) => {
        const spec = look[which];
        if (!spec) return null;
        return (
          <Pool
            key={s.key}
            spec={spec}
            x={s.x}
            y={s.y}
            moving={s.kind === "carrier"}
            flicker={config.flicker && s.kind !== "lava"}
            flickerKey={`${which}-${s.key}`}
          />
        );
      })}
      {heroPx && heroLook[which] && (
        <Pool
          spec={heroLook[which]!}
          follow
          flicker={config.flicker}
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
      <div style={wrapper("multiply", 12050, ambientRgb(config))}>{layer("hole")}</div>
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
