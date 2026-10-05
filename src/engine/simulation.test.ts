import { describe, expect, it } from 'vitest';
import {
  advanceRoom,
  comboFromCards,
  castError,
  coordLabel,
  createGame,
  endPlayerTurn,
  gmRemoveEnemy,
  parseCoord,
  planEnemyTurn,
  playerCast,
  playerMove,
  playerReroll,
  playerUnstableFire,
  previewIntents,
  spawnEnemy,
  type Card,
  type CardState,
  type Element,
  type EnemyKind,
  type FragmentKind,
  type GameState,
} from './index';

interface Setup {
  size?: number;
  player: string;
  enemies?: { kind: EnemyKind; at: string; element?: Element }[];
  exit?: { at: string; locked: boolean };
  /** Cards to put in hand, in order. Everything else from the starting deck stays in the deck. */
  hand?: FragmentKind[];
  seed?: number;
}

/** A Simulation-mode game on a custom board with a chosen hand. */
function simBoard(setup: Setup): GameState {
  const s = createGame(setup.seed ?? 42, 'simulation');
  const size = setup.size ?? 6;
  s.room = {
    id: 'test',
    name: 'Test',
    blurb: '',
    width: size,
    height: size,
    pillars: [],
    exit: setup.exit ? { pos: parseCoord(setup.exit.at), locked: setup.exit.locked } : null,
  };
  s.enemies = [];
  s.typeCounters = {};
  s.nextDeployId = 1;
  s.player.pos = parseCoord(setup.player);
  for (const e of setup.enemies ?? []) spawnEnemy(s, e.kind, parseCoord(e.at), e.element);
  if (setup.hand) {
    const cards = s.cards!;
    const all = [...cards.hand, ...cards.deck];
    cards.hand = [];
    for (const kind of setup.hand) {
      const i = all.findIndex((c) => c.kind === kind);
      cards.hand.push(i >= 0 ? all.splice(i, 1)[0] : { id: cards.nextId++, kind });
    }
    cards.deck = all;
  }
  return s;
}

const kinds = (cards: Card[]) => cards.map((c) => c.kind).sort();
const total = (c: CardState) => c.hand.length + c.deck.length + c.discard.length;
const runEnemyTurn = (s: GameState) => planEnemyTurn(endPlayerTurn(s)).final;
const fire = (n: 1 | 2, shape: 'beam' | 'cross', shapeCount: 1 | 2 = 1) => ({ element: 'fire' as const, elementCount: n, shape, shapeCount });

describe('simulation setup', () => {
  it('shuffles the 11-card starting deck and deals a hand of 5', () => {
    const s = createGame(3, 'simulation');
    expect(s.mode).toBe('simulation');
    expect(s.cards!.hand).toHaveLength(5);
    expect(s.cards!.deck).toHaveLength(6);
    expect(kinds([...s.cards!.hand, ...s.cards!.deck])).toEqual(
      ['beam', 'beam', 'cross', 'cross', 'fire', 'fire', 'fire', 'rock', 'rock', 'water', 'water'].sort(),
    );
  });

  it('tracker games keep no cards and still ask the table to deal', () => {
    const s = createGame(3);
    expect(s.mode).toBe('tracker');
    expect(s.cards).toBeUndefined();
    expect(s.log.some((l) => l.paper && l.text.includes('draw a hand of 5'))).toBe(true);
  });

  it('the same seed deals the same hand', () => {
    expect(createGame(9, 'simulation').cards!.hand).toEqual(createGame(9, 'simulation').cards!.hand);
  });
});

