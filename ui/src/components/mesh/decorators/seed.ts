/**
 * seed — deterministic PRNG for procedural decoration.
 *
 * `mulberry32` is a small, fast, well-distributed 32-bit PRNG; output is
 * stable for a given seed so reloads keep the same surface decoration.
 *
 * `hashString` produces a stable 32-bit seed from a string (machine id +
 * slot index), so each part of the arm gets its own consistent variation.
 */

/** Mulberry32 PRNG. Returns a function that yields [0, 1) floats. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a 32-bit hash of a string. Stable across runs. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** Convenience: build a seeded RNG from a string key. */
export function seededRng(key: string): () => number {
  return mulberry32(hashString(key))
}
