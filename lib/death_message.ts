/**
 * Shared human-readable "how you died" text, so every end-of-run surface
 * (DeathScreen, the daily results, the endless game-over screen) uses the same
 * wording for a given cause.
 */

export interface DeathCause {
  type: "enemy" | "faulty_floor" | "poison" | "bomb" | "darkness" | "lava";
  enemyKind?: string;
}

export function deathCauseMessage(cause?: DeathCause | null): string {
  if (!cause) return "You have fallen";
  switch (cause.type) {
    case "faulty_floor":
      return "You fell into the abyss";
    case "lava":
      return "The lava consumed you";
    case "poison":
      return "The poison consumed you";
    case "darkness":
      return "You were swallowed by the dark";
    case "bomb":
      return "Caught in your own bomb blast";
    case "enemy": {
      const enemyName = cause.enemyKind || "enemy";
      const formatted = enemyName
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
      return `Slain by ${formatted}`;
    }
    default:
      return "You have fallen";
  }
}
