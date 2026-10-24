// RNG có seed (mulberry32): cùng seed => cùng trận. Cần cho replay, test và debug cân bằng.

export interface Rng {
  next(): number;
  chance(p: number): boolean;
  /** Phân phối xấp xỉ chuẩn N(0, 1) */
  gauss(): number;
  pickWeighted<T>(items: readonly T[], weight: (t: T) => number): T;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    chance: (p) => next() < p,
    gauss: () => {
      const u = Math.max(next(), 1e-12);
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
    },
    pickWeighted(items, weight) {
      const total = items.reduce((sum, it) => sum + Math.max(0, weight(it)), 0);
      let r = next() * total;
      for (const it of items) {
        r -= Math.max(0, weight(it));
        if (r <= 0) return it;
      }
      return items[items.length - 1];
    },
  };
}
