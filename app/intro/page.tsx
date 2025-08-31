"use client";

import React from "react";
import { go } from "../../lib/navigation";

export default function IntroPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-xl p-8">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
          Escape the Dungeon
        </h1>

        <div className="text-gray-700 leading-relaxed">
          <div className="text-lg space-y-6">
            <p>
              You have been trapped in a treacherous dungeon filled with deadly
              creatures and ancient traps! Your only hope of survival is to
              navigate the dark corridors using the <strong>arrow keys</strong>{" "}
              to find the mystical
              <span className="inline-flex items-center gap-1 mx-1">
                <strong>exit key</strong>
                <div
                  className="w-5 h-5"
                  style={{
                    backgroundImage: "url(/images/items/exit-key.png)",
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                  }}
                />
              </span>
              and reach the
              <span className="inline-flex items-center gap-1 mx-1">
                <strong>exit portal</strong>
                <div
                  className="w-5 h-5"
                  style={{
                    backgroundImage: "url(/images/door/exit-dark.png)",
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                  }}
                />
              </span>
              before being slain by the dungeon&apos;s guardians.
            </p>

            <p>
              Beware of the vicious
              <span className="inline-flex items-center gap-1 mx-1">
                <strong>goblins</strong>
                <div
                  className="w-5 h-5"
                  style={{
                    backgroundImage:
                      "url(/images/enemies/fire-goblin/fire-goblin-front.png)",
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                  }}
                />
              </span>
              , ethereal
              <span className="inline-flex items-center gap-1 mx-1">
                <strong>ghosts</strong>
                <div
                  className="w-5 h-5"
                  style={{
                    backgroundImage: "url(/images/enemies/lantern-wisp.png)",
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                  }}
                />
              </span>
              , fearsome
              <span className="inline-flex items-center gap-1 mx-1">
                <strong>stone exciters</strong>
                <div
                  className="w-5 h-5"
                  style={{
                    backgroundImage:
                      "url(/images/enemies/stone-exciter-front.png)",
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                  }}
                />
              </span>
              and others! Walk into these foul beasts to engage them in mortal
              combat.
            </p>

            <p>
              The ancient dungeon floor is riddled with
              <span className="inline-flex items-center gap-1 mx-1">
                <strong>deadly cracks</strong>
                <div
                  className="w-5 h-5"
                  style={{
                    backgroundImage: "url(/images/floor/crack3.png)",
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                  }}
                />
              </span>
              that will send you plummeting into the abyss if stepped upon.
              Watch your footing, brave adventurer!
            </p>

            <p>
              Seek out the legendary
              <span className="inline-flex items-center gap-1 mx-1">
                <strong>sword</strong>
                <div
                  className="w-5 h-5"
                  style={{
                    backgroundImage: "url(/images/items/sword.png)",
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                  }}
                />
              </span>
              to increase your battle prowess and the enchanted
              <span className="inline-flex items-center gap-1 mx-1">
                <strong>shield</strong>
                <div
                  className="w-5 h-5"
                  style={{
                    backgroundImage: "url(/images/items/shield.png)",
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                  }}
                />
              </span>
              to protect yourself from enemy attacks. These treasures may be
              locked away in
              <span className="inline-flex items-center gap-1 mx-1">
                <strong>chests</strong>
                <div
                  className="w-5 h-5"
                  style={{
                    backgroundImage: "url(/images/items/chest.png)",
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                  }}
                />
              </span>
              that require a
              <span className="inline-flex items-center gap-1 mx-1">
                <strong>key</strong>
                <div
                  className="w-5 h-5"
                  style={{
                    backgroundImage: "url(/images/items/key.png)",
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                  }}
                />
              </span>
              to unlock.
            </p>

            <p className="text-xl font-semibold text-center text-red-700 mt-8">
              Will you escape with your life, or become another victim of the
              dungeon?
            </p>
          </div>
        </div>

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
