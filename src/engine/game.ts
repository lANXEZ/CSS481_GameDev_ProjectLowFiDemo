import { ENEMY_DEFS, ROOMS, RULES, coordLabel, parseCoord } from './data';
import {
  RuleError,
  burnTickPlayer,
  cloneState,
  damageEnemy,
  enemyName,
  immunityReason,
  log,
  playerOnExit,
} from './core';
import { DIR_VECTORS, addPos, enemyAt, inBounds, isPillar, samePos } from './grid';
import {
  ELEMENT_EFFECT,
  enemiesOnTiles,
  fragmentCount,
  spellCost,
  spellDamage,
  spellError,
  spellName,
  spellTiles,
  unstableTiles,
} from './spells';
import type { Dir, Element, Enemy, EnemyKind, GameState, Pos, SpellSpec } from './types';

const noStatus = () => ({ burn: 0, root: 0, stun: 0 });

export function createGame(seed: number = Date.now()): GameState {
  const state: GameState = {
    roomIndex: 0,
    room: { id: '', name: '', blurb: '', width: 0, height: 0, pillars: [], exit: null },
    player: {
      pos: { x: 0, y: 0 },
      hp: RULES.playerMaxHp,
      maxHp: RULES.playerMaxHp,
      mana: RULES.roomStartMana,
      maxMana: RULES.playerMaxMana,
      potions: 0,
      status: noStatus(),
      unstableUsed: false,
    },
    enemies: [],
    turn: 1,
    phase: 'player',
    actionsLeft: RULES.actionsPerTurn,
    playerActed: false,
    redactionZone: [],
    typeCounters: {},
    nextDeployId: 1,
    rng: seed | 0,
    log: [],
    nextLogId: 1,
  };
  log(state, 'system', 'New game. Shuffle the 11 fragment cards into a deck and draw a hand of 5.', true);
  loadRoom(state, 0);
  return state;
}

/** Set up a room in place. HP and potions carry over; mana resets. */
export function loadRoom(state: GameState, index: number): void {
  const def = ROOMS[index];
  state.roomIndex = index;
  state.room = {
    id: def.id,
    name: def.name,
    blurb: def.blurb,
    width: def.width,
    height: def.height,
    pillars: def.pillars.map(parseCoord),
    exit: def.exit ? { pos: parseCoord(def.exit.at), locked: def.exit.locked } : null,
  };
  state.enemies = [];
  state.typeCounters = {};
  state.nextDeployId = 1;
  state.player.pos = parseCoord(def.start);
  state.player.mana = RULES.roomStartMana;
  state.player.status = noStatus();
  state.player.unstableUsed = false;
  state.turn = 1;
  state.phase = 'player';
  state.actionsLeft = RULES.actionsPerTurn;
  state.playerActed = false;
  state.redactionZone = [];
  for (const spawn of def.enemies) spawnEnemy(state, spawn.kind, parseCoord(spawn.at), spawn.element);

  log(state, 'system', `Room ${index + 1}: ${def.name}. Mana resets to ${RULES.roomStartMana}.`);
  log(state, 'system', `Set up the board for ${def.name}: YOU on ${def.start}, ${state.enemies.map((e) => `${e.id}@${coordLabel(e.pos)}`).join(', ')}.`, true);
  log(state, 'player', 'Your turn 1.');
}

