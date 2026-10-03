import { ENEMY_DEFS, RULES, coordLabel } from './data';
import {
  RuleError,
  burnTickEnemy,
  cloneState,
  damagePlayer,
  enemyName,
  log,
  wardsStanding,
} from './core';
import { endPlayerTurn, spawnEnemy } from './game';
import {
  DIRS8,
  addPos,
  chebyshev,
  hasLineOfSight,
  isPillar,
  isWalkable,
  lineDirection,
  manhattan,
  neighbors4,
  neighbors8,
  posKey,
  ray,
  stepAway,
  stepToward,
} from './grid';
import { pick } from './rng';
import type { Enemy, GameState, Intent, IntentKind, LogEntry, Pos } from './types';

export interface EnemyStep {
  /** Enemy that acted, or null for turn-level events (spawns, start of the player's turn). */
  actorId: string | null;
  entries: LogEntry[];
  /** Tiles to highlight on the board for this step (movement, attack area, marked line…). */
  focus: Pos[];
  /** Full game state right after this step (omitted when planning without snapshots). */
  state: GameState;
}

export interface EnemyTurnPlan {
  steps: EnemyStep[];
  final: GameState;
  /** What each enemy does this turn, in order, keyed by enemy id. */
  intents: Record<string, Intent[]>;
}

/** Enemies act by type number (Rat 1 … Redactor 8), then by deploy order. */
export function turnOrder(state: GameState): Enemy[] {
  return [...state.enemies].sort((a, b) => a.typeNum - b.typeNum || a.deployId - b.deployId);
}

/**
 * Resolve the whole enemy turn, recording every action as a step the GM can walk through.
 * With `snapshots: false` the per-step states are skipped (used for cheap intent previews).
 */
export function planEnemyTurn(state: GameState, opts: { snapshots?: boolean } = {}): EnemyTurnPlan {
  if (state.phase !== 'enemy') throw new RuleError('It is not the enemy turn.');
  const snapshots = opts.snapshots ?? true;
  const s = cloneState(state);
  const steps: EnemyStep[] = [];
  const intents: Record<string, Intent[]> = {};
  let mark = s.log.length;
  const emit = (actorId: string | null, focus: Pos[] = []) => {
    const entries = s.log.slice(mark);
    mark = s.log.length;
    if (entries.length === 0) return;
    steps.push({ actorId, entries, focus, state: snapshots ? cloneState(s) : s });
  };
  const recorder = (id: string) => (intent: Intent) => (intents[id] ??= []).push(intent);

  for (const { id } of turnOrder(s)) {
    if (s.phase !== 'enemy') break;
    const e = s.enemies.find((x) => x.id === id);
    if (e) runUnitTurn(s, e, emit, recorder(id));
  }

  if (s.phase === 'enemy') {
    if (wardsSpawnOn(s.turn)) spawnScraps(s, recorder);
    else if (s.enemies.some((e) => e.kind === 'ward')) log(s, 'enemy', 'The Page Wards gather ink: no Page Scrap this turn.');
    emit(null);
    s.turn += 1;
    s.phase = 'player';
    s.actionsLeft = RULES.actionsPerTurn;
    s.playerActed = false;
    log(s, 'player', `Your turn ${s.turn}: draw back up to ${RULES.handSize} cards.`, true);
    emit(null);
  } else {
    emit(null);
  }
  return { steps, final: s, intents };
}

/**
 * What every enemy will do on its coming turn, assuming the player ends their turn now.
 * Enemy randomness is seeded in the state, so this matches the real enemy turn exactly
 * until the player does something else.
 */
export function previewIntents(state: GameState): Record<string, Intent[]> {
  if (state.phase === 'enemy') return planEnemyTurn(state, { snapshots: false }).intents;
  if (state.phase !== 'player') return {};
  return planEnemyTurn(endPlayerTurn(state), { snapshots: false }).intents;
}

// ---------------------------------------------------------------------------

interface TurnCtx {
  acted: boolean;
  attacked: boolean;
  /** Archer: direction to back off in this turn (player was adjacent at turn start). */
  backoffDir: Pos | null;
  /** Set by an action that ends the unit's turn early (Warden marking its line). */
  endTurn: boolean;
  /** Redactor in Chaos mode: the next action is a cooldown. Resets every turn. */
  cooldown: boolean;
  /** Record an intent for this unit (also used by actions that trigger extra effects). */
  record: (intent: Intent) => void;
}

