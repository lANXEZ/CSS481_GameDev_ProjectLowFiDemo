import type { Element, EnemyKind, Pos } from './types';

/**
 * Tunable numbers. Playtest balance changes should only need edits here.
 */
export const RULES = {
  playerMaxHp: 20,
  playerMaxMana: 6,
  roomStartMana: 3,
  actionsPerTurn: 3,
  meditateMana: 3,
  handSize: 5,

  burnTicks: 3,
  rootTurns: 1,
  stunTurns: 1,

  elementDamage: { fire: 1, water: 2, rock: 2 } as Record<Element, number>,
  doubledElementBonus: 2,
  beamLength: 2,
  doubledBeamLength: 4,
  crossReach: 1,
  doubledCrossReach: 2,

  unstableCost: 5,
  unstableBurn: 3,
  unstableDamageOptions: [6, 7],

  archerRange: 4,
  archerBackoffSteps: 2,

  wardenShotDamage: 5,
  /** Warden gains a telegraph charge on its turns 2, 4, 6, ... */
  wardenChargeEvery: 2,
  /** Page Wards spawn a Page Scrap after enemy turns 2, 4, 6, ... */
  wardSpawnEvery: 2,

  redactorExplodeDamage: 3,
  redactorActions: { guarded: 2, chaos: 4, spent: 3 },
  /** Marks the Redactor can hold. Page Scraps stop stealing once it's full. */
  redactorMaxMarks: 5,
} as const;

export type AttackKind = 'melee' | 'ranged' | 'drain' | 'telegraph' | 'none' | 'steal' | 'explode';

export interface EnemyDef {
  kind: EnemyKind;
  typeNum: number;
  name: string;
  hp: number;
  actions: number;
  attack: AttackKind;
  damage: number;
  attackText: string;
  notes: string;
  /** What the enemy AI actually does on its turn, in plain words. */
  behavior: string;
  /** Short name shown on the board token. */
  shortName: string;
  drop: string | null;
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  rat: {
    kind: 'rat',
    shortName: 'Rat',
    typeNum: 1,
    name: 'Rat',
    hp: 2,
    actions: 3,
    attack: 'melee',
    damage: 1,
    attackText: '1 dmg to one adjacent tile.',
    notes: 'Moves in packs. Punishes single-target spells.',
    behavior: 'Takes the shortest path to you, then bites once when next to you. Stops for the turn after biting.',
    drop: 'Fire fragment',
  },
  archer: {
    kind: 'archer',
    shortName: 'Archer',
    typeNum: 2,
    name: 'Archer',
    hp: 3,
    actions: 2,
    attack: 'ranged',
    damage: 2,
    attackText: '2 dmg, range 4, straight or diagonal line. Blocked by pillars.',
    notes: 'If you are adjacent when its turn starts, it spends both actions backing off away from you.',
    behavior:
      'Walks until it has a clear straight or diagonal shot within 4 tiles, then shoots once. If you start its turn next to it, it spends both actions backing away from you instead.',
    drop: 'Beam fragment',
  },
  brute: {
    kind: 'brute',
    shortName: 'Brute',
    typeNum: 3,
    name: 'Brute',
    hp: 6,
    actions: 2,
    attack: 'melee',
    damage: 3,
    attackText: '3 dmg to one adjacent tile.',
    notes: 'Slow but tough. A tempo check, not a puzzle.',
    behavior: 'Takes the shortest path to you, then hits once when next to you. Stops for the turn after hitting.',
    drop: 'Rock fragment',
  },
  leech: {
    kind: 'leech',
    shortName: 'Leech',
    typeNum: 4,
    name: 'Leech',
    hp: 4,
    actions: 2,
    attack: 'drain',
    damage: 1,
    attackText: 'Drains 1 mana (not HP) from one adjacent tile.',
    notes: 'Pressures your meditation, not your HP.',
    behavior: 'Takes the shortest path to you, then drains 1 mana once when next to you. Never touches your HP.',
    drop: 'Water fragment',
  },
  warden: {
    kind: 'warden',
    shortName: 'Warden',
    typeNum: 5,
    name: 'Warden',
    hp: 8,
    actions: 2,
    attack: 'telegraph',
    damage: RULES.wardenShotDamage,
    attackText: 'No normal attack. A telegraphed 5 dmg line on charged turns.',
    notes: 'Crowned: holds the room key. Hunts for a clear line to you.',
    behavior:
      'Walks the shortest path to a tile where it can see you (straight or diagonal, pillars block), then holds still. On its 2nd, 4th, 6th… turn, once it sees you it marks a line to the board edge and its turn ends. The first action of its next turn fires 5 dmg down that line. An unused charge is lost at the end of that turn.',
    drop: 'Max Potion (+ unlocks the exit)',
  },
  ward: {
    kind: 'ward',
    shortName: 'Ward',
    typeNum: 6,
    name: 'Page Ward',
    hp: 4,
    /** On summon turns only (2, 4, 6…); it rests with no action in between. */
    actions: 1,
    attack: 'none',
    damage: 0,
    attackText: 'None. Does not attack.',
    notes: 'Immune to spells without its attuned element. Its 1 action, every other enemy turn, summons a Page Scrap.',
    behavior: 'Never moves or attacks. On every other enemy turn (2nd, 4th, 6th…) it spends its 1 action summoning a Page Scrap on a free tile next to it (Burn ticks before it, like any action); in between it rests. While any Ward stands, the Redactor is immune.',
    drop: null,
  },
  scrap: {
    kind: 'scrap',
    shortName: 'Scrap',
    typeNum: 7,
    name: 'Page Scrap',
    hp: 1,
    actions: 4,
    attack: 'steal',
    damage: 0,
    attackText: 'Touch (1 action): steals a fragment from your hand.',
    notes: 'Feeds the Redactor marks while the Wards stand. Blocks you once they fall.',
    behavior:
      'While Wards stand: runs to you and steals a fragment, carries it to the Redactor (any of the 8 tiles around it) to give it 1 mark, then keeps away from you for good. It stops stealing once the Redactor has 5 marks. After all Wards fall, every Scrap runs at you to block your path, without stealing.',
    drop: 'Returns any stolen fragments to your hand',
  },
  redactor: {
    kind: 'redactor',
    shortName: 'Redactor',
    typeNum: 8,
    name: 'The Redactor',
    hp: 18,
    actions: RULES.redactorActions.guarded,
    attack: 'explode',
    damage: RULES.redactorExplodeDamage,
    attackText: 'Explodes for 3 dmg on all 8 tiles around it.',
    notes:
      'Immune while any Page Ward stands (2 actions). Gains marks (max 5) from Page Scraps that bring it a stolen fragment. After all Wards fall: spends 1 mark per turn for Chaos mode (4 actions, each explosion followed by a cooldown action); when out of marks, 3 actions.',
    behavior:
      'Walks toward you and explodes whenever you are in the 8 tiles around it. In Chaos mode the action after an explosion is a cooldown, and each explosion leaves an Erasure zone on the 9 tiles around it (its own tile included): end your next turn there and you lose a fragment for good.',
    drop: null,
  },
};

