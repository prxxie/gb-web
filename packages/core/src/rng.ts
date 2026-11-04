import type { Rng } from "./types.js";

/**
 * sfc32 — small, fast, fully deterministic given a 32-bit seed.
 *
 * Determinism is a requirement, not a preference (`NFR-28`): the same seed must produce the same
 * weather sequence, the same cluster split and the same bot aim on every device.
 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  let b = (seed * 0x9e3779b9) >>> 0;
  let c = (seed ^ 0x85ebca6b) >>> 0;
  let d = (seed + 0xc2b2ae35) >>> 0;

  const next = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (a + b + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) >>> 0;
    return t / 4294967296;
  };

  // Discard the first few values: sfc32 needs a short warm-up before it is well mixed.
  for (let i = 0; i < 12; i += 1) next();

  return {
    next,
    int(min: number, max: number): number {
      if (max < min) throw new RangeError(`rng.int: max ${max} < min ${min}`);
      return min + Math.floor(next() * (max - min + 1));
    },
    float(min: number, max: number): number {
      return min + next() * (max - min);
    },
    state(): number {
      return a >>> 0;
    },
  };
}

/** Turn a room code or match id into a stable 32-bit seed. */
export function seedFromString(value: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
