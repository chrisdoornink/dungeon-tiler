# Dungeon Tiler Coding Standards

This document outlines coding standards and common pitfalls to avoid when working on the Dungeon Tiler project.

## TypeScript/ESLint Rules

### 1. Variable Declaration
- **Use `const` by default** - Only use `let` if the variable will be reassigned
- **Remove unused variables** - Delete or comment out variables that aren't used

```typescript
// ❌ Bad
let finalState = { ...state };  // Never reassigned
let roomId = "story-room";      // Never used

// ✅ Good  
const finalState = { ...state };
// const roomId = "story-room";  // Commented if needed for future
```

### 2. Type Safety
- **Avoid `any` types** - Use specific types or `unknown` instead
- **Use proper type assertions** - Be specific about what you're casting

```typescript
// ❌ Bad
const config = data as any;
const metadata = (snapshot as any)?.metadata;

// ✅ Good
const config = data as { effects?: Array<{ eventId: string; value: boolean }> };
const metadata = snapshot?.metadata as Record<string, unknown> | undefined;
```

### 3. Import Organization
- **Remove unused imports** - Clean up imports that aren't being used
- **Avoid duplicate imports** - Check for the same module imported twice

```typescript
// ❌ Bad
import { Direction } from "../map";
import { NPC, type PlainNPC } from "../npc";  // PlainNPC unused
import { Direction } from "../map";  // Duplicate

// ✅ Good
import { Direction } from "../map";
import { NPC } from "../npc";
```

## React Hook Rules

### 1. useEffect Dependencies
- **Include all dependencies** - Add all values from component scope used inside effect
- **Remove unnecessary dependencies** - Don't include outer scope values that don't trigger re-renders

```typescript
// ❌ Bad
useEffect(() => {
  findMatchingOptionId(options);
}, [options]); // Missing findMatchingOptionId

useEffect(() => {
  collectStoryCheckpointOptions();
}, [collectStoryCheckpointOptions]); // Outer scope function

// ✅ Good
useEffect(() => {
  findMatchingOptionId(options);
}, [options, findMatchingOptionId]);

useEffect(() => {
  collectStoryCheckpointOptions();
}, []); // No dependencies needed for outer scope
```

### 2. useCallback Dependencies
- **Same rules as useEffect** - Include values from component scope, exclude outer scope

```typescript
// ❌ Bad
const callback = useCallback(() => {
  buildStoryStateFromConfig(config);
}, [buildStoryStateFromConfig]); // Outer scope function

// ✅ Good
const callback = useCallback(() => {
  buildStoryStateFromConfig(config);
}, [config]); // Only include component scope values
```

## Accessibility (a11y) Rules

### 1. ARIA Attributes
- **Use correct ARIA for roles** - Don't add unsupported ARIA attributes
- **Button elements** - Don't add `aria-selected` to buttons (it's implicit)

```typescript
// ❌ Bad
<button role="button" aria-selected={isSelected}>

// ✅ Good
<button className={isSelected ? 'selected' : ''}>
// or
<div role="button" aria-selected={isSelected}>
```

## File Organization

### 1. ESLint Configuration
- **Use `eslint.config.js`** instead of `.eslintignore`
- **Configure ignores property** in the config file

```javascript
// eslint.config.js
export default {
  ignores: [
    'dist/**',
    'build/**',
    '.next/**'
  ],
  // ... other config
};
```

## Story Mode Specific Rules

### 1. Story Events
- **Always register new events** in `event_registry.ts`
- **Use proper event naming** - kebab-case with descriptive names
- **Include proper typing** for story effects

```typescript
// ✅ Good event definition
"entered-bluff-cave": {
  id: "entered-bluff-cave",
  description: "Hero entered the bluff cave, Kalen moved to sanctum area.",
  defaultValue: false,
},
```

### 2. NPC Conditional Logic
- **Use story events** instead of custom logic
- **Proper priority ordering** - Higher numbers = higher priority
- **Clear condition logic** - Use `showWhen` and `removeWhen` appropriately

```typescript
// ✅ Good NPC dialogue rules
{
  npcId: "npc-sanctum-boy",
  scriptId: "kalen-sanctum-default",
  priority: 30,
  conditions: [{ eventId: "entered-bluff-cave", value: true }],
},
```

### 3. Room Metadata
- **Consistent structure** for room metadata
- **Proper typing** for onEnemyDefeat and onRoomEnter effects

```typescript
// ✅ Good room metadata
metadata: {
  conditionalNpcs: {
    "npc-id": {
      showWhen: [{ eventId: "event-name", value: true }]
    }
  },
  onRoomEnter: {
    effects: [{ eventId: "event-name", value: true }]
  }
}
```

## Common Patterns to Follow

### 1. Game State Updates
- **Use story events** for state changes
- **Call updateConditionalNpcs** after story flag changes
- **Proper mode checking** - Only run story logic in story mode

```typescript
// ✅ Good pattern
if (newGameState.mode === 'story') {
  // Apply story effects
  newGameState.storyFlags[effect.eventId] = effect.value;
  updateConditionalNpcs(newGameState);
}
```

### 2. Error Prevention
- **Check for existence** before accessing properties
- **Use optional chaining** for nested properties
- **Proper null/undefined handling**

```typescript
// ✅ Good defensive coding
const roomMetadata = newGameState.rooms?.[roomId]?.metadata;
const effects = (config as Record<string, unknown>)?.effects;
if (effects && Array.isArray(effects)) {
  // Process effects
}
```

## Pre-commit Checklist

Before committing code, ensure:

- [ ] No unused variables or imports
- [ ] All `let` variables that are never reassigned changed to `const`
- [ ] No `any` types (use `unknown` or specific types)
- [ ] React hooks have correct dependencies
- [ ] No unsupported ARIA attributes
- [ ] Story events are properly registered
- [ ] Mode checks for story-specific logic
- [ ] Proper error handling and null checks

## Build Command Verification

Always run these commands before committing:

```bash
npm run typecheck  # Check TypeScript errors
npm run lint       # Check ESLint errors  
npm run build      # Full build verification
```

Fix all errors and warnings before proceeding with commits.
