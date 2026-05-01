# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## Project Overview

TorchBoy is a daily dungeon-crawling roguelite built with Next.js (App Router) and TypeScript. Players navigate a 3-floor dungeon, fight enemies, collect items, and try to escape. It is deployed on Vercel — merges to main auto-deploy to production.

## Key Commands

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run test      # Run Jest test suite
npm run lint      # ESLint
```

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

## DO NOTs

- Do not modify `lib/rng.ts` without understanding downstream effects on daily seeds
- Do not add emojis to code or comments unless already present
- Never commit or push unless explicitly asked to in that message
