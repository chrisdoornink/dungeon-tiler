# Snake Quiz Challenge - Story Mode Feature

## Overview
A high-stakes quiz challenge where incorrect answers spawn snakes that randomly move around the room. If a snake steps on a pressure plate button, it triggers a deadly trap that kills the player.

## Concept
- Player encounters a quiz room (possibly related to the Ancient Serpent lore)
- Each incorrect answer spawns 1-2 snakes in the room
- Snakes move randomly using existing NPC movement AI
- A pressure plate button exists somewhere in the room
- If any snake steps on the button, the player dies instantly
- Player must answer enough questions correctly to proceed while managing snake threat

## Game Mechanics

### Quiz System
- **Question Count**: 5-10 questions total
- **Difficulty Scaling**: Questions get harder as you progress
- **Time Pressure**: Optional timer per question to increase tension
- **Topics**: Lore-based (Ancient Serpent history, Torch Town knowledge, dungeon secrets)

### Snake Spawning
- **Spawn Rate**: 1 snake per incorrect answer (or 2 for harder difficulty)
- **Spawn Locations**: Random floor tiles away from player and button
- **Snake Type**: Use existing snake enemy with modified behavior
- **Max Snakes**: Cap at 10-15 to prevent performance issues

### Snake Behavior
- **Movement Pattern**: Random wandering (similar to existing NPC patrol)
- **Movement Speed**: Slower than normal snakes (1 move per 2-3 player turns)
- **No Combat**: Snakes don't attack player directly
- **Button Detection**: Check if snake position matches button position each turn

### Pressure Plate Button
- **Visual**: Special floor tile subtype (PRESSURE_PLATE or similar)
- **Location**: Fixed position in room, visible to player
- **Trigger**: Instant death when snake steps on it
- **Warning**: Visual indicator when snake is near (1-2 tiles away)

### Death Mechanism
- **Trigger**: Snake position === button position
- **Death Message**: "A snake stepped on the pressure plate! The room's trap was triggered!"
- **Consequence**: Instant death, respawn at last checkpoint
- **Story Flag**: Track if player died this way for dialogue variations

## Room Design

### Layout
```
# # # # # # # # # # # # #
# . . . . . . . . . . . #
# . . . . . . . . . . . #
# . . . Q . . . . . . . #  <- Q = Quiz NPC/Pedestal
# . . . . . . . . . . . #
# . . . . . . . . . . . #
# . . . . . B . . . . . #  <- B = Pressure Plate Button
# . . . . . . . . . . . #
# . . . . . . . . . . . #
# # # # 0 # # # # # # # #  <- 0 = Exit (locked until quiz complete)
```

### Room Elements
- **Entry Point**: Top or side entrance
- **Quiz Giver**: NPC or ancient pedestal at north end
- **Pressure Plate**: Center-south area (visible but not directly in path)
- **Exit Door**: Locked until quiz is completed successfully
- **Floor Space**: Large enough for 10+ snakes to move without clustering

## Implementation Details

### New Components Needed

#### 1. Pressure Plate Tile Subtype
```typescript
// In lib/map/constants.ts
TileSubtype.PRESSURE_PLATE = 49
```

#### 2. Quiz State Management
```typescript
interface QuizChallengeState {
  questionsAsked: number;
  questionsCorrect: number;
  questionsIncorrect: number;
  snakesSpawned: number;
  isQuizActive: boolean;
  isQuizComplete: boolean;
  currentQuestionId?: string;
}
```

#### 3. Snake Spawn Logic
```typescript
function spawnQuizSnake(
  gameState: GameState,
  roomId: RoomId,
  avoidPositions: [number, number][]
): GameState {
  // Find random floor tile
  // Avoid player, button, and existing snakes
  // Spawn snake with special metadata
  // Add to gameState.enemies
}
```

#### 4. Button Check Logic
```typescript
function checkPressurePlateTriggered(
  gameState: GameState,
  buttonPosition: [number, number]
): boolean {
  // Check if any enemy is on button position
  // Return true if triggered
}
```

#### 5. Quiz Questions Registry
```typescript
// In lib/story/quiz_registry.ts
interface QuizQuestion {
  id: string;
  question: string;
  answers: Array<{
    id: string;
    text: string;
    isCorrect: boolean;
  }>;
  difficulty: 'easy' | 'medium' | 'hard';
}

const SNAKE_QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'snake-quiz-1',
    question: 'What ancient creature guards the riddles in the bluffs?',
    answers: [
      { id: 'a', text: 'A dragon', isCorrect: false },
      { id: 'b', text: 'An ancient serpent', isCorrect: true },
      { id: 'c', text: 'A giant spider', isCorrect: false },
      { id: 'd', text: 'A stone golem', isCorrect: false },
    ],
    difficulty: 'easy',
  },
  // ... more questions
];
```

