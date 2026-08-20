"use client";

import React, { useEffect, useMemo, useState } from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import { tileTypes } from "../../lib/map";
import { buildHearthHomeState } from "../../lib/story/hearth_home_mode";
import {
  FAMILY_MEMBERS,
  type FamilyMemberId,
} from "../../lib/story/rooms/home";

const HERO_CHOICE_KEY = "hearthHomeHero";

function isFamilyMemberId(value: string | null): value is FamilyMemberId {
  return FAMILY_MEMBERS.some((m) => m.id === value);
}

export default function HearthHomePage() {
  const [heroId, setHeroId] = useState<FamilyMemberId>("chris");

  // Remember who this device plays as, so Emerson's phone stays Emerson.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(HERO_CHOICE_KEY);
      if (isFamilyMemberId(saved)) setHeroId(saved);
    } catch {
      // localStorage unavailable — default to Chris.
    }
  }, []);

  const pickHero = (id: FamilyMemberId) => {
    setHeroId(id);
    try {
      window.localStorage.setItem(HERO_CHOICE_KEY, id);
    } catch {
      // Non-fatal: the choice just won't survive a refresh.
    }
  };

  // Built in the SAME render as a heroId change so the keyed remount below
  // always receives the matching state. (Building it in an effect left the
  // remounted grid holding the previous character's state — the effect ran
  // one render too late, and the grid ignores initialGameState after mount.)
  const initialState = useMemo(() => buildHearthHomeState(heroId), [heroId]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 text-white relative"
      style={{
        backgroundImage: "url(/images/presentational/wall-up-close.png)",
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
      }}
    >
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      <div className="relative z-10 flex flex-col items-center gap-4">
        <h1 className="text-xl font-semibold text-gray-300 tracking-wide uppercase">
          Hearth &amp; Home
        </h1>
        <div className="flex flex-col items-center gap-1">
          <div className="flex flex-wrap justify-center gap-2">
            {FAMILY_MEMBERS.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => pickHero(member.id)}
                className={`rounded border px-3 py-1 text-sm transition ${
                  heroId === member.id
                    ? "border-amber-300 bg-amber-300/20 text-amber-100"
                    : "border-white/30 bg-black/40 text-gray-300 hover:bg-white/10"
                }`}
              >
                {member.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            Pick who&apos;s walking in the front door.
          </p>
        </div>
        <TilemapGrid
          key={heroId}
          tileTypes={tileTypes}
          initialGameState={initialState}
          forceDaylight={true}
          storageSlot="home"
        />
      </div>
    </div>
  );
}
