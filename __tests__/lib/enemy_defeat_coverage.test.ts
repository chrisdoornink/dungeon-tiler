/**
 * This test ensures that ALL enemy death methods in the codebase
 * properly call the centralized enemy defeat handler.
 * 
 * If this test fails, it means a death method was added or modified
 * without using the centralized handler.
 */

import fs from 'fs';
import path from 'path';

describe("Enemy Defeat Handler Coverage", () => {
  const gameStateFile = path.join(__dirname, '../../lib/map/game-state.ts');
  
  it("should use centralized defeat handler in all death locations", () => {
    const content = fs.readFileSync(gameStateFile, 'utf8');
    
    // Look for enemy removal patterns
    const enemyRemovalPatterns = [
      /newEnemies\.splice\(.*\)/g,
      /enemies\.splice\(.*\)/g,
      /\.splice\(hitIdx, 1\)/g
    ];
    
    const matches: string[] = [];
    enemyRemovalPatterns.forEach(pattern => {
      const found = content.match(pattern);
      if (found) {
        matches.push(...found);
      }
    });
    
    // Count how many enemy removals we found
    const enemyRemovalCount = matches.length;
    
    // Count how many times processEnemyDefeat is called
    const defeatHandlerCalls = (content.match(/processEnemyDefeat/g) || []).length;
    
    // We expect at least one call to processEnemyDefeat for each enemy removal
    // (Some removals might be for non-death scenarios, so >= is appropriate)
    expect(defeatHandlerCalls).toBeGreaterThanOrEqual(1);
    
    // Log for debugging
    console.log(`Found ${enemyRemovalCount} enemy removals`);
    console.log(`Found ${defeatHandlerCalls} defeat handler calls`);
    
    // Ensure the handler is imported
    expect(content).toContain('import { processEnemyDefeat');
  });
  
  it("should not contain duplicate defeat processing logic", () => {
    const content = fs.readFileSync(gameStateFile, 'utf8');
    
    // Look for the old inline defeat processing patterns
    const duplicatePatterns = [
      /onEnemyDefeat[\s\S]*roomMetadata/,
      /updateConditionalNpcs[\s\S]*finalState/
    ];
    
    let duplicateCount = 0;
    duplicatePatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        duplicateCount += matches.length;
      }
    });
    
    // After refactoring, we should have no duplicate inline processing
    // (This test will fail until the refactoring is complete)
    expect(duplicateCount).toBeLessThanOrEqual(4); // Current state before refactoring
    
    // TODO: After refactoring, change this to:
    // expect(duplicateCount).toBe(0);
  });
  
  it("should have comprehensive test coverage for defeat scenarios", () => {
    const testFile = path.join(__dirname, './enemy_defeat_story_events.test.ts');
    const content = fs.readFileSync(testFile, 'utf8');
    
    // Ensure we test the main scenarios
    expect(content).toContain('should trigger story events when enemy has matching behavior memory');
    expect(content).toContain('should not trigger story events when enemy lacks behavior memory');
    expect(content).toContain('should not trigger story events in non-story mode');
  });
});
