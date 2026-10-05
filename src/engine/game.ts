import {
  cardsForSpec,
  cardsLabel,
  comboFromCards,
  drawCards,
  fragmentName,
  freshShuffle,
  newCardState,
  takeFromHand,
  type DrawResult,
} from './cards';
import { ENEMY_DEFS, ROOMS, RULES, coordLabel, parseCoord } from './data';
import {
  RuleError,
  burnTickPlayer,
  checkGrimoire,
  cloneState,
  damageEnemy,
  enemyName,
  immunityReason,
  log,
  playerOnExit,
  tableLog,
} from './core';
import { random } from './rng';
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
import type { Card, Dir, Element, Enemy, EnemyKind, GameMode, GameState, Pos, SpellSpec } from './types';

const noStatus = () => ({ burn: 0, root: 0, stun: 0 });

export function createGame(seed: number = Date.now(), mode: GameMode = 'tracker'): GameState {
  const state: GameState = {
    mode,
    ...(mode === 'simulation' ? { cards: newCardState() } : {}),
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
    erasureZone: [],
    typeCounters: {},
    nextDeployId: 1,
    rng: seed | 0,
    log: [],
    nextLogId: 1,
    pendingLoot: [],
  };
  tableLog(state, 'system', 'New game. Shuffle the 11 fragment cards into a deck and draw a hand of 5.', 'New game: the 11 fragment cards are your deck.');
  loadRoom(state, 0);
  return state;
}

