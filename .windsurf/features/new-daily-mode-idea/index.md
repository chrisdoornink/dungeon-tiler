# Feature: Endless Daily Dungeon Mode

**Branch:** new-daily-mode-idea
**Started:** January 29, 2026
**Ticket:** N/A

## Objective
Transform the daily challenge from a single-level dungeon into an endless progression mode where players descend through increasingly difficult floors, testing how far they can get.

## Current State (as of Feb 17, 2026)

### Already Implemented
- [x] Multi-floor game state: `currentFloor`, `maxFloors`, `needsFloorTransition` fields on GameState
- [x] `advanceToNextFloor()` in `lib/map/game-state.ts` — generates next floor preserving hero stats/inventory
- [x] Floor transition handler in `TilemapGrid.tsx` (gated behind `storageSlot === 'daily-new'`)
- [x] Exit door logic refactored in `movePlayer` — multi-tier mode advances floor instead of winning
- [x] `daily-new` storage slot for separate save state
- [x] `app/daily-new/page.tsx` route with `storageSlot="daily-new"`
- [x] Combat variance rebalanced: weighted 25%/50%/25% (was uniform 33/33/33)
- [x] 7 goblin types with unique stats and behaviors
- [x] Weighted enemy spawn system in `lib/enemy_assignment.ts`

### Not Yet Implemented
- [ ] Floor-based difficulty scaling (enemy counts, types, map size)
- [ ] Completion screen showing floor reached
- [ ] Daily stats tracking best floor reached
- [ ] Collectible gems system (stretch goal)

---

## Enemy Difficulty Ratings

All enemy types rated 1–10 on overall difficulty to the player. These ratings inform spawn weighting and floor-based introduction.

### Goblins (spawn weights in `lib/enemy_assignment.ts`)

| Enemy | HP | ATK | Special | Difficulty | Spawn Weight |
|-------|:--:|:---:|---------|:----------:|:------------:|
| **Earth Goblin** | 3 | 1 | None | 2/10 | 20 (~23%) |
| **Fire Goblin** | 4 | 2 | None (carries torch — visible in dark) | 3/10 | 17 (~20%) |
| **Water Goblin** | 5 | 1 | None | 3/10 | 17 (~20%) |
| **Earth Goblin Knives** | 3 | 3 | None | 4/10 | 12 (~14%) |
| **Water Goblin Spear** | 5 | 4 | None | 6/10 | 8 (~9%) |
| **Stone Goblin** | 8 | 5 | Takes exactly 1 melee dmg; instant-killed by rune | 7/10 | 6 (~7%) |
| **Pink Goblin** | 4 | 1 | Ranged attack (1-2 dmg by distance), teleportation ring, maintains 4-5 tile distance, LOS-aware | 8/10 | 5 (~6%) |

### Non-Goblins (separate spawn rules)

| Enemy | HP | ATK | Special | Difficulty |
|-------|:--:|:---:|---------|:----------:|
| **Ghost (Lantern Wisp)** | 2 | 1 | Snuffs hero's torch when adjacent (vision penalty) | 5/10 |
| **Snake** | 2 | 1 | Avoids player 67% of the time; mostly stays coiled; attacks when adjacent | 3/10 |

### Difficulty Rationale
- **Earth Goblin (2):** Weakest in every stat. Filler enemy.
- **Fire Goblin (3):** Balanced baseline. Visible in dark caves (torch) which is a slight advantage for the player.
- **Water Goblin (3):** Tanky but hits like a wet noodle. Takes time to kill but rarely threatens.
- **Earth Goblin Knives (4):** Glass cannon — low HP but 3 ATK hurts. Punishes careless engagement.
- **Ghost (5):** Low stats but torch-snuffing is devastating in caves. Reduces vision, making other enemies harder.
- **Water Goblin Spear (6):** High HP + high ATK. A serious melee threat that takes multiple hits.
- **Stone Goblin (7):** Effectively immune to melee (1 dmg per hit = 8 hits to kill). Requires runes. 5 ATK is lethal. Rune pots spawn to compensate.
- **Pink Goblin (8):** Hardest to deal with. Ranged attack means you take damage without being able to retaliate. Teleports when out of LOS. Best strategy is avoidance.

---

## Difficulty Scaling Strategy (Floors 1–10)

### Design Principles
- Hero health, inventory, and stats carry between floors
- Each floor has its own exit key
- Map size increases slightly per floor
- Enemy composition shifts from easy goblins to harder types + non-goblins
- Floor seed = `dailySeed + floorNumber` for deterministic generation

### Floor Progression

| Floor | Map Size | Enemy Count | Goblin Pool | Non-Goblins | Notes |
|:-----:|:--------:|:-----------:|-------------|-------------|-------|
| 1 | Base | 4–5 | Earth, Fire, Water only | None | Intro floor, learn the controls |
| 2 | Base+1 | 5–6 | Earth, Fire, Water, Earth Knives | None | Knives variant introduced |
| 3 | Base+2 | 5–6 | All easy/medium goblins | 1 snake | First non-goblin |
| 4 | Base+3 | 6 | + Water Spear eligible | 1 ghost | Ghost torch-snuff adds pressure |
| 5 | Base+4 | 6–7 | Full weighted pool | 1 ghost, 1 snake | Midpoint — all types possible |
| 6 | Base+5 | 6–7 | Full weighted pool | 1–2 ghosts | Ghost density increases |
| 7 | Base+6 | 7 | Weights shift harder | 1–2 ghosts, 1 snake | Stone/Pink more likely |
| 8 | Base+7 | 7–8 | Weights shift harder | 2 ghosts, 1 snake | High pressure |
| 9 | Base+8 | 8 | Hard-weighted pool | 2 ghosts, 1–2 snakes | Near-max difficulty |
| 10 | Base+9 | 8–9 | Hard-weighted pool | 2 ghosts, 2 snakes | Final floor — survival test |

