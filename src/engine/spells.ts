import { RULES } from './data';
import { DIR_VECTORS, DIRS4, enemyAt, neighbors8, ray } from './grid';
import type { Dir, Element, Enemy, GameState, Pos, SpellSpec } from './types';

export const ELEMENT_EFFECT: Record<Element, { status: 'burn' | 'root' | 'stun'; text: string }> = {
  fire: { status: 'burn', text: `Burn: 1 dmg before each action, ${RULES.burnTicks} ticks` },
  water: { status: 'root', text: `Root: can't move for its next turn` },
  rock: { status: 'stun', text: `Stun: can't attack for its next turn` },
};

export function fragmentCount(spec: SpellSpec): number {
  return spec.elementCount + spec.shapeCount;
}

/** Validity check: exactly one element + one shape, 2–3 fragments in total. */
export function spellError(spec: SpellSpec): string | null {
  const n = fragmentCount(spec);
  if (n < 2) return 'A cast needs at least 2 fragments.';
  if (n > 3) return 'A cast uses at most 3 fragments.';
  return null;
}

/** Cost = fragments used, +1 per doubled element or shape. */
export function spellCost(spec: SpellSpec): number {
  return fragmentCount(spec) + (spec.elementCount === 2 ? 1 : 0) + (spec.shapeCount === 2 ? 1 : 0);
}

export function spellDamage(spec: SpellSpec): number {
  return RULES.elementDamage[spec.element] + (spec.elementCount === 2 ? RULES.doubledElementBonus : 0);
}

export function spellName(spec: SpellSpec): string {
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  const el = spec.elementCount === 2 ? `${cap(spec.element)} ×2` : cap(spec.element);
  const sh = spec.shapeCount === 2 ? `${cap(spec.shape)} ×2` : cap(spec.shape);
  return `${el} + ${sh}`;
}

/** Tiles the spell hits. Beam needs a direction; Cross is centered on the caster. Pillars stop both. */
export function spellTiles(state: GameState, spec: SpellSpec, dir: Dir | null): Pos[] {
  const origin = state.player.pos;
  if (spec.shape === 'beam') {
    if (!dir) return [];
    const len = spec.shapeCount === 2 ? RULES.doubledBeamLength : RULES.beamLength;
    return ray(state, origin, DIR_VECTORS[dir], len);
  }
  const reach = spec.shapeCount === 2 ? RULES.doubledCrossReach : RULES.crossReach;
  return DIRS4.flatMap((d) => ray(state, origin, d, reach));
}

/** Unstable Fire: the 3×3 block around the caster (the caster's own tile is not hit). */
export function unstableTiles(state: GameState): Pos[] {
  return neighbors8(state, state.player.pos);
}

export function enemiesOnTiles(state: GameState, tiles: Pos[]): Enemy[] {
  return tiles.map((t) => enemyAt(state, t)).filter((e): e is Enemy => !!e);
}
