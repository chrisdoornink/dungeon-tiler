"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { TilemapGrid } from "../../components/TilemapGrid";
import {
  tileTypes,
  type GameState,
  type PartyMemberState,
} from "../../lib/map";
import {
  buildHearthHomeState,
  enterBackyard,
  handleControlledMemberDeath,
  switchPartyMember,
} from "../../lib/story/hearth_home_mode";
import {
  FAMILY_MEMBERS,
  type FamilyMemberId,
} from "../../lib/story/rooms/home";

const HERO_CHOICE_KEY = "hearthHomeHero";

function isFamilyMemberId(value: string | null): value is FamilyMemberId {
  return FAMILY_MEMBERS.some((m) => m.id === value);
}

export default function HearthHomePage() {
  // Who the scene boots as (mount-time only; restored from the last visit).
  const [initialHeroId, setInitialHeroId] = useState<FamilyMemberId>("chris");
  // Who is currently controlled — the picker highlight. Switching happens
  // LIVE inside the running scene (possession), not by rebuilding it.
  const [heroId, setHeroId] = useState<FamilyMemberId>("chris");
  const [externalAction, setExternalAction] = useState<
    { seq: number; apply: (state: GameState) => GameState } | undefined
  >(undefined);
  const seqRef = useRef(0);
  // Live roster mirror from the grid: who's alive, who's controlled.
  const [party, setParty] = useState<PartyMemberState[] | undefined>(undefined);
  // Shortcut: /home?start=outside boots straight into the backyard, skipping
  // the whole intro (for testing the survival core and for replays).
  const [bootOutside, setBootOutside] = useState(false);

  const handlePartyChange = useCallback(
    (roster: PartyMemberState[], activeHeroId?: string) => {
      setParty(roster);
      // Deaths can hand control to someone else — keep the highlight honest.
      if (isFamilyMemberId(activeHeroId ?? null)) {
        setHeroId(activeHeroId as FamilyMemberId);
      }
    },
    []
  );

  // Permadeath: when the controlled member falls, control jumps to the next
  // living family member; when nobody is left, the visit starts over.
  const handleDeath = useCallback(() => {
    seqRef.current += 1;
    setExternalAction({
      seq: seqRef.current,
      apply: (state) => handleControlledMemberDeath(state),
    });
  }, []);

  // The intro reached the back door — hand off to the backyard in place.
  const handleHearthExit = useCallback(() => {
    seqRef.current += 1;
    setExternalAction({
      seq: seqRef.current,
      apply: (state) => enterBackyard(state),
    });
  }, []);

  useEffect(() => {
    try {
      if (
        new URLSearchParams(window.location.search).get("start") === "outside"
      ) {
        setBootOutside(true);
      }
    } catch {
      // no query string available — stay in the intro
    }
    try {
      const saved = window.localStorage.getItem(HERO_CHOICE_KEY);
      if (isFamilyMemberId(saved)) {
        setInitialHeroId(saved);
        setHeroId(saved);
      }
    } catch {
      // localStorage unavailable — default to Chris.
    }
  }, []);

  const pickHero = useCallback((id: FamilyMemberId) => {
    setHeroId(id);
    try {
      window.localStorage.setItem(HERO_CHOICE_KEY, id);
    } catch {
      // Non-fatal: the choice just won't survive a refresh.
    }
    seqRef.current += 1;
    setExternalAction({
      seq: seqRef.current,
      apply: (state) => switchPartyMember(state, id),
    });
  }, []);

  // 1-5 jump straight into that family member, in roster order.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const index = Number.parseInt(event.key, 10) - 1;
      if (Number.isNaN(index)) return;
      const member = FAMILY_MEMBERS[index];
      if (member) pickHero(member.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pickHero]);

  const initialState = useMemo(
    () => buildHearthHomeState(initialHeroId, { startOutside: bootOutside }),
    [initialHeroId, bootOutside]
  );

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
            {FAMILY_MEMBERS.map((member, index) => {
              const fallen =
                party?.find((p) => p.id === member.id)?.alive === false;
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => pickHero(member.id)}
                  disabled={fallen}
                  className={`rounded border px-3 py-1 text-sm transition ${
                    fallen
                      ? "border-white/10 bg-black/40 text-gray-600 line-through"
                      : heroId === member.id
                      ? "border-amber-300 bg-amber-300/20 text-amber-100"
                      : "border-white/30 bg-black/40 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  <span className="mr-1 text-xs text-gray-400">
                    {index + 1}
                  </span>
                  {member.name}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-400">
            Switch who you&apos;re controlling any time — click or press 1-5.
          </p>
        </div>
        <TilemapGrid
          key={`${initialHeroId}-${bootOutside ? "yard" : "house"}`}
          tileTypes={tileTypes}
          initialGameState={initialState}
          forceDaylight={true}
          storageSlot="home"
          externalAction={externalAction}
          onPartyChange={handlePartyChange}
          onDeath={handleDeath}
          onHearthExit={handleHearthExit}
        />
      </div>
    </div>
  );
}