### Floor-Based Weight Adjustments
Early floors should restrict or reduce the chance of hard goblins. Proposed approach:
- **Floors 1–2:** Zero weight for Stone Goblin, Pink Goblin, Water Goblin Spear
- **Floors 3–4:** Zero weight for Stone Goblin, Pink Goblin; Water Goblin Spear at half weight
- **Floors 5–6:** Normal weighted pool (current weights)
- **Floors 7–8:** Double the weight of Stone Goblin and Pink Goblin
- **Floors 9–10:** Triple the weight of Stone Goblin and Pink Goblin

---

## Chest & Key System

### Overview
Keys and treasure chests replace the old "find key → open all chests" model. Each chest has a corresponding key somewhere. Keys persist between floors, so a key found on floor 1 can open a chest on floor 3.

### Rules
- **3 chests total**, randomly distributed across **floors 1–4** (not necessarily one per floor)
- **3 keys total**, one per chest, also randomly placed across floors 1–4
- Keys and chests are placed independently — a key doesn't have to be on the same floor as its chest
- The generation must guarantee that the total keys across floors 1–4 equals the total chests across floors 1–4
- Player **cannot go backwards**, so all keys must be reachable before or on the floor of the last chest
- Keys persist in inventory between floors; exit key does **not** persist (resets each floor)

### Chest Contents (one of each)
1. **Sword** — +2 melee damage bonus
2. **Shield** — reduces incoming damage
3. **Snake Medallion** — portal placement ability (currently story-mode only, now available in daily)

### Placement Algorithm
During daily-new map generation for floors 1–4:
1. Use floor seed to deterministically decide how many chests/keys go on each floor
2. Distribute 3 chests and 3 keys across floors 1–4 (e.g., floor 1 gets 1 chest + 0 keys, floor 2 gets 0 chests + 2 keys, etc.)
3. Constraint: cumulative keys placed ≥ cumulative chests placed at each floor (so player always has enough keys)
4. Place chests and keys on walkable floor tiles away from player spawn

### Implementation
- [ ] Add `keyCount` to GameState (number of chest keys held, separate from exit key)
- [ ] Modify chest interaction: consume 1 key to open, grant item
- [ ] Floor generation: place chests/keys per the allocation for that floor
- [ ] Ensure key/chest allocation is deterministic from daily seed
- [ ] Snake medallion chest integration (portal ability in daily mode)

---

## Collectible Gems System (Future Enhancement)
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
- [x] Combat variance rebalanced
- [x] Exit door transitions to next floor instead of ending game (multi-tier mode)
- [x] Weighted enemy spawn system
- [ ] Floor-based difficulty scaling (enemy pool restrictions + weight shifts per floor)
- [ ] Floors increase in size by 1 tile per level
- [ ] Chest & key system: 3 chests (sword, shield, snake medallion) across floors 1–4
- [ ] Keys persist between floors; exit key resets per floor
- [ ] Game tracks deepest floor reached
- [ ] Completion screen shows floor reached (and eventually gems)
- [ ] Daily stats updated to track best floor reached

## Implementation Notes

### Key Files
- `lib/enemies/registry.ts` — Enemy configs, stats, behaviors
- `lib/enemy_assignment.ts` — Weighted spawn logic (needs floor-based overrides)
- `lib/map/game-state.ts` — `advanceToNextFloor()`, `movePlayer()` exit logic, `GameState` type
- `lib/current_game_storage.ts` — `daily-new` storage slot
- `components/TilemapGrid.tsx` — Floor transition effect
- `components/GameView.tsx` — Multi-tier initialization
- `app/daily-new/page.tsx` — New daily mode route

### Architecture Decisions
- Keep daily seed-based generation, parameterized by floor: `seed = dailySeed + floorNumber`
- `currentFloor` and `maxFloors` stored in GameState
- On exit door: set `needsFloorTransition = true` → TilemapGrid effect calls `advanceToNextFloor()`
- Hero health/inventory/stats persist between floors
- Exit key, enemies, map data reset per floor
- Game ends on death (not on reaching final exit)

## Questions/Blockers
- Should hero health carry between floors or reset?
  - **Decision:** Carry over (makes it harder, more strategic)
- Should items persist between floors?
  - **Decision:** Yes, keep all items
- How to handle exit key on each floor?
  - Each floor generates its own exit key placement
- Map generation: use same daily seed + floor offset?
  - **Decision:** `dailySeed + floorNumber` for deterministic but varied floors

## Resources
- Enemy registry: `lib/enemies/registry.ts`
- Enemy assignment: `lib/enemy_assignment.ts`
- Combat system: `lib/enemy.ts`
- Game state / floor logic: `lib/map/game-state.ts`
- Daily flow: `lib/daily_challenge_flow.ts`
