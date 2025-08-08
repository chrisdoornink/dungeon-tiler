"use client";

import { generateMap, generateMapCenterOut, tileTypes } from "../lib/map";
import { TilemapGrid } from "../components/TilemapGrid";
import { Legend } from "../components/Legend";

interface HomeProps {
  algorithm?: "default" | "centerOut";
}

export default function Home({ algorithm = "centerOut" }: HomeProps) {
  // Generate the tilemap based on selected algorithm
  const tilemap =
    algorithm === "centerOut" ? generateMapCenterOut() : generateMap();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-6">Dungeon Tilemap</h1>

      <TilemapGrid tilemap={tilemap} tileTypes={tileTypes} />

      <Legend tileTypes={tileTypes} />
    </div>
  );
}
