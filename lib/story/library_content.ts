import { registerBookshelf } from "./library_registry";

/**
 * Register all library content
 * This is called during game initialization
 */
export function initializeLibraryContent(): void {
  // Library shelf at position (1, 1) - History of Torch Town
  registerBookshelf({
    id: "story-torch-town-library-shelf-1-1",
    roomId: "story-torch-town-library",
    y: 1,
    x: 1,
    excerpts: [
      {
        id: "torch-town-history",
        title: "The History of Torch Town",
        content: `Torch Town was founded generations ago by travelers seeking refuge from the darkness that plagued the land. The town's name comes from the tradition of keeping torches burning throughout the settlement, a symbol of hope and safety.

The founders discovered that light could ward off the malevolent spirits that threatened them. They built their homes close together, ensuring no shadow went unwatched. The tradition of maintaining vigilant light continues to this day.

The town has grown from a small outpost to a thriving community, with a library, workshop, and general store serving the needs of its residents. Despite the dangers that lurk beyond its walls, Torch Town remains a beacon of civilization in an otherwise dark world.`,
      },
    ],
  });

  // Library shelf at position (1, 5) - Ancient Serpent Legends
  registerBookshelf({
    id: "story-torch-town-library-shelf-1-5",
    roomId: "story-torch-town-library",
    y: 1,
    x: 5,
    excerpts: [
      {
        id: "ancient-serpent-legend",
        title: "Legends of the Ancient Serpent",
        content: `Deep within the caves of the Western Bluff, it is said that an Ancient Serpent dwells—a creature of immense wisdom and age. Unlike the common snakes that roam the wilds, this serpent is believed to possess intelligence rivaling that of the wisest scholars.

According to legend, the Ancient Serpent guards a powerful artifact that can bend space itself, allowing one to traverse great distances in an instant. However, the serpent does not yield its treasure to strength or force. Only those who prove their wisdom through riddles may earn its favor.

The riddles are said to test one's understanding of fundamental truths: silence, shadow, light, time, and echo. Many have ventured into the eastern caves seeking the serpent's gift, but few have returned with tales of success.

If you seek the Ancient Serpent, venture to the easternmost chamber of the Bluff Caves. There, in the stillness of stone, you may find the guardian waiting.`,
      },
    ],
  });

  // Library shelf at position (1, 9) - Cryptic Tales
  registerBookshelf({
    id: "story-torch-town-library-shelf-1-9",
    roomId: "story-torch-town-library",
    y: 1,
    x: 9,
    excerpts: [
      {
        id: "cryptic-tales",
        title: "Secret of the Bluff Caves",
        content: `I ventured into the eastmost chamber of the bluff cave today, where silence dwells in stone and shadows linger in every corner. There I found one who remains still among us—a guardian of some kind. It spoke of riddles, testing whether I could see light in darkness, hear what speaks without sound, and grasp what moves yet cannot be held.

I fled before answering, but the echo of its words haunts me. It guards something powerful, I'm certain—perhaps a means to traverse great distances. Time seems to stand still in that place. If you seek this treasure, bring patience. Silence is the first lesson, it said, and the echo of your thoughts the final test.`,
        onReadEventId: "read-bluff-cave-secret",
      },
    ],
  });

  // Register bookshelves for other positions on top row (y=1)
  for (let x = 2; x <= 9; x++) {
    if (x === 5) continue; // Skip x=5, already registered above
    registerBookshelf({
      id: `story-torch-town-library-shelf-1-${x}`,
      roomId: "story-torch-town-library",
      y: 1,
      x,
      excerpts: [],
    });
  }

  // Register bookshelves for middle row left side (y=4, x=1-3)
  for (let x = 1; x <= 3; x++) {
    registerBookshelf({
      id: `story-torch-town-library-shelf-4-${x}`,
      roomId: "story-torch-town-library",
      y: 4,
      x,
      excerpts: [],
    });
  }

  // Register bookshelves for middle row right side (y=4, x=7-9)
  for (let x = 7; x <= 9; x++) {
    registerBookshelf({
      id: `story-torch-town-library-shelf-4-${x}`,
      roomId: "story-torch-town-library",
      y: 4,
      x,
      excerpts: [],
    });
  }

  // Add more bookshelves as needed
}
