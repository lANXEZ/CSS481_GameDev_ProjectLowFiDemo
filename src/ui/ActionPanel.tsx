import {
  ELEMENT_EFFECT,
  RULES,
  castError,
  enemiesOnTiles,
  immunityReason,
  moveTarget,
  spellCost,
  spellDamage,
  spellError,
  spellTiles,
  unstableError,
  type Dir,
  type Element,
  type GameState,
  type SpellSpec,
} from '../engine';
import { ELEMENT_COLOR, cap } from './look';

interface Props {
  state: GameState;
  spec: SpellSpec;
  setSpec: (s: SpellSpec) => void;
  setPreviewDir: (d: Dir | null) => void;
  onMove: (d: Dir) => void;
  onCast: (d: Dir | null) => void;
  onUnstable: () => void;
  onMeditate: () => void;
  onPotion: () => void;
  onReroll: () => void;
  onEndTurn: () => void;
}

const ARROWS: { dir: Dir; glyph: string; area: string }[] = [
  { dir: 'up', glyph: '↑', area: 'up' },
  { dir: 'left', glyph: '←', area: 'left' },
  { dir: 'right', glyph: '→', area: 'right' },
  { dir: 'down', glyph: '↓', area: 'down' },
];

export function ActionPanel(props: Props) {
  const { state, spec, setSpec, setPreviewDir } = props;
  const p = state.player;
  const invalid = spellError(spec);
  const cost = spellCost(spec);
  const noMana = p.mana < cost;
  const unstableBlocked = unstableError(state);

  const setElement = (element: Element) => setSpec({ ...spec, element });
  const toggleDoubleElement = () =>
    setSpec({ ...spec, elementCount: spec.elementCount === 2 ? 1 : 2, shapeCount: spec.elementCount === 2 ? spec.shapeCount : 1 });
  const toggleDoubleShape = () =>
    setSpec({ ...spec, shapeCount: spec.shapeCount === 2 ? 1 : 2, elementCount: spec.shapeCount === 2 ? spec.elementCount : 1 });

  // Who would the spell hit? Shown for Cross directly; for Beam per hovered direction on the board.
  const crossTargets = spec.shape === 'cross' ? enemiesOnTiles(state, spellTiles(state, spec, null)) : [];

  return (
    <section className="panel actions" aria-label="Your actions">
      <h2>Your actions</h2>

      <div className="action-group">
        <h3>Move</h3>
        <div className="move-row">
          <div className="dpad">
            {ARROWS.map(({ dir, glyph, area }) => (
              <button
                key={dir}
                className="dpad-btn"
                style={{ gridArea: area }}
                disabled={!moveTarget(state, dir)}
                onClick={() => props.onMove(dir)}
                aria-label={`Move ${dir}`}
              >
                {glyph}
              </button>
            ))}
          </div>
          <p className="hint">Click a gold dot on the board, or use the arrow keys.</p>
        </div>
      </div>

      <div className="action-group">
        <h3>Cast</h3>
        <div className="spell-row" role="group" aria-label="Element">
          {(['fire', 'water', 'rock'] as Element[]).map((el) => (
            <button
              key={el}
              className={`chip${spec.element === el ? ' chip-on' : ''}`}
              style={{ ['--chip' as string]: ELEMENT_COLOR[el] }}
              onClick={() => setElement(el)}
              aria-pressed={spec.element === el}
            >
              {cap(el)}
            </button>
          ))}
          <button className={`chip chip-double${spec.elementCount === 2 ? ' chip-on' : ''}`} onClick={toggleDoubleElement} aria-pressed={spec.elementCount === 2}>
            ×2
          </button>
        </div>
        <div className="spell-row" role="group" aria-label="Shape">
          {(['beam', 'cross'] as const).map((sh) => (
            <button
              key={sh}
              className={`chip${spec.shape === sh ? ' chip-on' : ''}`}
              style={{ ['--chip' as string]: '#7d5ba6' }}
              onClick={() => setSpec({ ...spec, shape: sh })}
              aria-pressed={spec.shape === sh}
            >
              {cap(sh)}
            </button>
          ))}
          <button className={`chip chip-double${spec.shapeCount === 2 ? ' chip-on' : ''}`} onClick={toggleDoubleShape} aria-pressed={spec.shapeCount === 2}>
            ×2
          </button>
        </div>
        <p className="spell-summary">
          {spec.elementCount + spec.shapeCount} fragments, <strong>{cost} mana</strong>, {spellDamage(spec)} dmg and{' '}
          {ELEMENT_EFFECT[spec.element].text.split(':')[0].toLowerCase()}
          {spec.shape === 'beam'
            ? `, ${spec.shapeCount === 2 ? RULES.doubledBeamLength : RULES.beamLength}-tile line`
            : `, reaches ${spec.shapeCount === 2 ? RULES.doubledCrossReach : RULES.crossReach} tile${spec.shapeCount === 2 ? 's' : ''} out`}
          .
        </p>
        {noMana && <p className="warn">Not enough mana ({p.mana}/{cost}). Meditate first.</p>}

        {spec.shape === 'beam' ? (
          <div className="move-row">
            <div className="dpad dpad-cast" onMouseLeave={() => setPreviewDir(null)}>
              {ARROWS.map(({ dir, glyph, area }) => (
                <button
                  key={dir}
                  className="dpad-btn"
                  style={{ gridArea: area }}
                  disabled={!!castError(state, spec, dir)}
                  onMouseEnter={() => setPreviewDir(dir)}
                  onFocus={() => setPreviewDir(dir)}
                  onBlur={() => setPreviewDir(null)}
                  onClick={() => props.onCast(dir)}
                  aria-label={`Cast beam ${dir}`}
                >
                  {glyph}
                </button>
              ))}
            </div>
            <p className="hint">Hover a direction to preview the hit tiles, click to cast.</p>
          </div>
        ) : (
          <>
            <button className="btn btn-spell" disabled={!!invalid || noMana} onClick={() => props.onCast(null)}>
              Cast {spec.shapeCount === 2 ? 'double ' : ''}Cross around you
            </button>
            <TargetList state={state} targets={crossTargets} element={spec.element} />
          </>
        )}

        <button className="btn btn-unstable" disabled={!!unstableBlocked} onClick={props.onUnstable} title={unstableBlocked ?? undefined}>
          Unstable Fire (Fire ×3, {RULES.unstableCost} mana)
        </button>
        {unstableBlocked && <p className="hint">{unstableBlocked}</p>}
      </div>

      <div className="action-group other-actions">
        <button className="btn" onClick={props.onMeditate} disabled={p.mana >= p.maxMana}>
          Meditate (+{RULES.meditateMana} mana)
        </button>
        <button className="btn" onClick={props.onPotion} disabled={p.potions <= 0}>
          Drink potion (+{RULES.potionHeal} HP)
        </button>
        <button className="btn" onClick={props.onReroll}>
          Reroll hand
        </button>
      </div>

      <button className="btn btn-primary end-turn" onClick={props.onEndTurn}>
        End turn{state.actionsLeft > 0 ? ` (${state.actionsLeft} unused)` : ''}
      </button>
    </section>
  );
}

function TargetList({ state, targets, element }: { state: GameState; targets: ReturnType<typeof enemiesOnTiles>; element: Element }) {
  if (targets.length === 0) return <p className="hint">No enemies in range.</p>;
  return (
    <ul className="target-list">
      {targets.map((e) => {
        const immune = immunityReason(state, e, element);
        return (
          <li key={e.id}>
            Hits {e.id}
            {immune ? <span className="muted"> (immune: {immune})</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
