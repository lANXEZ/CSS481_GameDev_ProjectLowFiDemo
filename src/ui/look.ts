import { ENEMY_DEFS, type Element, type Enemy, type Intent, type IntentKind, type LogSide } from '../engine';

/** Token colours copied from the kit's token sheet so the screen matches the paper. */
export const ELEMENT_COLOR: Record<Element, string> = {
  fire: '#b63b2f',
  water: '#276f91',
  rock: '#6d5a3a',
};

export function tokenColor(e: Enemy): string {
  switch (e.kind) {
    case 'warden':
      return '#a07a2c';
    case 'ward':
      return ELEMENT_COLOR[e.element ?? 'fire'];
    case 'scrap':
    case 'redactor':
      return '#3d2a4a';
    default:
      return '#7a2e2e';
  }
}

export const PLAYER_COLOR = '#a8822f';

export function hpColor(hp: number, max: number): string {
  const f = max > 0 ? hp / max : 0;
  if (f > 0.6) return '#5c9a52';
  if (f > 0.3) return '#d09a2c';
  return '#c2463d';
}

export function unitTitle(e: Enemy): string {
  const def = ENEMY_DEFS[e.kind];
  const el = e.element ? ` (${e.element})` : '';
  return `${def.name}${el}`;
}

export const SIDE_LABEL: Record<LogSide, string> = {
  player: 'You',
  enemy: 'Enemy',
  system: 'Table',
  gm: 'GM',
};

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------- intents

export interface IntentInfo {
  color: string;
  /** Plain-language phrase for the hover card. `n` = how many times in a row, `v` = value. */
  describe: (n: number, v?: number) => string;
  /** Kinds that deal damage show their value on the chip. */
  showsValue?: boolean;
}

const times = (n: number) => (n === 1 ? '' : ` ×${n}`);

export const INTENT_INFO: Record<IntentKind, IntentInfo> = {
  move: { color: '#5aa9e6', describe: (n) => `Moves ${n} tile${n === 1 ? '' : 's'}` },
  retreat: { color: '#9bb0c4', describe: (n) => `Backs away ${n} tile${n === 1 ? '' : 's'}` },
  attack: { color: '#ef5b52', showsValue: true, describe: (n, v) => `Attacks for ${v}${times(n)}` },
  shoot: { color: '#ef5b52', showsValue: true, describe: (n, v) => `Shoots you for ${v}${times(n)}` },
  drain: { color: '#4ea7ea', showsValue: true, describe: (_n, v) => `Drains ${v} mana` },
  mark: { color: '#f0a83c', describe: (_n, v) => `Marks a line at you (fires ${v} dmg next turn) and ends its turn` },
  fire: { color: '#ff7a45', showsValue: true, describe: (_n, v) => `Fires the marked line for ${v}` },
  watch: { color: '#d4b25c', describe: () => 'Holds still with a clear line to you' },
  steal: { color: '#b98fe6', describe: () => 'Steals a fragment from your hand' },
  deliver: { color: '#b98fe6', describe: () => 'Brings the fragment to the Redactor: +1 mark' },
  block: { color: '#b39a72', describe: () => 'Blocks your path' },
  explode: { color: '#ff6a3d', showsValue: true, describe: (n, v) => `Explodes for ${v}${times(n)}` },
  cooldown: { color: '#a3a9b8', describe: (n) => `Cools down${times(n)}` },
  spawn: { color: '#b98fe6', describe: () => 'Spawns a Page Scrap at the end of the enemy turn' },
  wait: { color: '#a3a9b8', describe: () => 'Does nothing' },
};

export interface IntentGroup {
  kind: IntentKind;
  value?: number;
  count: number;
  note?: string;
}

/** Collapse runs of the same intent (e.g. three moves) into one chip with a count. */
export function groupIntents(intents: Intent[] = []): IntentGroup[] {
  const out: IntentGroup[] = [];
  for (const i of intents) {
    const last = out[out.length - 1];
    if (last && last.kind === i.kind && last.value === i.value) last.count++;
    else out.push({ kind: i.kind, value: i.value, count: 1, note: i.note });
  }
  return out;
}

/** Sentence for the hover card: "Moves 2 tiles, then attacks for 3." */
export function describeIntents(intents: Intent[] = []): string {
  const groups = groupIntents(intents);
  if (groups.length === 0) return 'Nothing this turn.';
  const parts = groups.map((g) => {
    const text = INTENT_INFO[g.kind].describe(g.count, g.value);
    return g.kind === 'wait' && g.note ? `Waits (it ${g.note.replace(/[.,].*$/, '')})` : text;
  });
  const sentence = parts.map((p, i) => (i === 0 ? p : p.charAt(0).toLowerCase() + p.slice(1))).join(', then ');
  return `${sentence}.`;
}
