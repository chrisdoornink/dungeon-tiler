## Dungeon Tiler Plan File

Refer to the coding methodology in `__plans__/coding_methodology.md` before taking any action in here. Then start the next unfinished task in the Task List below.

## Notes

- User requested to refactor the codebase so that each component is in its own file before further iteration.
- Identified components: Home (main page), Tile (tile cell in grid), Legend (legend display)
- Created components directory and separated Tile, Legend, and TilemapGrid into their own files
- Transitioning to TDD: Will set up a test framework and write tests for components
- Jest and React Testing Library configured for testing React components
- TDD cycle complete for Tile; now targeting Legend component (tests written and run)
- TDD cycle complete for Legend; now targeting TilemapGrid (failing tests written, partial implementation in progress)
- TDD cycle complete for TilemapGrid (all tests passing, ready for next phase)
- DT-2 requirements for random grid generation are now active; next step is to follow the TDD cycle for these rules
- Failing tests for DT-2 (random grid generation) have been written; now implementing the generation logic to pass these tests
- DT-2 generation logic implemented; next step is to refactor if needed after tests pass
- All DT-2 tests are now passing; refactor step complete, ready for next phase
- DT-3 and DT-4 requirements for floor connectivity and room count are now active; next step is to follow the TDD cycle for these rules
- The current dungeon generation algorithm is modular and can be replaced with another. Future tickets can direct or swap out the algorithm without breaking the rest of the app.

## Task List

- [x] Identify all components in the current codebase
- [x] Create a separate file for each component
- [x] Move each component's code to its respective file
- [x] Update imports/exports as needed to reflect new file structure
- [x] Set up testing framework (e.g. Jest, React Testing Library)
- [x] Write first failing test for a component (e.g. Tile renders tileId)
- [x] Implement minimum code to pass the test
- [x] Refactor if needed after test passes
- [x] Test to ensure everything works after refactor
- [x] Write failing tests for Legend component
- [x] Implement minimum code to pass Legend tests
- [x] Refactor if needed after Legend tests pass
- [x] Repeat TDD cycle for next component (e.g. TilemapGrid)
- [x] Write failing tests for TilemapGrid (DT-1 requirements)
- [x] Implement minimum code to pass all TilemapGrid tests
- [x] Refactor if needed after TilemapGrid tests pass
- [x] Follow TDD cycle for DT-1 below
- [x] Follow TDD cycle for DT-2 below
  - [x] Write failing tests for DT-2 requirements
  - [x] Implement minimum code to pass DT-2 tests
  - [x] Refactor if needed after DT-2 tests pass
- [x] Follow TDD cycle for DT-3 below
- [x] Follow TDD cycle for DT-4 below
- [x] Follow TDD cycle for DT-3 (floor connectivity)
  - [x] Write failing tests for DT-3 requirements
  - [x] Implement minimum code to pass DT-3 tests
  - [x] Refactor if needed after DT-3 tests pass
- [x] Follow TDD cycle for DT-4 (room count)
  - [x] Write failing tests for DT-4 requirements
  - [x] Implement minimum code to pass DT-4 tests
  - [x] Refactor if needed after DT-4 tests pass
- [x] Follow TDD cycle for DT-5 (new algorithm)
  - [x] Write failing tests for DT-5 requirements
  - [x] Implement minimum code to pass DT-5 tests
  - [x] Refactor if needed after DT-5 tests pass
