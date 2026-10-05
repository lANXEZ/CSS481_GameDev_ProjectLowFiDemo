import { useCallback, useState } from 'react';
import { RULES, fragmentName, spellCost, spellName, type CardCombo, type GameState } from '../engine';
import { CARD_BACK_ART, POTION_CARD_ART, cardArt } from './art';
import { PileViewer, type PileKind } from './PileViewer';

interface Props {
  state: GameState;
  /** Ids of the hand cards picked for the next cast. */
  selected: number[];
  onToggle: (id: number) => void;
  onClear: () => void;
  combo: CardCombo | null;
  /** Cards can only be picked on your own turn. */
  interactive: boolean;
}

/** Simulation mode: your deck, discard pile and hand, drawn with the printed cards. Pick 2–3 cards to craft. */
export function HandPanel({ state, selected, onToggle, onClear, combo, interactive }: Props) {
  const [viewing, setViewing] = useState<PileKind | null>(null);
  const closeViewer = useCallback(() => setViewing(null), []);
  const cards = state.cards;
  if (!cards) return null;
  const topDiscard = cards.discard[cards.discard.length - 1];

  return (
    <section className="hand-panel" aria-label="Your cards">
      <div className="hand-head">
        <h3>Your hand</h3>
        <p className="hand-status" aria-live="polite">
          <ComboText combo={combo} count={selected.length} />
        </p>
        {selected.length > 0 && interactive && (
          <button className="btn btn-small btn-quiet" onClick={onClear}>
            Clear
          </button>
        )}
      </div>

      <div className="hand-row">
        <div className="hand" role="group" aria-label={`Hand, ${cards.hand.length} cards`}>
          {cards.hand.length === 0 && <p className="hint hand-empty">Your hand is empty.</p>}
          {cards.hand.map((card) => {
            const on = selected.includes(card.id);
            return (
              <button
                key={card.id}
                className={`card-btn${on ? ' is-picked' : ''}`}
                onClick={() => onToggle(card.id)}
                disabled={!interactive}
                aria-pressed={on}
                aria-label={`${fragmentName(card.kind)} fragment${card.loot ? ` (loot from the ${card.loot})` : ''}`}
              >
                <img src={cardArt(card)} alt="" draggable={false} />
              </button>
            );
          })}
        </div>

        <div className="piles">
          <Pile label="Deck" count={cards.deck.length} art={cards.deck.length ? CARD_BACK_ART : null} onOpen={() => setViewing('deck')} />
          <Pile label="Discard" count={cards.discard.length} art={topDiscard ? cardArt(topDiscard) : null} onOpen={() => setViewing('discard')} />
          {cards.erased.length > 0 && (
            <Pile label="Erased" count={cards.erased.length} art={cardArt(cards.erased[cards.erased.length - 1])} onOpen={() => setViewing('erased')} erased />
          )}
          {state.player.potions > 0 && (
            <Pile label="Potion" count={state.player.potions} art={POTION_CARD_ART} title="Max Potion: drink it (1 action) to restore full HP." />
          )}
        </div>
      </div>

      {viewing && <PileViewer pile={viewing} cards={cards[viewing]} onClose={closeViewer} />}
    </section>
  );
}

interface PileProps {
  label: string;
  count: number;
  art: string | null;
  /** Click to see every card in the pile. Piles without it (the potion) are just a picture. */
  onOpen?: () => void;
  title?: string;
  erased?: boolean;
}

function Pile({ label, count, art, onOpen, title, erased = false }: PileProps) {
  const body = (
    <>
      <span className="pile-card">{art ? <img src={art} alt="" draggable={false} /> : <span className="pile-empty" />}</span>
      <span className="pile-label">
        {label} <strong>{count}</strong>
      </span>
    </>
  );
  const cls = `pile${erased ? ' pile-erased' : ''}`;
  return onOpen ? (
    <button className={`${cls} pile-btn`} onClick={onOpen} title={`See the ${count} card${count === 1 ? '' : 's'} in this pile`} aria-label={`${label}: ${count} cards. Show them all`}>
      {body}
    </button>
  ) : (
    <div className={cls} title={title}>
      {body}
    </div>
  );
}

/** What the picked cards do: the spell they craft, and that Reroll would swap them. */
function ComboText({ combo, count }: { combo: CardCombo | null; count: number }) {
  if (count === 0 || !combo) {
    return <span className="muted">Pick 2–3 fragments to craft a spell (one element and one shape), or pick any to reroll them.</span>;
  }
  const reroll = <span className="muted"> · or reroll {count === 1 ? 'it' : `these ${count}`}</span>;
  if (combo.kind === 'invalid') {
    return (
      <>
        <span className={count > 3 ? 'muted' : 'warn'}>{count > 3 ? `${count} picked, too many to cast` : combo.reason}</span>
        {reroll}
      </>
    );
  }
  return (
    <>
      <strong className="combo-ok">
        {combo.kind === 'unstable' ? `Unstable Fire · ${RULES.unstableCost} mana` : `${spellName(combo.spec)} · ${spellCost(combo.spec)} mana`}
      </strong>
      {reroll}
    </>
  );
}

