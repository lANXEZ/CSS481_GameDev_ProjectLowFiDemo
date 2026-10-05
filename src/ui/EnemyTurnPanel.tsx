import { useEffect, useRef, useState } from 'react';
import type { EnemyTurnPlan, GameState } from '../engine';
import { MiniToken } from './MiniToken';

/** Pause between steps when the enemy turn plays itself (Simulation mode). */
const AUTO_STEP_MS = 700;
const AUTO_STEP_REDUCED_MS = 160;

interface Props {
  state: GameState;
  plan: EnemyTurnPlan;
  /** Index of the step shown on the board; -1 = before the enemy turn starts. */
  stepIndex: number;
  setStepIndex: (i: number) => void;
  onFinish: () => void;
  /** Simulation mode: walk through the steps automatically, then finish the turn. */
  auto?: boolean;
}

export function EnemyTurnPanel({ state, plan, stepIndex, setStepIndex, onFinish, auto = false }: Props) {
  const last = plan.steps.length - 1;
  const done = stepIndex >= last;
  const listRef = useRef<HTMLOListElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    listRef.current?.querySelector('.step-current')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [stepIndex]);

  // Auto-play: show the next step after a beat; after the last one, finish the turn.
  // The latest callbacks go through a ref so a parent re-render doesn't restart the timer.
  const latest = useRef({ onFinish, setStepIndex });
  latest.current = { onFinish, setStepIndex };
  useEffect(() => {
    if (!auto || paused) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const delay = reduced ? AUTO_STEP_REDUCED_MS : AUTO_STEP_MS;
    const timer = window.setTimeout(() => (done ? latest.current.onFinish() : latest.current.setStepIndex(stepIndex + 1)), delay);
    return () => window.clearTimeout(timer);
  }, [auto, paused, done, stepIndex]);

  const actorEnemy = (id: string | null) =>
    id ? (state.enemies.find((x) => x.id === id) ?? plan.steps.find((s) => s.actorId === id)?.state.enemies.find((x) => x.id === id)) : undefined;

  return (
    <section className="panel enemy-turn" aria-label="Enemy turn">
      <h2>Enemy turn {state.turn}</h2>
      <p className="hint">
        {auto
          ? 'The monsters take their turns. Pause to look at a step, or skip to the end.'
          : 'Step through each monster’s actions and copy them onto the paper board. Nothing changes here until you finish the turn.'}
      </p>
      <ol className="steps" ref={listRef}>
        {plan.steps.map((step, i) => {
          const enemy = actorEnemy(step.actorId);
          return (
            <li
              key={i}
              className={`step${i === stepIndex ? ' step-current' : ''}${i > stepIndex ? ' step-future' : ''}`}
              onClick={() => {
                setPaused(true);
                setStepIndex(i);
              }}
            >
              {enemy ? <MiniToken unit={enemy} /> : <span className="step-actor">•</span>}
              <span className="step-lines">
                {step.entries.map((entry) => (
                  <span key={entry.id} className={entry.paper ? 'step-line is-paper' : 'step-line'}>
                    {entry.paper && <span className="paper-tag">Table</span>}
                    {entry.text}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ol>
      {auto ? (
        <div className="step-controls">
          <button className="btn" onClick={() => setPaused((p) => !p)}>
            {paused ? 'Resume' : 'Pause'}
          </button>
          {paused && (
            <button className="btn" onClick={() => setStepIndex(Math.min(last, stepIndex + 1))} disabled={done}>
              Next step
            </button>
          )}
        </div>
      ) : (
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
      )}
      <button className="btn btn-primary end-turn" onClick={onFinish}>
        {auto ? 'Skip to your turn' : done ? 'Finish enemy turn' : 'Skip to end and finish'}
      </button>
    </section>
  );
}