type Decision =
  | { kind: 'act'; intent: Intent; focus: Pos[]; run: () => void }
  /** `intent` is shown when the unit ends its turn this way (e.g. Warden watching, Scrap blocking). */
  | { kind: 'stop'; reason?: string; intent?: IntentKind };

const act = (intent: Intent, focus: Pos[], run: () => void): Decision => ({ kind: 'act', intent, focus, run });
const stop = (reason?: string, intent?: IntentKind): Decision => ({ kind: 'stop', reason, intent });

function orthAdjacent(a: Pos, b: Pos): boolean {
  return manhattan(a, b) === 1;
}

function runUnitTurn(
  s: GameState,
  e: Enemy,
  emit: (actorId: string | null, focus?: Pos[]) => void,
  record: (intent: Intent) => void,
): void {
  const actions = startUnitTurn(s, e);
  const ctx: TurnCtx = { acted: false, attacked: false, backoffDir: null, endTurn: false, cooldown: false, record };
  let recorded = 0;
  const rec = (intent: Intent) => {
    recorded++;
    record(intent);
  };
  ctx.record = rec;

  if (e.kind === 'archer' && orthAdjacent(e.pos, s.player.pos)) {
    ctx.backoffDir = { x: Math.sign(e.pos.x - s.player.pos.x), y: Math.sign(e.pos.y - s.player.pos.y) };
    log(s, 'enemy', `${enemyName(e)}: you're adjacent, so it backs off.`);
  }

  for (let i = 0; i < actions; i++) {
    if (e.kind === 'scrap') tryDeliver(s, e, ctx);
    if (ctx.cooldown) {
      // A cooldown is a spent action that does nothing, so it doesn't trigger Burn.
      ctx.cooldown = false;
      rec({ kind: 'cooldown' });
      log(s, 'enemy', `${enemyName(e)} cools down after the explosion.`);
      emit(e.id, [e.pos]);
      continue;
    }
    const decision = decide(s, e, ctx);
    if (decision.kind === 'stop') {
      if (decision.reason) log(s, 'enemy', `${enemyName(e)} ${decision.reason}`);
      if (decision.intent) rec({ kind: decision.intent, note: decision.reason });
      else if (recorded === 0 && actions > 0) rec({ kind: 'wait', note: decision.reason });
      break;
    }
    if (burnTickEnemy(s, e)) {
      emit(e.id, [e.pos]);
      return;
    }
    if (s.phase !== 'enemy') break;
    rec(decision.intent);
    decision.run();
    ctx.acted = true;
    if (e.kind === 'scrap') tryDeliver(s, e, ctx);
    emit(e.id, decision.focus);
    if (s.phase !== 'enemy') return;
    if (ctx.endTurn) break;
  }
  endUnitTurn(s, e, ctx.acted);
  emit(e.id);
}

/** Actions the unit will get on its next turn. Pure: mirrors startUnitTurn without spending marks. */
export function actionsNextTurn(s: GameState, e: Enemy): number {
  if (e.kind !== 'redactor') return ENEMY_DEFS[e.kind].actions;
  if (wardsStanding(s)) return RULES.redactorActions.guarded;
  return (e.marks ?? 0) > 0 ? RULES.redactorActions.chaos : RULES.redactorActions.spent;
}

/** Whether the Warden's next turn is a charged (telegraph) turn. */
export function wardenChargedNextTurn(e: Enemy): boolean {
  return ((e.turnCount ?? 0) + 1) % RULES.wardenChargeEvery === 0;
}

