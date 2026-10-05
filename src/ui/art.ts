import type { Card, Element, Enemy, EnemyKind, FragmentKind } from '../engine';

/**
 * Art cut from the print-and-cut kit (Broken_Grimoire_Cutouts_A4.pdf) by scripts/extract_art.py.
 * Files live in public/art/ and are served next to the page.
 */
export const artUrl = (path: string) => `${import.meta.env.BASE_URL}art/${path}`;

export interface MapArt {
  src: string;
  /** Whether the printed board shows its exit locked (the app draws over it when the state differs). */
  exitLocked: boolean;
}

/** Room boards, stitched from the kit's two A4 sheets. Pillars, START and EXIT are part of the picture. */
export const MAP_ART: Record<string, MapArt> = {
  cistern: { src: artUrl('maps/cistern.jpg'), exitLocked: false },
  scriptorium: { src: artUrl('maps/scriptorium.jpg'), exitLocked: true },
  redactor: { src: artUrl('maps/redactor.jpg'), exitLocked: false },
};

/** The map pictures include the board's frame: this much of a tile on every side of the grid. */
export const MAP_FRAME = 9.9 / 90.71;

/** The Cistern's open exit tile, laid over a printed locked exit once it opens. */
export const OPEN_EXIT_ART = artUrl('maps/exit-open.jpg');

export const PLAYER_TOKEN_ART = artUrl('tokens/you.png');

export function tokenArtFor(kind: EnemyKind, element?: Element): string {
  return artUrl(`tokens/${kind === 'ward' ? `ward-${element ?? 'fire'}` : kind}.png`);
}

export const tokenArt = (e: Enemy) => tokenArtFor(e.kind, e.element);

export const STATUS_ART = {
  burn: artUrl('status/burn.png'),
  root: artUrl('status/root.png'),
  stun: artUrl('status/stun.png'),
};

/** Printed fragment card. Loot cards (with the wax seal) have their own art. */
export function cardArt(card: Pick<Card, 'kind' | 'loot'>): string {
  return artUrl(`cards/${card.kind}${card.loot ? '-loot' : ''}.jpg`);
}

export const CARD_BACK_ART = artUrl('cards/back.jpg');
export const POTION_CARD_ART = artUrl('cards/potion.jpg');

/** Fragment illustrations without the card around them. */
export const iconArt = (kind: FragmentKind | 'potion') => artUrl(`icons/${kind}.png`);

/** Printed enemy reference cards (and the wizard's character card). */
export const referenceArt = (kind: EnemyKind | 'wizard') => artUrl(`reference/${kind}.jpg`);
