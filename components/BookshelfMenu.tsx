"use client";

import { useEffect, useState } from "react";
import type { BookExcerpt } from "../lib/story/library_registry";
import { getBookshelf, getAvailableExcerpts } from "../lib/story/library_registry";
import type { StoryFlags } from "../lib/story/event_registry";

interface BookshelfMenuProps {
  bookshelfId: string;
  storyFlags: StoryFlags;
  onClose: () => void;
}

export function BookshelfMenu({ bookshelfId, storyFlags, onClose }: BookshelfMenuProps) {
  const [selectedExcerpt, setSelectedExcerpt] = useState<BookExcerpt | null>(null);
  const [availableExcerpts, setAvailableExcerpts] = useState<BookExcerpt[]>([]);

  useEffect(() => {
    const excerpts = getAvailableExcerpts(bookshelfId, storyFlags);
    setAvailableExcerpts(excerpts);
  }, [bookshelfId, storyFlags]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        if (selectedExcerpt) {
          setSelectedExcerpt(null);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [selectedExcerpt, onClose]);

  if (selectedExcerpt) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-amber-50 border-4 border-amber-900 rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-y-auto">
          <h2 className="text-2xl font-bold text-amber-900 mb-4">{selectedExcerpt.title}</h2>
          <div className="text-amber-950 whitespace-pre-wrap mb-6 leading-relaxed">
            {selectedExcerpt.content}
          </div>
          <button
            onClick={() => setSelectedExcerpt(null)}
            className="bg-amber-700 hover:bg-amber-800 text-white px-6 py-2 rounded font-semibold"
          >
            Close (ESC or SPACE)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-amber-50 border-4 border-amber-900 rounded-lg p-6 max-w-md">
        <h2 className="text-2xl font-bold text-amber-900 mb-4">Bookshelf</h2>
        
        {availableExcerpts.length === 0 ? (
          <p className="text-amber-800 mb-4">Nothing of interest here.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {availableExcerpts.map((excerpt) => (
              <button
                key={excerpt.id}
                onClick={() => setSelectedExcerpt(excerpt)}
                className="w-full text-left bg-amber-100 hover:bg-amber-200 border-2 border-amber-700 rounded px-4 py-3 text-amber-900 font-semibold transition-colors"
              >
                📖 {excerpt.title}
              </button>
            ))}
          </div>
        )}
        
        <button
          onClick={onClose}
          className="w-full bg-amber-700 hover:bg-amber-800 text-white px-6 py-2 rounded font-semibold"
        >
          Close (ESC or SPACE)
        </button>
      </div>
    </div>
  );
}