/** Start-of-turn bookkeeping. Returns the number of actions the unit gets this turn. */
function startUnitTurn(s: GameState, e: Enemy): number {
  if (e.kind === 'warden') {
    const charged = wardenChargedNextTurn(e);
    e.turnCount = (e.turnCount ?? 0) + 1;
    if (charged) {
      e.charge = true;
      log(s, 'enemy', `${enemyName(e)} gains a telegraph charge (its turn ${e.turnCount}).`);
    }
  }
  if (e.kind === 'redactor') {
    if (wardsStanding(s)) {
      e.mode = 'guarded';
      return RULES.redactorActions.guarded;
    }
    if ((e.marks ?? 0) > 0) {
      e.marks = (e.marks ?? 0) - 1;
      const entering = e.mode !== 'chaos';
      e.mode = 'chaos';
      log(s, 'enemy', `${enemyName(e)} ${entering ? 'enters' : 'stays in'} CHAOS MODE: spends 1 mark (${e.marks} left), ${RULES.redactorActions.chaos} actions.`);
      return RULES.redactorActions.chaos;
    }
    if (e.mode === 'chaos') log(s, 'enemy', `${enemyName(e)} is out of marks: Chaos mode ends.`);
    e.mode = 'spent';
    return RULES.redactorActions.spent;
  }
  return ENEMY_DEFS[e.kind].actions;
}

function endUnitTurn(s: GameState, e: Enemy, acted: boolean): void {
  if (!acted && e.status.burn > 0) {
    e.status.burn = 0;
    log(s, 'enemy', `${enemyName(e)} took no action: Burn wears off.`);
  }
  if (e.status.root > 0 && --e.status.root === 0) log(s, 'enemy', `${enemyName(e)} is no longer rooted.`);
  if (e.status.stun > 0 && --e.status.stun === 0) log(s, 'enemy', `${enemyName(e)} is no longer stunned.`);
  if (e.kind === 'warden' && e.charge) {
    e.charge = false;
    log(s, 'enemy', `${enemyName(e)} never saw you, so its charge is lost.`);
  }
}

function moveTo(s: GameState, e: Enemy, to: Pos, kind: 'move' | 'retreat' = 'move'): Decision {
  const from = e.pos;
  return act({ kind }, [from, to], () => {
    e.pos = to;
    log(s, 'enemy', `${enemyName(e)} ${kind === 'retreat' ? 'retreats' : 'moves'} ${coordLabel(from)} → ${coordLabel(to)}.`);
  });
}

function approach(s: GameState, e: Enemy, goals: Pos[]): Decision {
  if (e.status.root > 0) return stop('is rooted and can’t move.');
  const step = stepToward(s, e, goals);
  if (!step) return stop('has no open path, so it waits.');
  return moveTo(s, e, step);
}

function flee(s: GameState, e: Enemy): Decision {
  if (e.status.root > 0) return stop('is rooted and can’t run.');
  const step = stepAway(s, e, s.player.pos);
  if (!step) return stop('is cornered and holds position.');
  return moveTo(s, e, step, 'retreat');
}

function decide(s: GameState, e: Enemy, ctx: TurnCtx): Decision {
  switch (e.kind) {
    case 'rat':
    case 'brute':
    case 'leech':
      return decideMelee(s, e, ctx);
    case 'archer':
      return decideArcher(s, e, ctx);
    case 'warden':
      return decideWarden(s, e, ctx);
    case 'scrap':
      return decideScrap(s, e, ctx);
    case 'redactor':
      return decideRedactor(s, e, ctx);
    case 'ward':
      return stop();
  }
}

function decideMelee(s: GameState, e: Enemy, ctx: TurnCtx): Decision {
  if (ctx.attacked) return stop();
  const p = s.player.pos;
  if (orthAdjacent(e.pos, p)) {
    if (e.status.stun > 0) return stop('is stunned and can’t attack.');
    const leech = e.kind === 'leech';
    const intent: Intent = leech ? { kind: 'drain', value: ENEMY_DEFS.leech.damage } : { kind: 'attack', value: ENEMY_DEFS[e.kind].damage };
    return act(intent, [p], () => {
      ctx.attacked = true;
      if (leech) {
        const before = s.player.mana;
        s.player.mana = Math.max(0, before - ENEMY_DEFS.leech.damage);
        log(s, 'enemy', `${enemyName(e)} drains YOUR mana (${before} → ${s.player.mana}).`);
      } else {
        damagePlayer(s, ENEMY_DEFS[e.kind].damage, enemyName(e));
      }
    });
  }
  return approach(s, e, neighbors4(s, p));
}

/** Tiles from which an archer can shoot the player: up to range 4 on the 8 lines, not through pillars. */
export function archerFiringTiles(s: GameState): Pos[] {
  return DIRS8.flatMap((d) => ray(s, s.player.pos, d, RULES.archerRange));
}