- [x] start using the new algorithm in the TilemapGrid component once it is ready
- [x] Refactor the center-out algorithm to generate a single room in the center of the grid between 9 and 100 tiles in size. The rest should be walls.
- [x] Refactor the center-out algorithm to generate a random number of rooms between 1 and 4 in the center of the grid between 9 and 100 tiles in size. The rest should be walls.
- [x] Refactor the center-out algorithm to generate a random number of rooms between 3 and 6 in the center of the grid between 9 and 100 tiles in size. The rest should be walls.
- [x] The Grid should at least 50% floor tiles and at most 75% floor tiles
- [x] Walls and floors can have subtypes, stored as enum values in an array of numbers.
- [x] Subtypes are displayed next to the tile number in each grid cell.
- [x] Make the wall tile text visible, light text over the dark tile please
- [x] There should always be a single wall tile in the grid with the type 2 which will be "door" AND the type 1 which will be "exit". The exit tile should be placed next to a floor tile.
- [x] There may be a wall or tile with the type 3 which will be 'key'. A key will correspond to a lock which will be type 4. Type 3 and 4 always need to be used together and need to reference each other so that the key can unlock the lock.
- [x] A User is represented by a tile with the type 5 which will be "player". The player tile should be placed on a floor tile.
- [x] When the user clicks the right arrow key the player should move one tile to the right if the tile is a floor tile.
- [x] When the user clicks the left arrow key the player should move one tile to the left if the tile is a floor tile.
- [x] When the user clicks the up arrow key the player should move one tile up if the tile is a floor tile.
- [x] When the user clicks the down arrow key the player should move one tile down if the tile is a floor tile.
- [x] When the player moves to a tile with a subtype the subtype should be removed from the tile.
- [x] When the player moves to a tile with a subtype the subtype should be added to an inventory array.
- [x] Only part of the map is visible at any given time. The player should be able to move the visible area of the map around the player. A player can see 4 tiles in all directions. The tiles that are invisible are displayed as black, the unexplored but remembered wall tiles are displayed as dark gray, the floor tiles as lighter gray, and the player tile is displayed in blue.
- [x] Add subtype 6 for lightswitch - it toggles off the visibility of the map so they can see the whole map.
- [x] Stepping on a switch should not pick remove it from the tile.
- [x] The lightswitch should only work for 3 seconds and then flicker back off.
- [x] Add subtype 7 for exitKey - it must be used to open the exit door
- [x] A sword is only found inside a chest, so in the generation, a sword will need a chest in the same tile.
- [x] Stepping onto a chest item should add the item in the chest to the inventory and remove the chest from the tile, adding an OPEN_CHEST subtype on that tile.
- [x] Building off the visual design implemented currently, try to give some forced perspective to the walls by making the bottom border if the wall tile has a floor tile below it taller than the other borders.
- [x] Implement this // TODO - if bottom neighbor is false then its a wall and we shoudl rend er the top of the wall in the bottom off this tile - need the asset first
- [x] Throwing a rock should count as a movement by the player, so the enemies should get a movement turn when the rock is thrown. This movement should occur before the rock leaves its starting point and reaches its destination, so if an enemy is no longer in the path of the throw, then it should not hit them.
- [x] Make it 'daylight' mode by default.
- [x] Make the ghost still affect the mode when it snuffs tehe users torch
- [x] Expand the snuffed visibility range 1 tile in all directions. Subtly affect the visibility of the map.
- [x] The dungeon exit key must be at least 14 tiles away from the exit door.
- [x] ghosts should be able to travel on faulty floor tiles, other future enemies may be able to as well
- [x] ghosts should be able to travel on walls
- [x] I just bought the domain torchboy.com that this will live on, by defualt, the daily page should be what is displayed when a user hits the site on that domain, what are our options for enforcing this? Can it be domain level magic that uses /daily as the index? or do we need more levers to pull based on environment?
- [x] Mobile support needs some updates: - [x] Health and inventory shoudl be visible at all times - [x] The entire screen should scale down as a single unit using media queries starting at 650px. All elements should scale down as a single unit. the only exception is the controls at the bottom of the screen.
- [x] I want the daily challenge to be the same for everyone who plays it, so we need to create a random seed for the daily challenge and store it in localStorage, if its that simple, but dpeending on how the levels are generated, we may need to make a script that generates levels and stores them per day, and we can test them out before we deploy them.
      NOTE\*\* - ended up implenenting a daily challenge seed rather than storing
      a finite set of levels so it will work indefinitely.
- [ ] Daily reset time → Make it consistent at midnight local time instead of offset/confusing reset. First investigate and report to me how it currently wroks. I have my suspicions and I want to make sure we are not going to break it. I dont necessarily want to tackle this issue now depending on how we want to handle it.
- [ ] Health display → Replace “Status: 5” with 5 heart icons (filled/unfilled). Enemies should also use hearts instead of numbers.
- [ ] Potion healing → Using from inventory should heal 2 (not 1) to match pickup behavior.
- [ ] End game screen emojis → Replace emojis (victory/defeat, etc.) with proper assets.
- [ ] Layout and Box Adjustments
      • Game Statistics Box
      • Move it to the center and make it the main, larger box.
      • Move the Share Results button inside this box (likely below the listed statistics).
      • Updated Stats Section
      • Remove the title “Updated Stats” entirely.
      • The individual items (e.g. current streak, total games, etc.) should be displayed as a simple list immediately below the Game Statistics box, not inside any box.
- [ ]

Future Tickets

- [ ] Here’s a consolidated and detailed list of all the items that I'm considering but having solidly planned yet. Do not start these without approval.

