import { useLayoutEffect, useRef, useState } from 'react';
import {
  ENEMY_DEFS,
  RULES,
  actionsNextTurn,
  chebyshev,
  coordLabel,
  redactorMarksFull,
  wardenChargedNextTurn,
  wardenSightLine,
  wardsSpawnOn,
  wardsStanding,
  type Enemy,
  type GameState,
  type Intent,
  type Statuses,
} from '../engine';
import { PLAYER_COLOR, cap, describeIntents, hpColor, tokenColor, unitTitle } from './look';

interface Props {
  state: GameState;
  /** The unit's planned actions for the coming enemy turn. */
  intents?: Intent[];
  /** Enemy id or "player". */
  unitId: string;
  /** Screen rect of the hovered token; the card is placed beside it. */
  anchor: DOMRect;
}

/** Hover card explaining what a unit is, how it behaves, and what it's doing right now. */
export function UnitTooltip({ state, intents, unitId, anchor }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const enemy = state.enemies.find((e) => e.id === unitId);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const gap = 10;
    const pad = 8;
    const { offsetWidth: w, offsetHeight: h } = el;
    let left = anchor.right + gap;
    if (left + w > window.innerWidth - pad) left = anchor.left - gap - w;
    left = Math.max(pad, left);
    const top = Math.max(pad, Math.min(anchor.top, window.innerHeight - h - pad));
    setPos({ left, top });
  }, [anchor, unitId, state]);

  if (unitId !== 'player' && !enemy) return null;

  return (
    <div
      ref={ref}
      className="unit-tip"
      role="tooltip"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0, visibility: 'hidden' }}
    >
      {enemy ? <EnemyInfo state={state} e={enemy} intents={intents} /> : <PlayerInfo state={state} />}
      <p className="tip-foot">Click the token to edit it.</p>
    </div>
  );
}

function HpLine({ hp, max }: { hp: number; max: number }) {
  return (
    <div className="tip-hp">
      <span className="tip-hp-track">
        <span className="tip-hp-fill" style={{ width: `${Math.max(0, Math.min(1, hp / max)) * 100}%`, background: hpColor(hp, max) }} />
      </span>
      <span className="tip-hp-text">
        {hp}/{max} HP
      </span>
    </div>
  );
}

function statusLines(st: Statuses, who: string): string[] {
  const out: string[] = [];
  if (st.burn > 0) out.push(`Burning, ${st.burn} tick${st.burn === 1 ? '' : 's'} left: ${who} take${who === 'you' ? '' : 's'} 1 dmg before each action.`);
  if (st.root > 0) out.push(`Rooted: ${who === 'you' ? 'you' : 'it'} can’t move next turn.`);
  if (st.stun > 0) out.push(`Stunned: ${who === 'you' ? 'you' : 'it'} can’t attack next turn.`);
  return out;
}

