import { LOOT_FRAGMENT, fragmentName, type GameMode, type LootNotice } from '../engine';
import { CARD_BACK_ART, POTION_CARD_ART, cardArt } from './art';
import { MiniToken } from './MiniToken';

function LootCard({ art, title, note }: { art: string; title: string; note: string }) {
  return (
    <figure className="loot-card">
      <img src={art} alt={title} draggable={false} />
      <figcaption className="loot-card-note">{note}</figcaption>
    </figure>
  );
}

interface Props {
  notices: LootNotice[];
  mode: GameMode;
  onConfirm: () => void;
}

/**
 * Shown after enemies die. Tracker: which loot cards to add to the discard pile on the table.
 * Simulation: what was added to the deck (the app already did it).
 */
export function LootDialog({ notices, mode, onConfirm }: Props) {
  const sim = mode === 'simulation';
  const hasDiscard = notices.some((n) => n.discard.length > 0);
  const hasHand = notices.some((n) => (n.toHand ?? []).length > 0);
  const title = notices.length === 1 ? `${notices[0].enemyName} defeated` : `${notices.length} enemies defeated`;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="loot-title">
      <div className="modal loot-modal">
        <h2 id="loot-title">{title}</h2>
        <p>
          {sim ? (
            <>
              {hasDiscard && 'The loot cards went into your discard pile. They join the deck when it’s reshuffled. '}
              {hasHand && 'The fragments the Page Scrap stole are back in your hand. '}
            </>
          ) : (
            <>
              {hasDiscard && 'Take these loot cards from the loot pile and add them to your discard pile. They’ll come back when the deck is reshuffled. '}
              {hasHand && 'Take back the fragments the Page Scrap stole (from under its token) and put them in your hand. '}
            </>
          )}
          {!hasDiscard && !hasHand && (sim ? 'Nothing else to take.' : 'Take the loot from the table.')}
        </p>

        <ul className="loot-list">
          {notices.map((n) => (
            <li key={n.enemyId} className="loot-item">
              {notices.length > 1 && (
                <p className="loot-from">
                  <MiniToken unit={{ id: n.enemyId, kind: n.enemyKind }} />
                  {n.enemyName}
                </p>
              )}
              <div className="loot-cards">
                {n.discardCards
                  ? n.discardCards.map((card) => <LootCard key={card.id} art={cardArt(card)} title={`${fragmentName(card.kind)} fragment`} note="In your discard pile" />)
                  : n.discard.map((card) => {
                      const kind = LOOT_FRAGMENT[n.enemyKind];
                      return <LootCard key={card} art={kind ? cardArt({ kind, loot: n.enemyKind }) : CARD_BACK_ART} title={card} note="Add to discard pile" />;
                    })}
                {n.handCards
                  ? n.handCards.map((card) => <LootCard key={card.id} art={cardArt(card)} title={`${fragmentName(card.kind)} fragment`} note="Back in your hand" />)
                  : (n.toHand ?? []).map((card) => <LootCard key={card} art={CARD_BACK_ART} title={card} note={`${card}: back to hand`} />)}
                {n.enemyKind === 'warden' && <LootCard art={POTION_CARD_ART} title="Max Potion" note={sim ? 'Kept for later' : 'Keep in hand'} />}
              </div>
              {n.extras.length > 0 && (
                <ul className="loot-extras">
                  {n.extras.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onConfirm} autoFocus>
            {sim ? 'Continue' : hasDiscard && !hasHand ? 'Added to discard pile' : hasHand && !hasDiscard ? 'Back in hand' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
