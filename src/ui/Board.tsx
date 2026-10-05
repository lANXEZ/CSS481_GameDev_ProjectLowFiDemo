import { useEffect, useMemo, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { RULES, coordLabel, posKey, wardsStanding, type Enemy, type GameState, type Intent, type IntentKind, type Pos } from '../engine';
import { MAP_ART, MAP_FRAME, OPEN_EXIT_ART, PLAYER_TOKEN_ART, STATUS_ART, tokenArt } from './art';
import { INTENT_INFO, groupIntents, hpColor, unitTitle, type IntentGroup } from './look';
import { UnitTooltip } from './UnitTooltip';

const T = 80; // tile size in SVG units
const OX = 32; // left margin (row numbers)
const OY = 12; // top margin (room for the map frame)
const FRAME = MAP_FRAME * T;

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
  /** What each enemy will do on its coming turn, shown above its token. */
  intents: Record<string, Intent[]>;
  highlights: BoardHighlights;
  selectedId: string | null;
  onTileClick: (p: Pos) => void;
  onUnitClick: (id: string) => void;
}

export function Board({ state, intents, highlights, selectedId, onTileClick, onUnitClick }: Props) {
  const { width: W, height: H } = state.room;
  const vbW = OX + W * T + FRAME + 4;
  const vbH = OY + H * T + FRAME + 26;

  const tx = (p: Pos) => OX + p.x * T;
  const ty = (p: Pos) => OY + (H - 1 - p.y) * T;

  // The kit's printed board for this room, or null for boards the kit doesn't have (tests, custom layouts).
  const art = MAP_ART[state.room.id] ?? null;
  const exit = state.room.exit;

  const sets = useMemo(() => {
    const toSet = (ps?: Pos[]) => new Set((ps ?? []).map(posKey));
    return {
      moves: toSet(highlights.moves),
      spell: toSet(highlights.spell),
      focus: toSet(highlights.focus),
      place: toSet(highlights.place),
      zone: toSet(state.erasureZone),
      marked: toSet(state.enemies.flatMap((e) => e.markedLine ?? [])),
      occupied: toSet([state.player.pos, ...state.enemies.map((e) => e.pos)]),
    };
  }, [highlights, state.erasureZone, state.enemies, state.player.pos]);

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

        {art ? (
          <>
            {/* the printed board: floor, pillars, START and EXIT are all in the picture */}
            <image
              href={art.src}
              x={OX - FRAME}
              y={OY - FRAME}
              width={W * T + 2 * FRAME}
              height={H * T + 2 * FRAME}
              preserveAspectRatio="none"
              className="board-art"
            />
            {exit && !exit.locked && art.exitLocked && (
              <image href={OPEN_EXIT_ART} x={tx(exit.pos)} y={ty(exit.pos)} width={T} height={T} preserveAspectRatio="none" pointerEvents="none" />
            )}
            {exit && exit.locked && !art.exitLocked && <LockedExit x={tx(exit.pos)} y={ty(exit.pos)} />}
          </>
        ) : (
          /* vellum page */
          <rect x={OX - 4} y={OY - 4} width={W * T + 8} height={H * T + 8} rx={6} className="board-page" />
        )}

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
              <rect x={x} y={y} width={T} height={T} className={art ? 'tile-art' : (p.x + p.y) % 2 ? 'tile-a' : 'tile-b'} />
              {sets.marked.has(k) && <rect x={x} y={y} width={T} height={T} fill="url(#hatch-red)" />}
              {sets.zone.has(k) && <Erased x={x} y={y} occupied={sets.occupied.has(k)} />}
              {sets.spell.has(k) && <rect x={x + 2} y={y + 2} width={T - 4} height={T - 4} rx={4} className="hl-spell" />}
              {sets.focus.has(k) && <rect x={x + 3} y={y + 3} width={T - 6} height={T - 6} rx={5} className="hl-focus" />}
              {sets.moves.has(k) && <circle cx={x + T / 2} cy={y + T / 2} r={9} className="hl-move" />}
              {sets.place.has(k) && <rect x={x + 6} y={y + 6} width={T - 12} height={T - 12} rx={6} className="hl-place" />}
            </g>
          );
        })}

        {/* coordinate labels, matching the paper boards */}
        {Array.from({ length: W }, (_, x) => (
          <text key={`cx${x}`} x={OX + x * T + T / 2} y={OY + H * T + FRAME + 19} className="coord">
            {String.fromCharCode(97 + x)}
          </text>
        ))}
        {Array.from({ length: H }, (_, y) => (
          <text key={`cy${y}`} x={(OX - FRAME) / 2} y={OY + (H - 1 - y) * T + T / 2 + 5} className="coord">
            {y + 1}
          </text>
        ))}

        {!art &&
          state.room.pillars.map((p) => (
            <g key={`pil${posKey(p)}`} pointerEvents="none">
              <rect x={tx(p) + 14} y={ty(p) + 14} width={T - 28} height={T - 28} rx={6} className="pillar" />
              <rect x={tx(p) + 14} y={ty(p) + 14} width={T - 28} height={7} rx={3} className="pillar-cap" />
              <text x={tx(p) + T / 2} y={ty(p) + T / 2 + 6} className="pillar-label">PIL</text>
            </g>
          ))}

        {!art && exit && (exit.locked ? <LockedExit x={tx(exit.pos)} y={ty(exit.pos)} /> : <OpenExit x={tx(exit.pos)} y={ty(exit.pos)} />)}

        {state.enemies.map((e) => (
          <EnemyToken
            key={e.id}
            e={e}
            x={tx(e.pos)}
            y={ty(e.pos)}
            selected={selectedId === e.id}
            acting={highlights.actorId === e.id}
            shielded={e.kind === 'redactor' && shielded}
            showLetter={e.kind !== 'ward' && e.kind !== 'redactor' && (state.typeCounters[e.typeNum] ?? 0) > 1}
            intents={intents[e.id]}
            {...handlers(e.id)}
          />
        ))}

        <PlayerToken state={state} x={tx(state.player.pos)} y={ty(state.player.pos)} selected={selectedId === 'player'} {...handlers('player')} />
      </svg>
      {peek && <UnitTooltip state={state} intents={intents[peek.id]} unitId={peek.id} anchor={peek.anchor} />}
    </>
  );
}

