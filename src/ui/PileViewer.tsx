import { useEffect, useRef } from 'react';
import { fragmentName, type Card, type FragmentKind } from '../engine';
import { cardArt } from './art';

export type PileKind = 'deck' | 'discard' | 'erased';

const PILE_INFO: Record<PileKind, { title: string; note: string }> = {
  // Like Slay the Spire, the draw pile is shown sorted so opening it doesn't give away the draw order.
  deck: { title: 'Draw pile', note: 'Sorted by type, not in draw order. When it runs out, the discard pile is shuffled into a new deck.' },
  discard: { title: 'Discard pile', note: 'In the order they were discarded, newest last. Shuffled back into the deck when the deck runs out.' },
  erased: { title: 'Erased cards', note: 'Taken out of the game by the Erasure zone. They never come back in this run.' },
};

const KIND_ORDER: FragmentKind[] = ['fire', 'water', 'rock', 'beam', 'cross'];

/** Draw pile order hidden: by kind, starting-deck cards before loot cards. */
function sortedForDisplay(cards: Card[]): Card[] {
  return [...cards].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || Number(!!a.loot) - Number(!!b.loot) || a.id - b.id,
  );
}

/** "Fire ×3 · Beam ×2", in kind order. */
function countsLine(cards: Card[]): string {
  return KIND_ORDER.map((k) => [k, cards.filter((c) => c.kind === k).length] as const)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${fragmentName(k)} ×${n}`)
    .join(' · ');
}

interface Props {
  pile: PileKind;
  cards: Card[];
  onClose: () => void;
}

/** Full-screen look at a pile, as a grid of the printed cards (like Slay the Spire's deck view). */
export function PileViewer({ pile, cards, onClose }: Props) {
  const info = PILE_INFO[pile];
  const shown = pile === 'deck' ? sortedForDisplay(cards) : cards;
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus the close button on open, close on Escape, and give focus back to whatever opened it.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop pile-backdrop" role="dialog" aria-modal="true" aria-labelledby="pile-title" onClick={onClose}>
      <div className="modal pile-modal" onClick={(e) => e.stopPropagation()}>
        <header className="pile-modal-head">
          <div>
            <h2 id="pile-title">
              {info.title} <span className="pile-modal-count">{cards.length}</span>
            </h2>
            {cards.length > 0 && <p className="pile-modal-counts">{countsLine(cards)}</p>}
          </div>
          <button ref={closeRef} className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <p className="hint">{info.note}</p>
        {shown.length === 0 ? (
          <p className="pile-modal-empty">No cards here.</p>
        ) : (
          <ul className={`pile-grid${pile === 'erased' ? ' is-erased' : ''}`}>
            {shown.map((card) => (
              <li key={card.id}>
                <img
                  src={cardArt(card)}
                  alt={`${fragmentName(card.kind)} fragment${card.loot ? ` (loot from the ${card.loot})` : ''}`}
                  draggable={false}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
