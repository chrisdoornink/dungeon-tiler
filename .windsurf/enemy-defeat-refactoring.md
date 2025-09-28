# Enemy Defeat System Refactoring Guide

## Problem
Currently, enemy defeat story event processing is duplicated in multiple places:
- Melee combat in `movePlayer()`
- Rock throwing in `throwRock()`
- Rune throwing in `throwRune()`

This leads to:
- Code duplication
- Easy to forget adding logic to new death methods
- Inconsistent behavior
- Hard to test comprehensively

## Solution
Centralized enemy defeat handler in `lib/map/enemy-defeat-handler.ts`

## Refactoring Steps

### 1. Replace Inline Logic with Handler Calls

**Before (in each death location):**
```typescript
// Process onEnemyDefeat effects immediately (story mode only)
if (finalState.mode === 'story') {
  const roomMetadata = finalState.rooms?.[finalState.currentRoomId || ""]?.metadata;
  const onEnemyDefeat = roomMetadata?.onEnemyDefeat as Record<string, { effects?: Array<{ eventId: string; value: boolean }> }> | undefined;
  if (onEnemyDefeat && typeof onEnemyDefeat === "object") {
    for (const [memoryKey, config] of Object.entries(onEnemyDefeat)) {
      if (removed.behaviorMemory && removed.behaviorMemory[memoryKey]) {
        const effects = config?.effects;
        if (effects && Array.isArray(effects)) {
          // Apply effects directly to finalState
          for (const effect of effects) {
            if (effect.eventId && typeof effect.value === 'boolean') {
              if (!finalState.storyFlags) {
                finalState.storyFlags = {};
              }
              finalState.storyFlags[effect.eventId] = effect.value;
            }
          }
          // Update conditional NPCs after story flags change
          if (finalState.storyFlags && finalState.rooms) {
            updateConditionalNpcs(finalState);
          }
        }
      }
    }
  }
}
```

**After (in each death location):**
```typescript
import { processEnemyDefeat, createDefeatedEnemyInfo } from "./enemy-defeat-handler";

// Process enemy defeat story events
const defeatedEnemyInfo = createDefeatedEnemyInfo(removed);
finalState = processEnemyDefeat(finalState, defeatedEnemyInfo);
```

### 2. Update Each Death Location

#### Melee Combat (game-state.ts ~line 1470)
```typescript
// Replace the large inline block with:
const defeatedEnemyInfo = createDefeatedEnemyInfo(enemy);
newGameState = processEnemyDefeat(newGameState, defeatedEnemyInfo);
```

#### Rock Throwing - Instant Kill (game-state.ts ~line 308)
```typescript
// Replace the large inline block with:
const defeatedEnemyInfo = createDefeatedEnemyInfo(removed);
finalState = processEnemyDefeat(finalState, defeatedEnemyInfo);
```

#### Rock Throwing - Damage Kill (game-state.ts ~line 365)
```typescript
// Replace the large inline block with:
const defeatedEnemyInfo = createDefeatedEnemyInfo(removed);
finalState = processEnemyDefeat(finalState, defeatedEnemyInfo);
```

#### Rune Throwing (game-state.ts ~line 573)
```typescript
// Replace the large inline block with:
const defeatedEnemyInfo = createDefeatedEnemyInfo(removed);
finalState = processEnemyDefeat(finalState, defeatedEnemyInfo);
```

### 3. Add Required Imports
Add to the top of `game-state.ts`:
```typescript
import { processEnemyDefeat, createDefeatedEnemyInfo } from "./enemy-defeat-handler";
```

### 4. Remove Duplicate Import
Remove the now-unused import:
```typescript
import { updateConditionalNpcs } from "../story/story_mode";
```

## Testing Strategy

### Unit Tests
- Test `processEnemyDefeat()` with various scenarios
- Test `createDefeatedEnemyInfo()` helper
- Test edge cases (no metadata, wrong mode, etc.)

### Integration Tests
- Test that each death method calls the handler
- Test end-to-end story event flow
- Test multiple enemies with different memory flags

### Regression Tests
- Test Kalen rescue scenario specifically
- Test other story events that use onEnemyDefeat
- Test in different game modes

## Future-Proofing

### For New Death Methods
1. **Always use the centralized handler**
2. **Add integration test** to verify handler is called
3. **Follow the pattern**:
   ```typescript
   const defeatedEnemyInfo = createDefeatedEnemyInfo(enemy);
   gameState = processEnemyDefeat(gameState, defeatedEnemyInfo);
   ```

### For New Story Events
1. **Add to room metadata** in `onEnemyDefeat`
2. **Register event** in `event_registry.ts`
3. **Add test case** for the new event
4. **Update dialogue rules** if needed

## Benefits After Refactoring

✅ **Single source of truth** for enemy defeat logic  
✅ **Easier to test** - one function to test thoroughly  
✅ **Impossible to forget** - new death methods must use the handler  
✅ **Consistent behavior** across all death types  
✅ **Better maintainability** - changes in one place  
✅ **Clear separation of concerns** - defeat logic separate from combat logic  

## Validation Checklist

After refactoring, verify:
- [ ] All existing story events still work
- [ ] Kalen rescue scenario works with all death methods
- [ ] Tests pass
- [ ] No duplicate code remains
- [ ] Performance is not impacted
- [ ] New death methods are easy to add
