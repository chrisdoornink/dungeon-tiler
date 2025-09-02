"use client";

import React from "react";
import { go } from "../../lib/navigation";
import GameInstructions from "../../components/GameInstructions";

export default function IntroPage() {
  return (
    <div
      className="min-h-screen py-8 px-4"
      style={{
        backgroundImage: "url(/images/presentational/wall-up-close.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
      }}
    >
      <div className="max-w-4xl mx-auto rounded-lg shadow-xl p-8 font-[family-name:var(--font-press-start-2p)]">
        <h1 className="text-2xl text-center mb-8 text-gray-100">
          Escape the Dungeon
        </h1>

        <GameInstructions />

        {/* Start Game Button */}
        <div className="mt-12 text-center">
          <button
            type="button"
            onClick={() => go("/")}
            className="px-8 py-4 text-xl font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg"
          >
            Start Your Adventure
          </button>
        </div>
      </div>
    </div>
  );
}
