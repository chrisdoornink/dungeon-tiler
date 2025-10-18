# Story Flags Reset Feature

## Overview
Added the ability to set story flags in the game reset modal, making it easy to test different dialogue states without having to play through the entire story.

## Changes Made

### 1. `/lib/story/story_mode.ts`
**Added `storyFlags` to `StoryResetConfig` interface:**
```typescript
export interface StoryResetConfig {
  // ... existing fields
  storyFlags?: Record<string, boolean>;
}
```

**Updated `applyStoryResetConfig` function:**
- Now applies story flags from the config when resetting
- Merges config flags with default flags: `{ ...createInitialStoryFlags(), ...config.storyFlags }`
- This allows partial flag overrides while keeping defaults for unspecified flags

### 2. `/components/StoryResetModal.tsx`
**Added story flags UI section:**
- Imports `listStoryEvents()` to get all available story flags
- New `updateStoryFlag()` handler for checkbox changes
- New scrollable section showing all story flags with:
  - Checkbox for each flag
  - Flag ID in monospace font (emerald color)
  - Description text (gray color) with hover tooltip
  - Max height with scroll for many flags

**UI Layout:**
- Story flags section appears after inventory items
- Scrollable container (max-height: 12rem / 48px) to handle many flags
- Each flag shows as: `[checkbox] flag-id — description`

## Available Story Flags

Current flags that can be toggled:
1. **met-elder-rowan** - Hero met Elder Rowan for the first time
2. **met-caretaker-lysa** - Hero met Caretaker Lysa for the first time
3. **heard-missing-boy** - Lysa reported Kalen missing at the bluff
4. **elder-rowan-acknowledged-warning** - Elder Rowan acknowledged Lysa's warning
5. **rescued-kalen** - Kalen was rescued and returned safely
6. **kalen-rescued-at-bluff** - Kalen was rescued but still at the bluff
7. **entered-bluff-cave** - Hero entered the bluff cave

## Usage

1. Open the story reset modal (in story mode)
2. Configure your starting location, health, items, etc.
3. **Scroll to "Story Flags" section**
4. **Check the flags you want to be true** for testing dialogue
5. Click "Apply Reset"

## Testing Dialogue States

### Example: Test Cave Awareness Dialogue
Check these flags:
- ✅ `entered-bluff-cave`

NPCs will now mention the cave and hint at library resources:
- Eldra, Captain Bren, Dara, Lio

### Example: Test Kalen Rescue Dialogue
Check these flags:
- ✅ `kalen-rescued-at-bluff`

NPCs will acknowledge you rescued Kalen:
- Maro, Yanna, Serin, Mira, Kira, Old Fenna, Rhett

### Example: Test Late Game State
Check multiple flags:
- ✅ `met-elder-rowan`
- ✅ `met-caretaker-lysa`
- ✅ `heard-missing-boy`
- ✅ `kalen-rescued-at-bluff`
- ✅ `entered-bluff-cave`

## Benefits

✅ **Fast iteration** - Test dialogue without playing through the story
✅ **Comprehensive testing** - Easily test all dialogue branches
✅ **Debug friendly** - Quickly reproduce specific story states
✅ **Designer friendly** - Non-programmers can test dialogue variations
✅ **Future proof** - Automatically includes new flags as they're added

## Technical Notes

- Flags are optional in the config (defaults to `createInitialStoryFlags()`)
- Partial flag overrides are supported (unspecified flags use defaults)
- NPCs are dynamically reloaded based on the new flags after reset
- Time of day is also considered when determining NPC visibility
