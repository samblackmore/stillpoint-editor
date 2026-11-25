// Seeded RNG (mulberry32). Unity's generator uses UnityEngine.Random, which is
// unseeded — the port uses a seeded RNG instead, so a daily puzzle (seed = the
// date) gives every player the same level, and any generated level can be
// replayed from its seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// String seed (e.g. "2026-11-26") -> uint32.
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class RNG {
  constructor(seed) {
    this.next = mulberry32(typeof seed === 'string' ? hashSeed(seed) : seed);
  }
  // UnityEngine.Random.Range(int, int) is inclusive on both ends.
  rangeInt(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  rangeFloat(min, max) {
    return min + this.next() * (max - min);
  }
  // Unity's RNG.Chance(n): Random.Range(0, n) == 0 — a 1-in-n chance.
  // n = 0 always returns true (Range(0, 0) is 0).
  chanceOneIn(n) {
    if (n <= 0) return true;
    return this.rangeInt(0, n - 1) === 0;
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
}
