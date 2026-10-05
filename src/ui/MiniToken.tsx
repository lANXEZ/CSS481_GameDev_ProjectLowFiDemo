import { ENEMY_DEFS, type Element, type EnemyKind } from '../engine';
import { PLAYER_TOKEN_ART, tokenArtFor } from './art';

/** Anything with a token: an Enemy, or just the parts of one (e.g. a loot notice). */
export interface TokenUnit {
  id: string;
  kind: EnemyKind;
  element?: Element;
}

/** Small printed token with the unit's id underneath, for lists and panel headers. Without a unit: you. */
export function MiniToken({ unit, big = false }: { unit?: TokenUnit; big?: boolean }) {
  const title = unit ? `${ENEMY_DEFS[unit.kind].name}${unit.element ? ` (${unit.element})` : ''} ${unit.id}` : 'You';
  return (
    <span className={`mini-token-art${big ? ' big' : ''}`} title={title}>
      <img src={unit ? tokenArtFor(unit.kind, unit.element) : PLAYER_TOKEN_ART} alt="" draggable={false} />
      <span className="mini-token-id">{unit?.id ?? 'YOU'}</span>
    </span>
  );
}
