import { useState } from 'react';
import {
  ENEMY_DEFS,
  RULES,
  coordLabel,
  gmEdit,
  gmPatchEnemy,
  gmPatchPlayer,
  gmRemoveEnemy,
  type Element,
  type Enemy,
  type EnemyKind,
  type GameState,
  type Statuses,
} from '../engine';
import { tokenColor, unitTitle, PLAYER_COLOR } from './look';

export type PlaceMode = { kind: 'move'; id: string } | { kind: 'add'; enemy: EnemyKind; element?: Element } | null;

interface Props {
  state: GameState;
  selectedId: string | null;
  run: (fn: (s: GameState) => GameState) => boolean;
  placeMode: PlaceMode;
  setPlaceMode: (m: PlaceMode) => void;
  onClose: () => void;
}

/** GM override panel: fix HP, statuses or positions when the table and the app disagree. */
export function Inspector({ state, selectedId, run, placeMode, setPlaceMode, onClose }: Props) {
  const enemy = state.enemies.find((e) => e.id === selectedId);
  return (
    <section className="panel inspector" aria-label="Unit details">
      {selectedId === 'player' ? (
        <PlayerEditor state={state} run={run} placeMode={placeMode} setPlaceMode={setPlaceMode} onClose={onClose} />
      ) : enemy ? (
        <EnemyEditor state={state} e={enemy} run={run} placeMode={placeMode} setPlaceMode={setPlaceMode} onClose={onClose} />
      ) : (
        <TableTools state={state} run={run} placeMode={placeMode} setPlaceMode={setPlaceMode} />
      )}
    </section>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <span className="stepper-label">{label}</span>
      <button className="step-btn" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Decrease ${label}`}>
        −
      </button>
      <span className="stepper-value">{value}</span>
      <button className="step-btn" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`Increase ${label}`}>
        +
      </button>
    </div>
  );
}

function StatusEditor({ status, onChange }: { status: Statuses; onChange: (key: keyof Statuses, v: number) => void }) {
  return (
    <>
      <Stepper label="Burn ticks" value={status.burn} min={0} max={9} onChange={(v) => onChange('burn', v)} />
      <Stepper label="Root (turns)" value={status.root} min={0} max={3} onChange={(v) => onChange('root', v)} />
      <Stepper label="Stun (turns)" value={status.stun} min={0} max={3} onChange={(v) => onChange('stun', v)} />
    </>
  );
}

interface EditorProps {
  state: GameState;
  run: Props['run'];
  placeMode: PlaceMode;
  setPlaceMode: Props['setPlaceMode'];
  onClose: () => void;
}

function EnemyEditor({ e, run, placeMode, setPlaceMode, onClose }: EditorProps & { e: Enemy }) {
  const def = ENEMY_DEFS[e.kind];
  const patch = (p: Partial<Enemy>, note: string) => run((s) => gmPatchEnemy(s, e.id, p, `${e.id} ${note}`));
  const moving = placeMode?.kind === 'move' && placeMode.id === e.id;
  const actionsNow = e.kind === 'redactor' ? RULES.redactorActions[e.mode ?? 'guarded'] : def.actions;

  return (
    <>
      <header className="inspector-head">
        <span className="mini-token big" style={{ background: tokenColor(e) }}>
          {e.id}
        </span>
        <div>
          <h2>{unitTitle(e)}</h2>
          <p className="muted">
            On {coordLabel(e.pos)}, {actionsNow} actions per turn
          </p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      <p className="card-text">{def.attackText}</p>
      <p className="card-text muted">{def.notes}</p>
      {def.drop && <p className="card-text">Drops: {def.drop}</p>}

      <div className="editor-grid">
        <Stepper label="HP" value={e.hp} min={0} max={99} onChange={(v) => patch({ hp: v }, `HP ${e.hp} → ${v}`)} />
        <StatusEditor status={e.status} onChange={(k, v) => patch({ status: { ...e.status, [k]: v } }, `${k} → ${v}`)} />
        {e.kind === 'warden' && (
          <>
            <Stepper label="Warden turns taken" value={e.turnCount ?? 0} min={0} max={99} onChange={(v) => patch({ turnCount: v }, `turn count → ${v}`)} />
            <label className="check">
              <input type="checkbox" checked={!!e.charge} onChange={(ev) => patch({ charge: ev.target.checked }, `charge ${ev.target.checked ? 'on' : 'off'}`)} />
              Holding a charge
            </label>
            {e.markedLine && (
              <button className="btn" onClick={() => patch({ markedLine: null }, 'marked line cleared')}>
                Clear marked line
              </button>
            )}
          </>
        )}
        {e.kind === 'redactor' && (
          <Stepper label="Marks" value={e.marks ?? 0} min={0} max={20} onChange={(v) => patch({ marks: v }, `marks → ${v}`)} />
        )}
        {e.kind === 'scrap' && (
          <Stepper label="Stolen fragments" value={e.stolen ?? 0} min={0} max={5} onChange={(v) => patch({ stolen: v }, `stolen → ${v}`)} />
        )}
      </div>

      <div className="editor-actions">
        <button className={`btn${moving ? ' btn-on' : ''}`} onClick={() => setPlaceMode(moving ? null : { kind: 'move', id: e.id })}>
          {moving ? 'Click a tile… (cancel)' : 'Move token'}
        </button>
        <button className="btn" onClick={() => run((s) => gmRemoveEnemy(s, e.id, true))}>
          Defeat (with loot)
        </button>
        <button className="btn btn-quiet" onClick={() => run((s) => gmRemoveEnemy(s, e.id, false))}>
          Remove
        </button>
      </div>
    </>
  );
}

function PlayerEditor({ state, run, placeMode, setPlaceMode, onClose }: EditorProps) {
  const p = state.player;
  const moving = placeMode?.kind === 'move' && placeMode.id === 'player';
  return (
    <>
      <header className="inspector-head">
        <span className="mini-token big" style={{ background: PLAYER_COLOR }}>
          YOU
        </span>
        <div>
          <h2>Your wizard</h2>
          <p className="muted">On {coordLabel(p.pos)}</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      <div className="editor-grid">
        <Stepper label="HP" value={p.hp} min={0} max={p.maxHp} onChange={(v) => run((s) => gmPatchPlayer(s, { hp: v }, `YOUR HP ${p.hp} → ${v}`))} />
        <Stepper label="Mana" value={p.mana} min={0} max={p.maxMana} onChange={(v) => run((s) => gmPatchPlayer(s, { mana: v }, `YOUR mana ${p.mana} → ${v}`))} />
        <Stepper label="Potions" value={p.potions} min={0} max={5} onChange={(v) => run((s) => gmPatchPlayer(s, { potions: v }, `potions → ${v}`))} />
        <Stepper
          label="Actions left"
          value={state.actionsLeft}
          min={0}
          max={RULES.actionsPerTurn}
          onChange={(v) => run((s) => gmEdit(s, `actions left → ${v}`, (d) => void (d.actionsLeft = v)))}
        />
        <StatusEditor status={p.status} onChange={(k, v) => run((s) => gmPatchPlayer(s, { status: { ...p.status, [k]: v } }, `YOUR ${k} → ${v}`))} />
        <label className="check">
          <input
            type="checkbox"
            checked={p.unstableUsed}
            onChange={(ev) => run((s) => gmPatchPlayer(s, { unstableUsed: ev.target.checked }, `Unstable Fire ${ev.target.checked ? 'spent' : 'ready'}`))}
          />
          Unstable Fire already used
        </label>
      </div>
      <div className="editor-actions">
        <button className={`btn${moving ? ' btn-on' : ''}`} onClick={() => setPlaceMode(moving ? null : { kind: 'move', id: 'player' })}>
          {moving ? 'Click a tile… (cancel)' : 'Move token'}
        </button>
      </div>
    </>
  );
}

const PLACEABLE: EnemyKind[] = ['rat', 'archer', 'brute', 'leech', 'warden', 'ward', 'scrap', 'redactor'];

function TableTools({ state, run, placeMode, setPlaceMode }: Omit<EditorProps, 'onClose'>) {
  const [kind, setKind] = useState<EnemyKind>('scrap');
  const [element, setElement] = useState<Element>('fire');
  const adding = placeMode?.kind === 'add';
  const exit = state.room.exit;
  return (
    <>
      <h2>Table fixes</h2>
      <p className="hint">Select a token on the board to edit its HP, statuses or position. Every fix is recorded in the log.</p>
      <div className="place-row">
        <select value={kind} onChange={(e) => setKind(e.target.value as EnemyKind)} aria-label="Unit type">
          {PLACEABLE.map((k) => (
            <option key={k} value={k}>
              {ENEMY_DEFS[k].typeNum}. {ENEMY_DEFS[k].name}
            </option>
          ))}
        </select>
        {kind === 'ward' && (
          <select value={element} onChange={(e) => setElement(e.target.value as Element)} aria-label="Ward element">
            <option value="fire">Fire</option>
            <option value="water">Water</option>
            <option value="rock">Rock</option>
          </select>
        )}
        <button
          className={`btn${adding ? ' btn-on' : ''}`}
          onClick={() => setPlaceMode(adding ? null : { kind: 'add', enemy: kind, element: kind === 'ward' ? element : undefined })}
        >
          {adding ? 'Click a tile… (cancel)' : 'Place unit'}
        </button>
      </div>
      {exit && (
        <button
          className="btn"
          onClick={() => run((s) => gmEdit(s, `exit ${exit.locked ? 'unlocked' : 'locked'}`, (d) => void (d.room.exit!.locked = !exit.locked)))}
        >
          {exit.locked ? 'Unlock exit' : 'Lock exit'}
        </button>
      )}
    </>
  );
}
