let counter = 0;

export function newId(prefix: string): string {
  counter += 1;
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${stamp}${counter.toString(36)}${rand}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function isoDaysAgo(days: number, from = Date.now()): string {
  return new Date(from - days * 86_400_000).toISOString();
}

/** Small deterministic PRNG so seeded data is identical on every run. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
