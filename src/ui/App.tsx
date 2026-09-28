import { useEffect, useMemo, useState } from 'react';
import {
  ENEMY_DEFS,
  ROOMS,
  advanceRoom,
  canPlaceAt,
  endPlayerTurn,
  enemyName,
  gmAddEnemy,
  gmMoveEnemy,
  gmMovePlayer,
  moveTarget,
  planEnemyTurn,
  playerCast,
  playerDrinkPotion,
  playerMeditate,
  playerMove,
  playerReroll,
  playerUnstableFire,
  spellTiles,
  unstableTiles,
  type Dir,
  type GameState,
  type Pos,
  type SpellSpec,
} from '../engine';
import { ActionPanel } from './ActionPanel';
import { Board, type BoardHighlights } from './Board';
import { EnemyTurnPanel } from './EnemyTurnPanel';
import { Inspector, type PlaceMode } from './Inspector';
import { LogPanel } from './LogPanel';
import { TurnTracker, WizardCard } from './Panels';
import { SpinWheel } from './SpinWheel';
import { useGame } from './useGame';

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const KEY_DIRS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

export function App() {
  const game = useGame();
  const { state, run } = game;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placeMode, setPlaceMode] = useState<PlaceMode>(null);
  const [spec, setSpec] = useState<SpellSpec>({ element: 'fire', elementCount: 1, shape: 'beam', shapeCount: 1 });
  const [previewDir, setPreviewDir] = useState<Dir | null>(null);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);

  // The enemy turn is fully determined by the state (seeded RNG), so it can be derived.
  const plan = useMemo(() => (state.phase === 'enemy' ? planEnemyTurn(state) : null), [state]);
  useEffect(() => setStepIndex(-1), [plan]);

  // Drop a selection whose unit has died.
  useEffect(() => {
    if (selectedId && selectedId !== 'player' && !state.enemies.some((e) => e.id === selectedId)) setSelectedId(null);
  }, [state, selectedId]);

  const shown: GameState = plan && stepIndex >= 0 ? plan.steps[stepIndex].state : state;
  const step = plan && stepIndex >= 0 ? plan.steps[stepIndex] : null;

  const highlights: BoardHighlights = useMemo(() => {
    if (placeMode) {
      const place: Pos[] = [];
      for (let x = 0; x < state.room.width; x++)
        for (let y = 0; y < state.room.height; y++) if (canPlaceAt(state, { x, y })) place.push({ x, y });
      return { place };
    }
    if (step) return { focus: step.focus, actorId: step.actorId };
    if (state.phase !== 'player') return {};
    const moves = DIRS.map((d) => moveTarget(state, d)).filter((p): p is Pos => !!p);
    let spell: Pos[] = [];
    if (wheelOpen) spell = unstableTiles(state);
    else if (spec.shape === 'cross') spell = spellTiles(state, spec, null);
    else if (previewDir) spell = spellTiles(state, spec, previewDir);
    return { moves, spell };
  }, [placeMode, step, state, spec, previewDir, wheelOpen]);

  const act = (fn: (s: GameState) => GameState) => {
    setPreviewDir(null);
    return run(fn);
  };

  const onTileClick = (p: Pos) => {
    if (placeMode) {
      if (!canPlaceAt(state, p)) return;
      const ok =
        placeMode.kind === 'add'
          ? run((s) => gmAddEnemy(s, placeMode.enemy, p, placeMode.element))
          : placeMode.id === 'player'
            ? run((s) => gmMovePlayer(s, p))
            : run((s) => gmMoveEnemy(s, placeMode.id, p));
      if (ok) setPlaceMode(null);
      return;
    }
    if (state.phase !== 'player') return;
    const dir = DIRS.find((d) => {
      const t = moveTarget(state, d);
      return t && t.x === p.x && t.y === p.y;
    });
    if (dir) act((s) => playerMove(s, dir));
    else setSelectedId(null);
  };

  // Keyboard: arrows move, Ctrl+Z / Ctrl+Y undo and redo, Escape cancels placement.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) game.redo();
        else game.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        game.redo();
      } else if (e.key === 'Escape') {
        setPlaceMode(null);
        setSelectedId(null);
      } else if (KEY_DIRS[e.key] && state.phase === 'player' && !wheelOpen) {
        const d = KEY_DIRS[e.key];
        if (moveTarget(state, d)) {
          e.preventDefault();
          act((s) => playerMove(s, d));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Table actions produced by the most recent change, so nothing gets missed on the paper.
  const freshPaper = useMemo(() => {
    const prev = game.previous;
    if (!prev) return state.log.filter((l) => l.paper && l.roomIndex === state.roomIndex && l.turn === state.turn);
    return state.log.filter((l) => l.paper && l.id >= prev.nextLogId);
  }, [state, game.previous]);

  const newGame = () => {
    if (window.confirm('Start a new run from Room 1? You can still undo this.')) {
      game.reset();
      setSelectedId(null);
      setPlaceMode(null);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Broken Grimoire</h1>
          <span className="brand-sub">Board tracker for the paper demo</span>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-small" onClick={game.undo} disabled={!game.canUndo} title="Ctrl+Z">
            Undo
          </button>
          <button className="btn btn-small" onClick={game.redo} disabled={!game.canRedo} title="Ctrl+Y">
            Redo
          </button>
          <button className="btn btn-small btn-quiet" onClick={newGame}>
            New run
          </button>
        </div>
      </header>

      {game.error && (
        <div className="toast" role="alert" onClick={game.clearError}>
          {game.error}
        </div>
      )}

      <main className="layout">
        <div className="board-col">
          <div className="room-title">
            <h2>{state.room.name}</h2>
            <p>{state.room.blurb}</p>
          </div>
          <div className="board-frame">
            <Board
              state={shown}
              highlights={highlights}
              selectedId={selectedId}
              onTileClick={onTileClick}
              onUnitClick={(id) => {
                if (placeMode) return;
                setSelectedId(id === selectedId ? null : id);
              }}
            />
            {step && <div className="board-caption">Showing step {stepIndex + 1} of {plan!.steps.length}</div>}
          </div>
          <Legend />
          {freshPaper.length > 0 && state.phase === 'player' && (
            <div className="table-callout" aria-live="polite">
              <h3>Do on the table</h3>
              <ul>
                {freshPaper.map((l) => (
                  <li key={l.id}>{l.text}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="side">
          <div className="rail">
            <TurnTracker state={shown} />
            <WizardCard state={shown} />

            {state.phase === 'player' && (
              <ActionPanel
                state={state}
                spec={spec}
                setSpec={setSpec}
                setPreviewDir={setPreviewDir}
                onMove={(d) => act((s) => playerMove(s, d))}
                onCast={(d) => act((s) => playerCast(s, spec, d))}
                onUnstable={() => setWheelOpen(true)}
                onMeditate={() => act(playerMeditate)}
                onPotion={() => act(playerDrinkPotion)}
                onReroll={() => act(playerReroll)}
                onEndTurn={() => act(endPlayerTurn)}
              />
            )}

            {plan && (
              <EnemyTurnPanel state={state} plan={plan} stepIndex={stepIndex} setStepIndex={setStepIndex} onFinish={() => run(() => plan.final)} />
            )}

            <Inspector
              state={state}
              selectedId={selectedId}
              run={run}
              placeMode={placeMode}
              setPlaceMode={setPlaceMode}
              onClose={() => setSelectedId(null)}
            />
          </div>

          <div className="log-col">
            <LogPanel state={state} />
          </div>
        </div>
      </main>

      {wheelOpen && (
        <SpinWheel
          onCancel={() => setWheelOpen(false)}
          onApply={(dmg) => {
            setWheelOpen(false);
            act((s) => playerUnstableFire(s, dmg));
          }}
        />
      )}

      {state.phase === 'roomExit' && <RoomExitDialog state={state} onAdvance={() => run(advanceRoom)} onUndo={game.undo} />}
      {(state.phase === 'won' || state.phase === 'lost') && (
        <EndDialog won={state.phase === 'won'} onUndo={game.undo} onNew={() => game.reset()} />
      )}
    </div>
  );
}

function RoomExitDialog({ state, onAdvance, onUndo }: { state: GameState; onAdvance: () => void; onUndo: () => void }) {
  const left = state.enemies.filter((e) => ENEMY_DEFS[e.kind].drop);
  const next = ROOMS[state.roomIndex + 1];
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="exit-title">
      <div className="modal">
        <h2 id="exit-title">You reached the exit</h2>
        {left.length > 0 ? (
          <p>
            Leaving now forfeits the fragments of {left.map((e) => `${enemyName(e)} (${ENEMY_DEFS[e.kind].drop})`).join(', ')}.
          </p>
        ) : (
          <p>The room is clear.</p>
        )}
        <p className="hint">HP carries over and mana resets to 3. Set up the next board before continuing.</p>
        <div className="modal-actions">
          <button className="btn btn-quiet" onClick={onUndo}>
            Step back
          </button>
          <button className="btn btn-primary" onClick={onAdvance}>
            {next ? `Enter ${next.name}` : 'Finish the demo'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EndDialog({ won, onUndo, onNew }: { won: boolean; onUndo: () => void; onNew: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="end-title">
      <div className="modal">
        <h2 id="end-title">{won ? 'The grimoire is restored' : 'The wizard has fallen'}</h2>
        <p>{won ? 'You beat the demo. Export the log to keep this playtest.' : 'HP reached 0. Undo to replay the last step, or start over.'}</p>
        <div className="modal-actions">
          <button className="btn btn-quiet" onClick={onUndo}>
            Undo last step
          </button>
          <button className="btn btn-primary" onClick={onNew}>
            New run
          </button>
        </div>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <ul className="legend" aria-label="Board legend">
      <li>
        <span className="lg lg-move" /> Where you can step
      </li>
      <li>
        <span className="lg lg-spell" /> Spell hits
      </li>
      <li>
        <span className="lg lg-marked" /> Warden’s marked line
      </li>
      <li>
        <span className="lg lg-redacted" /> Redaction zone
      </li>
      <li>
        <span className="lg lg-shield" /> Protected by wards
      </li>
    </ul>
  );
}
