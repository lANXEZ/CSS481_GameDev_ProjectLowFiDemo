import { useEffect, useRef, useState } from 'react';
import { RULES } from '../engine';

const SEGMENTS = 8;
const SPIN_MS = 3200;

interface Props {
  onApply: (damage: number) => void;
  onCancel: () => void;
}

/** Spin to decide whether Unstable Fire deals 6 or 7 damage. */
export function SpinWheel({ onApply, onCancel }: Props) {
  const options = RULES.unstableDamageOptions;
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const timer = useRef<number>(0);
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const seg = 360 / SEGMENTS;
  const valueAt = (i: number) => options[i % options.length];

  const spin = () => {
    const landing = Math.floor(Math.random() * SEGMENTS);
    // Rotate so the chosen segment's centre ends under the pointer at the top.
    const target = 360 * 6 + (360 - (landing * seg + seg / 2));
    const base = angle - (angle % 360);
    setAngle(base + target);
    setSpinning(true);
    setResult(null);
    timer.current = window.setTimeout(
      () => {
        setSpinning(false);
        setResult(valueAt(landing));
      },
      reduceMotion ? 50 : SPIN_MS,
    );
  };

  const R = 110;
  const arc = (i: number) => {
    const a0 = ((i * seg - 90) * Math.PI) / 180;
    const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
    return `M0 0 L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 0 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z`;
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="wheel-title">
      <div className="modal wheel-modal">
        <h2 id="wheel-title">Unstable Fire</h2>
        <p className="hint">Three Fires, no shape. Everything in the 3×3 around you takes the damage the wheel lands on, and you take 3 Burn.</p>
        <div className="wheel-wrap">
          <svg viewBox="-120 -132 240 252" className="wheel" aria-hidden>
            <g
              style={{
                transform: `rotate(${angle}deg)`,
                transition: spinning && !reduceMotion ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.7, 0.12, 1)` : 'none',
              }}
            >
              {Array.from({ length: SEGMENTS }, (_, i) => {
                // Labels point outward, so the winning number sits upright under the pointer.
                const midDeg = i * seg + seg / 2;
                return (
                  <g key={i}>
                    <path d={arc(i)} className={valueAt(i) === options[0] ? 'wheel-seg-a' : 'wheel-seg-b'} />
                    <text transform={`rotate(${midDeg}) translate(0 -64)`} y={9} className="wheel-num">
                      {valueAt(i)}
                    </text>
                  </g>
                );
              })}
              <circle r={R} className="wheel-rim" />
            </g>
            <circle r={16} className="wheel-hub" />
            <path d="M-11 -128 L11 -128 L0 -104 Z" className="wheel-pointer" />
          </svg>
        </div>
        <p className="wheel-result" aria-live="polite">
          {result !== null ? `${result} damage` : spinning ? 'Spinning…' : 'Spin to see how hard it burns.'}
        </p>
        <div className="modal-actions">
          <button className="btn btn-quiet" onClick={onCancel} disabled={spinning}>
            Cancel
          </button>
          {result === null ? (
            <button className="btn btn-primary" onClick={spin} disabled={spinning}>
              Spin the wheel
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => onApply(result)}>
              Cast for {result} damage
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
