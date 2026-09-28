import { useState } from 'react';
import { ROOMS, type GameState, type LogEntry } from '../engine';
import { SIDE_LABEL } from './look';

export function LogPanel({ state }: { state: GameState }) {
  const [tableOnly, setTableOnly] = useState(false);
  const entries = state.log.filter((l) => !tableOnly || l.paper);

  // Newest turn first; entries inside a turn stay in reading order.
  const groups: { key: string; title: string; items: LogEntry[] }[] = [];
  for (const entry of entries) {
    const key = `${entry.roomIndex}-${entry.turn}`;
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, title: `${ROOMS[entry.roomIndex]?.name ?? ''}, turn ${entry.turn}`, items: [] };
      groups.push(g);
    }
    g.items.push(entry);
  }
  groups.reverse();

  const exportLog = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), log: state.log, finalState: state }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `broken-grimoire-playtest-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel log" aria-label="Game log">
      <div className="log-head">
        <h2>Log</h2>
        <label className="check">
          <input type="checkbox" checked={tableOnly} onChange={(e) => setTableOnly(e.target.checked)} />
          Table actions only
        </label>
        <button className="btn btn-small" onClick={exportLog}>
          Export playtest log
        </button>
      </div>
      <div className="log-body">
        {groups.map((g) => (
          <div key={g.key} className="log-group">
            <h3>{g.title}</h3>
            <ul>
              {g.items.map((l) => (
                <li key={l.id} className={`log-line side-${l.side}${l.paper ? ' is-paper' : ''}`}>
                  <span className="log-side">{l.paper ? 'Table' : SIDE_LABEL[l.side]}</span>
                  <span>{l.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