export interface RoomDef {
  id: string;
  name: string;
  blurb: string;
  width: number;
  height: number;
  pillars: string[];
  start: string;
  exit: { at: string; locked: boolean } | null;
  enemies: { kind: EnemyKind; at: string; element?: Element }[];
}

/** Room layouts transcribed from the demo kit boards (pp. 11–13). Enemies are listed in deploy order. */
export const ROOMS: RoomDef[] = [
  {
    id: 'cistern',
    name: 'The Cistern',
    blurb: 'Teaching room. The exit is open the whole time, but every enemy you skip is a fragment you don’t get. Target: clear it in 3–4 turns.',
    width: 6,
    height: 6,
    pillars: ['d4', 'c3'],
    start: 'a1',
    exit: { at: 'f6', locked: false },
    enemies: [
      { kind: 'rat', at: 'f4' },
      { kind: 'brute', at: 'c5' },
      { kind: 'brute', at: 'e2' },
    ],
  },
  {
    id: 'scriptorium',
    name: 'The Scriptorium',
    blurb: 'The exit is locked until the crowned Warden dies.',
    width: 6,
    height: 6,
    pillars: ['b5', 'e5', 'b2', 'e2'],
    start: 'a1',
    exit: { at: 'f6', locked: true },
    enemies: [
      { kind: 'archer', at: 'a6' },
      { kind: 'archer', at: 'e6' },
      { kind: 'leech', at: 'd2' },
      { kind: 'warden', at: 'c4' },
    ],
  },
  {
    id: 'redactor',
    name: 'The Redactor',
    blurb: 'Defeat the boss to finish the demo. While any Page Ward stands the boss takes no damage, and each Ward only takes damage from its own element.',
    width: 8,
    height: 8,
    pillars: ['b6', 'g6', 'b3', 'g3'],
    start: 'd1',
    exit: null,
    enemies: [
      { kind: 'ward', at: 'c7', element: 'fire' },
      { kind: 'ward', at: 'f7', element: 'water' },
      { kind: 'ward', at: 'd4', element: 'rock' },
      { kind: 'redactor', at: 'e5' },
    ],
  },
];

/** "c5" -> {x: 2, y: 4} */
export function parseCoord(coord: string): Pos {
  const x = coord.charCodeAt(0) - 'a'.charCodeAt(0);
  const y = parseInt(coord.slice(1), 10) - 1;
  return { x, y };
}

/** {x: 2, y: 4} -> "c5" */
export function coordLabel(p: Pos): string {
  return `${String.fromCharCode('a'.charCodeAt(0) + p.x)}${p.y + 1}`;
}
