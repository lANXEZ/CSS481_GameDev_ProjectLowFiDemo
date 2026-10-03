/** Board coordinate. x = column (0 = "a"), y = row (0 = row "1", the bottom row on the paper board). */
export interface Pos {
  x: number;
  y: number;
}

export type Element = 'fire' | 'water' | 'rock';
export type Shape = 'beam' | 'cross';
export type Dir = 'up' | 'down' | 'left' | 'right';

export type EnemyKind = 'rat' | 'archer' | 'brute' | 'leech' | 'warden' | 'ward' | 'scrap' | 'redactor';

export interface Statuses {
  /** Remaining Burn ticks (0 = not burning). */
  burn: number;
  /** Turns of Root left (unit can't move during its next turn). */
  root: number;
  /** Turns of Stun left (unit can't attack during its next turn). */
  stun: number;
}

export type RedactorMode = 'guarded' | 'chaos' | 'spent';

export interface Enemy {
  /** Display id, e.g. "3a" = first Brute deployed in this room. */
  id: string;
  kind: EnemyKind;
  typeNum: number;
  /** Order the unit was deployed in the room. Breaks ties in turn order and pathing priority. */
  deployId: number;
  pos: Pos;
  hp: number;
  maxHp: number;
  status: Statuses;
  /** Page Ward attunement. */
  element?: Element;
  // Warden
  turnCount?: number;
  charge?: boolean;
  markedLine?: Pos[] | null;
  // Redactor
  marks?: number;
  mode?: RedactorMode;
  // Page Scrap: number of fragments it is holding
  stolen?: number;
  /** Page Scrap: already brought its stolen fragment to the Redactor (it flees from then on). */
  delivered?: boolean;
}

export interface PlayerState {
  pos: Pos;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  potions: number;
  status: Statuses;
  unstableUsed: boolean;
}

export interface ExitState {
  pos: Pos;
  locked: boolean;
}

export interface RoomRuntime {
  id: string;
  name: string;
  blurb: string;
  width: number;
  height: number;
  pillars: Pos[];
  exit: ExitState | null;
}

export type Phase = 'player' | 'enemy' | 'roomExit' | 'won' | 'lost';

export type LogSide = 'player' | 'enemy' | 'system' | 'gm';

export interface LogEntry {
  id: number;
  roomIndex: number;
  turn: number;
  side: LogSide;
  text: string;
  /** Something the players must mirror on the paper components (cards, tokens). */
  paper?: boolean;
}

/** A defeated enemy whose loot the players still need to take on the table. */
export interface LootNotice {
  enemyId: string;
  enemyKind: EnemyKind;
  enemyName: string;
  /** Cards that go into the discard pile, e.g. "Fire fragment". */
  discard: string[];
  /** Cards that go straight back into the player's hand (fragments a Page Scrap stole). */
  toHand: string[];
  /** Other things to do or know, e.g. taking the Heal Potion or the exit unlocking. */
  extras: string[];
}

export interface GameState {
  roomIndex: number;
  room: RoomRuntime;
  player: PlayerState;
  enemies: Enemy[];
  /** Turn counter within the room. Player turn N is followed by enemy turn N. */
  turn: number;
  phase: Phase;
  actionsLeft: number;
  /** Whether the player took any action this turn (for Burn wear-off). */
  playerActed: boolean;
  /** Tiles turned into Erasure zone by the Redactor's explosions. Cleared when the player's next turn ends. */
  erasureZone: Pos[];
  /** Per-type deploy counters used to label spawned units (e.g. next Page Scrap = "7c"). */
  typeCounters: Record<number, number>;
  nextDeployId: number;
  /** Seeded RNG state, so undo/redo replays the exact same enemy decisions. */
  rng: number;
  log: LogEntry[];
  nextLogId: number;
  /** Loot from kills not yet confirmed at the table (drives the loot popup). */
  pendingLoot: LootNotice[];
}

/**
 * One thing an enemy will do on its turn, shown above its token like Slay the Spire intents.
 * `value` is the damage / amount where that matters.
 */
export type IntentKind =
  | 'move'
  | 'retreat'
  | 'attack'
  | 'shoot'
  | 'drain'
  | 'mark'
  | 'fire'
  | 'watch'
  | 'steal'
  | 'deliver'
  | 'block'
  | 'explode'
  | 'cooldown'
  | 'spawn'
  | 'wait';

export interface Intent {
  kind: IntentKind;
  value?: number;
  /** Plain-language note for the hover card, e.g. why it waits. */
  note?: string;
}

export interface SpellSpec {
  element: Element;
  elementCount: 1 | 2;
  shape: Shape;
  shapeCount: 1 | 2;
}