### Integration Points

#### Story Event Flow
1. **Room Entry**: Trigger dialogue explaining the challenge
2. **Quiz Start**: Player accepts challenge, quiz begins
3. **Question Loop**: 
   - Present question
   - Player selects answer
   - If wrong: spawn snake(s)
   - If right: increment score
   - Check button trigger after each snake movement
4. **Quiz Complete**: Unlock exit door if enough correct answers
5. **Failure**: Death if button triggered, or quiz failed

#### Story Flags
- `snake-quiz-started`: Player has entered the quiz room
- `snake-quiz-completed`: Player successfully completed quiz
- `snake-quiz-failed`: Player died to pressure plate
- `snake-quiz-deaths`: Counter for how many times died this way

#### Dialogue Integration
```typescript
// In dialogue_registry.ts
"snake-quiz-intro": {
  id: "snake-quiz-intro",
  lines: [
    {
      speaker: "Ancient Voice",
      text: "Answer my questions wisely, traveler. Each mistake will summon a serpent to this chamber.",
    },
    {
      speaker: "Ancient Voice", 
      text: "Beware the pressure plate in the center. Should a serpent step upon it... the trap will seal your fate.",
    },
  ],
},
```

## Difficulty Variations

### Easy Mode
- 5 questions, need 3 correct to pass
- 1 snake per wrong answer
- Snakes move every 3 turns
- Large room with plenty of space

### Normal Mode  
- 7 questions, need 5 correct to pass
- 1-2 snakes per wrong answer
- Snakes move every 2 turns
- Medium room

### Hard Mode
- 10 questions, need 8 correct to pass
- 2 snakes per wrong answer
- Snakes move every turn
- Smaller room, button closer to spawn points

## Rewards

### Success Rewards
- **Story Progress**: Unlock next area/chapter
- **Lore Item**: Ancient scroll or medallion piece
- **Dialogue**: NPCs comment on your wisdom
- **Achievement**: "Snake Charmer" - Complete quiz without spawning any snakes

### Failure Consequences
- **Death**: Respawn at checkpoint
- **Retry**: Can attempt quiz again
- **Dialogue Changes**: NPCs mock your failure or offer encouragement

## Visual & Audio Feedback

### Visual Indicators
- **Pressure Plate**: Distinct tile sprite (cracked stone with runes)
- **Warning Glow**: Red glow when snake is 1-2 tiles from button
- **Snake Spawn**: Particle effect when snake appears
- **Button Trigger**: Flash/explosion effect when triggered

### Audio Cues
- **Question Prompt**: Mysterious chime
- **Correct Answer**: Success chime
- **Wrong Answer**: Ominous tone + snake hiss
- **Snake Movement**: Subtle slithering sound
- **Button Warning**: Tense music intensifies
- **Button Trigger**: Loud trap activation sound
- **Death**: Dramatic death sound

## Testing Checklist

- [ ] Snakes spawn at correct rate per wrong answer
- [ ] Snakes move randomly without getting stuck
- [ ] Button detection works reliably
- [ ] Death triggers correctly when snake hits button
- [ ] Quiz state persists through save/load
- [ ] Exit unlocks only after sufficient correct answers
- [ ] Visual warnings appear when snake near button
- [ ] Can retry quiz after death
- [ ] Story flags update correctly
- [ ] Performance with 10+ snakes is acceptable

## Future Enhancements

### Possible Additions
- **Snake Lure Items**: Consumable that attracts snakes away from button
- **Freeze Spell**: Temporarily stop snake movement
- **Button Shield**: One-time protection from button trigger
- **Multiple Buttons**: Different buttons trigger different traps
- **Timed Challenge**: Complete quiz before snakes reach critical mass
- **Snake Variants**: Different colored snakes with different movement patterns

### Alternative Mechanics
- **Reverse Challenge**: Player must lure snakes TO the button to unlock door
- **Pattern Puzzle**: Snakes must hit buttons in specific sequence
- **Snake Herding**: Player can push/guide snakes away from button
- **Multi-Room**: Quiz spans multiple rooms with different hazards

## Story Integration

### Placement in Campaign
- **Chapter 2-3**: After basic mechanics are established
- **Location**: Ancient temple or serpent shrine
- **Prerequisites**: Must have encountered Ancient Serpent riddles
- **Narrative Purpose**: Test player's knowledge and attention to lore

### Lore Connections
- Ties into Ancient Serpent mythology
- References previous riddles and story events
- Foreshadows future challenges
- Rewards players who pay attention to dialogue and books

## Notes
- Keep questions fair and based on information player has encountered
- Provide hints or allow one retry per question
- Balance difficulty so it's challenging but not frustrating
- Make pressure plate clearly visible and explained
- Consider accessibility: allow quiz to be skipped with penalty (e.g., lose items)
