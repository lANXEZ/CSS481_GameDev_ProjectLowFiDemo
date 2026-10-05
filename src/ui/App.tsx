import { useEffect, useMemo, useState } from 'react';
import {
  ENEMY_DEFS,
  ROOMS,
  acknowledgeLoot,
  advanceRoom,
  canPlaceAt,
  comboFromCards,
  endPlayerTurn,
  enemyName,
  gmAddEnemy,
  gmMoveEnemy,
  gmMovePlayer,
  moveTarget,
  planEnemyTurn,
  previewIntents,
  playerCast,
  playerDrinkPotion,
  playerMeditate,
  playerMove,
  playerReroll,
  playerUnstableFire,
  spellTiles,
  unstableTiles,
  type Dir,
  type GameMode,
  type GameState,
  type Pos,
  type SpellSpec,
} from '../engine';
import { ActionPanel } from './ActionPanel';
import { Board, type BoardHighlights } from './Board';
import { EnemyTurnPanel } from './EnemyTurnPanel';
import { HandPanel } from './HandPanel';
import { Inspector, type PlaceMode } from './Inspector';
import { LogPanel } from './LogPanel';
import { LootDialog } from './LootDialog';
import { TurnTracker, WizardCard } from './Panels';
import { SpinWheel } from './SpinWheel';
import { useGame } from './useGame';

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const KEY_DIRS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const MODE_KEY = 'broken-grimoire/mode';

function loadMode(): GameMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'simulation' ? 'simulation' : 'tracker';
  } catch {
    return 'tracker';
  }
}

/** Picks the mode; each mode is its own game with its own save and undo history. */
export function App() {
  const [mode, setMode] = useState<GameMode>(loadMode);
  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // Storage blocked: the mode just isn't remembered.
    }
  }, [mode]);
  return <Game key={mode} mode={mode} onModeChange={setMode} />;
}

