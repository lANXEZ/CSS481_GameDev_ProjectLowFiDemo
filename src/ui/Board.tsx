import { useEffect, useMemo, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { coordLabel, posKey, wardsStanding, type Enemy, type GameState, type Pos } from '../engine';
import { ELEMENT_COLOR, PLAYER_COLOR, hpColor, tokenColor, unitTitle } from './look';
import { UnitTooltip } from './UnitTooltip';

const T = 80; // tile size in SVG units
const M = 26; // margin for coordinate labels

export interface BoardHighlights {
  /** Tiles the player can step onto (clickable). */
  moves?: Pos[];
  /** Tiles the pending spell will hit. */
  spell?: Pos[];
  /** Tiles involved in the enemy step being shown. */
  focus?: Pos[];
  /** Unit acting in the enemy step being shown. */
  actorId?: string | null;
  /** Tiles valid for a GM placement (move / add). */
  place?: Pos[];
}

interface Props {
  state: GameState;
  highlights: BoardHighlights;
  selectedId: string | null;
  onTileClick: (p: Pos) => void;
  onUnitClick: (id: string) => void;
}

export function Board({ state, highlights, selectedId, onTileClick, onUnitClick }: Props) {
  const { width: W, height: H } = state.room;
  const vbW = M + W * T + 6;
  const vbH = H * T + M + 6;

  const tx = (p: Pos) => M + p.x * T;
  const ty = (p: Pos) => (H - 1 - p.y) * T + 3;

  const sets = useMemo(() => {
    const toSet = (ps?: Pos[]) => new Set((ps ?? []).map(posKey));
    return {
      moves: toSet(highlights.moves),
      spell: toSet(highlights.spell),
      focus: toSet(highlights.focus),
      place: toSet(highlights.place),
      zone: toSet(state.redactionZone),
      marked: toSet(state.enemies.flatMap((e) => e.markedLine ?? [])),
      occupied: toSet([state.player.pos, ...state.enemies.map((e) => e.pos)]),
    };
  }, [highlights, state.redactionZone, state.enemies, state.player.pos]);

  const tiles: Pos[] = [];
  for (let y = H - 1; y >= 0; y--) for (let x = 0; x < W; x++) tiles.push({ x, y });

  const shielded = wardsStanding(state);

  // Hover card for the unit under the pointer (or keyboard focus).
  const [peek, setPeek] = useState<{ id: string; anchor: DOMRect } | null>(null);
  useEffect(() => {
    if (!peek) return;
    const clear = () => setPeek(null);
    window.addEventListener('scroll', clear, true);
    window.addEventListener('resize', clear);
    return () => {
      window.removeEventListener('scroll', clear, true);
      window.removeEventListener('resize', clear);
    };
  }, [peek]);

  const handlers = (id: string): UnitHandlers => ({
    onClick: () => onUnitClick(id),
    onPeek: (el) => setPeek({ id, anchor: el.getBoundingClientRect() }),
    onUnpeek: () => setPeek((cur) => (cur?.id === id ? null : cur)),
  });

  return (
    <>
      <svg
        className="board"
        viewBox={`0 0 ${vbW} ${vbH}`}
        preserveAspectRatio="xMinYMin meet"
        role="grid"
        aria-label={`${state.room.name} board, ${W} by ${H}`}
      >
        <defs>
          <pattern id="hatch-red" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="10" height="10" fill="rgba(178,40,40,0.18)" />
            <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(178,40,40,0.75)" strokeWidth="4" />
          </pattern>
          <filter id="token-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodColor="#2a1c10" floodOpacity="0.45" />
          </filter>
        </defs>

        {/* vellum page */}
        <rect x={M - 4} y={-1} width={W * T + 8} height={H * T + 8} rx={6} className="board-page" />

        {tiles.map((p) => {
          const k = posKey(p);
          const x = tx(p);
          const y = ty(p);
          const clickable = sets.moves.has(k) || sets.place.has(k);
          return (
            <g
              key={k}
              className={`tile${clickable ? ' tile-clickable' : ''}`}
              onClick={() => onTileClick(p)}
              role="gridcell"
              aria-label={coordLabel(p)}
            >
              <rect x={x} y={y} width={T} height={T} className={(p.x + p.y) % 2 ? 'tile-a' : 'tile-b'} />
              {sets.marked.has(k) && <rect x={x} y={y} width={T} height={T} fill="url(#hatch-red)" />}
              {sets.zone.has(k) && <Redacted x={x} y={y} occupied={sets.occupied.has(k)} />}
              {sets.spell.has(k) && <rect x={x + 2} y={y + 2} width={T - 4} height={T - 4} rx={4} className="hl-spell" />}
              {sets.focus.has(k) && <rect x={x + 3} y={y + 3} width={T - 6} height={T - 6} rx={5} className="hl-focus" />}
              {sets.moves.has(k) && <circle cx={x + T / 2} cy={y + T / 2} r={9} className="hl-move" />}
              {sets.place.has(k) && <rect x={x + 6} y={y + 6} width={T - 12} height={T - 12} rx={6} className="hl-place" />}
            </g>
          );
        })}

        {/* coordinate labels, matching the paper boards */}
        {Array.from({ length: W }, (_, x) => (
          <text key={`cx${x}`} x={M + x * T + T / 2} y={H * T + M - 6} className="coord">
            {String.fromCharCode(97 + x)}
          </text>
        ))}
        {Array.from({ length: H }, (_, y) => (
          <text key={`cy${y}`} x={M / 2 - 2} y={(H - 1 - y) * T + T / 2 + 8} className="coord">
            {y + 1}
          </text>
        ))}

        {state.room.pillars.map((p) => (
          <g key={`pil${posKey(p)}`} pointerEvents="none">
            <rect x={tx(p) + 14} y={ty(p) + 14} width={T - 28} height={T - 28} rx={6} className="pillar" />
            <rect x={tx(p) + 14} y={ty(p) + 14} width={T - 28} height={7} rx={3} className="pillar-cap" />
            <text x={tx(p) + T / 2} y={ty(p) + T / 2 + 6} className="pillar-label">PIL</text>
          </g>
        ))}

        {state.room.exit && (
          <g pointerEvents="none">
            <rect
              x={tx(state.room.exit.pos) + 7}
              y={ty(state.room.exit.pos) + 7}
              width={T - 14}
              height={T - 14}
              rx={3}
              className={state.room.exit.locked ? 'exit exit-locked' : 'exit'}
            />
            <text x={tx(state.room.exit.pos) + T / 2} y={ty(state.room.exit.pos) + T / 2 + (state.room.exit.locked ? 0 : 5)} className="exit-label">
              EXIT
            </text>
            {state.room.exit.locked && (
              <text x={tx(state.room.exit.pos) + T / 2} y={ty(state.room.exit.pos) + T / 2 + 15} className="exit-sub">
                locked
              </text>
            )}
          </g>
        )}

        {state.enemies.map((e) => (
          <EnemyToken
            key={e.id}
            e={e}
            x={tx(e.pos)}
            y={ty(e.pos)}
            selected={selectedId === e.id}
            acting={highlights.actorId === e.id}
            shielded={e.kind === 'redactor' && shielded}
            {...handlers(e.id)}
          />
        ))}

        <PlayerToken state={state} x={tx(state.player.pos)} y={ty(state.player.pos)} selected={selectedId === 'player'} {...handlers('player')} />
      </svg>
      {peek && <UnitTooltip state={state} unitId={peek.id} anchor={peek.anchor} />}
    </>
  );
}

/**
 * Black bars, like a redacted line of text, over tiles the Redactor has blasted.
 * The bars leave the middle free for the move dot; tiles under a token only get a black frame.
 */
function Redacted({ x, y, occupied }: { x: number; y: number; occupied: boolean }) {
  return (
    <g className="redacted" pointerEvents="none">
      <rect x={x} y={y} width={T} height={T} className="redacted-tint" />
      {occupied ? (
        <rect x={x + 3} y={y + 3} width={T - 6} height={T - 6} className="redacted-frame" />
      ) : (
        <>
          <rect x={x + 9} y={y + 10} width={T - 22} height={8} className="redacted-bar" />
          <rect x={x + 9} y={y + 21} width={T - 40} height={8} className="redacted-bar" />
          <rect x={x + 9} y={y + 53} width={T - 18} height={8} className="redacted-bar" />
          <rect x={x + 9} y={y + 64} width={T - 34} height={8} className="redacted-bar" />
        </>
      )}
    </g>
  );
}

function HpBar({ x, y, hp, max }: { x: number; y: number; hp: number; max: number }) {
  const w = 58;
  const fill = Math.max(0, Math.min(1, hp / max)) * w;
  return (
    <g pointerEvents="none">
      <rect x={x + (T - w) / 2} y={y + 58} width={w} height={9} rx={2} className="hp-track" />
      <rect x={x + (T - w) / 2} y={y + 58} width={fill} height={9} rx={2} fill={hpColor(hp, max)} />
      <text x={x + T / 2} y={y + 77} className="hp-text">
        {hp}/{max}
      </text>
    </g>
  );
}

interface Badge {
  label: string;
  color: string;
  title: string;
}

function Badges({ x, y, badges }: { x: number; y: number; badges: Badge[] }) {
  return (
    <g pointerEvents="none">
      {badges.map((b, i) => (
        <g key={b.title} transform={`translate(${x + T - 13 - i * 21}, ${y + 11})`}>
          <rect x={-10} y={-8} width={20} height={16} rx={8} fill={b.color} stroke="#f7efdc" strokeWidth={1.5} />
          <text className="badge-text" y={4}>
            {b.label}
          </text>
        </g>
      ))}
    </g>
  );
}

function statusBadges(st: { burn: number; root: number; stun: number }): Badge[] {
  const out: Badge[] = [];
  if (st.burn > 0) out.push({ label: `B${st.burn}`, color: ELEMENT_COLOR.fire, title: `Burn, ${st.burn} ticks left` });
  if (st.root > 0) out.push({ label: 'R', color: ELEMENT_COLOR.water, title: 'Rooted: can’t move next turn' });
  if (st.stun > 0) out.push({ label: 'S', color: ELEMENT_COLOR.rock, title: 'Stunned: can’t attack next turn' });
  return out;
}

interface UnitHandlers {
  onClick: () => void;
  /** Show the hover card next to this token. */
  onPeek: (el: Element) => void;
  onUnpeek: () => void;
}

const canHover = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover)').matches;