export function spawnEnemy(state: GameState, kind: EnemyKind, pos: Pos, element?: Element): Enemy {
  const def = ENEMY_DEFS[kind];
  const n = state.typeCounters[def.typeNum] ?? 0;
  state.typeCounters[def.typeNum] = n + 1;
  const enemy: Enemy = {
    id: `${def.typeNum}${String.fromCharCode(97 + (n % 26))}${n >= 26 ? Math.floor(n / 26) : ''}`,
    kind,
    typeNum: def.typeNum,
    deployId: state.nextDeployId++,
    pos: { ...pos },
    hp: def.hp,
    maxHp: def.hp,
    status: noStatus(),
  };
  if (element) enemy.element = element;
  if (kind === 'warden') {
    enemy.turnCount = 0;
    enemy.charge = false;
    enemy.markedLine = null;
  }
  if (kind === 'redactor') {
    enemy.marks = 0;
    enemy.mode = 'guarded';
  }
  if (kind === 'scrap') enemy.stolen = 0;
  state.enemies.push(enemy);
  return enemy;
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------

function assertPlayerAction(state: GameState): void {
  if (state.phase !== 'player') throw new RuleError('It is not the player turn.');
  if (state.actionsLeft <= 0) throw new RuleError('No actions left this turn.');
}

/** Shared wrapper: Burn ticks right before the action, then the action resolves and uses 1 action. */
function playerAction(state: GameState, body: (s: GameState) => void): GameState {
  const s = cloneState(state);
  burnTickPlayer(s);
  if (s.phase === 'lost') return s;
  body(s);
  s.playerActed = true;
  s.actionsLeft -= 1;
  if (s.phase === 'player' && s.actionsLeft <= 0) endTurnInPlace(s);
  return s;
}

export function moveTarget(state: GameState, dir: Dir): Pos | null {
  const to = addPos(state.player.pos, DIR_VECTORS[dir]);
  if (!inBounds(state, to) || isPillar(state, to) || enemyAt(state, to)) return null;
  const exit = state.room.exit;
  if (exit && exit.locked && samePos(exit.pos, to)) return null;
  return to;
}

export function playerMove(state: GameState, dir: Dir): GameState {
  assertPlayerAction(state);
  const to = moveTarget(state, dir);
  if (!to) throw new RuleError('That tile is blocked.');
  return playerAction(state, (s) => {
    const from = s.player.pos;
    s.player.pos = to;
    log(s, 'player', `Move ${coordLabel(from)} → ${coordLabel(to)}.`);
    if (playerOnExit(s)) {
      s.phase = 'roomExit';
      log(s, 'system', 'YOU reach the exit.');
    }
  });
}

export function castError(state: GameState, spec: SpellSpec, dir: Dir | null): string | null {
  const invalid = spellError(spec);
  if (invalid) return invalid;
  if (state.player.mana < spellCost(spec)) return `Needs ${spellCost(spec)} mana (you have ${state.player.mana}).`;
  if (spec.shape === 'beam' && !dir) return 'Pick a direction for the Beam.';
  return null;
}

function applyStatus(s: GameState, e: Enemy, element: Element): void {
  const effect = ELEMENT_EFFECT[element].status;
  if (effect === 'burn') e.status.burn = Math.max(e.status.burn, RULES.burnTicks);
  if (effect === 'root') e.status.root = Math.max(e.status.root, RULES.rootTurns);
  if (effect === 'stun') e.status.stun = Math.max(e.status.stun, RULES.stunTurns);
  log(s, 'player', `${enemyName(e)} is ${effect === 'burn' ? 'burning' : effect === 'root' ? 'rooted' : 'stunned'}.`);
}

export function playerCast(state: GameState, spec: SpellSpec, dir: Dir | null): GameState {
  assertPlayerAction(state);
  const err = castError(state, spec, dir);
  if (err) throw new RuleError(err);
  return playerAction(state, (s) => {
    const cost = spellCost(spec);
    s.player.mana -= cost;
    const tiles = spellTiles(s, spec, dir);
    log(s, 'player', `Cast ${spellName(spec)}${dir ? ` ${dir}` : ''} for ${cost} mana (mana ${s.player.mana + cost} → ${s.player.mana}).`);
    log(s, 'player', `Discard the ${fragmentCount(spec)} fragments you used.`, true);
    const targets = enemiesOnTiles(s, tiles);
    if (targets.length === 0) log(s, 'player', 'The spell hits nothing.');
    const dmg = spellDamage(spec);
    for (const e of targets) {
      const immune = immunityReason(s, e, spec.element);
      if (immune) {
        log(s, 'player', `${enemyName(e)} is immune (${immune}).`);
        continue;
      }
      const died = damageEnemy(s, e, dmg, spellName(spec));
      if (!died) applyStatus(s, e, spec.element);
    }
  });
}

export function unstableError(state: GameState): string | null {
  if (state.player.unstableUsed) return 'Unstable Fire was already used in this room.';
  if (state.player.mana < RULES.unstableCost) return `Needs ${RULES.unstableCost} mana (you have ${state.player.mana}).`;
  return null;
}

/** Fire ×3 with no shape. `damage` comes from the spin wheel (6 or 7). */
export function playerUnstableFire(state: GameState, damage: number): GameState {
  assertPlayerAction(state);
  const err = unstableError(state);
  if (err) throw new RuleError(err);
  return playerAction(state, (s) => {
    s.player.mana -= RULES.unstableCost;
    s.player.unstableUsed = true;
    log(s, 'player', `Cast UNSTABLE FIRE (Fire ×3) for ${RULES.unstableCost} mana: the wheel lands on ${damage} damage.`);
    log(s, 'player', 'Discard the 3 Fire fragments you used.', true);
    for (const e of enemiesOnTiles(s, unstableTiles(s))) {
      const immune = immunityReason(s, e, 'fire');
      if (immune) {
        log(s, 'player', `${enemyName(e)} is immune (${immune}).`);
        continue;
      }
      damageEnemy(s, e, damage, 'Unstable Fire');
    }
    s.player.status.burn = Math.max(s.player.status.burn, RULES.unstableBurn);
    log(s, 'player', `YOU take ${RULES.unstableBurn} stacks of Burn.`);
  });
}

export function playerMeditate(state: GameState): GameState {
  assertPlayerAction(state);
  return playerAction(state, (s) => {
    const before = s.player.mana;
    s.player.mana = Math.min(s.player.maxMana, before + RULES.meditateMana);
    log(s, 'player', `Meditate: mana ${before} → ${s.player.mana}.`);
  });
}

export function playerDrinkPotion(state: GameState): GameState {
  assertPlayerAction(state);
  if (state.player.potions <= 0) throw new RuleError('You have no potion.');
  return playerAction(state, (s) => {
    const before = s.player.hp;
    s.player.hp = Math.min(s.player.maxHp, before + RULES.potionHeal);
    s.player.potions -= 1;
    log(s, 'player', `Drink the Heal Potion: HP ${before} → ${s.player.hp}.`);
    log(s, 'player', 'Discard the Heal Potion card.', true);
  });
}

export function playerReroll(state: GameState): GameState {
  assertPlayerAction(state);
  return playerAction(state, (s) => {
    log(s, 'player', `Reroll: discard your whole hand and draw ${RULES.handSize} fresh cards.`, true);
  });
}

export function endPlayerTurn(state: GameState): GameState {
  if (state.phase !== 'player') throw new RuleError('It is not the player turn.');
  const s = cloneState(state);
  endTurnInPlace(s);
  return s;
}

function endTurnInPlace(s: GameState): void {
  if (s.actionsLeft > 0) log(s, 'player', `End turn (${s.actionsLeft} action${s.actionsLeft === 1 ? '' : 's'} unused).`);
  if (s.redactionZone.length > 0) {
    if (s.redactionZone.some((p) => samePos(p, s.player.pos))) {
      log(s, 'system', 'YOU ended your turn inside the redaction zone: permanently remove one fragment from your hand (out of the game).', true);
    }
    s.redactionZone = [];
    log(s, 'system', 'The redaction zone fades.');
  }
  const st = s.player.status;
  if (!s.playerActed && st.burn > 0) {
    st.burn = 0;
    log(s, 'player', 'YOU took no action this turn: Burn wears off.');
  }
  st.root = Math.max(0, st.root - 1);
  st.stun = Math.max(0, st.stun - 1);
  s.phase = 'enemy';
  log(s, 'enemy', `Enemy turn ${s.turn}.`);
}

/** After stepping on the exit: move on to the next room, forfeiting drops of enemies still alive. */
export function advanceRoom(state: GameState): GameState {
  if (state.phase !== 'roomExit') throw new RuleError('The player is not on the exit.');
  const s = cloneState(state);
  const skipped = s.enemies.filter((e) => ENEMY_DEFS[e.kind].drop);
  if (skipped.length) {
    log(s, 'system', `Left behind: ${skipped.map(enemyName).join(', ')}. Their fragments are forfeited.`);
  }
  if (s.roomIndex + 1 >= ROOMS.length) {
    s.phase = 'won';
    log(s, 'system', 'You escaped the final room!');
    return s;
  }
  loadRoom(s, s.roomIndex + 1);
  return s;
}