function ModeToggle({ mode, onChange }: { mode: GameMode; onChange: (m: GameMode) => void }) {
  const options: { value: GameMode; label: string; hint: string }[] = [
    { value: 'tracker', label: 'Board tracker', hint: 'Follow along with the paper game' },
    { value: 'simulation', label: 'Simulation', hint: 'Play the whole game here, cards included' },
  ];
  return (
    <div className="mode-toggle" role="radiogroup" aria-label="Mode">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={mode === o.value}
          className={`mode-option${mode === o.value ? ' is-on' : ''}`}
          onClick={() => onChange(o.value)}
          title={o.hint}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Game({ mode, onModeChange }: { mode: GameMode; onModeChange: (m: GameMode) => void }) {
  const game = useGame(mode);
  const { state, run } = game;
  const sim = mode === 'simulation';

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placeMode, setPlaceMode] = useState<PlaceMode>(null);
  const [chipSpec, setChipSpec] = useState<SpellSpec>({ element: 'fire', elementCount: 1, shape: 'beam', shapeCount: 1 });
  const [pickedCards, setPickedCards] = useState<number[]>([]);
  const [previewDir, setPreviewDir] = useState<Dir | null>(null);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);

  // Simulation: the spell is whatever the picked hand cards make. Picks of cards that left the hand are dropped.
  const hand = state.cards?.hand;
  const picked = useMemo(() => (hand ? pickedCards.filter((id) => hand.some((c) => c.id === id)) : []), [hand, pickedCards]);
  const combo = useMemo(() => (hand && picked.length ? comboFromCards(hand.filter((c) => picked.includes(c.id))) : null), [hand, picked]);
  const spec: SpellSpec | null = sim ? (combo?.kind === 'spell' ? combo.spec : null) : chipSpec;
  // Picks serve both actions: 2–3 cards craft a spell, any number can be rerolled.
  const togglePick = (id: number) => setPickedCards((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...picked, id]));

  // The enemy turn is fully determined by the state (seeded RNG), so it can be derived.
  const plan = useMemo(() => (state.phase === 'enemy' ? planEnemyTurn(state) : null), [state]);

  // Enemy intentions: during the player's turn, a preview of what each enemy does if the turn ended now.
  // Recomputed after every action; exact, because enemy randomness is seeded in the state.
  const intents = useMemo(() => (plan ? plan.intents : previewIntents(state)), [plan, state]);
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
    if (wheelOpen || combo?.kind === 'unstable') spell = unstableTiles(state);
    else if (spec?.shape === 'cross') spell = spellTiles(state, spec, null);
    else if (spec && previewDir) spell = spellTiles(state, spec, previewDir);
    return { moves, spell };
  }, [placeMode, step, state, spec, combo, previewDir, wheelOpen]);

  const act = (fn: (s: GameState) => GameState) => {
    setPreviewDir(null);
    return run(fn);
  };

  const cast = (dir: Dir | null) => {
    if (!spec) return;
    if (sim) {
      if (act((s) => playerCast(s, spec, dir, picked))) setPickedCards([]);
    } else {
      act((s) => playerCast(s, spec, dir));
    }
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
        setPickedCards([]);
      } else if (KEY_DIRS[e.key] && state.phase === 'player' && !document.querySelector('.modal-backdrop')) {
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
    if (window.confirm(`Start a new ${sim ? 'simulation' : 'run'} from Room 1? You can still undo this.`)) {
      game.reset();
      setSelectedId(null);
      setPlaceMode(null);
      setPickedCards([]);
    }
  };

  return (
    <div className={`app mode-${mode}`}>
      <header className="topbar">
        <div className="brand">
          <h1>Broken Grimoire</h1>
          <span className="brand-sub">{sim ? 'Full simulation of the demo' : 'Board tracker for the paper demo'}</span>
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
          <ModeToggle mode={mode} onChange={onModeChange} />
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
              intents={intents}
              highlights={highlights}
              selectedId={selectedId}
              onTileClick={onTileClick}
              onUnitClick={(id) => {
                if (placeMode) return;
                setSelectedId(id === selectedId ? null : id);
              }}
            />
            {step && (
              <div className="board-caption">
                Showing step {stepIndex + 1} of {plan!.steps.length}
              </div>
            )}
          </div>
          {sim && (
            <HandPanel
              state={shown}
              selected={picked}
              onToggle={togglePick}
              onClear={() => setPickedCards([])}
              combo={combo}
              interactive={state.phase === 'player' && !step}
            />
          )}
          <Legend />
          {!sim && freshPaper.length > 0 && state.phase === 'player' && (
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
                setSpec={sim ? undefined : setChipSpec}
                combo={sim ? combo : undefined}
                cardIds={sim ? picked : undefined}
                setPreviewDir={setPreviewDir}
                onMove={(d) => act((s) => playerMove(s, d))}
                onCast={cast}
                onUnstable={() => setWheelOpen(true)}
                onMeditate={() => act(playerMeditate)}
                onPotion={() => act(playerDrinkPotion)}
                onReroll={() => act((s) => playerReroll(s, picked)) && setPickedCards([])}
                onEndTurn={() => act(endPlayerTurn) && setPickedCards([])}
              />
            )}

            {plan && (
              <EnemyTurnPanel
                key={state.turn}
                state={state}
                plan={plan}
                stepIndex={stepIndex}
                setStepIndex={setStepIndex}
                onFinish={() => run(() => plan.final)}
                auto={sim}
              />
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
            if (act((s) => playerUnstableFire(s, dmg))) setPickedCards([]);
          }}
        />
      )}

      {state.pendingLoot.length > 0 && state.phase !== 'won' && state.phase !== 'lost' && (
        <LootDialog notices={state.pendingLoot} mode={mode} onConfirm={() => game.amend(acknowledgeLoot)} />
      )}
      {state.phase === 'roomExit' && <RoomExitDialog state={state} onAdvance={() => run(advanceRoom)} onUndo={game.undo} />}
      {(state.phase === 'won' || state.phase === 'lost') && (
        <EndDialog state={state} onUndo={game.undo} onNew={() => game.reset()} />
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
        <p className="hint">
          {state.cards
            ? 'HP carries over and mana resets to 3. Your hand, deck and discard pile are shuffled together and you draw 5.'
            : 'HP carries over and mana resets to 3. Set up the next board before continuing.'}
        </p>
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

function EndDialog({ state, onUndo, onNew }: { state: GameState; onUndo: () => void; onNew: () => void }) {
  const won = state.phase === 'won';
  const broken = state.lostReason === 'grimoire';
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="end-title">
      <div className="modal">
        <h2 id="end-title">{won ? 'The grimoire is restored' : broken ? 'The grimoire is broken' : 'The wizard has fallen'}</h2>
        <p>
          {won
            ? 'You beat the demo. Export the log to keep this playtest.'
            : broken
              ? 'Your hand, deck and discard pile no longer hold an element and a shape, so you can’t cast anything. Undo to replay the last step, or start over.'
              : 'HP reached 0. Undo to replay the last step, or start over.'}
        </p>
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
        <span className="lg lg-erased" /> Erasure zone
      </li>
      <li>
        <span className="lg lg-shield" /> Protected by wards
      </li>
    </ul>
  );
}
