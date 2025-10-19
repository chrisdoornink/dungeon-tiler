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
        content: `Torch Town was founded generations ago by travelers seeking refuge from the darkness that plagued the land. The town's name comes from the eternal flame kept burning in the central plaza, a symbol of hope and safety.

The founders discovered that light could ward off the malevolent spirits that roamed at night. They built their homes close together, ensuring no shadow went unwatched. The tradition of lighting torches at dusk continues to this day.

The town has grown from a small outpost to a thriving community, with a library, workshop, and general store serving the needs of its residents. Despite the dangers that lurk beyond its walls, Torch Town remains a beacon of civilization in an otherwise dark world.`,
      },
    ],
  });

  // Register empty shelves for other positions
  for (let x = 2; x <= 9; x++) {
    registerBookshelf({
      id: `story-torch-town-library-shelf-1-${x}`,
      roomId: "story-torch-town-library",
      y: 1,
      x,
      excerpts: [],
    });
  }

  for (let x = 1; x <= 3; x++) {
    registerBookshelf({
      id: `story-torch-town-library-shelf-4-${x}`,
      roomId: "story-torch-town-library",
      y: 4,
      x,
      excerpts: [],
    });
  }

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
