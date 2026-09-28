import { useEffect, useRef } from 'react';
import type { EnemyTurnPlan, GameState } from '../engine';
import { tokenColor } from './look';

interface Props {
  state: GameState;
  plan: EnemyTurnPlan;
  /** Index of the step shown on the board; -1 = before the enemy turn starts. */
  stepIndex: number;
  setStepIndex: (i: number) => void;
  onFinish: () => void;
}

export function EnemyTurnPanel({ state, plan, stepIndex, setStepIndex, onFinish }: Props) {
  const last = plan.steps.length - 1;
  const done = stepIndex >= last;
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    listRef.current?.querySelector('.step-current')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [stepIndex]);

  const actorColor = (id: string | null) => {
    if (!id) return '#6b6f80';
    const e = state.enemies.find((x) => x.id === id) ?? plan.steps.find((s) => s.actorId === id)?.state.enemies.find((x) => x.id === id);
    return e ? tokenColor(e) : '#6b6f80';
  };

  return (
    <section className="panel enemy-turn" aria-label="Enemy turn">
      <h2>Enemy turn {state.turn}</h2>
      <p className="hint">
        Step through each monster's actions and copy them onto the paper board. Nothing changes here until you finish the
        turn.
      </p>
      <ol className="steps" ref={listRef}>
        {plan.steps.map((step, i) => (
          <li
            key={i}
            className={`step${i === stepIndex ? ' step-current' : ''}${i > stepIndex ? ' step-future' : ''}`}
            onClick={() => setStepIndex(i)}
          >
            <span className="step-actor" style={{ background: actorColor(step.actorId) }}>
              {step.actorId ?? '•'}
            </span>
            <span className="step-lines">
              {step.entries.map((entry) => (
                <span key={entry.id} className={entry.paper ? 'step-line is-paper' : 'step-line'}>
                  {entry.paper && <span className="paper-tag">Table</span>}
                  {entry.text}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
      <div className="step-controls">
        <button className="btn" onClick={() => setStepIndex(Math.max(-1, stepIndex - 1))} disabled={stepIndex < 0}>
          Back
        </button>
        <button className="btn" onClick={() => setStepIndex(Math.min(last, stepIndex + 1))} disabled={done}>
          Next step
        </button>
        <button className="btn" onClick={() => setStepIndex(last)} disabled={done}>
          Show all
        </button>
      </div>
      <button className="btn btn-primary end-turn" onClick={onFinish}>
        {done ? 'Finish enemy turn' : 'Skip to end and finish'}
      </button>
    </section>
  );
}