export function archerCanShoot(s: GameState, e: Enemy): boolean {
  const p = s.player.pos;
  return !!lineDirection(e.pos, p) && chebyshev(e.pos, p) <= RULES.archerRange && hasLineOfSight(s, e.pos, p);
}

function decideArcher(s: GameState, e: Enemy, ctx: TurnCtx): Decision {
  if (ctx.backoffDir) {
    if (e.status.root > 0) return stop('is rooted and can’t back off.');
    const straight = addPos(e.pos, ctx.backoffDir);
    const to = isWalkable(s, straight, e.id) ? straight : stepAway(s, e, s.player.pos);
    if (!to) return stop('is cornered and can’t back off.');
    return moveTo(s, e, to, 'retreat');
  }
  if (ctx.attacked) return stop();
  if (archerCanShoot(s, e)) {
    if (e.status.stun > 0) return stop('is stunned and can’t shoot.');
    const p = s.player.pos;
    return act({ kind: 'shoot', value: ENEMY_DEFS.archer.damage }, [p], () => {
      ctx.attacked = true;
      damagePlayer(s, ENEMY_DEFS.archer.damage, `${enemyName(e)} (arrow)`);
    });
  }
  return approach(s, e, archerFiringTiles(s));
}

/** Direction from the Warden to the player if the player is on one of its 8 lines of sight. */
export function wardenSightLine(s: GameState, e: Enemy): Pos | null {
  const d = lineDirection(e.pos, s.player.pos);
  if (!d || !hasLineOfSight(s, e.pos, s.player.pos)) return null;
  return d;
}

/** Every tile that has a clear straight or diagonal line to the player (any distance). */
export function sightTiles(s: GameState): Pos[] {
  return DIRS8.flatMap((d) => ray(s, s.player.pos, d));
}

function decideWarden(s: GameState, e: Enemy, ctx: TurnCtx): Decision {
  if (e.markedLine) {
    if (e.status.stun > 0) {
      e.markedLine = null;
      log(s, 'enemy', `${enemyName(e)} is stunned: its marked line fizzles out.`);
    } else {
      const line = e.markedLine;
      return act({ kind: 'fire', value: RULES.wardenShotDamage }, line, () => {
        e.markedLine = null;
        const hit = line.some((t) => posKey(t) === posKey(s.player.pos));
        if (hit) damagePlayer(s, RULES.wardenShotDamage, `${enemyName(e)}'s telegraphed blast`);
        else log(s, 'enemy', `${enemyName(e)} fires down the marked line and misses.`);
      });
    }
  }
  const d = wardenSightLine(s, e);
  if (d) {
    if (e.charge) {
      const line = ray(s, e.pos, d);
      return act({ kind: 'mark', value: RULES.wardenShotDamage }, line, () => {
        e.charge = false;
        e.markedLine = line;
        ctx.endTurn = true;
        log(
          s,
          'enemy',
          `${enemyName(e)} spots YOU and marks a line ${coordLabel(line[0])}–${coordLabel(line[line.length - 1])}. Its turn ends; it fires for ${RULES.wardenShotDamage} dmg at the start of its next turn.`,
        );
      });
    }
    return stop('has a clear line to you and holds position.', 'watch');
  }
  return approach(s, e, sightTiles(s));
}

export function redactorOf(s: GameState): Enemy | undefined {
  return s.enemies.find((x) => x.kind === 'redactor');
}

export function redactorMarksFull(s: GameState): boolean {
  const boss = redactorOf(s);
  return !!boss && (boss.marks ?? 0) >= RULES.redactorMaxMarks;
}

/**
 * A Scrap carrying a stolen fragment that reaches any of the 8 tiles around the Redactor
 * gives it one mark (capped). This is free: it doesn't use an action. The fragment stays on the Scrap.
 */
function tryDeliver(s: GameState, e: Enemy, ctx: TurnCtx): void {
  const boss = redactorOf(s);
  if (!boss || e.delivered || (e.stolen ?? 0) === 0 || !wardsStanding(s) || chebyshev(e.pos, boss.pos) !== 1) return;
  e.delivered = true;
  if ((boss.marks ?? 0) >= RULES.redactorMaxMarks) {
    log(s, 'enemy', `${enemyName(e)} reaches ${enemyName(boss)}, but its marks are already full (${RULES.redactorMaxMarks}/${RULES.redactorMaxMarks}).`);
    return;
  }
  boss.marks = (boss.marks ?? 0) + 1;
  ctx.record({ kind: 'deliver' });
  log(s, 'enemy', `${enemyName(e)} brings its stolen fragment to ${enemyName(boss)}: it gains a mark (${boss.marks}/${RULES.redactorMaxMarks}). The fragment stays on the Scrap.`);
}

