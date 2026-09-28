import { ENEMY_DEFS, coordLabel } from './data';
import { samePos } from './grid';
import type { Enemy, GameState, LogSide } from './types';

export class RuleError extends Error {}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

export function log(state: GameState, side: LogSide, text: string, paper = false): void {
  state.log.push({
    id: state.nextLogId++,
    roomIndex: state.roomIndex,
    turn: state.turn,
    side,
    text,
    ...(paper ? { paper: true } : {}),
  });
}

export function enemyName(e: Enemy): string {
  const def = ENEMY_DEFS[e.kind];
  const element = e.element ? ` (${e.element})` : '';
  return `${def.name}${element} ${e.id}`;
}

export function wardsStanding(state: GameState): boolean {
  return state.enemies.some((e) => e.kind === 'ward');
}

/** Why a spell of this element has no effect on this enemy, or null if it can be hurt. */
export function immunityReason(state: GameState, e: Enemy, element: string | null): string | null {
  if (e.kind === 'ward' && element !== e.element) return `only ${e.element} hurts it`;
  if (e.kind === 'redactor' && wardsStanding(state)) return 'protected while a Page Ward stands';
  return null;
}

export function damagePlayer(state: GameState, amount: number, source: string): void {
  if (amount <= 0) return;
  const before = state.player.hp;
  state.player.hp = Math.max(0, before - amount);
  log(state, 'enemy', `${source} hits YOU for ${amount} (HP ${before} → ${state.player.hp}).`);
  if (state.player.hp <= 0) {
    state.phase = 'lost';
    log(state, 'system', 'The wizard has fallen. Game over.');
  }
}

/** Deal damage to an enemy, handling death, drops and room-key effects. Returns true if it died. */
export function damageEnemy(state: GameState, e: Enemy, amount: number, source: string, side: LogSide = 'player'): boolean {
  if (amount <= 0) return false;
  const before = e.hp;
  e.hp = Math.max(0, e.hp - amount);
  log(state, side, `${source} hits ${enemyName(e)} for ${amount} (HP ${before} → ${e.hp}).`);
  if (e.hp <= 0) {
    killEnemy(state, e);
    return true;
  }
  return false;
}

export function killEnemy(state: GameState, e: Enemy): void {
  state.enemies = state.enemies.filter((x) => x.id !== e.id);
  log(state, 'system', `${enemyName(e)} is defeated at ${coordLabel(e.pos)}. Remove its token.`, true);

  const notice = (discard: string[], extras: string[] = []) =>
    state.pendingLoot.push({ enemyId: e.id, enemyKind: e.kind, enemyName: enemyName(e), discard, extras });

  switch (e.kind) {
    case 'rat':
    case 'archer':
    case 'brute':
    case 'leech': {
      const card = ENEMY_DEFS[e.kind].drop!;
      log(state, 'system', `Loot: add the ${card} (loot card) to your discard pile.`, true);
      notice([card]);
      break;
    }
    case 'warden': {
      state.player.potions += 1;
      log(state, 'system', 'Loot: the Warden drops the Heal Potion. Take the potion card.', true);
      const extras = ['Take the Heal Potion card. Keep it with you, not in the deck: drinking it costs 1 action.'];
      if (state.room.exit?.locked) {
        state.room.exit.locked = false;
        log(state, 'system', 'The exit is now unlocked.');
        extras.push('The exit is now unlocked.');
      }
      notice([], extras);
      break;
    }
    case 'scrap':
      if (e.stolen) {
        log(state, 'system', `The scrap drops ${e.stolen} stolen fragment(s): put them in your discard pile.`, true);
        notice([`${e.stolen === 1 ? 'The fragment' : `The ${e.stolen} fragments`} it stole`]);
      }
      break;
    case 'redactor':
      state.phase = 'won';
      log(state, 'system', 'The Redactor is destroyed. The grimoire is yours. You win the demo!');
      break;
    case 'ward':
      if (!wardsStanding(state)) {
        log(state, 'system', 'All Page Wards have fallen. The Redactor is no longer protected.');
      }
      break;
  }
}

/** The players confirmed they took the loot on the table: clear the popup queue. */
export function acknowledgeLoot(state: GameState): GameState {
  return { ...state, pendingLoot: [] };
}

/** Burn tick that happens right before a unit takes an action. Returns true if the unit died from it. */
export function burnTickEnemy(state: GameState, e: Enemy): boolean {
  if (e.status.burn <= 0) return false;
  e.status.burn -= 1;
  return damageEnemy(state, e, 1, 'Burn', 'enemy');
}

export function burnTickPlayer(state: GameState): void {
  if (state.player.status.burn <= 0) return;
  state.player.status.burn -= 1;
  const before = state.player.hp;
  state.player.hp = Math.max(0, before - 1);
  log(state, 'player', `Burn hurts YOU for 1 (HP ${before} → ${state.player.hp}).`);
  if (state.player.hp <= 0) {
    state.phase = 'lost';
    log(state, 'system', 'The wizard has fallen. Game over.');
  }
}

export function playerOnExit(state: GameState): boolean {
  return !!state.room.exit && samePos(state.room.exit.pos, state.player.pos);
}