/** Drawn exit, for boards without kit art (and over a printed open exit that the GM locked). */
function LockedExit({ x, y }: { x: number; y: number }) {
  return (
    <g pointerEvents="none">
      <rect x={x + 7} y={y + 7} width={T - 14} height={T - 14} rx={3} className="exit exit-locked" />
      <text x={x + T / 2} y={y + T / 2} className="exit-label">
        EXIT
      </text>
      <text x={x + T / 2} y={y + T / 2 + 15} className="exit-sub">
        locked
      </text>
    </g>
  );
}

function OpenExit({ x, y }: { x: number; y: number }) {
  return (
    <g pointerEvents="none">
      <rect x={x + 7} y={y + 7} width={T - 14} height={T - 14} rx={3} className="exit" />
      <text x={x + T / 2} y={y + T / 2 + 5} className="exit-label">
        EXIT
      </text>
    </g>
  );
}

/**
 * Black bars, like an erased line of text, over tiles the Redactor has blasted.
 * The bars leave the middle free for the move dot; tiles under a token only get a black frame.
 */
function Erased({ x, y, occupied }: { x: number; y: number; occupied: boolean }) {
  return (
    <g className="erased" pointerEvents="none">
      <rect x={x} y={y} width={T} height={T} className="erased-tint" />
      {occupied ? (
        <rect x={x + 3} y={y + 3} width={T - 6} height={T - 6} className="erased-frame" />
      ) : (
        <>
          <rect x={x + 9} y={y + 10} width={T - 22} height={8} className="erased-bar" />
          <rect x={x + 9} y={y + 21} width={T - 40} height={8} className="erased-bar" />
          <rect x={x + 9} y={y + 53} width={T - 18} height={8} className="erased-bar" />
          <rect x={x + 9} y={y + 64} width={T - 34} height={8} className="erased-bar" />
        </>
      )}
    </g>
  );
}

