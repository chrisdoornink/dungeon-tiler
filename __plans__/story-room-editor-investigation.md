# Story room editing + data structure investigation

## Current story room architecture
- `lib/story/story_mode.ts` currently builds every story room programmatically. Each helper like `buildBluffPassageway` or `buildOutdoorWorld` allocates raw `tiles` and `subtypes` matrices, mutates them with loops, and instantiates enemies/NPCs inline.【F:lib/story/story_mode.ts†L24-L139】【F:lib/story/story_mode.ts†L741-L829】
- Room transitions and snapshots are also assembled inside `buildStoryModeState`, which clones each `StoryRoom` result into the `rooms` dictionary that the runtime uses to respawn/reset.【F:lib/story/story_mode.ts†L1581-L1651】
- Because each room is generated through imperative code, tweaking a single tile requires understanding bespoke carving logic, with no shared abstraction for tile grids, transitions, or placed objects.

## Existing rendering/editor surfaces
- The main playable grid is rendered through `components/TilemapGrid`, which already knows how to display arbitrary `mapData` plus enemies/NPCs from an initial `GameState`. It can also run in a mode where a raw `tilemap` is provided and it will fabricate a temporary `GameState` on the fly, as demonstrated by the prototype pages in `app/test-room`.*【F:components/TilemapGrid.tsx†L99-L161】【F:app/test-room/page.tsx†L1-L123】
- The "test room" pages show that we can mount custom rooms in isolation today, but the data is still produced as imperative scripts.

## Pain points for manual editing
1. **Readability** – There is no human-readable snapshot of a room layout. Floors vs walls, transitions, and decorations all require following loops/algorithms.
2. **Reusability** – Patterns such as carving corridors or placing torches are repeated per room, leading to boilerplate and subtle inconsistencies.
3. **Serialization gap** – Story reset/save relies on cloning the generated rooms, so any editor would have to either re-run generator functions or duplicate logic to emit compatible `StoryRoom` objects.

## Proposed direction: declarative room blueprints
1. **Introduce a `RoomBlueprint` schema** that captures:
   - `id`, `environment`, `width/height`
   - a tile grid stored as a string matrix (e.g. `"F"` for floor, `"W"` for wall, `"T"` for transition) or numeric tuples matching `TileSubtype`
   - arrays for `transitions`, `items`, `npcs`, `enemies`, etc. with explicit coordinates and metadata
   - optional helper sections (`autofillWalls`, `spawnRules`) for procedural touches that should stay dynamic.
2. **Create per-room definition files** in something like `lib/story/rooms/<room-id>.ts` (or JSON if we want to author with non-TypeScript tools). Each file exports a blueprint object.
3. **Build a loader** that converts a blueprint into runtime `StoryRoom` data, handling translation of characters → `TileSubtype`, instantiating `Enemy`/`NPC` classes, and wiring `RoomTransition`s. This loader can also be reused by future editors to serialize back to blueprint form.
4. **Refactor `buildStoryModeState`** to import the blueprint list, transform them via the loader, and compose transitions/checkpoints. This reduces the monolithic file to orchestration logic and keeps layout data isolated.

## Editor implications
- With declarative blueprints, an editor can operate on the serialized structure: toggling a tile only mutates a string in the blueprint, and adding content pushes to an array.
- We can implement a lightweight "edit mode" page that:
  - loads a blueprint via dynamic import
  - displays it using `TilemapGrid` (possibly in a visualization-only mode)
  - captures click/drag events to toggle tile type or cycle through subtypes
  - persists edits by writing back to the blueprint file (during development) or exporting JSON to paste into source.
- For object placement (NPCs, enemies, props), a sidebar could expose the arrays from the blueprint schema. Clicking a tile could open a form for selecting an entity kind, mirroring how `TilemapGrid` already expects enemy/NPC metadata in the `GameState`.

## Suggested next steps
1. Define the `RoomBlueprint` TypeScript types and a `blueprintToStoryRoom` helper, covered by unit tests to ensure parity with existing generator output.
2. Migrate one simple room (e.g. `story-hall-entrance`) into the declarative format to validate the workflow and adjust the schema.
3. Add utilities for loading/saving blueprint JSON to support a future browser-based editor view.
4. Once comfortable with the schema, proceed to implement the interactive editor page that edits blueprint objects instead of imperative code.

*The existing test-room page could be repurposed as an early experiment for the editor UI once declarative data is available.
