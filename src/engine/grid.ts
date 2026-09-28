import { pick } from './rng';
import type { Dir, Enemy, GameState, Pos } from './types';

export const DIR_VECTORS: Record<Dir, Pos> = {
  up: { x: 0, y: 1 },
  down: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const DIRS4: Pos[] = Object.values(DIR_VECTORS);

export const DIRS8: Pos[] = [
  ...DIRS4,
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

export const posKey = (p: Pos) => `${p.x},${p.y}`;
export const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
export const addPos = (a: Pos, b: Pos): Pos => ({ x: a.x + b.x, y: a.y + b.y });
export const manhattan = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const chebyshev = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function inBounds(state: GameState, p: Pos): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < state.room.width && p.y < state.room.height;
}

export function isPillar(state: GameState, p: Pos): boolean {
  return state.room.pillars.some((q) => samePos(p, q));
}

export function enemyAt(state: GameState, p: Pos): Enemy | undefined {
  return state.enemies.find((e) => samePos(e.pos, p));
}

export function isOccupied(state: GameState, p: Pos, ignoreEnemyId?: string): boolean {
  if (samePos(state.player.pos, p)) return true;
  return state.enemies.some((e) => e.id !== ignoreEnemyId && samePos(e.pos, p));
}

/** Can a unit step onto this tile? Pillars and other units block. */
export function isWalkable(state: GameState, p: Pos, selfEnemyId?: string): boolean {
  return inBounds(state, p) && !isPillar(state, p) && !isOccupied(state, p, selfEnemyId);
}

/** Tiles orthogonally adjacent to p that are on the board. */
export function neighbors4(state: GameState, p: Pos): Pos[] {
  return DIRS4.map((d) => addPos(p, d)).filter((q) => inBounds(state, q));
}

/** Tiles in the 3×3 ring around p that are on the board (not p itself). */
export function neighbors8(state: GameState, p: Pos): Pos[] {
  return DIRS8.map((d) => addPos(p, d)).filter((q) => inBounds(state, q));
}

/** Straight or diagonal direction from a to b, or null if b isn't on one of the 8 lines. */
export function lineDirection(a: Pos, b: Pos): Pos | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return null;
  if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return null;
  return { x: Math.sign(dx), y: Math.sign(dy) };
}

/** True if a and b share a straight/diagonal line with no pillar strictly between them. Units don't block. */
export function hasLineOfSight(state: GameState, a: Pos, b: Pos): boolean {
  const d = lineDirection(a, b);
  if (!d) return false;
  let p = addPos(a, d);
  while (!samePos(p, b)) {
    if (isPillar(state, p)) return false;
    p = addPos(p, d);
  }
  return true;
}

/** Tiles travelled from `from` (exclusive) in direction d, stopping before pillars or the board edge. */
export function ray(state: GameState, from: Pos, d: Pos, maxLen = Infinity): Pos[] {
  const out: Pos[] = [];
  let p = addPos(from, d);
  while (out.length < maxLen && inBounds(state, p) && !isPillar(state, p)) {
    out.push(p);
    p = addPos(p, d);
  }
  return out;
}

/**
 * Walking distance from every reachable tile to the nearest goal tile.
 * Other units and pillars are treated as walls; `selfId`'s own tile counts as walkable.
 */
export function distanceField(state: GameState, goals: Pos[], selfId: string): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: Pos[] = [];
  for (const g of goals) {
    if (!isWalkable(state, g, selfId) || dist.has(posKey(g))) continue;
    dist.set(posKey(g), 0);
    queue.push(g);
  }
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    const d = dist.get(posKey(p))!;
    for (const q of neighbors4(state, p)) {
      if (dist.has(posKey(q)) || !isWalkable(state, q, selfId)) continue;
      dist.set(posKey(q), d + 1);
      queue.push(q);
    }
  }
  return dist;
}

/**
 * Next step along a shortest path toward any goal tile. Equal-length paths are chosen at random.
 * Returns null if already on a goal or no path exists.
 */
export function stepToward(state: GameState, enemy: Enemy, goals: Pos[]): Pos | null {
  const dist = distanceField(state, goals, enemy.id);
  const here = dist.get(posKey(enemy.pos));
  if (here === 0) return null;
  const options = neighbors4(state, enemy.pos).filter((q) => {
    const d = dist.get(posKey(q));
    return d !== undefined && (here === undefined || d < here) && isWalkable(state, q, enemy.id);
  });
  if (options.length === 0) return null;
  const best = Math.min(...options.map((q) => dist.get(posKey(q))!));
  return pick(state, options.filter((q) => dist.get(posKey(q)) === best));
}

/**
 * One step that increases the distance from `threat` as much as possible. Returns null when
 * every open step would bring the unit closer.
 */
export function stepAway(state: GameState, enemy: Enemy, threat: Pos): Pos | null {
  const current = manhattan(enemy.pos, threat);
  const options = neighbors4(state, enemy.pos).filter((q) => isWalkable(state, q, enemy.id));
  if (options.length === 0) return null;
  const score = (q: Pos) => manhattan(q, threat) * 10 + chebyshev(q, threat);
  const bestScore = Math.max(...options.map(score));
  const best = options.filter((q) => score(q) === bestScore);
  if (manhattan(best[0], threat) < current) return null;
  return pick(state, best);
}
