import { useCallback, useEffect, useState } from 'react';
import { createGame, type GameState } from '../engine';

const STORAGE_KEY = 'broken-grimoire-tracker/v1';
const HISTORY_LIMIT = 200;
const SAVED_HISTORY = 40;

interface History {
  past: GameState[];
  present: GameState;
  future: GameState[];
}

/** Fill in fields added after a game was saved, so older saves keep working. */
function upgrade(s: GameState): GameState {
  const old = s as GameState & { redactionZone?: GameState['erasureZone'] };
  return {
    ...s,
    // "Redaction zone" was renamed to "Erasure zone".
    erasureZone: s.erasureZone ?? old.redactionZone ?? [],
    pendingLoot: (s.pendingLoot ?? []).map((n) => ({ ...n, toHand: n.toHand ?? [] })),
    // "Redacting mode" was renamed to "Chaos mode".
    enemies: s.enemies.map((e) => ((e.mode as string) === 'redacting' ? { ...e, mode: 'chaos' } : e)),
  };
}

function load(): History {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as History;
      if (saved?.present?.room) return { past: (saved.past ?? []).map(upgrade), present: upgrade(saved.present), future: [] };
    }
  } catch {
    // Storage blocked or corrupt: start fresh.
  }
  return { past: [], present: createGame(), future: [] };
}

export interface GameApi {
  state: GameState;
  /** The state before the most recent change (for "what changed" summaries). */
  previous: GameState | null;
  error: string | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Apply an engine function. Rule errors are shown instead of thrown. */
  run: (fn: (s: GameState) => GameState) => boolean;
  /** Change the current state without adding an undo step (for bookkeeping like dismissing popups). */
  amend: (fn: (s: GameState) => GameState) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  clearError: () => void;
}

export function useGame(): GameApi {
  const [history, setHistory] = useState<History>(load);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ past: history.past.slice(-SAVED_HISTORY), present: history.present, future: [] }),
      );
    } catch {
      // Quota exceeded or storage blocked: the session still works, it just won't survive a reload.
    }
  }, [history]);

  const run = useCallback(
    (fn: (s: GameState) => GameState) => {
      try {
        const next = fn(history.present);
        setHistory({ past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: next, future: [] });
        setError(null);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [history],
  );

  const amend = useCallback((fn: (s: GameState) => GameState) => {
    setHistory((h) => ({ ...h, present: fn(h.present) }));
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h));
    setError(null);
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h));
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setHistory((h) => ({ past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: createGame(), future: [] }));
    setError(null);
  }, []);

  return {
    state: history.present,
    previous: history.past[history.past.length - 1] ?? null,
    error,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    run,
    amend,
    undo,
    redo,
    reset,
    clearError: () => setError(null),
  };
}
