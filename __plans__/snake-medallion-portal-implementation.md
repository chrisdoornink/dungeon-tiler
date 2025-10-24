# Snake Medallion Portal System - Implementation Summary

## Overview
Implemented a complete portal travel system using the snake medallion item. The medallion allows players to place a portal and teleport to it from anywhere in the game world.

## Features Implemented

### 1. **Game State & Constants**
- Added `TileSubtype.SNAKE_MEDALLION` (39) and `TileSubtype.PORTAL` (40) to `/lib/map/constants.ts`
- Added `hasSnakeMedallion?: boolean` to GameState interface
- Added `portalLocation?: { roomId: RoomId; position: [number, number] }` to track portal placement

### 2. **Item Acquisition via Exchange System**
- Snake medallion is given through the exchange system, not as a world pickup
- Exchange ID: `"snake-riddle-reward"`
- Triggered in dialogue: `"snake-riddle-5-correct"` (when player solves final riddle)
- Given by NPC: `"npc-bluff-coiled-snake"` (Ancient Serpent)
- Sets completion flag: `"received-snake-medallion"`
- Player must click "Accept the Snake Medallion" option to receive it
- Dialogue includes instructions on how to use the medallion

### 3. **Inventory UI**
- Added clickable snake medallion button to inventory in `TilemapGrid.tsx`
- Shows snake medallion icon (`/images/items/snake-medalion.png`)
- Included in inventory count calculation
- Title: "Snake Medallion — Place or travel to portal"

### 4. **Portal Placement**
- **First Click (No Portal)**: Places portal at player's current location
  - Adds `TileSubtype.PORTAL` to current tile
  - Stores portal location in `gameState.portalLocation`
  - Portal appears small (50% scale) when player is standing on it
  - Portal becomes full size when player moves away

### 5. **Portal Travel Dialogue**
- **Subsequent Clicks (Portal Exists)**: Opens dialogue menu with 3 options:
  - **Travel to the portal**: Initiates teleportation with animation
  - **Replace portal location**: Moves portal to current position
  - **Cancel**: Closes dialogue

### 6. **Teleportation System**
- Handles same-room teleportation (moves player to portal location)
- Framework for cross-room travel (integrates with existing room transition system)
- Updates player position in map data
- Saves game state after teleportation

### 7. **Travel Animation**
- **Phase 1 - Sparkle Out** (600ms): Shows sparkle effects at departure
- **Phase 2 - Transition**: Performs actual teleportation
- **Phase 3 - Sparkle In** (600ms): Shows sparkle effects at arrival
- Uses two sparkle assets:
  - `/images/items/travel-sparkle-large.png` (pulse animation)
  - `/images/items/travel-sparkle-small.png` (ping animation)
- Full-screen overlay with z-index 9999
- Non-blocking (pointer-events: none)

### 8. **Visual Rendering**
- Portal renders using `/images/items/portal-static.png`
- Snake medallion renders using `/images/items/snake-medalion.png`
- Portal scales down to 50% when player is on the same tile
- Portal has higher z-index (10) when player is not on it, lower (1) when player is on it

### 9. **Asset Preloading**
- Added all portal-related assets to `/lib/assets_manifest.ts`:
  - `snake-medalion.png`
  - `portal-static.png`
  - `travel-sparkle-large.png`
  - `travel-sparkle-small.png`

## Files Modified

### Core Logic
- `/lib/map/constants.ts` - Added TileSubtype enums
- `/lib/map/game-state.ts` - Added state properties
- `/lib/story/exchange_registry.ts` - Added snake-riddle-reward exchange
- `/lib/story/dialogue_registry.ts` - Added snake-riddle-reward-complete dialogue
- `/lib/assets_manifest.ts` - Added asset URLs

### UI Components
- `/components/TilemapGrid.tsx` - Added medallion handler, dialogue, animation, and inventory UI
- `/components/Tile.tsx` - Added portal and medallion rendering

## How It Works

### Medallion Acquisition Flow
1. Player solves all 5 snake riddles
2. On final riddle (riddle 5), dialogue `"snake-riddle-5-correct"` triggers
3. Sets `snake-riddles-completed` flag
4. Ancient Serpent offers the Snake Medallion
5. Player clicks "Accept the Snake Medallion" option
6. Exchange `"snake-riddle-reward"` executes, giving the medallion
7. Ancient Serpent explains how to use it
8. Medallion appears in inventory

### Portal Placement Flow
1. Player clicks medallion in inventory → portal placed at current location
2. Portal appears on the tile (small if player is on it, full size otherwise)

### Portal Travel Flow
1. Player clicks medallion (with portal already placed)
2. Dialogue menu appears with options
3. Player selects "Travel to the portal"
4. Sparkle-out animation plays (600ms)
5. Player teleports to portal location
6. Sparkle-in animation plays (600ms)
7. Animation completes

### Portal Replacement Flow
1. Player clicks medallion (with portal already placed)
2. Dialogue menu appears
3. Player selects "Replace portal location"
4. Old portal removed from previous location (if same room)
5. New portal placed at current location
6. Portal location updated in game state

## Technical Details

### State Management
- Portal location persists in `gameState.portalLocation`
- Includes both `roomId` and `position` for cross-room support
- Saved to localStorage via `CurrentGameStorage`

### Animation System
- Uses React state `travelAnimation` with phases
- `useEffect` hook manages phase transitions
- Timing: 600ms per sparkle phase, instant transition

### Cross-Room Support
- Portal location stores `roomId` for future cross-room travel
- Framework in place for room transition integration
- Currently handles same-room travel; cross-room needs room transition logic

## Assets Required
All assets are already created and referenced:
- ✅ `/public/images/items/snake-medalion.png`
- ✅ `/public/images/items/portal-static.png`
- ✅ `/public/images/items/travel-sparkle-large.png`
- ✅ `/public/images/items/travel-sparkle-small.png`

## Restart Game Modal Integration
- Added "Snake Medallion" checkbox to the story reset modal
- Players can choose to start with the medallion when resetting/restarting the game
- Useful for testing portal functionality without solving all riddles
- Files modified:
  - `/lib/story/story_mode.ts` - Added `hasSnakeMedallion` to `StoryResetConfig` interface
  - `/app/story/page.tsx` - Added medallion to default reset config
  - `/components/StoryResetModal.tsx` - Added checkbox UI for medallion

## Testing Checklist
- [ ] Solve all 5 snake riddles
- [ ] Verify final riddle dialogue shows medallion offer
- [ ] Click "Accept the Snake Medallion" option
- [ ] Verify medallion is given and appears in inventory
- [ ] Verify instructional dialogue displays correctly
- [ ] Test portal placement on first click
- [ ] Verify portal appears small when player is on it
- [ ] Verify portal becomes full size when player moves away
- [ ] Test dialogue menu on second click
- [ ] Test "Travel to portal" option
- [ ] Verify travel animation plays correctly
- [ ] Test "Replace portal location" option
- [ ] Test "Cancel" option
- [ ] Verify portal works across different rooms
- [ ] Test portal persistence across game saves/loads
- [ ] Test restart game modal with "Snake Medallion" checkbox
- [ ] Verify starting with medallion works correctly

## Future Enhancements
- Cross-room portal travel (requires room transition integration)
- Portal visual effects (glow, particles)
- Sound effects for portal placement and travel
- Cooldown or cost for portal usage
- Multiple portal support
- Portal naming/labeling system
