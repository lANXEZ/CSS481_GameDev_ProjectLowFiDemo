import { coordLabel } from './data';
import { RuleError, cloneState, enemyName, killEnemy, log } from './core';
import { spawnEnemy } from './game';
import { isPillar, isOccupied } from './grid';
import type { Element, Enemy, EnemyKind, GameState, PlayerState, Pos } from './types';

/**
 * Manual corrections by the GM, for when the paper table and the app disagree.
 * Every edit is logged so playtest records show what was overridden.
 */
export function gmEdit(state: GameState, note: string, edit: (s: GameState) => void): GameState {
  const s = cloneState(state);
  edit(s);
  log(s, 'gm', `GM: ${note}`);
  if (s.player.hp <= 0 && s.phase !== 'lost') {
    s.phase = 'lost';
    log(s, 'system', 'The wizard has fallen. Game over.');
  }
  return s;
}

function findEnemy(s: GameState, id: string): Enemy {
  const e = s.enemies.find((x) => x.id === id);
  if (!e) throw new RuleError(`No unit ${id} on the board.`);
  return e;
}

export function gmPatchEnemy(state: GameState, id: string, patch: Partial<Enemy>, note: string): GameState {
  return gmEdit(state, note, (s) => {
    const e = findEnemy(s, id);
    Object.assign(e, structuredClone(patch));
    if (e.hp <= 0) killEnemy(s, e);
  });
}

export function gmPatchPlayer(state: GameState, patch: Partial<PlayerState>, note: string): GameState {
  return gmEdit(state, note, (s) => Object.assign(s.player, structuredClone(patch)));
}

export function canPlaceAt(state: GameState, pos: Pos): boolean {
  return !isPillar(state, pos) && !isOccupied(state, pos);
}

export function gmMoveEnemy(state: GameState, id: string, to: Pos): GameState {
  if (!canPlaceAt(state, to)) throw new RuleError('That tile is taken.');
  const e = findEnemy(state, id);
  return gmEdit(state, `moved ${enemyName(e)} ${coordLabel(e.pos)} → ${coordLabel(to)}`, (s) => {
    findEnemy(s, id).pos = { ...to };
  });
}

export function gmMovePlayer(state: GameState, to: Pos): GameState {
  if (!canPlaceAt(state, to)) throw new RuleError('That tile is taken.');
  return gmEdit(state, `moved YOU ${coordLabel(state.player.pos)} → ${coordLabel(to)}`, (s) => {
    s.player.pos = { ...to };
  });
}

export function gmRemoveEnemy(state: GameState, id: string, asKill: boolean): GameState {
  const e = findEnemy(state, id);
  return gmEdit(state, `${asKill ? 'killed' : 'removed'} ${enemyName(e)}`, (s) => {
    const target = findEnemy(s, id);
    if (asKill) killEnemy(s, target);
    else s.enemies = s.enemies.filter((x) => x.id !== id);
  });
}

export function gmAddEnemy(state: GameState, kind: EnemyKind, pos: Pos, element?: Element): GameState {
  if (!canPlaceAt(state, pos)) throw new RuleError('That tile is taken.');
  let label = '';
  const s = gmEdit(state, '', (draft) => {
    label = enemyName(spawnEnemy(draft, kind, pos, element));
  });
  s.log[s.log.length - 1].text = `GM: placed ${label} on ${coordLabel(pos)}`;
  return s;
}
