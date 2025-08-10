## 2025-08-10

### Behavioral
- Added failing test in `__tests__/components/TilemapGrid.test.tsx` to verify lightswitch auto-disables full map visibility after 3 seconds using Jest fake timers.
- Implemented minimal behavior in `components/TilemapGrid.tsx`: a `useEffect` that, when `showFullMap` is true, sets a `setTimeout` to flip `showFullMap` to false after 3000ms. Cleans up timer on unmount/changes.

### Structural
- Test cleanups: typed `initialGameState` as `GameState`, imported `TileSubtype` to place a `PLAYER` at center for visibility calculations.

All tests passing (27/27).