function decideScrap(s: GameState, e: Enemy, ctx: TurnCtx): Decision {
  const p = s.player.pos;
  if (!wardsStanding(s)) {
    // Endgame: every Scrap crowds the player to block movement. No stealing.
    if (orthAdjacent(e.pos, p)) return stop('blocks your path.', 'block');
    return approach(s, e, neighbors4(s, p));
  }
  if (e.delivered) return flee(s, e);
  const boss = redactorOf(s);
  if ((e.stolen ?? 0) > 0) return boss ? approach(s, e, neighbors8(s, boss.pos)) : flee(s, e);
  if (redactorMarksFull(s)) return flee(s, e);
  if (orthAdjacent(e.pos, p)) {
    if (e.status.stun > 0) return stop('is stunned and can’t steal.');
    return act({ kind: 'steal' }, [p], () => {
      ctx.attacked = true;
      e.stolen = (e.stolen ?? 0) + 1;
      log(s, 'enemy', `${enemyName(e)} touches YOU and steals a fragment: give it one card from your hand (tuck it under its token).`, true);
    });
  }
  return approach(s, e, neighbors4(s, p));
}

/** Tiles the explosion damages: the 8 around the Redactor. */
export function explosionTiles(s: GameState, e: Enemy): Pos[] {
  return neighbors8(s, e.pos).filter((t) => !isPillar(s, t));
}

/** Tiles a Chaos-mode explosion turns into Erasure zone: the 3×3 block, including the Redactor's own tile. */
export function erasureTiles(s: GameState, e: Enemy): Pos[] {
  return [e.pos, ...explosionTiles(s, e)];
}

function decideRedactor(s: GameState, e: Enemy, ctx: TurnCtx): Decision {
  const p = s.player.pos;
  if (chebyshev(e.pos, p) === 1) {
    if (e.status.stun > 0) return stop('is stunned and can’t explode.');
    const chaos = e.mode === 'chaos';
    const focus = chaos ? erasureTiles(s, e) : explosionTiles(s, e);
    return act({ kind: 'explode', value: RULES.redactorExplodeDamage }, focus, () => {
      log(s, 'enemy', `${enemyName(e)} EXPLODES around ${coordLabel(e.pos)}.`);
      damagePlayer(s, RULES.redactorExplodeDamage, enemyName(e));
      // Only Chaos-mode explosions leave an Erasure zone.
      if (chaos) {
        const keys = new Set(s.erasureZone.map(posKey));
        for (const t of erasureTiles(s, e)) if (!keys.has(posKey(t))) s.erasureZone.push(t);
        log(s, 'enemy', `The blast leaves an Erasure zone on the 9 tiles around ${coordLabel(e.pos)}. End your next turn there and you lose a fragment for good.`);
        ctx.cooldown = true;
      }
    });
  }
  return approach(s, e, neighbors8(s, p));
}

/** Whether Page Wards spawn Scraps at the end of enemy turn `turn` (every other turn: 2, 4, 6…). */
export function wardsSpawnOn(turn: number): boolean {
  return turn % RULES.wardSpawnEvery === 0;
}

/** End of the enemy turn: each standing Page Ward spawns one Page Scrap next to it. */
function spawnScraps(s: GameState, recorder: (id: string) => (intent: Intent) => void): void {
  for (const ward of turnOrder(s).filter((e) => e.kind === 'ward')) {
    const open = neighbors4(s, ward.pos).filter((t) => isWalkable(s, t));
    if (open.length === 0) {
      log(s, 'enemy', `${enemyName(ward)} has no room to spawn a Page Scrap.`);
      continue;
    }
    const scrap = spawnEnemy(s, 'scrap', pick(s, open));
    recorder(ward.id)({ kind: 'spawn' });
    log(s, 'enemy', `${enemyName(ward)} spawns ${enemyName(scrap)}: place a 7 token on ${coordLabel(scrap.pos)}.`, true);
  }
}