// Token layout inside an 80-unit tile, top to bottom:
//   y+2..16  intent chips      y+18..64  token art (centre y+41)
//   y+67..76 HP bar with the numbers inside
// Statuses run down the right edge; charge / stolen cards / Redactor marks down the left.
const TOKEN_CY = 41;
const TOKEN_R = 23;

function HpBar({ x, y, hp, max }: { x: number; y: number; hp: number; max: number }) {
  const w = 54;
  const fill = Math.max(0, Math.min(1, hp / max)) * w;
  return (
    <g pointerEvents="none">
      <rect x={x + (T - w) / 2} y={y + 67} width={w} height={10} rx={3} className="hp-track" />
      <rect x={x + (T - w) / 2} y={y + 67} width={fill} height={10} rx={3} fill={hpColor(hp, max)} />
      <text x={x + T / 2} y={y + 75} className="hp-text">
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

/** Small pills stacked down the left of the token (Warden charge, cards a Scrap carries). */
function Badges({ x, y, badges }: { x: number; y: number; badges: Badge[] }) {
  return (
    <g pointerEvents="none">
      {badges.map((b, i) => (
        <g key={b.title} transform={`translate(${x + 9}, ${y + 27 + i * 15})`}>
          <rect x={-8.5} y={-6.5} width={17} height={13} rx={6.5} fill={b.color} stroke="#f7efdc" strokeWidth={1.2} />
          <text className="badge-text" y={3.2}>
            {b.label}
          </text>
        </g>
      ))}
    </g>
  );
}

/** The kit's Burn / Root / Stun tokens, dropped on the unit's right edge. Burn shows the ticks left. */
function StatusTokens({ x, y, status }: { x: number; y: number; status: { burn: number; root: number; stun: number } }) {
  const shown = (['burn', 'root', 'stun'] as const).filter((k) => status[k] > 0);
  const size = 15;
  return (
    <g pointerEvents="none">
      {shown.map((k, i) => {
        const sx = x + T - size - 1;
        const sy = y + 20 + i * (size + 2);
        return (
          <g key={k}>
            <image href={STATUS_ART[k]} x={sx} y={sy} width={size} height={size} />
            {k === 'burn' && (
              <>
                <circle cx={sx + 1} cy={sy + 1} r={5} className="burn-count-bg" />
                <text x={sx + 1} y={sy + 3.6} className="burn-count">
                  {status.burn}
                </text>
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------- intent chips

/** Icon glyphs drawn in a 12×12 box centred on 0,0. */
function IntentGlyph({ kind, color }: { kind: IntentKind; color: string }) {
  const stroke = { fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'move':
      return <path d="M-5 -4 L-1 0 L-5 4 M0 -4 L4 0 L0 4" {...stroke} />;
    case 'retreat':
      return <path d="M5 -4 L1 0 L5 4 M0 -4 L-4 0 L0 4" {...stroke} />;
    case 'attack':
      return (
        <g {...stroke}>
          <path d="M-4 4 L5 -5" strokeWidth={2.2} />
          <path d="M-5.5 1 L-1 5.5" />
        </g>
      );
    case 'shoot':
      return (
        <g {...stroke}>
          <path d="M-5 5 L4.5 -4.5" />
          <path d="M0.5 -5 L5 -5 L5 -0.5" />
          <path d="M-5 2 L-3 2 L-3 4 M-2.5 4.5 L-2.5 2.5" strokeWidth={1.3} />
        </g>
      );
    case 'drain':
      return <path d="M0 -6 C2.5 -2.5 4.5 0 4.5 2.2 A4.5 4.5 0 0 1 -4.5 2.2 C-4.5 0 -2.5 -2.5 0 -6 Z" fill={color} />;
    case 'mark':
      return (
        <g {...stroke}>
          <circle r={4} />
          <path d="M0 -6.5 V-2.5 M0 2.5 V6.5 M-6.5 0 H-2.5 M2.5 0 H6.5" strokeWidth={1.4} />
        </g>
      );
    case 'fire':
      return <path d="M1.5 -6 L-4 1 L-0.5 1 L-1.5 6 L4 -1 L0.5 -1 Z" fill={color} />;
    case 'watch':
      return (
        <g>
          <path d="M-6 0 Q0 -5.5 6 0 Q0 5.5 -6 0 Z" fill="none" stroke={color} strokeWidth={1.5} />
          <circle r={1.9} fill={color} />
        </g>
      );
    case 'steal':
      return (
        <g {...stroke}>
          <rect x={-4.5} y={-5} width={6.5} height={9} rx={1} />
          <path d="M3 1 L6 1 M4.5 -0.8 L6 1 L4.5 2.8" strokeWidth={1.4} />
        </g>
      );
    case 'deliver':
      return (
        <g>
          <circle r={4.6} fill={color} />
          <path d="M0 -2.4 V2.4 M-2.4 0 H2.4" stroke="#2b2230" strokeWidth={1.6} strokeLinecap="round" />
        </g>
      );
    case 'block':
      return <path d="M0 -6 L5 -4 V0 C5 3 3 5 0 6 C-3 5 -5 3 -5 0 V-4 Z" fill={color} />;
    case 'explode':
      return (
        <path
          d="M0 -6.5 L1.6 -2.2 L5.8 -3.6 L3 0 L5.8 3.6 L1.6 2.2 L0 6.5 L-1.6 2.2 L-5.8 3.6 L-3 0 L-5.8 -3.6 L-1.6 -2.2 Z"
          fill={color}
        />
      );
    case 'cooldown':
      return <path d="M-4 -5.5 H4 L0 0 L4 5.5 H-4 L0 0 Z" {...stroke} strokeWidth={1.5} />;
    case 'spawn':
      return (
        <g {...stroke}>
          <circle r={5} strokeWidth={1.5} />
          <path d="M0 -2.6 V2.6 M-2.6 0 H2.6" />
        </g>
      );
    case 'wait':
      return (
        <g fill={color}>
          <rect x={-3.6} y={-4.5} width={2.6} height={9} rx={0.8} />
          <rect x={1} y={-4.5} width={2.6} height={9} rx={0.8} />
        </g>
      );
  }
}

function chipLabel(g: IntentGroup): string {
  const info = INTENT_INFO[g.kind];
  if (g.kind === 'deliver') return '+1';
  if (info.showsValue && g.value !== undefined) return g.count > 1 ? `${g.value}×${g.count}` : String(g.value);
  return g.count > 1 ? `×${g.count}` : '';
}

/** Slay-the-Spire style intent chips floating at the top of the tile. */
function IntentRow({ cx, y, intents }: { cx: number; y: number; intents?: Intent[] }) {
  const groups = groupIntents(intents);
  if (groups.length === 0) return null;
  const chips = groups.map((g) => {
    const label = chipLabel(g);
    return { g, label, w: 15 + (label ? label.length * 5.4 + 2 : 0) };
  });
  const gap = 2;
  const total = chips.reduce((sum, c) => sum + c.w, 0) + gap * (chips.length - 1);
  const maxW = T - 4;
  const scale = total > maxW ? maxW / total : 1;
  let left = -total / 2;
  return (
    <g className="intents" pointerEvents="none" transform={`translate(${cx}, ${y + 9}) scale(${scale})`}>
      {chips.map(({ g, label, w }, i) => {
        const x0 = left;
        left += w + gap;
        const info = INTENT_INFO[g.kind];
        return (
          <g key={i} transform={`translate(${x0}, 0)`}>
            <rect x={0} y={-7.5} width={w} height={15} rx={4} className="intent-chip" />
            <g transform="translate(7.5, 0) scale(0.92)">
              <IntentGlyph kind={g.kind} color={info.color} />
            </g>
            {label && (
              <text x={15} y={3.4} className="intent-text">
                {label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** The Redactor's marks: five dots down the left of its token, filled as Page Scraps bring it stolen fragments. */
function MarkDots({ x, y, marks }: { x: number; y: number; marks: number }) {
  const n = RULES.redactorMaxMarks;
  const gap = 8;
  const top = y + 23;
  return (
    <g pointerEvents="none" aria-hidden>
      <rect x={x + 3} y={top - 5} width={10} height={(n - 1) * gap + 10} rx={5} className="mark-backing" />
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} cx={x + 8} cy={top + i * gap} r={2.8} className={i < marks ? 'mark-dot mark-on' : 'mark-dot'} />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------- tokens

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
  /** Show the a/b letter when the room has more than one unit of this type. */
  showLetter: boolean;
  intents?: Intent[];
}

/** The printed token, with a hover / focus edge on top. */
function TokenArt({ cx, cy, href }: { cx: number; cy: number; href: string }) {
  return (
    <>
      <image href={href} x={cx - TOKEN_R} y={cy - TOKEN_R} width={TOKEN_R * 2} height={TOKEN_R * 2} filter="url(#token-shadow)" />
      <circle cx={cx} cy={cy} r={TOKEN_R - 0.5} className="token-edge" />
    </>
  );
}

function EnemyToken({ e, x, y, selected, acting, shielded, showLetter, intents, ...handlers }: EnemyTokenProps) {
  const cx = x + T / 2;
  const cy = y + TOKEN_CY;
  const r = TOKEN_R;
  const special: Badge[] = [];
  if (e.kind === 'warden' && e.charge) special.push({ label: '⚡', color: '#a07a2c', title: 'Holding a telegraph charge' });
  if (e.kind === 'scrap' && (e.stolen ?? 0) > 0) special.push({ label: `F${e.stolen}`, color: '#7d5ba6', title: `Holding ${e.stolen} stolen fragment(s)` });

  return (
    <g {...unitProps(handlers)} aria-label={`${unitTitle(e)} ${e.id}, ${e.hp} of ${e.maxHp} HP`}>
      {(selected || acting) && <circle cx={cx} cy={cy} r={r + 5} className={acting ? 'ring-acting' : 'ring-selected'} />}
      {shielded && <circle cx={cx} cy={cy} r={r + 3} className="ring-shield" />}
      {e.kind === 'redactor' && e.mode === 'chaos' && <circle cx={cx} cy={cy} r={r + 3} className="ring-chaos" />}
      <TokenArt cx={cx} cy={cy} href={tokenArt(e)} />
      {showLetter && (
        <g pointerEvents="none">
          <circle cx={cx + r * 0.78} cy={cy + r * 0.62} r={6} className="letter-badge" />
          <text x={cx + r * 0.78} y={cy + r * 0.62 + 3} className="letter-text">
            {e.id.slice(1)}
          </text>
        </g>
      )}
      <HpBar x={x} y={y} hp={e.hp} max={e.maxHp} />
      <StatusTokens x={x} y={y} status={e.status} />
      <Badges x={x} y={y} badges={special} />
      {e.kind === 'redactor' && <MarkDots x={x} y={y} marks={e.marks ?? 0} />}
      <IntentRow cx={cx} y={y} intents={intents} />
    </g>
  );
}

function PlayerToken({ state, x, y, selected, ...handlers }: { state: GameState; x: number; y: number; selected: boolean } & UnitHandlers) {
  const p = state.player;
  const cx = x + T / 2;
  const cy = y + TOKEN_CY;
  return (
    <g {...unitProps(handlers)} aria-label={`You, ${p.hp} of ${p.maxHp} HP`}>
      {selected && <circle cx={cx} cy={cy} r={TOKEN_R + 5} className="ring-selected" />}
      <TokenArt cx={cx} cy={cy} href={PLAYER_TOKEN_ART} />
      <HpBar x={x} y={y} hp={p.hp} max={p.maxHp} />
      <StatusTokens x={x} y={y} status={p.status} />
    </g>
  );
}
