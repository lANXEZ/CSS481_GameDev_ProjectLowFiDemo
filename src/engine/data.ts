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
  potionHeal: 5,
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

  redactorExplodeDamage: 3,
  redactorActions: { guarded: 2, redacting: 5, spent: 3 },
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
  drop: string | null;
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  rat: {
    kind: 'rat',
    typeNum: 1,
    name: 'Rat',
    hp: 2,
    actions: 3,
    attack: 'melee',
    damage: 1,
    attackText: '1 dmg to one adjacent tile.',
    notes: 'Moves in packs. Punishes single-target spells.',
    drop: 'Fire fragment',
  },
  archer: {
    kind: 'archer',
    typeNum: 2,
    name: 'Archer',
    hp: 3,
    actions: 2,
    attack: 'ranged',
    damage: 2,
    attackText: '2 dmg, range 4, straight or diagonal line. Blocked by pillars.',
    notes: 'If you are adjacent when its turn starts, it spends both actions backing off away from you.',
    drop: 'Beam fragment',
  },
  brute: {
    kind: 'brute',
    typeNum: 3,
    name: 'Brute',
    hp: 6,
    actions: 2,
    attack: 'melee',
    damage: 3,
    attackText: '3 dmg to one adjacent tile.',
    notes: 'Slow but tough. A tempo check, not a puzzle.',
    drop: 'Rock fragment',
  },
  leech: {
    kind: 'leech',
    typeNum: 4,
    name: 'Leech',
    hp: 4,
    actions: 2,
    attack: 'drain',
    damage: 1,
    attackText: 'Drains 1 mana (not HP) from one adjacent tile.',
    notes: 'Pressures your meditation, not your HP.',
    drop: 'Water fragment',
  },
  warden: {
    kind: 'warden',
    typeNum: 5,
    name: 'Warden',
    hp: 8,
    actions: 2,
    attack: 'telegraph',
    damage: RULES.wardenShotDamage,
    attackText:
      'No normal attack. On its 2nd, 4th, 6th… turn it holds a charge: if you are in its line of sight it marks a line to the board edge; its next action fires 5 dmg down that line.',
    notes: 'Crowned: holds the room key. Otherwise runs away from you.',
    drop: 'Heal potion (+ unlocks the exit)',
  },
  ward: {
    kind: 'ward',
    typeNum: 6,
    name: 'Page Ward',
    hp: 4,
    actions: 0,
    attack: 'none',
    damage: 0,
    attackText: 'None. Does not attack.',
    notes: 'Immune to spells without its attuned element. Spawns 1 Page Scrap at the end of every enemy turn.',
    drop: null,
  },
  scrap: {
    kind: 'scrap',
    typeNum: 7,
    name: 'Page Scrap',
    hp: 1,
    actions: 3,
    attack: 'steal',
    damage: 0,
    attackText: 'Touch (1 action): steals a fragment from your hand.',
    notes: 'Flees with its remaining actions once it holds a fragment.',
    drop: 'The fragment it stole',
  },
  redactor: {
    kind: 'redactor',
    typeNum: 8,
    name: 'The Redactor',
    hp: 18,
    actions: RULES.redactorActions.guarded,
    attack: 'explode',
    damage: RULES.redactorExplodeDamage,
    attackText:
      'Explodes for 3 dmg on all 8 tiles around it whenever you are in that zone (every action). Exploded tiles become redaction zone for one turn.',
    notes:
      'Immune while any Page Ward stands. While Wards stand: shreds 1 fragment and gains 1 mark each turn (2 actions). After all Wards fall: spends 1 mark per turn for Redacting mode (5 actions); when out of marks, 3 actions.',
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
