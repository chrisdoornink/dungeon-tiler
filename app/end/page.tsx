"use client";

import React, { useEffect, useState } from "react";

type LastGame = {
  completedAt: string;
  hasKey: boolean;
  hasExitKey: boolean;
  mapData: {
    tiles: number[][];
    subtypes: number[][][];
  };
  outcome?: "win" | "dead";
};

export default function EndPage() {
  const [last, setLast] = useState<LastGame | null>(null);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const raw = window.sessionStorage.getItem("lastGame");
        if (raw) {
          setLast(JSON.parse(raw));
        }
      }
    } catch {
      // ignore parse/storage errors
    }
  }, []);

  if (!last) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2">No game data found</h1>
          <p className="text-gray-600">Play a game to see your results here.</p>
        </div>
      </div>
    );
  }

  const height = last.mapData?.tiles?.length ?? 0;
  const width = height > 0 ? last.mapData.tiles[0].length : 0;

  const title = last.outcome === "dead" ? "You died in the dungeon!" : "You escaped the dungeon!";
  const subtitle = last.outcome === "dead" ? "Defeated at" : "Completed at";

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full text-center">
        <h1 className="text-2xl font-semibold mb-2">{title}</h1>
        <p className="text-gray-600 mb-4">{subtitle} {new Date(last.completedAt).toLocaleString()}</p>
        <div className="grid grid-cols-2 gap-3 text-left">
          <div className="font-medium">Had Key</div>
          <div>{last.hasKey ? "Yes" : "No"}</div>
          <div className="font-medium">Had Exit Key</div>
          <div>{last.hasExitKey ? "Yes" : "No"}</div>
          <div className="font-medium">Map Size</div>
          <div>{width} x {height}</div>
        </div>
      </div>
    </div>
  );
}
