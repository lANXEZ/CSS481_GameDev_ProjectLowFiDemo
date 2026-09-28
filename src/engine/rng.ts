import type { GameState } from './types';

/** mulberry32: small seeded PRNG. The seed lives in GameState so undo replays identical decisions. */
export function random(state: GameState): number {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function pick<T>(state: GameState, items: readonly T[]): T {
  return items[Math.floor(random(state) * items.length)];
}
