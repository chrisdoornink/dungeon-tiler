## 2025-08-10

### Behavioral
- Added failing test in `__tests__/components/TilemapGrid.test.tsx` to verify lightswitch auto-disables full map visibility after 3 seconds using Jest fake timers.
- Implemented minimal behavior in `components/TilemapGrid.tsx`: a `useEffect` that, when `showFullMap` is true, sets a `setTimeout` to flip `showFullMap` to false after 3000ms. Cleans up timer on unmount/changes.

- Added TDD test in `__tests__/lib/map.test.ts`: generation should only place `SWORD` inside a `CHEST`.
- Generation already satisfied constraint via `addChestsToMap`; tests now cover it.

### Structural
- Test cleanups: typed `initialGameState` as `GameState`, imported `TileSubtype` to place a `PLAYER` at center for visibility calculations.

- Replaced CommonJS `require` with ES import for `generateCompleteMap` in `__tests__/lib/map.test.ts`.

All tests passing (27/27).

## 2025-08-11

### Behavioral
- Added failing test then verified passing: `lib: attempting to move into exit without exit key does NOT set gameState.win` in `__tests__/lib/player.test.ts`. Existing logic in `movePlayer()` already satisfied this; test confirms behavior.

### Structural
- No structural changes.

All tests passing (44/44) at 2025-08-11T14:37:36-07:00.
