# Item Exchange System

## Overview
A flexible system for trading items with NPCs, designed to support the smithy's stone-for-sword trade and future exchanges like the snake's riddle reward.

## Architecture

### 1. Exchange Registry (`lib/story/exchange_registry.ts`)
Central registry defining all possible item exchanges in the game.

**Key Features:**
- **Requirements**: Check for items, story flags, or custom conditions
- **Costs**: Deduct items from player inventory
- **Rewards**: Grant items or set story flags
- **Repeatability**: Control whether exchanges can be done multiple times
- **Completion Tracking**: Automatic story flag setting

**Example Exchange:**
```typescript
"smithy-stones-for-sword": {
  id: "smithy-stones-for-sword",
  npcId: "npc-jorin",
  name: "Forge a Sword",
  requirements: [{ type: "item", itemType: "rockCount", count: 20 }],
  costs: [{ type: "item", itemType: "rockCount", count: 20 }],
  rewards: [{ type: "item", itemType: "sword" }],
  completionFlagId: "smithy-forged-sword",
  repeatable: false,
}
```

### 2. Dialogue Integration (`lib/story/dialogue_registry.ts`)
New `ExchangeEffect` type allows dialogue choices to trigger exchanges.

**Usage in Dialogue:**
```typescript
options: [
  {
    id: "accept-sword-trade",
    prompt: "Yes, forge me a sword (20 stones)",
    effects: [
      { type: "exchange", exchangeId: "smithy-stones-for-sword" },
    ],
  },
]
```

### 3. NPC Script Registry (`lib/story/npc_script_registry.ts`)
Enhanced with `customCondition` function for complex checks like item counts.

**Example:**
```typescript
{
  npcId: "npc-jorin",
  scriptId: "jorin-sword-offer",
  customCondition: (gameState) => (gameState.rockCount ?? 0) >= 20,
}
```

### 4. Dialogue Handler (`components/TilemapGrid.tsx`)
Updated to process exchange effects when dialogue choices are selected.

## Smithy Implementation

### NPCs
- **Jorin** (`npc-jorin`) - The smithy in Torch Town

### Dialogues
1. **jorin-greeting** - Default greeting (no stones)
2. **jorin-sword-offer** - Offer when player has 20+ stones
3. **jorin-sword-complete** - Confirmation after trade
4. **jorin-after-sword** - Post-trade dialogue

### Story Events
- **smithy-forged-sword** - Set when exchange completes

### Flow
1. Player collects 20+ stones
2. Talks to Jorin in smithy
3. Jorin detects stones via `customCondition`
4. Shows `jorin-sword-offer` dialogue
5. Player accepts trade
6. Exchange system:
   - Deducts 20 stones
   - Grants sword (`hasSword: true`)
   - Sets `smithy-forged-sword` flag
7. Future visits show `jorin-after-sword`

## Testing
Comprehensive test suite in `__tests__/lib/story/exchange_system.test.ts`:
- ✓ Availability checks (item counts, completion flags)
- ✓ Exchange execution (deductions, rewards)
- ✓ NPC lookup
- ✓ Edge cases

## Future Extensions

### Snake Riddle Reward (Template)
```typescript
"snake-riddle-reward": {
  id: "snake-riddle-reward",
  npcId: "npc-bluff-coiled-snake",
  requirements: [
    { type: "flag", flagId: "completed-all-snake-riddles" }
  ],
  costs: [],
  rewards: [
    { type: "item", itemType: "shield" } // Or any item
  ],
  completionFlagId: "received-snake-reward",
  repeatable: false,
}
```

### Other Possible Exchanges
- Trading food for healing potions
- Trading runes for magical items
- Multi-item trades (e.g., 10 stones + 5 runes for special weapon)
- Flag-based rewards (completing quests)

## API Reference

### `isExchangeAvailable(exchangeId, gameState)`
Check if an exchange can be performed.

### `getAvailableExchangesForNPC(npcId, gameState)`
Get all available exchanges for a specific NPC.

### `performExchange(exchangeId, gameState)`
Execute an exchange, returning updated game state.

### `resolveNpcDialogueScript(npcId, flags, gameState)`
Resolve dialogue with custom conditions (e.g., item counts).

## Benefits
- **Extensible**: Easy to add new exchanges
- **Type-safe**: Full TypeScript support
- **Testable**: Comprehensive test coverage
- **Flexible**: Supports items, flags, and custom conditions
- **Maintainable**: Single source of truth for all exchanges