Dungeon Game To-Do List

- [ ] Repurpose Switch Functionality
      • Switches no longer control dungeon visibility.
      • Each switch affects something within an 8-tile radius to ensure clarity for the player.
      • Possible effects:
      • Release caged item: Unlock a cage containing a special item (to be defined; may be designed to counter specific enemies).
      • Trigger enemy defeat: Release or activate something that can kill a specific enemy type.
      • Open trapdoors: Cause enemies (or the player) on those tiles to fall through.

- [x] Shield Mechanics
      • Adjust shield so it’s not full invulnerability.
      • Allow player to tank 2–3 enemies more easily but still take damage if overwhelmed.

- [x] Combat Refactor
      • Build stable, predictable combat system with clearer structure.
      • Needed for future enemies (e.g., sword-wielders).

- [x] Stone Exciter Counter Item
      • Single-use item that instantly destroys a Stone Exciter.
      • Found rarely (e.g., once per map) inside a clay pot.
      • Acts like a normal thrown rock against other enemies.
      • Final design: ancient rune with green glow matching Stone Exciter’s glow.

- [ ] Environmental Debris Items
      • Add small throwables/collectibles: bones, broken pottery, rusty tools, scraps of rope/cloth.
      • Expand dungeon flavor and player resource variety.

- [x] Exit Portal Redesign
      • Replace directional door with a glowing ground portal.
      • Always visible and recognizable from any approach angle.

- [ ] Trapdoors
      • Hazard tiles visible on the map.
      • Both player and enemies fall through if stepped on.
      • Most enemies avoid them, except:
      • Ghost-type enemies (immune).
      • Stone Exciter in hunt mode (glowing) will not avoid trapdoors and can fall through.

- [ ] Multi-Tile Boss Enemy
      • Occupies multiple tiles in larger rooms.
      • Performs area attacks (e.g., rotating strikes, shockwaves, or projectiles).
      • Adds strategic layer to navigation and positioning.

- [ ] Additional Enemy Concepts (future tickets)
      • Mimic enemy: disguises as item or debris until approached.
      • Beam-attack enemy: charges then fires directional energy wave/shockwave, forcing timing-based dodges. - a snake that lives in a pot and attacks the player when they step on it, poison is applied to the player and they need another item to counteract it. -

## Daily Challenge System (DT-DAILY)

### Overview

A daily challenge system that serves as the main entry point to the game, providing a single dungeon run per day with persistent tracking and progression.

### Requirements

#### Route Structure

- **Route**: `/daily` (development and production)
- **Folder Structure**: `app/daily/` with dedicated pages
- **Main Entry Point**: This becomes the primary way users access the game

#### Local Storage Tracking

The system tracks the following data in localStorage under key `dailyChallenge`:

```typescript
interface DailyChallengeData {
  // User progression
  hasSeenIntro: boolean;
  currentStreak: number;
  totalGamesPlayed: number;
  totalGamesWon: number;

  // Daily tracking
  lastPlayedDate: string; // ISO date string (YYYY-MM-DD)
  todayCompleted: boolean;
  todayResult: "won" | "lost" | null;

  // Historical data
  streakHistory: Array<{
    date: string;
    result: "won" | "lost";
    streak: number;
  }>;
}
```

#### Flow States

1. **First Time User**: Shows intro screen, sets `hasSeenIntro: true`
2. **Daily Available**: User can play today's challenge
3. **Daily Completed**: Shows results, no replay until next day
4. **Daily Cooldown**: User must wait until next day

#### Game Integration

- Game over screen removes replay functionality
- Navigation prevents going back to game after completion
- Completion triggers daily challenge data update
- Streak calculation based on consecutive days played

#### TDD Implementation Plan

1. **Storage Service Tests**: Test localStorage operations
2. **Date Utility Tests**: Test day comparison logic
3. **Flow State Tests**: Test state determination logic
4. **Component Tests**: Test UI components for each state
5. **Integration Tests**: Test complete user flows

### Task Breakdown

- [ ] Create daily challenge storage service with TDD
- [ ] Create date utility functions with TDD
- [ ] Create flow state management with TDD
- [ ] Create `/daily` route structure
- [ ] Create intro flow component
- [ ] Create daily available component
- [ ] Create daily completed component
- [ ] Create daily cooldown component
- [ ] Integrate with existing game completion flow
- [ ] Remove replay functionality from game over
- [ ] Add navigation guards to prevent replay
