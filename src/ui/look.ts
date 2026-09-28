import { ENEMY_DEFS, type Element, type Enemy, type LogSide } from '../engine';

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
