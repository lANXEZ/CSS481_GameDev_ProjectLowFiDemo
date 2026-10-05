import { RULES, cardsLabel, fragmentName, spellCost, spellName, type CardCombo, type GameState } from '../engine';
import { CARD_BACK_ART, POTION_CARD_ART, cardArt } from './art';

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
          <Pile label="Deck" count={cards.deck.length} art={cards.deck.length ? CARD_BACK_ART : null} title={`${cards.deck.length} cards to draw. When it runs out, the discard pile is shuffled into a new deck.`} />
          <Pile
            label="Discard"
            count={cards.discard.length}
            art={topDiscard ? cardArt(topDiscard) : null}
            title={cards.discard.length ? `Discard pile: ${cardsLabel(cards.discard)}` : 'Discard pile: empty'}
          />
          {cards.erased.length > 0 && (
            <Pile label="Erased" count={cards.erased.length} art={cardArt(cards.erased[cards.erased.length - 1])} title={`Erased for good: ${cardsLabel(cards.erased)}`} erased />
          )}
          {state.player.potions > 0 && (
            <Pile label="Potion" count={state.player.potions} art={POTION_CARD_ART} title="Max Potion: drink it (1 action) to restore full HP." />
          )}
        </div>
      </div>
    </section>
  );
}

function Pile({ label, count, art, title, erased = false }: { label: string; count: number; art: string | null; title: string; erased?: boolean }) {
  return (
    <div className={`pile${erased ? ' pile-erased' : ''}`} title={title}>
      <div className="pile-card">{art ? <img src={art} alt="" draggable={false} /> : <span className="pile-empty" />}</div>
      <span className="pile-label">
        {label} <strong>{count}</strong>
      </span>
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

