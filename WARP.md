# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

**Torch Boy** is a roguelike dungeon crawler game built with Next.js featuring daily challenges, PostHog analytics, and retro pixel art aesthetics. The game runs at torchboy.com with a daily challenge as the main entry point.

## Core Development Commands

### Development
```bash
# Start development server
npm run dev

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Type checking
npm run typecheck

# Linting
npm run lint

# Build for production (includes pre-build checks)
npm run build
```

### Image Asset Management
```bash
# Compress image assets
npm run compress-images

# Compress with WebP format
npm run compress-images:webp

# Compress large assets
npm run compress-large

# Ultra compression for size optimization
npm run ultra-compress
```

## Architecture Overview

### Tech Stack
- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS v3.4.17
- **Analytics**: PostHog (posthog-js & posthog-node)
- **Testing**: Jest + React Testing Library
- **TypeScript**: Full type safety throughout

### Core Architecture Patterns

#### Test-Driven Development (TDD)
The codebase follows a strict TDD methodology:
1. Write failing tests first
2. Implement minimum code to pass tests
3. Refactor while keeping tests green
4. All game logic and components have comprehensive test coverage

#### Component Architecture
- **Modular Components**: Each component lives in its own file under `components/`
- **Game Engine**: Core game logic separated in `lib/map/` modules
- **Daily Challenge System**: Dedicated flow management for the main game mode

#### State Management
- **Game State**: Centralized in `GameState` type with immutable updates
- **Storage**: Browser localStorage with typed interfaces
- **Daily Challenge**: Separate storage and flow management

### Directory Structure

```
app/                    # Next.js App Router pages
├── daily/             # Main entry point (production)
├── test-room*/        # Development test environments (blocked in production)
└── layout.tsx         # Global layout with fonts and preloading

components/            # React components (one per file)
├── daily/            # Daily challenge specific components
├── Tile.tsx          # Individual tile rendering
├── TilemapGrid.tsx   # Main game grid component
└── GameView.tsx      # Game orchestration component

lib/                  # Core game logic and utilities
├── map/              # Map generation and game state logic
├── enemies/          # Enemy system and registry
├── analytics.ts      # PostHog integration
├── daily_challenge_* # Daily challenge flow management
└── current_game_storage.ts  # Game persistence

__tests__/            # Jest tests (mirrors source structure)
└── [mirrors lib/ and components/ structure]
```

### Game Engine Design

#### Map Generation System
- **Modular Generation**: Room-based generation with connectivity validation
- **Feature System**: Pluggable features (enemies, items, doors, etc.)
- **Validation**: Built-in checks for floor connectivity and room count requirements
- **Seeded Random**: Daily challenges use consistent seeds for same-day maps

#### Game State Management
- **Immutable Updates**: All game state changes return new state objects
- **Action System**: Player moves, enemy AI, and item interactions handled through dedicated functions
- **Persistence**: Automatic saving to localStorage with slot-based system

#### Combat & Movement
- **Turn-based**: Player action triggers enemy movement/actions
- **Line of Sight**: Sophisticated visibility calculations for fog of war
- **Projectile System**: Rock/rune throwing with animated paths and collision detection

## Production Environment

### Route Security (middleware.ts)
Production blocks access to:
- `/test-room*` - Development test environments
- `/test-world` - Testing sandbox
- `/intro` - Standalone intro (only through daily flow)
- `/end` - Direct end page access
- `/analytics*` - Analytics dashboard

### Daily Challenge System
- **Production Entry Point**: `/` redirects to `/daily`
- **One Play Per Day**: LocalStorage enforcement of daily limits
- **Seeded Generation**: Consistent maps for all players on same day
- **Progress Tracking**: Streaks, completion stats, performance metrics

### Environment Variables
```bash
# Required for production
NEXT_PUBLIC_POSTHOG_KEY=phc_*  # PostHog analytics key

# Development (optional)
# Comment out PostHog key to disable analytics locally
```

## Testing Strategy

### Test Coverage Requirements
- **Components**: All React components have render and interaction tests
- **Game Logic**: Complete test coverage for map generation, game state, and combat
- **Daily Challenge Flow**: State transitions and localStorage interactions
- **Integration**: End-to-end game scenarios

### Running Specific Tests
```bash
# Single test file
npm test components/Tile.test.tsx

# Test pattern matching
npm test -- --testNamePattern="should render tile"

# Coverage report
npm test -- --coverage
```

### TDD Workflow for New Features
1. Write failing test in appropriate `__tests__/` subdirectory
2. Run `npm run test:watch` for immediate feedback
3. Implement minimum code to pass test
4. Refactor while keeping tests green
5. Add edge case tests as needed

## Key Development Guidelines

### Game Logic
- **Pure Functions**: Game state updates should be pure and testable
- **Type Safety**: Use TypeScript interfaces for all game entities
- **Performance**: Consider viewport culling and asset preloading for smooth gameplay

### Component Development
- **Single Responsibility**: Each component handles one concern
- **Testing**: Components should be easily testable in isolation
- **Accessibility**: Include appropriate ARIA labels and keyboard navigation

### Asset Management
- **Optimization**: All game assets are compressed and optimized
- **Preloading**: Critical assets preloaded in layout.tsx
- **Background Loading**: Non-critical assets loaded after initial render

## Domain-Specific Knowledge

### Game Mechanics
- **Viewport System**: Player-centered 4-tile radius visibility
- **Inventory System**: Boolean flags (keys) + counters (consumables)
- **Enemy AI**: Different behaviors per enemy type with pathfinding
- **Environmental Interactions**: Doors, switches, chests, and traps

### Daily Challenge Flow
The main production feature has three states:
1. **FIRST_TIME**: Show intro for new users
2. **DAILY_AVAILABLE**: User can play today's challenge
3. **DAILY_COMPLETED**: User finished today's challenge

### Mobile Support
- **Responsive Scaling**: Game scales as single unit below 650px
- **Touch Controls**: Mobile control buttons for movement and actions
- **UI Adaptation**: HUD panels stack/wrap on smaller screens

## Common Troubleshooting

### PostHog Integration
- Development: Comment out `NEXT_PUBLIC_POSTHOG_KEY` to disable
- Production: Required for user analytics and behavior tracking
- Test environment: Analytics calls are mocked/ignored

### Asset Loading Issues
- Check `public/images/` directory structure
- Verify asset paths in preload links in `layout.tsx`
- Run compression scripts if assets are too large

### Daily Challenge State Issues
```bash
# Clear daily challenge data (localStorage)
# In browser console:
localStorage.removeItem('dailyChallenge')

# Clear current game data
localStorage.removeItem('currentGame')
```