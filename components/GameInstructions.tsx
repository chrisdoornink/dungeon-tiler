"use client";

import React from "react";
import { EnemyRegistry } from "../lib/enemies/registry";

export default function GameInstructions() {
  return (
    <div className="text-gray-200 leading-relaxed text-sm">
      <div className="space-y-6">
        <p>
          You have been trapped in a treacherous dungeon filled with deadly
          creatures! Your only hope of survival is to navigate using the{" "}
          <strong>arrow keys</strong> to find the{" "}
          <span className="inline-flex items-center gap-1 mx-1">
            <strong>exit key</strong>
            <span
              className="w-10 h-10"
              style={{
                backgroundImage: "url(/images/items/exit-key.png)",
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
              }}
            />
          </span>{" "}
          and reach the{" "}
          <span className="inline-flex items-center gap-1 mx-1">
            <strong>exit</strong>
            <span
              className="w-10 h-10"
              style={{
                backgroundImage: "url(/images/door/exit-dark.png)",
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
              }}
            />
          </span>
          before being slain.
        </p>

        <p>
          Beware of the vicious
          <span className="inline-flex items-center gap-1 mx-1">
            <strong>{EnemyRegistry["fire-goblin"].displayName}s</strong>
            <span
              className="w-10 h-10"
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
            <strong>{EnemyRegistry.ghost.displayName}s</strong>
            <span
              className="w-10 h-10"
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
            <strong>{EnemyRegistry["stone-exciter"].displayName}s</strong>
            <span
              className="w-10 h-10"
              style={{
                backgroundImage: "url(/images/enemies/stone-exciter-front.png)",
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
            <span
              className="w-10 h-10"
              style={{
                backgroundImage: "url(/images/floor/crack3.png)",
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
              }}
            />
          </span>
          that will send you plummeting into the abyss if stepped upon. Watch
          your footing, brave adventurer!
        </p>

        <p>
          Seek out the legendary
          <span className="inline-flex items-center gap-1 mx-1">
            <strong>sword</strong>
            <span
              className="w-10 h-10"
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
            <span
              className="w-10 h-10"
              style={{
                backgroundImage: "url(/images/items/shield.png)",
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
              }}
            />
          </span>
          to protect yourself from enemy attacks. These treasures may be locked
          away in{" "}
          <span className="inline-flex items-center gap-1 mx-1">
            <strong>chests</strong>
            <span
              className="w-10 h-10"
              style={{
                backgroundImage: "url(/images/items/closed-chest.png)",
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
              }}
            />
          </span>
          that require a
          <span className="inline-flex items-center gap-1 mx-1">
            <strong>key</strong>
            <span
              className="w-10 h-10"
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

        <p className="text-xl font-semibold text-center text-red-300 mt-8">
          Will you escape with your life, or become another victim of the
          dungeon?
        </p>
      </div>
    </div>
  );
}
