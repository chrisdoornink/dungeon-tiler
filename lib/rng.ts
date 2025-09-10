// Simple seedable PRNG utilities for deterministic generation
// Mulberry32 PRNG: fast, decent quality for gameplay content generation
export type Rng = { next: () => number };

export function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return {
    next: () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    },
  };
}

// Create a 32-bit seed from a string (e.g., YYYY-MM-DD)
export function hashStringToSeed(str: string): number {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function randInt(
  rng: Rng,
  minInclusive: number,
  maxExclusive: number
): number {
  const r = rng.next();
  return Math.floor(minInclusive + r * (maxExclusive - minInclusive));
}

export function choice<T>(rng: Rng, arr: T[]): T {
  if (arr.length === 0) throw new Error("choice() on empty array");
  return arr[randInt(rng, 0, arr.length)];
}

export function shuffleInPlace<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Temporarily patch Math.random to a seeded source for a synchronous block
export function withPatchedMathRandom<T>(rng: Rng, fn: () => T): T {
  const original = Math.random;
  try {
    // Bind once so Math.random() calls don't depend on this lexical scope
    const seeded = () => rng.next();
    // Override built-in for a scoped block (safe cast)
    (Math as unknown as { random: () => number }).random = seeded;
    return fn();
  } finally {
    (Math as unknown as { random: () => number }).random = original;
  }
}
