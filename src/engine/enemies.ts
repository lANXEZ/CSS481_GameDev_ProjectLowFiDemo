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
import { spawnEnemy } from './game';
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
import type { Enemy, GameState, LogEntry, Pos } from './types';

export interface EnemyStep {
  /** Enemy that acted, or null for turn-level events (spawns, start of the player's turn). */
  actorId: string | null;
  entries: LogEntry[];
  /** Tiles to highlight on the board for this step (movement, attack area, marked line…). */
  focus: Pos[];
  /** Full game state right after this step. */
  state: GameState;
}

export interface EnemyTurnPlan {
  steps: EnemyStep[];
  final: GameState;
}

/** Enemies act by type number (Rat 1 … Redactor 8), then by deploy order. */
export function turnOrder(state: GameState): Enemy[] {
  return [...state.enemies].sort((a, b) => a.typeNum - b.typeNum || a.deployId - b.deployId);
}

/** Resolve the whole enemy turn, recording every action as a step the GM can walk through. */
export function planEnemyTurn(state: GameState): EnemyTurnPlan {
  if (state.phase !== 'enemy') throw new RuleError('It is not the enemy turn.');
  const s = cloneState(state);
  const steps: EnemyStep[] = [];
  let mark = s.log.length;
  const emit = (actorId: string | null, focus: Pos[] = []) => {
    const entries = s.log.slice(mark);
    mark = s.log.length;
    if (entries.length === 0) return;
    steps.push({ actorId, entries, focus, state: cloneState(s) });
  };

  for (const { id } of turnOrder(s)) {
    if (s.phase !== 'enemy') break;
    const e = s.enemies.find((x) => x.id === id);
    if (e) runUnitTurn(s, e, emit);
  }

  if (s.phase === 'enemy') {
    spawnScraps(s);
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
  return { steps, final: s };
}

// ---------------------------------------------------------------------------

interface TurnCtx {
  acted: boolean;
  attacked: boolean;
  /** Archer: direction to back off in this turn (player was adjacent at turn start). */
  backoffDir: Pos | null;
}

type Decision =
  | { kind: 'act'; focus: Pos[]; run: () => void }
  | { kind: 'stop'; reason?: string };

const act = (focus: Pos[], run: () => void): Decision => ({ kind: 'act', focus, run });
const stop = (reason?: string): Decision => ({ kind: 'stop', reason });

function orthAdjacent(a: Pos, b: Pos): boolean {
  return manhattan(a, b) === 1;
}

function runUnitTurn(s: GameState, e: Enemy, emit: (actorId: string | null, focus?: Pos[]) => void): void {
  const actions = startUnitTurn(s, e);
  const ctx: TurnCtx = { acted: false, attacked: false, backoffDir: null };

  if (e.kind === 'archer' && orthAdjacent(e.pos, s.player.pos)) {
    ctx.backoffDir = { x: Math.sign(e.pos.x - s.player.pos.x), y: Math.sign(e.pos.y - s.player.pos.y) };
    log(s, 'enemy', `${enemyName(e)}: you're adjacent, so it backs off.`);
  }

  for (let i = 0; i < actions; i++) {
    const decision = decide(s, e, ctx);
    if (decision.kind === 'stop') {
      if (decision.reason) log(s, 'enemy', `${enemyName(e)} ${decision.reason}`);
      break;
    }
    if (burnTickEnemy(s, e)) {
      emit(e.id, [e.pos]);
      return;
    }
    if (s.phase !== 'enemy') break;
    decision.run();
    ctx.acted = true;
    emit(e.id, decision.focus);
    if (s.phase !== 'enemy') return;
  }
  endUnitTurn(s, e, ctx.acted);
  emit(e.id);
}

/** Start-of-turn bookkeeping. Returns the number of actions the unit gets this turn. */
function startUnitTurn(s: GameState, e: Enemy): number {
  if (e.kind === 'warden') {
    e.turnCount = (e.turnCount ?? 0) + 1;
    if (e.turnCount % RULES.wardenChargeEvery === 0) {
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
      const entering = e.mode !== 'redacting';
      e.mode = 'redacting';
      log(s, 'enemy', `${enemyName(e)} ${entering ? 'enters' : 'stays in'} REDACTING MODE: spends 1 mark (${e.marks} left), ${RULES.redactorActions.redacting} actions.`);
      return RULES.redactorActions.redacting;
    }
    if (e.mode === 'redacting') log(s, 'enemy', `${enemyName(e)} is out of marks: Redacting mode ends.`);
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
  if (e.kind === 'redactor' && e.mode === 'guarded') {
    e.marks = (e.marks ?? 0) + 1;
    log(s, 'enemy', `${enemyName(e)} shreds a fragment: move one card from your hand to the discard pile. It gains a mark (${e.marks}).`, true);
  }
}

function moveTo(s: GameState, e: Enemy, to: Pos): Decision {
  const from = e.pos;
  return act([from, to], () => {
    e.pos = to;
    log(s, 'enemy', `${enemyName(e)} moves ${coordLabel(from)} → ${coordLabel(to)}.`);
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
  return moveTo(s, e, step);
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
      return decideWarden(s, e);
    case 'scrap':
      return decideScrap(s, e, ctx);
    case 'redactor':
      return decideRedactor(s, e);
    case 'ward':
      return stop();
  }
}

function decideMelee(s: GameState, e: Enemy, ctx: TurnCtx): Decision {
  if (ctx.attacked) return stop();
  const p = s.player.pos;
  if (orthAdjacent(e.pos, p)) {
    if (e.status.stun > 0) return stop('is stunned and can’t attack.');
    return act([p], () => {
      ctx.attacked = true;
      if (e.kind === 'leech') {
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
    return moveTo(s, e, to);
  }
  if (ctx.attacked) return stop();
  if (archerCanShoot(s, e)) {
    if (e.status.stun > 0) return stop('is stunned and can’t shoot.');
    const p = s.player.pos;
    return act([p], () => {
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

function decideWarden(s: GameState, e: Enemy): Decision {
  if (e.markedLine) {
    if (e.status.stun > 0) {
      e.markedLine = null;
      log(s, 'enemy', `${enemyName(e)} is stunned: its marked line fizzles out.`);
    } else {
      const line = e.markedLine;
      return act(line, () => {
        e.markedLine = null;
        const hit = line.some((t) => posKey(t) === posKey(s.player.pos));
        if (hit) damagePlayer(s, RULES.wardenShotDamage, `${enemyName(e)}'s telegraphed blast`);
        else log(s, 'enemy', `${enemyName(e)} fires down the marked line and misses.`);
      });
    }
  }
  if (e.charge) {
    const d = wardenSightLine(s, e);
    if (d) {
      const line = ray(s, e.pos, d);
      return act(line, () => {
        e.charge = false;
        e.markedLine = line;
        log(
          s,
          'enemy',
          `${enemyName(e)} spots YOU and marks a line ${coordLabel(line[0])}–${coordLabel(line[line.length - 1])}. It fires on its next action for ${RULES.wardenShotDamage} dmg.`,
        );
      });
    }
  }
  return flee(s, e);
}

function decideScrap(s: GameState, e: Enemy, ctx: TurnCtx): Decision {
  if ((e.stolen ?? 0) > 0) return flee(s, e);
  const p = s.player.pos;
  if (orthAdjacent(e.pos, p) && !ctx.attacked) {
    if (e.status.stun > 0) return stop('is stunned and can’t steal.');
    return act([p], () => {
      ctx.attacked = true;
      e.stolen = (e.stolen ?? 0) + 1;
      log(s, 'enemy', `${enemyName(e)} touches YOU and steals a fragment: give it one card from your hand (tuck it under its token).`, true);
    });
  }
  return approach(s, e, neighbors4(s, p));
}

export function explosionTiles(s: GameState, e: Enemy): Pos[] {
  return neighbors8(s, e.pos).filter((t) => !isPillar(s, t));
}

function decideRedactor(s: GameState, e: Enemy): Decision {
  const p = s.player.pos;
  if (chebyshev(e.pos, p) === 1) {
    if (e.status.stun > 0) return stop('is stunned and can’t explode.');
    const zone = explosionTiles(s, e);
    return act(zone, () => {
      log(s, 'enemy', `${enemyName(e)} EXPLODES around ${coordLabel(e.pos)}.`);
      damagePlayer(s, RULES.redactorExplodeDamage, enemyName(e));
      const keys = new Set(s.redactionZone.map(posKey));
      for (const t of zone) if (!keys.has(posKey(t))) s.redactionZone.push(t);
    });
  }
  return approach(s, e, neighbors8(s, p));
}

/** End of the enemy turn: each standing Page Ward spawns one Page Scrap next to it. */
function spawnScraps(s: GameState): void {
  for (const ward of turnOrder(s).filter((e) => e.kind === 'ward')) {
    const open = neighbors4(s, ward.pos).filter((t) => isWalkable(s, t));
    if (open.length === 0) {
      log(s, 'enemy', `${enemyName(ward)} has no room to spawn a Page Scrap.`);
      continue;
    }
    const scrap = spawnEnemy(s, 'scrap', pick(s, open));
    log(s, 'enemy', `${enemyName(ward)} spawns ${enemyName(scrap)}: place a 7 token on ${coordLabel(scrap.pos)}.`, true);
  }
}
