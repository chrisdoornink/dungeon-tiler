# Refactor Components into Separate Files

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
- [ ] Refactor the center-out algorithm to generate a single room in the center of the grid between 9 and 100 tiles in size. The rest should be walls.

## Current Goal

Determine next feature or audit (DT-7)

## DT-1: TilemapGrid Initial Implementation

The following rules should be applied and tested:

- The Grid bounds are 25 x 25
- The grid should be centered on the page
- The grid should be responsive
- The entire grid should be visible

## DT-2: TilemapGrid Generation Rules

THe TilemapGrid currently generates a 25x25 grid of tiles but they do not have any types assigned to them. Other than the top left 20 tiles, they are all 0 (floor).

We want a generation process that creates a random tilemap of the specified size (25x25) with a mix of tile types (floor and wall).

The generation process should be as follows:

- The grid should be generated randomly
- The grid should be generated with a mix of tile types (floor and wall)
- The walls should be connected to each other and form a continuous path
- There can be rooms of floor tiles surrounded by walls
- There should be no more than 4 rooms in a grid
- THe majority of the perimeter should be walls
- any dead space between the 4 rooms and the perimeter should be filled with walls
- there should be at least half floor tiles and up to 75% floor tiles

It should regenerate on a page refresh

## DT-3: TilemapGrid Generation Rules Follow-up

I missed some details in DT-2 that we'll need to address:

- The floors should be connected to each other and form a continuous path. THe connection points are theh tiles directly above, below, left, and right of each other.
- Diagonal connections are not allowed.
- Ensure the rules in DT-2 are still followed.

## DT-4: TilemapGrid Generation Rules Follow-up 2

Make a test to ensure the number of rooms is between 1 and 4.

## DT-5: TilemapGrid Generation Rules Follow-up 3

I want to try a different algorithm for generating the tilemap.

- Keep the existing map.ts algorithm
- Create a new algorithm in a new file called lib/map-center-out-algorithm.ts
- start using the new algorithm in the TilemapGrid component once it is ready
- The new algorithm should generate a tilemap with the same rules as the existing algorithm but with a different approach

The algorythm should start in the center of the grid (12,12) and work its way outwards, carving rooms and corridors as it goes. Follow these details as closely as you can:

Algorithm 1. Init

    •	Fill grid with 0 (Wall).
    •	Reserve perimeter as 0 (Wall) and never carve beyond margin.

    2.	Seed central room

    •	Center = (10,10).
    •	Pick w,h in [4..8], clamp to box within margins.
    •	Carve rectangle to 1 (Floor).

    3.	Place more rooms

    •	Maintain rooms[] (rects) and frontier[] (edges of carved rooms).
    •	While floor_count < target_floor and rooms.length < room_count:
    •	Pick a random existing room and a random side (N/E/S/W).
    •	Sample new room size (w,h in [4..8]).
    •	Compute a candidate rectangle offset from that side with buffer tiles of Wall between rooms.
    •	Validate:
    •	Inside bounds (respect margin).
    •	Does not overlap any existing Floor.
    •	Leaves at least buffer tiles of Wall around it.
    •	If valid:
    •	Carve rectangle to 1 (Floor).
    •	Carve exactly one doorway (D) in the shared wall between the two rooms (choose a cell centrally along the shared side). This prevents meandering hallways.
    •	Push new room to rooms[].

    4.	Grow area without hallways (if under target and room cap reached)

    •	While floor_count < target_floor:
    •	Pick a random room.
    •	Attempt a bulge: carve a small 2–3 tile wide rectangular annex attached to one side with a single doorway cell; still enforce buffer.
    •	If no valid annex after N tries, break.

    5.	Connectivity guard

    •	Flood-fill from the center. If some Floor is unreachable:
    •	Connect via straight L-path: carve a shortest rectilinear path (first horizontal then vertical or vice versa), but replace exactly one tile along the shared wall with D (door) and keep the path width = 1. This adds connectors only when necessary and avoids snaky corridors.

    6.	Room count validation

    •	Count rooms by connected-component labeling of rectangular floor masses split by doors. If > 4, randomly pick surplus rooms and fill them back to 0 (Wall) (or skip adding them earlier). Prefer prevention over pruning by enforcing the rooms.length < room_count check.

    7.	Wall continuity

    •	Ensure a continuous perimeter (already true).
    •	Because each room keeps a buffer of 1 Wall, outer walls naturally remain continuous and “dead space” stays Wall.

    8.	Final checks

    •	Perimeter mostly Wall (true by design).
    •	Floors connected (by flood-fill check).
    •	Floor ratio between 50% and 75%. If too low, repeat step 4 bulges. If too high, shrink a random room edge by 1 tile strip.
