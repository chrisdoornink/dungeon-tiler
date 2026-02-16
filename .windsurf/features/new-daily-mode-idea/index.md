# Feature: Endless Daily Dungeon Mode

**Branch:** new-daily-mode-idea
**Started:** January 29, 2026
**Ticket:** N/A

## Objective
Transform the daily challenge from a single-level dungeon into an endless progression mode where players descend through increasingly difficult floors, testing how far they can get.

## Current State
- Daily mode currently has one level with exit door
- When player opens exit (with exit key), `gameState.win = true` is set
- Game completes and shows `DailyCompleted` screen
- Player can only play once per day
- Combat: Goblin has 5 HP, 1 attack; Hero baseline similar but feels too balanced (50/50 fight)

## Proposed Changes

### 1. Combat Balance Adjustment
**Problem:** Hero vs single goblin (no items) is too even - should favor hero more

**Goal:** Hero should have ~80% win rate against a single goblin without items
- Adjust so hero can reliably beat 1 goblin
- 2 goblins without health replenishment should be too much
- Need to tweak damage ratios (hero damage given vs damage taken)

**Current Stats:**
- Goblin: 5 HP, 1 attack (base)
- Hero: Similar baseline
- Both have damage variance: -1/0/+1 spread

**Action Items:**
- [ ] Test current hero vs goblin win rate
- [ ] Adjust goblin HP or hero attack to achieve 80% hero win rate
- [ ] Consider: reduce goblin HP to 4, or increase hero base attack slightly
- [ ] Verify 2 goblins is appropriately challenging without healing

### 2. Multi-Level Progression System
**Current:** Exit door → win condition → game over
**New:** Exit door → descend to next level → continue playing

**Mechanics:**
- Start with 10 levels (can adjust based on difficulty testing)
- Each level gets progressively harder
- Dungeon size increases: +1 tile width/height per level (e.g., 10x10 → 11x11 → 12x12)
- New enemy types introduced as levels progress
- Track "deepest floor reached" as the primary metric

**Level Progression:**
- Floor 1: Current difficulty (adjusted goblins)
- Floor 2+: Gradually introduce ghosts, snakes, stone-exciters
- Each floor: slightly more enemies or tougher compositions
- Size scaling: `baseSize + floorNumber` for width/height

### 3. Collectible Gems System (Future Enhancement)
**Goal:** Add optional collectibles for completionists and sharing

**Mechanics:**
- Each floor has 1 gem hidden somewhere
- Not required to find to progress to next level
- Tracked separately: "gems collected" stat
- Adds replayability and comparison metric when sharing results
- Could be used for bragging rights or future unlocks

**Implementation:**
- [ ] Add gem tile subtype
- [ ] Place 1 gem per floor during generation
- [ ] Track gems collected in game state
- [ ] Display gem count in completion screen
- [ ] Include in daily stats/sharing

## Acceptance Criteria
- [ ] Hero has ~80% win rate vs single goblin (no items)
- [ ] Exit door transitions to next floor instead of ending game
- [ ] Floors increase in size by 1 tile per level
- [ ] Difficulty scales appropriately across 10 floors
- [ ] Game tracks deepest floor reached
- [ ] Completion screen shows floor reached (and eventually gems)
- [ ] Daily stats updated to track best floor reached

## Implementation Notes

### Key Files to Modify
- `@/Users/chrisdoornink/Documents/GitHub/dungeon-tiler/lib/enemy.ts:25-26` - Goblin base stats
- `@/Users/chrisdoornink/Documents/GitHub/dungeon-tiler/lib/map/game-state.ts:1374` - Win condition on exit
- `@/Users/chrisdoornink/Documents/GitHub/dungeon-tiler/lib/daily_challenge_storage.ts` - Add floor tracking
- Daily map generation - Add floor parameter for size scaling
- Enemy assignment - Scale counts/types by floor number

### Architecture Decisions
- Keep daily seed-based generation but parameterize by floor number
- Store current floor in game state
- On exit door: increment floor, regenerate map, keep hero stats/inventory
- Reset enemy positions but maintain hero health/items between floors
- Game ends on death (not on exit anymore)

### Difficulty Scaling Strategy
1. **Floors 1-3:** Goblins only, count increases
2. **Floors 4-6:** Introduce ghosts (1-2), keep goblins
3. **Floors 7-9:** Add snakes, increase enemy density
4. **Floor 10+:** Stone-exciters possible, max difficulty

## Questions/Blockers
- Should hero health carry between floors or reset?
  - Leaning toward: carry over (makes it harder, more strategic)
- Should items persist between floors?
  - Leaning toward: yes, keep all items/keys
- How to handle exit key on each floor?
  - Need to ensure each floor has exit key available
- Map generation: use same daily seed + floor offset?
  - Could use `dailySeed + floorNumber` for deterministic but varied floors

## Resources
- Enemy registry: `@/Users/chrisdoornink/Documents/GitHub/dungeon-tiler/lib/enemies/registry.ts`
- Combat system: `@/Users/chrisdoornink/Documents/GitHub/dungeon-tiler/lib/enemy.ts`
- Win condition: `@/Users/chrisdoornink/Documents/GitHub/dungeon-tiler/lib/map/game-state.ts:1360-1379`
- Daily flow: `@/Users/chrisdoornink/Documents/GitHub/dungeon-tiler/lib/daily_challenge_flow.ts`
