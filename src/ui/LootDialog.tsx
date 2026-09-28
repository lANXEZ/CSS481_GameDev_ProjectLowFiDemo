import type { EnemyKind, LootNotice } from '../engine';
import { ELEMENT_COLOR } from './look';

const ENEMY_COLOR: Partial<Record<EnemyKind, string>> = { warden: '#a07a2c', scrap: '#3d2a4a' };

/** Colour and category of a loot card, matching the paper cards (p.7). */
function cardLook(name: string): { color: string; category: string; title: string } {
  const n = name.toLowerCase();
  if (n.startsWith('fire')) return { color: ELEMENT_COLOR.fire, category: 'Element', title: 'Fire' };
  if (n.startsWith('water')) return { color: ELEMENT_COLOR.water, category: 'Element', title: 'Water' };
  if (n.startsWith('rock')) return { color: ELEMENT_COLOR.rock, category: 'Element', title: 'Rock' };
  if (n.startsWith('beam')) return { color: '#6b4c8f', category: 'Appearance', title: 'Beam' };
  return { color: '#5b5470', category: 'Returned', title: name };
}

function LootCard({ category, title, color, note }: { category: string; title: string; color: string; note: string }) {
  return (
    <div className="loot-card" style={{ ['--card' as string]: color }}>
      <div className="loot-card-band">
        <span className="loot-card-cat">{category}</span>
        <span className="loot-card-title">{title}</span>
      </div>
      <div className="loot-card-note">{note}</div>
    </div>
  );
}

interface Props {
  notices: LootNotice[];
  onConfirm: () => void;
}

/** Shown after enemies die: tells the table which loot cards to add to the discard pile. */
export function LootDialog({ notices, onConfirm }: Props) {
  const hasDiscard = notices.some((n) => n.discard.length > 0);
  const title = notices.length === 1 ? `${notices[0].enemyName} defeated` : `${notices.length} enemies defeated`;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="loot-title">
      <div className="modal loot-modal">
        <h2 id="loot-title">{title}</h2>
        <p>
          {hasDiscard
            ? 'Take these loot cards from the loot pile and add them to your discard pile. They’ll come back when the deck is reshuffled.'
            : 'Take the loot from the table.'}
        </p>

        <ul className="loot-list">
          {notices.map((n) => (
            <li key={n.enemyId} className="loot-item">
              {notices.length > 1 && (
                <p className="loot-from">
                  <span className="mini-token" style={{ background: ENEMY_COLOR[n.enemyKind] ?? '#7a2e2e' }}>
                    {n.enemyId}
                  </span>
                  {n.enemyName}
                </p>
              )}
              <div className="loot-cards">
                {n.discard.map((card) => {
                  const look = cardLook(card);
                  return <LootCard key={card} {...look} note="Add to discard pile" />;
                })}
                {n.enemyKind === 'warden' && <LootCard category="Item" title="Heal Potion" color="#9e3a3f" note="Keep in hand" />}
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
            {hasDiscard ? 'Added to discard pile' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
