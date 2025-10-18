# Eldra Librarian Fix

## Problem
There were two separate librarian NPCs causing confusion:
1. **`npc-librarian`** - A generic "Town Librarian" created in `story_mode.ts` with a placeholder sprite
2. **`npc-eldra`** - The actual Torchtown librarian character positioned outside the library door

## Solution
Consolidated to use only Eldra as the librarian, positioned inside the library building.

## Changes Made

### 1. `/lib/story/rooms/chapter1/buildings/library.ts`
- **Added**: Eldra NPC creation inside the library building
- **Added**: Conditional NPC logic to remove Eldra at night (she goes home to House 1)
- **Fixed**: Import `Direction` from `"../../../../map"` (not from npc module)

### 2. `/lib/story/story_mode.ts`
- **Removed**: Lines 344-368 that created the old `npc-librarian` NPC
- **Result**: Library room now uses Eldra from the building itself

### 3. `/lib/story/rooms/chapter1/torch_town.ts`
- **Removed**: Eldra NPC from the outdoor Torchtown map (lines 284-293)
- **Changed**: Line 283 now just has a comment noting Eldra is inside the library
- **Removed**: `"npc-eldra"` from the outdoor map's `conditionalNpcs` (line 546)

### 4. `/lib/story/npc_script_registry.ts`
- **Removed**: Old `npc-librarian` dialogue rules (lines 84-95)
- **Result**: Only Eldra's dialogue rules remain (cave hint, default, etc.)

## Behavior
- **During the day**: Eldra is inside the library building
- **At night**: Eldra goes home to House 1 (Eldra's Cottage)
- **Dialogue**: Uses Eldra's character-specific dialogue scripts including:
  - `eldra-cave-hint` (priority 25) - When player enters bluff cave
  - `eldra-default` (priority 0) - Default dialogue

## Testing
✅ All 318 tests pass
✅ No lint errors
✅ Eldra properly positioned inside library building
✅ Old npc-librarian completely removed
