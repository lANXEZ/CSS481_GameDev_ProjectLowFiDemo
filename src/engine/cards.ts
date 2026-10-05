import { RULES } from './data';
import { random } from './rng';
import type { Card, CardState, Element, EnemyKind, FragmentKind, GameState, SpellSpec } from './types';

/**
 * Fragment cards for Simulation mode: the deck, the hand and the discard pile.
 * Pure helpers (no logging); the rules modules decide what to say about each move.
 */

/** The 11-card starting deck (kit p.6–7): Fire ×3, Water ×2, Rock ×2, Beam ×2, Cross ×2. */
export const STARTING_DECK: FragmentKind[] = ['fire', 'fire', 'fire', 'water', 'water', 'rock', 'rock', 'beam', 'beam', 'cross', 'cross'];

/** The fragment card each enemy drops (kit p.8). */
export const LOOT_FRAGMENT: Partial<Record<EnemyKind, FragmentKind>> = {
  rat: 'fire',
  archer: 'beam',
  brute: 'rock',
  leech: 'water',
};

export const ELEMENTS: Element[] = ['fire', 'water', 'rock'];

export function isElementKind(kind: FragmentKind): kind is Element {
  return (ELEMENTS as string[]).includes(kind);
}

export function fragmentName(kind: FragmentKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/** "Fire", "Fire and Beam", "Fire, Fire and Beam". */
export function cardsLabel(cards: Card[]): string {
  const names = cards.map((c) => fragmentName(c.kind));
  if (names.length <= 1) return names[0] ?? 'nothing';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function newCardState(): CardState {
  return {
    deck: STARTING_DECK.map((kind, i) => ({ id: i + 1, kind })),
    hand: [],
    discard: [],
    erased: [],
    nextId: STARTING_DECK.length + 1,
  };
}

export function newLootCard(cards: CardState, kind: FragmentKind, loot: EnemyKind): Card {
  return { id: cards.nextId++, kind, loot };
}

/** Seeded Fisher–Yates, so undo/redo and the intent preview see the same order. */
export function shuffleInPlace(state: GameState, items: Card[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

export interface DrawResult {
  drawn: Card[];
  /** The discard pile was shuffled into a new deck along the way. */
  reshuffled: boolean;
}

/** Draw up to `n` cards. When the deck runs out, the discard pile is shuffled into a new deck. */
export function drawCards(state: GameState, n: number): DrawResult {
  const cards = state.cards!;
  const drawn: Card[] = [];
  let reshuffled = false;
  for (let i = 0; i < n; i++) {
    if (cards.deck.length === 0) {
      if (cards.discard.length === 0) break;
      cards.deck = cards.discard;
      cards.discard = [];
      shuffleInPlace(state, cards.deck);
      reshuffled = true;
    }
    const card = cards.deck.pop()!;
    cards.hand.push(card);
    drawn.push(card);
  }
  return { drawn, reshuffled };
}

/** Start of the player's turn: draw back up to the hand size. */
export function refillHand(state: GameState): DrawResult {
  return drawCards(state, Math.max(0, RULES.handSize - state.cards!.hand.length));
}

/** New room: hand, deck and discard all go back into one shuffled deck, then draw a fresh hand. */
export function freshShuffle(state: GameState): DrawResult {
  const cards = state.cards!;
  cards.deck = [...cards.deck, ...cards.hand, ...cards.discard];
  cards.hand = [];
  cards.discard = [];
  shuffleInPlace(state, cards.deck);
  return drawCards(state, RULES.handSize);
}

export type CardCombo = { kind: 'spell'; spec: SpellSpec } | { kind: 'unstable' } | { kind: 'invalid'; reason: string };

/** What a set of fragment cards casts, following "Crafting & Spells" (kit p.3). */
export function comboFromCards(cards: Card[]): CardCombo {
  if (cards.length < 2) return { kind: 'invalid', reason: 'Pick 2 or 3 fragments: one element and one shape.' };
  if (cards.length > 3) return { kind: 'invalid', reason: 'A cast uses at most 3 fragments.' };
  const elements = cards.filter((c) => isElementKind(c.kind));
  const shapes = cards.filter((c) => !isElementKind(c.kind));
  if (shapes.length === 0) {
    if (cards.length === 3 && elements.every((c) => c.kind === 'fire')) return { kind: 'unstable' };
    return { kind: 'invalid', reason: 'Add a shape (Beam or Cross).' };
  }
  if (elements.length === 0) return { kind: 'invalid', reason: 'Add an element (Fire, Water or Rock).' };
  if (new Set(elements.map((c) => c.kind)).size > 1 || new Set(shapes.map((c) => c.kind)).size > 1) {
    return { kind: 'invalid', reason: 'No mixing: one element and one shape (either can be doubled).' };
  }
  return {
    kind: 'spell',
    spec: {
      element: elements[0].kind as Element,
      elementCount: elements.length as 1 | 2,
      shape: shapes[0].kind as SpellSpec['shape'],
      shapeCount: shapes.length as 1 | 2,
    },
  };
}

/** Cards from the hand that make up this spell, or null if the hand can't pay for it. */
export function cardsForSpec(hand: Card[], spec: SpellSpec): Card[] | null {
  const take = (kind: FragmentKind, n: number) => hand.filter((c) => c.kind === kind).slice(0, n);
  const el = take(spec.element, spec.elementCount);
  const sh = take(spec.shape, spec.shapeCount);
  return el.length === spec.elementCount && sh.length === spec.shapeCount ? [...el, ...sh] : null;
}

/** Take these cards out of the hand (in hand order). */
export function takeFromHand(cards: CardState, ids: number[]): Card[] {
  const taken = cards.hand.filter((c) => ids.includes(c.id));
  cards.hand = cards.hand.filter((c) => !ids.includes(c.id));
  return taken;
}

/**
 * Losing condition (kit p.2): the hand, deck and discard pile together no longer hold an element and a shape
 * (or three Fire cards for Unstable Fire). Cards under Page Scraps and erased cards don't count.
 */
export function grimoireBroken(cards: CardState): boolean {
  const all = [...cards.hand, ...cards.deck, ...cards.discard];
  const hasElement = all.some((c) => isElementKind(c.kind));
  const hasShape = all.some((c) => !isElementKind(c.kind));
  const fires = all.filter((c) => c.kind === 'fire').length;
  return !(hasElement && hasShape) && fires < 3;
}
