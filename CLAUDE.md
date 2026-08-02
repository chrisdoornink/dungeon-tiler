# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## Project Overview

TorchBoy is a daily dungeon-crawling roguelite built with Next.js (App Router) and TypeScript. Players navigate a 3-floor dungeon, fight enemies, collect items, and try to escape. It is deployed on Vercel — merges to main auto-deploy to production.

## Key Commands

```bash
npm run dev       # Start dev server (port 4000)
npm run build     # Production build — DO NOT run while dev server is up (see DO NOTs)
npm run typecheck # tsc --noEmit — safe verification during dev, writes nothing
npm run test      # Run Jest test suite
npm run lint      # ESLint
```

**During iteration, prefer `npm run typecheck` over `npm run build` for sanity checks.** Both `next dev` and `next build` write to the same `.next/` directory, so a build run while dev is up corrupts the dev server's chunk manifest and every browser refresh 404s on `_next/static/*` assets until you stop dev, `rm -rf .next`, and restart. `typecheck` catches type errors without touching `.next/`.

## Architecture

- **Game logic**: `lib/map/game-state.ts` — core state machine, all movement/combat/item logic lives here
- **Enemies**: `lib/enemies/registry.ts`, `lib/map/enemy-features.ts`
- **Badges**: `lib/badges.ts` — badge definitions with rarity (common/rare/epic/legendary)
- **Daily challenge**: `lib/daily_challenge_storage.ts`, `app/daily/`
- **Completion screen**: `components/daily/DailyCompleted.tsx`
- **Map generation**: `lib/map/map-features.ts`

## Game Constants (useful for calibrating badge thresholds)

- **Floors**: 3 per daily run
- **Enemies per floor**: F1=3-5, F2=7-9, F3=8-10 (~18-24 total)
- **Snakes per floor**: 0-1 (floors 1-3), so max ~3 snakes per run
- **Rocks per floor**: F1=5, F2=4, F3=3 (12 total)

## Deployment

Deployed on Vercel. Merges to `main` trigger automatic production deploys. Use `/ship` to commit and push.

## Art assets (`public/images/`)

**When a sprite's pixels change, rename the file. Editing it in place will not reach players who already have it.** Art is served from a stable URL with a long `Cache-Control` max-age (see `next.config.ts`) and there is no content hash in the filename, so a browser that fetched the old art keeps serving it from disk without asking the server again. This is not theoretical — the snake medallion stayed pink on returning devices for weeks after it was recolored blue.

- **Recolor or redraw → new filename**, ideally one that says what changed (`snake-medalion.png` → `snake-medallion-blue.png`). Then update every reference: `grep -rn "old-name" components lib app`. Expect hits beyond the obvious render component — the preload lists (`lib/assets_manifest.ts`, `components/PreloadImages.tsx`) and the end-screen/stats icon maps (`components/daily/DailyCompleted.tsx`, `components/stats/EndgameStats.tsx`, `lib/stats/daily_chest.ts`) each carry their own copy of the path.
- **A brand-new sprite at a new path needs none of this** — only in-place edits to an existing filename are the hazard.
- **The cache header is a backstop, not the fix.** `max-age=604800, stale-while-revalidate=2592000` caps a forgotten rename at roughly a week; it does nothing for clients that already cached a file under the older `immutable` header. Only a new URL reaches those.

## Standalone HTML5 build (`standalone/`)

`standalone/` is a separate Vite build of **endless mode** for web-game portals (CrazyGames/Poki). It reuses this repo's `lib/` + `components/` engine unchanged and ships as a static bundle served from a CDN subpath. Everything standalone-specific is a **no-op in the Next app** (gated on `window.__ASSET_BASE__` / `window.__STANDALONE__`, which only the standalone sets). When editing shared game/render code, keep it working:

- **New `/images/...` paths in shared code MUST go through `assetUrl()`** (from `lib/asset_url`). Applies to `Tile.tsx`, `TilemapGrid.tsx`, `lib/enemies/registry.ts`, `lib/environment.ts`, and HUD/animation components — e.g. `` backgroundImage: `url(${assetUrl("/images/items/x.png")})` `` or `src={assetUrl("/images/x.png")}`. An unwrapped absolute path works on torchboy.com but 404s in the portal build (subpath hosting). CSS-module `url("/images/...")` backgrounds are auto-rewritten at build time — no action needed there.
- **New endless enemies/items**: their sprites follow the same `assetUrl()` rule, and the asset trim keeps them automatically — `standalone/scripts/trim-dist.mjs` only *removes* a story/town/boss blocklist. Only add a directory to that blocklist if it is large and NOT reachable in endless.
- **Do not add `next/*` imports** other than the shimmed `next/image` / `next/link` / `next/navigation`, nor server-only imports (`lib/redis`, `next/server`, node builtins), into the endless render path — they break the Vite build.
- **Keep `--tile-size` and `.fov-tier-*` in `app/globals.css`** (the standalone depends on them for tile sizing/lighting), and **keep `standalone` in `tsconfig.json` `exclude`** (removing it fails the Vercel deploy on Vite imports).
- **Portal-only behavior gets a seam in `lib/`, never a branch in a shared component.** The CrazyGames ad break is the pattern: `lib/ad_break.ts` is a handler registry that only `standalone/src/EndlessApp.tsx` ever registers into, so the Next app has no handler and the code path is dead there by construction. Policy that is really game tuning (e.g. `lib/ad_gate.ts`, how often an ad may interrupt) belongs in `lib/` too, where it is typechecked and tested — see the next point for why that matters.
- **`standalone/src` is typechecked by NOTHING unless you run it.** The root `tsconfig.json` excludes `standalone/`, and `vite build` uses esbuild, which strips types without checking them — a broken type in there builds cleanly and fails at runtime. Run `npm --prefix standalone run typecheck`. Its `tsconfig.json` mirrors the vite aliases and leans on two hand-written ambient files (`src/shims/ambient.d.ts` for CSS modules, `src/shims/styled-jsx.d.ts` for `<style jsx>`); the `import "react"` in the latter is load-bearing (see its comment).
- **The portal shares the live leaderboard.** `standalone/index.html` sets `window.__API_BASE__` to torchboy.com and `lib/api_base.ts` routes the endless leaderboard calls there, so `app/api/endless-run/route.ts` must keep its CORS headers and `OPTIONS` handler — drop them and the portal board silently goes quiet (every call is fail-soft). Clearing `__API_BASE__` falls back to local-best-only.
- After merging main into the standalone branch, re-verify: `npm --prefix standalone install && npm --prefix standalone run typecheck && npm --prefix standalone run build && node standalone/scripts/trim-dist.mjs`.

## DO NOTs

- Do not modify `lib/rng.ts` without understanding downstream effects on daily seeds
- When adding `/images/...` paths or new enemies/items to shared code, keep the standalone build working — wrap paths in `assetUrl()` (see the Standalone HTML5 build section)
- **Do not change a sprite's pixels without renaming the file** — cached devices keep the old art indefinitely (see Art assets)
- Do not add emojis to code or comments unless already present
- Never commit or push unless explicitly asked to in that message
- **Do not run `npm run build` while the dev server is running.** It overwrites `.next/` with production-hashed chunks, after which the dev server keeps serving HTML referencing dev-mode chunk paths that no longer exist → every refresh 404s. Use `npm run typecheck` for in-session verification; only run `npm run build` after the user has stopped dev (e.g. right before `/ship`).