/** What this particular unit is set up to do, given the board as it is now. */
function situation(state: GameState, e: Enemy): string[] {
  const lines = statusLines(e.status, 'it');
  const p = state.player.pos;
  const wardsLeft = state.enemies.filter((x) => x.kind === 'ward').length;

  switch (e.kind) {
    case 'warden':
      if (e.markedLine?.length) {
        lines.push(`Line marked (${coordLabel(e.markedLine[0])}–${coordLabel(e.markedLine[e.markedLine.length - 1])}): fires ${RULES.wardenShotDamage} dmg at the start of its next turn. Get off the red tiles.`);
      }
      if (e.charge) lines.push('Holding a telegraph charge this turn.');
      else if (wardenChargedNextTurn(e)) {
        lines.push(wardenSightLine(state, e) ? 'Charged next turn, and it can see you right now.' : 'Charged next turn: it will try to get a clear line to you.');
      } else lines.push('No charge next turn: it only repositions.');
      lines.push('Killing it unlocks the exit.');
      break;
    case 'ward':
      lines.push(`Only ${e.element} spells hurt it.`);
      lines.push(
        wardsSpawnOn(state.turn)
          ? `Spawns a Page Scrap at the end of enemy turn ${state.turn}.`
          : `No Page Scrap after enemy turn ${state.turn}; the next one comes after turn ${state.turn + 1}.`,
      );
      break;
    case 'scrap': {
      const held = e.stolen ?? 0;
      if (held > 0) lines.push(`Holding ${held} stolen fragment${held === 1 ? '' : 's'}. Kill it to get ${held === 1 ? 'it' : 'them'} back in your hand.`);
      if (!wardsStanding(state)) lines.push('The Wards are down: it only blocks you now.');
      else if (e.delivered) lines.push('Already gave the Redactor its mark: it keeps away from you.');
      else if (held > 0) lines.push('Carrying the fragment to the Redactor for a mark.');
      else if (redactorMarksFull(state)) lines.push(`The Redactor's marks are full (${RULES.redactorMaxMarks}/${RULES.redactorMaxMarks}): it won't steal.`);
      break;
    }
    case 'redactor': {
      const marks = e.marks ?? 0;
      const markText = `${marks}/${RULES.redactorMaxMarks} marks`;
      if (wardsLeft > 0) {
        lines.push(`Immune: ${wardsLeft} Page Ward${wardsLeft === 1 ? '' : 's'} still standing.`);
        lines.push(`${markText}. Page Scraps add one each time they bring it a stolen fragment.`);
      } else if (marks > 0) {
        lines.push(`${markText} left: each one buys a Chaos turn (${RULES.redactorActions.chaos} actions, a cooldown after each explosion).`);
      } else {
        lines.push(`Out of marks: ${RULES.redactorActions.spent} actions per turn from now on.`);
      }
      if (chebyshev(e.pos, p) === 1) lines.push('You’re in its blast zone.');
      break;
    }
  }
  return lines;
}

function EnemyInfo({ state, e, intents }: { state: GameState; e: Enemy; intents?: Intent[] }) {
  const def = ENEMY_DEFS[e.kind];
  const actions = actionsNextTurn(state, e);
  const now = situation(state, e);
  return (
    <>
      <header className="tip-head">
        <span className="mini-token" style={{ background: tokenColor(e) }}>
          {e.id}
        </span>
        <span className="tip-title">{unitTitle(e)}</span>
        <span className="tip-where">{coordLabel(e.pos)}</span>
      </header>
      <HpLine hp={e.hp} max={e.maxHp} />
      <dl className="tip-facts">
        <dt>Actions</dt>
        <dd>
          {actions === 0 ? 'None' : `${actions} per turn`}
          {e.kind === 'redactor' && actions !== def.actions ? ' (next turn)' : ''}
        </dd>
        <dt>Attack</dt>
        <dd>{def.attackText}</dd>
      </dl>
      {(intents?.length ?? 0) > 0 && (
        <p className="tip-intent">
          <strong>Next turn:</strong> {describeIntents(intents)}
        </p>
      )}
      <p className="tip-behavior">{def.behavior}</p>
      {now.length > 0 && (
        <ul className="tip-now" aria-label="Right now">
          {now.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      <p className="tip-drop">{def.drop ? `Drops: ${def.drop}` : e.kind === 'redactor' ? 'Beat it to win the demo.' : 'Drops nothing.'}</p>
    </>
  );
}

function PlayerInfo({ state }: { state: GameState }) {
  const p = state.player;
  const now = statusLines(p.status, 'you');
  return (
    <>
      <header className="tip-head">
        <span className="mini-token" style={{ background: PLAYER_COLOR }}>
          YOU
        </span>
        <span className="tip-title">Your wizard</span>
        <span className="tip-where">{coordLabel(p.pos)}</span>
      </header>
      <HpLine hp={p.hp} max={p.maxHp} />
      <dl className="tip-facts">
        <dt>Mana</dt>
        <dd>
          {p.mana}/{p.maxMana}
        </dd>
        <dt>Actions</dt>
        <dd>{state.phase === 'player' ? `${state.actionsLeft} of ${RULES.actionsPerTurn} left this turn` : `${RULES.actionsPerTurn} per turn`}</dd>
        <dt>Potion</dt>
        <dd>{p.potions ? `${p.potions} (+${RULES.potionHeal} HP each)` : 'None'}</dd>
        <dt>Unstable Fire</dt>
        <dd>{p.unstableUsed ? 'Used in this room' : 'Ready'}</dd>
      </dl>
      {now.length > 0 && (
        <ul className="tip-now">
          {now.map((l) => (
            <li key={l}>{cap(l)}</li>
          ))}
        </ul>
      )}
    </>
  );
}