describe('crafting from the hand', () => {
  const card = (kind: FragmentKind, id = 0): Card => ({ id, kind });

  it('reads combos the way the kit does', () => {
    expect(comboFromCards([card('fire'), card('beam')])).toEqual({ kind: 'spell', spec: fire(1, 'beam') });
    expect(comboFromCards([card('cross'), card('water'), card('cross')])).toMatchObject({
      kind: 'spell',
      spec: { element: 'water', elementCount: 1, shape: 'cross', shapeCount: 2 },
    });
    expect(comboFromCards([card('fire'), card('fire'), card('fire')])).toEqual({ kind: 'unstable' });
    expect(comboFromCards([card('fire'), card('water'), card('beam')]).kind).toBe('invalid');
    expect(comboFromCards([card('fire'), card('fire')]).kind).toBe('invalid');
    expect(comboFromCards([card('beam'), card('cross')]).kind).toBe('invalid');
    expect(comboFromCards([card('fire')]).kind).toBe('invalid');
  });

  it('casting moves the fragments used from the hand to the discard pile', () => {
    let s = simBoard({ player: 'a1', hand: ['fire', 'beam', 'water', 'rock', 'cross'], enemies: [{ kind: 'brute', at: 'a3' }] });
    s = playerCast(s, fire(1, 'beam'), 'up');
    expect(kinds(s.cards!.hand)).toEqual(['cross', 'rock', 'water']);
    expect(kinds(s.cards!.discard)).toEqual(['beam', 'fire']);
    expect(s.enemies[0].hp).toBe(5);
    expect(s.log.some((l) => l.paper)).toBe(false);
  });

  it('casts with the exact cards picked, and refuses cards that make a different spell', () => {
    const s = simBoard({ player: 'a1', hand: ['fire', 'fire', 'beam', 'cross', 'rock'] });
    s.player.mana = 6;
    const [f1, f2, beam, cross] = s.cards!.hand;
    expect(castError(s, fire(2, 'beam'), 'up', [f1.id, f2.id, beam.id])).toBeNull();
    expect(castError(s, fire(1, 'beam'), 'up', [f1.id, cross.id])).toMatch(/different spell/);
    const after = playerCast(s, fire(1, 'cross'), null, [f2.id, cross.id]);
    expect(after.cards!.discard.map((c) => c.id).sort()).toEqual([f2.id, cross.id].sort());
  });

  it("can't cast what the hand doesn't hold", () => {
    const s = simBoard({ player: 'a1', hand: ['fire', 'water', 'rock', 'cross', 'cross'] });
    expect(castError(s, fire(1, 'beam'), 'up')).toMatch(/hand can't make/);
    expect(() => playerCast(s, fire(1, 'beam'), 'up')).toThrow();
  });

  it('Unstable Fire needs three Fire cards in hand and discards them', () => {
    const s = simBoard({ player: 'c3', hand: ['fire', 'fire', 'beam', 'water', 'rock'] });
    s.player.mana = 6;
    expect(() => playerUnstableFire(s, 6)).toThrow(/three Fire/);
    const t = simBoard({ player: 'c3', hand: ['fire', 'fire', 'fire', 'water', 'rock'] });
    t.player.mana = 6;
    const after = playerUnstableFire(t, 6);
    expect(kinds(after.cards!.hand)).toEqual(['rock', 'water']);
    expect(kinds(after.cards!.discard)).toEqual(['fire', 'fire', 'fire']);
  });
});

describe('drawing', () => {
  it('reroll swaps only the picked cards: discard them, draw that many', () => {
    const s = simBoard({ player: 'a1', hand: ['fire', 'beam', 'water', 'rock', 'cross'] });
    const [f, b, w, r, c] = s.cards!.hand;
    const deckBefore = s.cards!.deck.length;
    const after = playerReroll(s, [f.id, b.id]);
    expect(kinds(after.cards!.discard)).toEqual(['beam', 'fire']);
    expect(after.cards!.hand).toHaveLength(5);
    expect(after.cards!.hand.slice(0, 3).map((x) => x.id)).toEqual([w.id, r.id, c.id]);
    expect(after.cards!.deck).toHaveLength(deckBefore - 2);
    expect(after.actionsLeft).toBe(2);
  });

  it('reroll needs at least one card from your hand', () => {
    const s = simBoard({ player: 'a1', hand: ['fire', 'beam'] });
    expect(() => playerReroll(s)).toThrow(/Pick the cards/);
    expect(() => playerReroll(s, [999])).toThrow(/not in your hand/);
  });

  it('in tracker mode reroll is a table instruction', () => {
    const s = createGame(3);
    const after = playerReroll(s);
    expect(after.log.some((l) => l.paper && l.text.includes('draw that many'))).toBe(true);
    expect(after.actionsLeft).toBe(2);
  });

  it('the start of your turn draws back up to 5', () => {
    let s = simBoard({ player: 'a1', hand: ['fire', 'beam', 'water', 'rock', 'cross'] });
    s = playerCast(s, fire(1, 'beam'), 'up');
    expect(s.cards!.hand).toHaveLength(3);
    s = runEnemyTurn(s);
    expect(s.phase).toBe('player');
    expect(s.cards!.hand).toHaveLength(5);
    expect(total(s.cards!)).toBe(11);
  });

  it('shuffles the discard pile into a new deck when the deck runs out', () => {
    const s = simBoard({ player: 'a1', hand: ['fire', 'beam', 'water'] });
    const cards = s.cards!;
    cards.discard = cards.deck.splice(0, 7);
    expect(cards.deck).toHaveLength(1);
    // Discard 3, draw 3: one from the deck, then the discard pile (the rerolled cards included) becomes the deck.
    const after = playerReroll(s, cards.hand.map((c) => c.id));
    expect(after.cards!.hand).toHaveLength(3);
    expect(after.cards!.discard).toHaveLength(0);
    expect(total(after.cards!)).toBe(11);
    expect(after.log.some((l) => l.text.includes('discard pile is shuffled into a new deck'))).toBe(true);
  });
});

describe('loot and rooms', () => {
  it('a kill puts the loot card straight into the discard pile', () => {
    const s = simBoard({ player: 'a1', hand: ['rock', 'cross'], enemies: [{ kind: 'brute', at: 'a2' }] });
    s.enemies[0].hp = 1;
    const after = playerCast(s, { element: 'rock', elementCount: 1, shape: 'cross', shapeCount: 1 }, null);
    const loot = after.cards!.discard.find((c) => c.loot === 'brute');
    expect(loot?.kind).toBe('rock');
    expect(after.pendingLoot[0].discardCards).toEqual([loot]);
    expect(total(after.cards!)).toBe(12);
  });

  it('a new room shuffles hand, deck and discard back together and deals 5', () => {
    let s = simBoard({ player: 'e6', hand: ['fire', 'beam', 'water'], exit: { at: 'f6', locked: false } });
    s.cards!.discard.push({ id: 99, kind: 'rock', loot: 'brute' });
    s = playerMove(s, 'right');
    s = advanceRoom(s);
    expect(s.room.name).toBe('The Scriptorium');
    expect(s.cards!.hand).toHaveLength(5);
    expect(s.cards!.discard).toHaveLength(0);
    expect(total(s.cards!)).toBe(12);
  });
});

describe('page scraps and erasure', () => {
  const bossRoom = (hand: FragmentKind[], scrapAt = 'a2') =>
    simBoard({
      size: 8,
      player: 'a1',
      hand,
      enemies: [
        { kind: 'ward', at: 'h8', element: 'fire' },
        { kind: 'scrap', at: scrapAt },
        { kind: 'redactor', at: 'c3' },
      ],
    });

  it('a scrap steals a real card from the hand, and killing it gives the card back', () => {
    const s = bossRoom(['fire', 'beam', 'water', 'rock', 'cross']);
    const plan = planEnemyTurn(endPlayerTurn(s));
    // The hand refilled at the start of the next turn, so look at the step right after the steal.
    const stealStep = plan.steps.find((st) => st.entries.some((l) => l.text.includes('steals your')))!;
    expect(stealStep.state.cards!.hand).toHaveLength(4);
    const scrap = plan.final.enemies.find((e) => e.kind === 'scrap')!;
    expect(scrap.carried).toHaveLength(1);
    expect(scrap.stolen).toBe(1);
    expect(plan.final.enemies.find((e) => e.kind === 'redactor')!.marks).toBe(1);

    const stolen = scrap.carried![0];
    const after = gmRemoveEnemy(plan.final, scrap.id, true);
    expect(after.cards!.hand.map((c) => c.id)).toContain(stolen.id);
    expect(after.pendingLoot[0].handCards).toEqual([stolen]);
  });

  it('with an empty hand there is nothing to steal', () => {
    const s = bossRoom([]);
    s.cards!.deck = [];
    const plan = planEnemyTurn(endPlayerTurn(s));
    expect(plan.intents['7a']).toEqual([{ kind: 'wait', note: 'finds your hand empty: nothing to steal.' }]);
    expect(plan.final.enemies.find((e) => e.kind === 'scrap')!.carried).toEqual([]);
  });

  it('ending your turn in the Erasure zone erases a hand card for good', () => {
    const s = simBoard({ size: 8, player: 'a1', hand: ['fire', 'beam', 'water'], enemies: [{ kind: 'redactor', at: 'h8' }] });
    s.erasureZone = [parseCoord('a1')];
    const after = endPlayerTurn(s);
    expect(after.cards!.hand).toHaveLength(2);
    expect(after.cards!.erased).toHaveLength(1);
    expect(after.erasureZone).toEqual([]);
  });

  it('with an empty hand the Erasure zone takes the top card of the deck', () => {
    const s = simBoard({ size: 8, player: 'a1', hand: [], enemies: [{ kind: 'redactor', at: 'h8' }] });
    s.erasureZone = [parseCoord('a1')];
    const top = s.cards!.deck[s.cards!.deck.length - 1];
    const after = endPlayerTurn(s);
    expect(after.cards!.erased).toEqual([top]);
  });

  it('you lose when hand, deck and discard no longer hold an element and a shape', () => {
    const s = simBoard({ size: 8, player: 'a1', hand: ['fire', 'beam'], enemies: [{ kind: 'redactor', at: 'h8' }] });
    s.cards!.deck = [];
    s.cards!.discard = [];
    s.erasureZone = [parseCoord('a1')];
    const after = endPlayerTurn(s);
    expect(after.phase).toBe('lost');
    expect(after.lostReason).toBe('grimoire');
  });

  it('three Fire cards are still a usable grimoire', () => {
    const s = simBoard({ size: 8, player: 'a1', hand: ['fire', 'fire', 'fire', 'beam'], enemies: [{ kind: 'redactor', at: 'h8' }] });
    s.cards!.deck = [];
    s.erasureZone = [parseCoord('a1')];
    // Whatever is erased, three Fires (or an element and a shape) remain.
    expect(endPlayerTurn(s).phase).not.toBe('lost');
  });
});

describe('simulation determinism', () => {
  it('the intent preview matches the real enemy turn, cards included', () => {
    const s = createGame(11, 'simulation');
    expect(previewIntents(s)).toEqual(planEnemyTurn(endPlayerTurn(s)).intents);
    const a = runEnemyTurn(s);
    const b = runEnemyTurn(s);
    expect(a.cards).toEqual(b.cards);
    expect(a.enemies.map((e) => coordLabel(e.pos))).toEqual(b.enemies.map((e) => coordLabel(e.pos)));
  });
});
