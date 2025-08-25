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

- [ ] Make it 'daylight' mode by default.
- [ ] Make the ghost still affect the mode when it snuffs tehe users torch
- [ ] Expand the snuffed visibility range to 1 tile in all directions.
- [ ]