/** "You draw Fire and Beam." plus a note when the discard pile was reshuffled into the deck. */
export function logDraw(state: GameState, result: DrawResult, lead: string): void {
  if (result.reshuffled) log(state, 'system', 'Your deck ran out: the discard pile is shuffled into a new deck.');
  log(state, 'player', result.drawn.length ? `${lead} ${cardsLabel(result.drawn)}.` : `${lead} nothing: no cards left to draw.`);
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
  state.erasureZone = [];
  for (const spawn of def.enemies) spawnEnemy(state, spawn.kind, parseCoord(spawn.at), spawn.element);

  log(state, 'system', `Room ${index + 1}: ${def.name}. Mana resets to ${RULES.roomStartMana}.`);
  tableLog(state, 'system', `Set up the board for ${def.name}: YOU on ${def.start}, ${state.enemies.map((e) => `${e.id}@${coordLabel(e.pos)}`).join(', ')}.`);
  log(state, 'player', 'Your turn 1.');
  if (state.cards) {
    // Every room starts from a freshly shuffled deck (hand and discard pile included).
    logDraw(state, freshShuffle(state), 'Hand, deck and discard pile are shuffled together. You draw');
  }
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
  if (kind === 'scrap') {
    enemy.stolen = 0;
    if (state.cards) enemy.carried = [];
  }
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

/**
 * Simulation mode: the hand cards a cast uses. With `cardIds` they must be in hand and make exactly this spell;
 * without, matching cards are taken from the hand. Returns an error message instead when that's impossible.
 */
function castCards(state: GameState, spec: SpellSpec, cardIds?: number[]): Card[] | string {
  const hand = state.cards!.hand;
  if (!cardIds) return cardsForSpec(hand, spec) ?? `Your hand can't make ${spellName(spec)}.`;
  const picked = hand.filter((c) => cardIds.includes(c.id));
  if (picked.length !== cardIds.length) return 'Those fragments are not in your hand.';
  const combo = comboFromCards(picked);
  if (combo.kind !== 'spell') return combo.kind === 'invalid' ? combo.reason : 'Those fragments make Unstable Fire.';
  const same = (a: SpellSpec, b: SpellSpec) =>
    a.element === b.element && a.elementCount === b.elementCount && a.shape === b.shape && a.shapeCount === b.shapeCount;
  return same(combo.spec, spec) ? picked : 'Those fragments make a different spell.';
}

export function castError(state: GameState, spec: SpellSpec, dir: Dir | null, cardIds?: number[]): string | null {
  const invalid = spellError(spec);
  if (invalid) return invalid;
  if (state.cards) {
    const cards = castCards(state, spec, cardIds);
    if (typeof cards === 'string') return cards;
  }
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

/** `cardIds` (Simulation mode) picks the exact hand cards to spend; otherwise matching cards are used. */
export function playerCast(state: GameState, spec: SpellSpec, dir: Dir | null, cardIds?: number[]): GameState {
  assertPlayerAction(state);
  const err = castError(state, spec, dir, cardIds);
  if (err) throw new RuleError(err);
  return playerAction(state, (s) => {
    const cost = spellCost(spec);
    s.player.mana -= cost;
    const tiles = spellTiles(s, spec, dir);
    log(s, 'player', `Cast ${spellName(spec)}${dir ? ` ${dir}` : ''} for ${cost} mana (mana ${s.player.mana + cost} → ${s.player.mana}).`);
    if (s.cards) {
      const used = castCards(s, spec, cardIds) as Card[];
      s.cards.discard.push(...takeFromHand(s.cards, used.map((c) => c.id)));
    } else {
      log(s, 'player', `Discard the ${fragmentCount(spec)} fragments you used.`, true);
    }
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
  if (state.cards && state.cards.hand.filter((c) => c.kind === 'fire').length < 3) return 'Needs three Fire fragments in your hand.';
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
    if (s.cards) {
      const fires = s.cards.hand.filter((c) => c.kind === 'fire').slice(0, 3);
      s.cards.discard.push(...takeFromHand(s.cards, fires.map((c) => c.id)));
    } else {
      log(s, 'player', 'Discard the 3 Fire fragments you used.', true);
    }
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
    s.player.hp = s.player.maxHp; // the Max Potion restores full HP
    s.player.potions -= 1;
    log(s, 'player', `Drink the Max Potion: HP ${before} → ${s.player.hp}.`);
    tableLog(s, 'player', 'Discard the Max Potion card.');
  });
}

export function rerollError(state: GameState, cardIds: number[] = []): string | null {
  if (!state.cards) return null;
  if (cardIds.length === 0) return 'Pick the cards in your hand you want to swap.';
  if (!cardIds.every((id) => state.cards!.hand.some((c) => c.id === id))) return 'Those fragments are not in your hand.';
  return null;
}

/**
 * Reroll: discard the chosen cards from your hand, then draw that many from the deck.
 * Simulation mode needs `cardIds`; the tracker leaves the choice to the table.
 */
export function playerReroll(state: GameState, cardIds: number[] = []): GameState {
  assertPlayerAction(state);
  const err = rerollError(state, cardIds);
  if (err) throw new RuleError(err);
  return playerAction(state, (s) => {
    if (!s.cards) {
      log(s, 'player', 'Reroll: discard any of the fragments in your hand and draw that many from the deck.', true);
      return;
    }
    const swapped = takeFromHand(s.cards, cardIds);
    s.cards.discard.push(...swapped);
    log(s, 'player', `Reroll: discard ${cardsLabel(swapped)}.`);
    logDraw(s, drawCards(s, swapped.length), 'You draw');
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
  if (s.erasureZone.length > 0) {
    if (s.erasureZone.some((p) => samePos(p, s.player.pos))) {
      if (s.cards) eraseFragment(s);
      else log(s, 'system', 'YOU ended your turn inside the Erasure zone: permanently remove one fragment from your hand (out of the game).', true);
    }
    s.erasureZone = [];
    log(s, 'system', 'The Erasure zone fades.');
    if (s.phase === 'lost') return;
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

/** Simulation mode: the Erasure zone takes a random hand card out of the game (the top of the deck if the hand is empty). */
function eraseFragment(s: GameState): void {
  const cards = s.cards!;
  const fromHand = cards.hand.length > 0;
  const card = fromHand ? cards.hand.splice(Math.floor(random(s) * cards.hand.length), 1)[0] : cards.deck.pop();
  if (!card) {
    log(s, 'system', 'YOU ended your turn inside the Erasure zone, but there was no fragment left to erase.');
    return;
  }
  cards.erased.push(card);
  log(s, 'system', `YOU ended your turn inside the Erasure zone: your ${fragmentName(card.kind)} fragment is erased from ${fromHand ? 'your hand' : 'the top of your deck'} for good.`);
  checkGrimoire(s);
}

/** After stepping on the exit: move on to the next room, forfeiting drops of enemies still alive. */
export function advanceRoom(state: GameState): GameState {
  if (state.phase !== 'roomExit') throw new RuleError('The player is not on the exit.');
  const s = cloneState(state);
  const skipped = s.enemies.filter((e) => ENEMY_DEFS[e.kind].drop);
  if (skipped.length) {
    log(s, 'system', `Left behind: ${skipped.map(enemyName).join(', ')}. Their fragments are forfeited.`);
  }
  const carried = s.enemies.flatMap((e) => e.carried ?? []);
  if (carried.length) log(s, 'system', `${cardsLabel(carried)} stay${carried.length === 1 ? 's' : ''} behind with the Page Scraps.`);
  if (s.roomIndex + 1 >= ROOMS.length) {
    s.phase = 'won';
    log(s, 'system', 'You escaped the final room!');
    return s;
  }
  loadRoom(s, s.roomIndex + 1);
  return s;
}
