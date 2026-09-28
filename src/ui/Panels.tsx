import { ENEMY_DEFS, ROOMS, RULES, turnOrder, type GameState } from '../engine';
import { PLAYER_COLOR, hpColor, tokenColor, unitTitle } from './look';

/** Whose turn it is, how many actions are left, and the order enemies will act in. */
export function TurnTracker({ state }: { state: GameState }) {
  const order = turnOrder(state).filter((e) => ENEMY_DEFS[e.kind].actions > 0 || e.kind === 'redactor');
  const playerActive = state.phase === 'player';
  const enemyActive = state.phase === 'enemy';
  return (
    <section className="panel turn-tracker" aria-label="Turn tracker">
      <div className="turn-head">
        <h2>Turn {state.turn}</h2>
        <span className="room-count">
          Room {state.roomIndex + 1} of {ROOMS.length}
        </span>
      </div>
      <ol className="turn-seq">
        <li className={`seq-step${playerActive ? ' is-active' : ''}`}>
          <span className="seq-dot" style={{ background: PLAYER_COLOR }}>
            YOU
          </span>
          <span className="seq-body">
            <span className="seq-title">Your turn</span>
            <span className="pips" aria-label={`${state.actionsLeft} of ${RULES.actionsPerTurn} actions left`}>
              {Array.from({ length: RULES.actionsPerTurn }, (_, i) => (
                <span key={i} className={`pip${playerActive && i < state.actionsLeft ? ' pip-on' : ''}`} />
              ))}
              {playerActive && <span className="pips-note">{state.actionsLeft} left</span>}
            </span>
          </span>
        </li>
        <li className={`seq-step${enemyActive ? ' is-active' : ''}`}>
          <span className="seq-dot seq-dot-enemy" aria-hidden>
            ⚔
          </span>
          <span className="seq-body">
            <span className="seq-title">Enemy turn</span>
            <span className="enemy-order" aria-label="Enemy acting order">
              {order.length === 0 && <span className="muted">No enemies left</span>}
              {order.map((e) => (
                <span key={e.id} className="mini-token" style={{ background: tokenColor(e) }} title={`${unitTitle(e)} ${e.id}`}>
                  {e.id}
                </span>
              ))}
            </span>
          </span>
        </li>
      </ol>
    </section>
  );
}

/** Digital copy of the paper HP / mana tracker (p.4). */
export function WizardCard({ state }: { state: GameState }) {
  const p = state.player;
  return (
    <section className="panel wizard" aria-label="Your wizard">
      <div className="wizard-row">
        <span className="stat-label">HP</span>
        <span className="stat-value" style={{ color: hpColor(p.hp, p.maxHp) }}>
          {p.hp}
          <small>/{p.maxHp}</small>
        </span>
        <div className="boxes hp-boxes" aria-hidden>
          {Array.from({ length: p.maxHp }, (_, i) => (
            <span key={i} className={i < p.hp ? 'box box-hp' : 'box'} style={i < p.hp ? { background: hpColor(p.hp, p.maxHp) } : undefined} />
          ))}
        </div>
      </div>
      <div className="wizard-row">
        <span className="stat-label">Mana</span>
        <span className="stat-value mana">
          {p.mana}
          <small>/{p.maxMana}</small>
        </span>
        <div className="boxes" aria-hidden>
          {Array.from({ length: p.maxMana }, (_, i) => (
            <span key={i} className={i < p.mana ? 'box box-mana' : 'box'} />
          ))}
        </div>
      </div>
      <div className="wizard-tags">
        <span className={p.potions ? 'tag tag-potion' : 'tag tag-off'}>
          {p.potions ? `Heal potion ×${p.potions}` : 'No potion'}
        </span>
        <span className={p.unstableUsed ? 'tag tag-off' : 'tag tag-fire'}>
          {p.unstableUsed ? 'Unstable Fire spent' : 'Unstable Fire ready'}
        </span>
        {p.status.burn > 0 && <span className="tag tag-fire">Burning ({p.status.burn})</span>}
      </div>
    </section>
  );
}
