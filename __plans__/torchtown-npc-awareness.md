# Torchtown NPC Awareness System

## Overview
Implemented a dynamic NPC dialogue system where Torchtown residents react to the player's actions, specifically:
1. **Cave Discovery**: Some NPCs know about the bluff cave and hint at library resources
2. **Kalen's Rescue**: Other NPCs heard about rescuing Kalen at the bluff

## Story Flags Used
- `entered-bluff-cave` (existing): Triggers when player enters the bluff cave
- `kalen-rescued-at-bluff` (existing): Triggers when player rescues Kalen at the bluff

## NPCs with Cave Awareness (Priority 25)
These NPCs know about the cave and suggest checking the library:

1. **Eldra (Librarian)** - `eldra-cave-hint`
   - "Word travels fast in a small town. I heard you ventured into the cave at the bluff."
   - Mentions archives might hold old maps and geological surveys

2. **Captain Bren (Guard Captain)** - `captain-bren-cave-hint`
   - Heard rumors of passages in the cliffs for years
   - Suggests Eldra keeps records of old expeditions

3. **Dara (Outsider/Traveler)** - `dara-cave-hint`
   - Hadn't heard of the cave despite traveling many roads
   - Suggests caves often have histories worth researching

4. **Lio (Hunter)** - `lio-cave-hint`
   - Hunted near the bluff for years but never knew about the cave
   - Mentions library might have old survey maps

## NPCs with Kalen Rescue Awareness (Priority 20)
These NPCs heard about the rescue and comment on it:

1. **Maro (Storekeeper)** - `maro-kalen-rescue`
   - "That boy's got more curiosity than sense"
   - Offers supplies for next venture

2. **Yanna (Herbalist)** - `yanna-kalen-rescue`
   - "The herbs told me someone was in danger"
   - Mystical acknowledgment of the rescue

3. **Serin (Healer)** - `serin-kalen-rescue`
   - Thanks for bringing Kalen back safely
   - Offers healing services

4. **Mira (Weaver)** - `mira-kalen-rescue`
   - "That's quite the tale to weave!"
   - Comments on the hero's growing story

5. **Kira (Teen)** - `kira-kalen-rescue`
   - Excited about the adventure
   - Wishes she could explore beyond the walls

6. **Old Fenna (Flame Caretaker)** - `fenna-kalen-rescue`
   - "The flame showed me your deed"
   - Gives the flame's blessing

7. **Rhett (Farmer)** - `rhett-kalen-rescue`
   - Simple acknowledgment of good work
   - Comments on community values

## Priority System
The dialogue priority system ensures proper ordering:

- **Priority 60**: Critical story moments (e.g., `elder-rowan-missing-boy`)
- **Priority 40**: Important story progression (e.g., `elder-rowan-warning-response`)
- **Priority 30**: First-time meetings (e.g., `elder-rowan-intro`)
- **Priority 25**: **Cave awareness dialogues** ← NEW
- **Priority 20**: **Kalen rescue awareness dialogues** ← NEW
- **Priority 0**: Default dialogues

This ensures:
- Cave hints take precedence over rescue dialogues
- Both take precedence over defaults
- Neither interferes with critical story progression
- Room for future flags at intermediate priorities

## Testing
Created comprehensive test suite (`npc_dialogue_priority.test.ts`) verifying:
- ✅ Cave awareness triggers correctly
- ✅ Rescue awareness triggers correctly
- ✅ Priority ordering works as expected
- ✅ Fallback to defaults when conditions aren't met
- ✅ All 318 existing tests still pass

## Files Modified
1. `/lib/story/dialogue_registry.ts` - Added 11 new dialogue scripts
2. `/lib/story/npc_script_registry.ts` - Added 11 new dialogue rules with conditions
3. `/__tests__/lib/story/npc_dialogue_priority.test.ts` - New test suite (16 tests)