/** Shared pointer / keyboard wiring for a token: click to select, hover or focus to show the card. */
function unitProps({ onClick, onPeek, onUnpeek }: UnitHandlers) {
  return {
    className: 'unit',
    role: 'button',
    tabIndex: 0,
    onClick,
    onKeyDown: (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        onClick();
      }
    },
    onMouseEnter: (ev: MouseEvent) => canHover() && onPeek(ev.currentTarget),
    onMouseLeave: onUnpeek,
    onFocus: (ev: FocusEvent) => onPeek(ev.currentTarget),
    onBlur: onUnpeek,
  };
}

interface EnemyTokenProps extends UnitHandlers {
  e: Enemy;
  x: number;
  y: number;
  selected: boolean;
  acting: boolean;
  shielded: boolean;
}

function EnemyToken({ e, x, y, selected, acting, shielded, ...handlers }: EnemyTokenProps) {
  const cx = x + T / 2;
  const cy = y + 31;
  const badges = statusBadges(e.status);
  if (e.kind === 'warden' && e.charge) badges.push({ label: '⚡', color: '#a07a2c', title: 'Holding a telegraph charge' });
  if (e.kind === 'redactor' && (e.marks ?? 0) > 0) badges.push({ label: `M${e.marks}`, color: '#3d2a4a', title: `${e.marks} marks` });
  if (e.kind === 'scrap' && (e.stolen ?? 0) > 0) badges.push({ label: `F${e.stolen}`, color: '#7d5ba6', title: `Holding ${e.stolen} stolen fragment(s)` });
  const isBoss = e.kind === 'redactor';
  const r = isBoss ? 25 : 22;

  return (
    <g {...unitProps(handlers)} aria-label={`${unitTitle(e)} ${e.id}, ${e.hp} of ${e.maxHp} HP`}>
      {(selected || acting) && <circle cx={cx} cy={cy} r={r + 5} className={acting ? 'ring-acting' : 'ring-selected'} />}
      {shielded && <circle cx={cx} cy={cy} r={r + 3} className="ring-shield" />}
      {e.kind === 'redactor' && e.mode === 'redacting' && <circle cx={cx} cy={cy} r={r + 3} className="ring-redacting" />}
      <circle cx={cx} cy={cy} r={r} fill={tokenColor(e)} filter="url(#token-shadow)" className="token" />
      {e.kind === 'warden' && <path d={`M${cx - 10} ${cy - 13} l4 -8 l6 5 l6 -5 l4 8 z`} className="crown" />}
      <text x={cx} y={cy + (e.element || isBoss ? 1 : 6)} className="token-num">
        {e.typeNum}
        <tspan className="token-sub">{e.id.slice(1)}</tspan>
      </text>
      {e.element && (
        <text x={cx} y={cy + 13} className="token-tag">
          {e.element}
        </text>
      )}
      {isBoss && (
        <text x={cx} y={cy + 13} className="token-tag">
          boss
        </text>
      )}
      <HpBar x={x} y={y} hp={e.hp} max={e.maxHp} />
      <Badges x={x} y={y} badges={badges} />
    </g>
  );
}

function PlayerToken({ state, x, y, selected, ...handlers }: { state: GameState; x: number; y: number; selected: boolean } & UnitHandlers) {
  const p = state.player;
  const cx = x + T / 2;
  const cy = y + 31;
  return (
    <g {...unitProps(handlers)} aria-label={`You, ${p.hp} of ${p.maxHp} HP`}>
      {selected && <circle cx={cx} cy={cy} r={27} className="ring-selected" />}
      <circle cx={cx} cy={cy} r={22} fill={PLAYER_COLOR} filter="url(#token-shadow)" className="token" />
      <text x={cx} y={cy + 5} className="token-you">
        YOU
      </text>
      <HpBar x={x} y={y} hp={p.hp} max={p.maxHp} />
      <Badges x={x} y={y} badges={statusBadges(p.status)} />
    </g>
  );
}
