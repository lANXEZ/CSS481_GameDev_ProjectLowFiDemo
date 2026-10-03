import { describe, expect, it } from 'vitest';
import {
  previewIntents,
  wardenSightLine,
  acknowledgeLoot,
  gmRemoveEnemy,
  actionsNextTurn,
  wardenChargedNextTurn,
  advanceRoom,
  createGame,
  endPlayerTurn,
  gmPatchEnemy,
  parseCoord,
  planEnemyTurn,
  playerCast,
  playerMeditate,
  playerMove,
  playerUnstableFire,
  spawnEnemy,
  spellCost,
  spellDamage,
  spellTiles,
  turnOrder,
  coordLabel,
  type Element,
  type EnemyKind,
  type GameState,
  type SpellSpec,
} from './index';

interface Setup {
  size?: number;
  pillars?: string[];
  player: string;
  enemies?: { kind: EnemyKind; at: string; element?: Element }[];
  exit?: { at: string; locked: boolean };
  seed?: number;
}

/** Build a custom board, bypassing the kit's room layouts. */
function board(setup: Setup): GameState {
  const s = createGame(setup.seed ?? 42);
  const size = setup.size ?? 6;
  s.room = {
    id: 'test',
    name: 'Test',
    blurb: '',
    width: size,
    height: size,
    pillars: (setup.pillars ?? []).map(parseCoord),
    exit: setup.exit ? { pos: parseCoord(setup.exit.at), locked: setup.exit.locked } : null,
  };
  s.enemies = [];
  s.typeCounters = {};
  s.nextDeployId = 1;
  s.player.pos = parseCoord(setup.player);
  for (const e of setup.enemies ?? []) spawnEnemy(s, e.kind, parseCoord(e.at), e.element);
  return s;
}

const at = (s: GameState, id: string) => coordLabel(s.enemies.find((e) => e.id === id)!.pos);
const hp = (s: GameState, id: string) => s.enemies.find((e) => e.id === id)?.hp;
const toEnemyTurn = (s: GameState) => endPlayerTurn(s);
const runEnemyTurn = (s: GameState) => planEnemyTurn(toEnemyTurn(s)).final;

const spec = (element: Element, elementCount: 1 | 2, shape: 'beam' | 'cross', shapeCount: 1 | 2): SpellSpec => ({
  element,
  elementCount,
  shape,
  shapeCount,
});

describe('spell math', () => {
  it('costs fragments + 1 per doubled part', () => {
    expect(spellCost(spec('fire', 1, 'beam', 1))).toBe(2);
    expect(spellCost(spec('fire', 2, 'beam', 1))).toBe(4);
    expect(spellCost(spec('water', 1, 'cross', 2))).toBe(4);
  });

  it('fire does 1 base damage, 3 doubled; water/rock do 2, 4 doubled', () => {
    expect(spellDamage(spec('fire', 1, 'beam', 1))).toBe(1);
    expect(spellDamage(spec('fire', 2, 'beam', 1))).toBe(3);
    expect(spellDamage(spec('rock', 1, 'beam', 1))).toBe(2);
    expect(spellDamage(spec('water', 2, 'cross', 1))).toBe(4);
  });

  it('beam stops at a pillar and doubled cross reaches 2 tiles', () => {
    const s = board({ player: 'a1', pillars: ['a3'] });
    expect(spellTiles(s, spec('fire', 1, 'beam', 2), 'up').map(coordLabel)).toEqual(['a2']);
    expect(spellTiles(s, spec('fire', 1, 'beam', 2), 'right').map(coordLabel)).toEqual(['b1', 'c1', 'd1', 'e1']);
    const c = board({ player: 'c3' });
    expect(spellTiles(c, spec('fire', 1, 'cross', 2), null)).toHaveLength(8);
  });
});

describe('player turn', () => {
  it('cast damages, applies status and spends mana', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'brute', at: 'a3' }] });
    const next = playerCast(s, spec('water', 1, 'beam', 1), 'up');
    expect(hp(next, '3a')).toBe(4);
    expect(next.enemies[0].status.root).toBe(1);
    expect(next.player.mana).toBe(1);
    expect(next.actionsLeft).toBe(2);
  });

  it('page wards only take their element; redactor is immune while wards stand', () => {
    const s = board({
      player: 'c3',
      enemies: [
        { kind: 'ward', at: 'c4', element: 'fire' },
        { kind: 'redactor', at: 'd3' },
      ],
    });
    s.player.mana = 6;
    const rock = playerCast(s, spec('rock', 1, 'cross', 1), null);
    expect(hp(rock, '6a')).toBe(4);
    expect(hp(rock, '8a')).toBe(18);
    const fire = playerCast(s, spec('fire', 1, 'cross', 1), null);
    expect(hp(fire, '6a')).toBe(3);
  });

  it('burn ticks before each player action and the turn auto-ends after 3 actions', () => {
    let s = board({ player: 'a1' });
    s.player.status.burn = 3;
    s = playerMeditate(s);
    s = playerMeditate(s);
    expect(s.player.hp).toBe(18);
    s = playerMove(s, 'right');
    expect(s.player.hp).toBe(17);
    expect(s.phase).toBe('enemy');
  });

  it('unstable fire hits the 3x3, burns the caster and is once per room', () => {
    let s = board({ player: 'c3', enemies: [{ kind: 'brute', at: 'e5' }, { kind: 'rat', at: 'b2' }] });
    s.player.mana = 6;
    s = playerUnstableFire(s, 6);
    expect(s.enemies.map((e) => e.id)).toEqual(['3a']);
    expect(hp(s, '3a')).toBe(6);
    expect(s.player.mana).toBe(1);
    expect(s.player.status.burn).toBe(3);
    expect(s.player.unstableUsed).toBe(true);
  });
});

describe('enemy turn', () => {
  it('acts by type number, then deploy order', () => {
    const s = board({
      player: 'a1',
      enemies: [
        { kind: 'brute', at: 'f6' },
        { kind: 'rat', at: 'f1' },
        { kind: 'brute', at: 'e6' },
      ],
    });
    expect(turnOrder(s).map((e) => e.id)).toEqual(['1a', '3a', '3b']);
  });

  it('melee enemy walks in and attacks only once per turn', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'rat', at: 'a4' }] });
    const after = runEnemyTurn(s);
    expect(at(after, '1a')).toBe('a2');
    expect(after.player.hp).toBe(19);
    expect(after.phase).toBe('player');
    expect(after.turn).toBe(2);
  });

  it('units never share tiles: the lower unit takes the contested tile', () => {
    // Only one open tile next to the player (b1); rat 1a gets it, 1b has to wait or reroute.
    const s = board({
      player: 'a1',
      pillars: ['a2'],
      enemies: [
        { kind: 'rat', at: 'd1' },
        { kind: 'rat', at: 'e1' },
      ],
    });
    const after = runEnemyTurn(s);
    expect(at(after, '1a')).toBe('b1');
    expect(at(after, '1b')).not.toBe('b1');
    expect(new Set(after.enemies.map((e) => coordLabel(e.pos))).size).toBe(2);
  });

  it('root stops movement for one turn, stun stops attacks for one turn', () => {
    let s = board({ player: 'a1', enemies: [{ kind: 'brute', at: 'a4' }] });
    s.enemies[0].status.root = 1;
    s = runEnemyTurn(s);
    expect(at(s, '3a')).toBe('a4');
    expect(s.enemies[0].status.root).toBe(0);

    let t = board({ player: 'a1', enemies: [{ kind: 'brute', at: 'a2' }] });
    t.enemies[0].status.stun = 1;
    t = runEnemyTurn(t);
    expect(t.player.hp).toBe(20);
    t = runEnemyTurn(t);
    expect(t.player.hp).toBe(17);
  });

  it('burn ticks before enemy actions and wears off if the unit does nothing', () => {
    let s = board({ player: 'a1', enemies: [{ kind: 'brute', at: 'a5' }] });
    s.enemies[0].status.burn = 3;
    s = runEnemyTurn(s); // moves twice: 2 ticks
    expect(hp(s, '3a')).toBe(4);
    expect(s.enemies[0].status.burn).toBe(1);

    let w = board({ player: 'a1', enemies: [{ kind: 'brute', at: 'a5' }] });
    w.enemies[0].status.burn = 3;
    w.enemies[0].status.root = 1;
    w = runEnemyTurn(w);
    expect(hp(w, '3a')).toBe(6);
    expect(w.enemies[0].status.burn).toBe(0);
  });

  it('archer backs off in the opposite direction when adjacent', () => {
    const s = board({ player: 'c3', enemies: [{ kind: 'archer', at: 'c4' }] });
    const after = runEnemyTurn(s);
    expect(at(after, '2a')).toBe('c6');
    expect(after.player.hp).toBe(20);
  });

  it('archer shoots diagonally in range, but not through pillars', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'archer', at: 'd4' }] });
    expect(runEnemyTurn(s).player.hp).toBe(18);
    const blocked = board({ player: 'a1', pillars: ['b2'], enemies: [{ kind: 'archer', at: 'd4' }] });
    const after = runEnemyTurn(blocked);
    expect(at(after, '2a')).not.toBe('d4');
  });

  it('leech drains mana, not HP', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'leech', at: 'a2' }] });
    const after = runEnemyTurn(s);
    expect(after.player.mana).toBe(2);
    expect(after.player.hp).toBe(20);
  });
});

describe('warden', () => {
  it('walks to a tile with a clear line to you, then holds still (no attack)', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'warden', at: 'c4' }] });
    const plan = planEnemyTurn(toEnemyTurn(s));
    const w = plan.final.enemies[0];
    expect(plan.final.player.hp).toBe(20);
    expect(['c3', 'd4']).toContain(coordLabel(w.pos));
    expect(wardenSightLine(plan.final, w)).not.toBeNull();
    expect(plan.intents['5a'].map((i) => i.kind)).toEqual(['move', 'watch']);
  });

  it('on a charged turn it moves into sight and marks with its second action', () => {
    let s = board({ player: 'a1', enemies: [{ kind: 'warden', at: 'c4' }] });
    s.enemies[0].turnCount = 1;
    const plan = planEnemyTurn(toEnemyTurn(s));
    expect(plan.intents['5a'].map((i) => i.kind)).toEqual(['move', 'mark']);
    s = plan.final;
    expect(s.enemies[0].markedLine?.some((t) => coordLabel(t) === 'a1')).toBe(true);
    expect(s.player.hp).toBe(20);
  });

  it('marking the line ends its turn; the shot fires at the start of its next turn', () => {
    let s = board({ player: 'a1', enemies: [{ kind: 'warden', at: 'a6' }] });
    s.enemies[0].turnCount = 1;
    s = runEnemyTurn(s);
    // Marked with its first action, then stopped: no shot, no flee with the second action.
    expect(s.player.hp).toBe(20);
    expect(at(s, '5a')).toBe('a6');
    expect(s.enemies[0].markedLine?.map(coordLabel)).toEqual(['a5', 'a4', 'a3', 'a2', 'a1']);
    expect(s.enemies[0].charge).toBe(false);

    // Standing still on the line gets you hit first thing next turn.
    s = runEnemyTurn(s);
    expect(s.player.hp).toBe(15);
    expect(s.enemies[0].markedLine).toBeNull();
  });

  it('a line marked with its last action fires first thing next turn (player can dodge)', () => {
    let s = board({ player: 'a1', enemies: [{ kind: 'warden', at: 'a6' }] });
    s.enemies[0].markedLine = ['a5', 'a4', 'a3', 'a2', 'a1'].map(parseCoord);
    s.enemies[0].turnCount = 2; // next turn (3) has no charge
    s = playerMove(s, 'right');
    s = runEnemyTurn(s);
    expect(s.player.hp).toBe(20);
    expect(s.enemies[0].markedLine).toBeNull();
  });

  it('loses its charge if no tile can see you', () => {
    // Pillars around a1 block every line to the player, so there is nowhere to go.
    let s = board({ player: 'a1', pillars: ['a2', 'b1', 'b2'], enemies: [{ kind: 'warden', at: 'e4' }] });
    s.enemies[0].turnCount = 1;
    const plan = planEnemyTurn(toEnemyTurn(s));
    expect(plan.intents['5a'].map((i) => i.kind)).toEqual(['wait']);
    s = plan.final;
    expect(s.enemies[0].charge).toBe(false);
    expect(s.enemies[0].markedLine).toBeNull();
    expect(at(s, '5a')).toBe('e4');
  });

  it('dying unlocks the exit and drops the potion; exit leads to the next room', () => {
    let s = board({ player: 'e6', enemies: [{ kind: 'warden', at: 'a1' }], exit: { at: 'f6', locked: true } });
    s = gmPatchEnemy(s, '5a', { hp: 0 }, 'test kill');
    expect(s.room.exit?.locked).toBe(false);
    expect(s.player.potions).toBe(1);
    s.player.mana = 0;
    s = playerMove(s, 'right');
    expect(s.phase).toBe('roomExit');
    s = advanceRoom(s);
    expect(s.room.name).toBe('The Scriptorium');
    expect(s.player.mana).toBe(3);
    expect(s.player.potions).toBe(1);
  });
});

describe('boss room', () => {
  it('wards spawn a scrap every other enemy turn (2, 4, ...); the redactor no longer shreds', () => {
    let s = board({
      size: 8,
      player: 'a1',
      enemies: [
        { kind: 'ward', at: 'h8', element: 'fire' },
        { kind: 'redactor', at: 'h1' },
      ],
    });
    const scraps = () => s.enemies.filter((e) => e.kind === 'scrap').length;
    s = runEnemyTurn(s); // enemy turn 1
    expect(scraps()).toBe(0);
    s = runEnemyTurn(s); // enemy turn 2
    expect(scraps()).toBe(1);
    s = runEnemyTurn(s); // enemy turn 3
    expect(scraps()).toBe(1);
    expect(s.enemies.find((e) => e.kind === 'redactor')!.marks).toBe(0);
    expect(s.log.some((l) => l.text.includes('shreds'))).toBe(false);
  });

  it('a scrap steals, carries the fragment to the redactor for a mark, then keeps away', () => {
    const s = board({
      size: 8,
      player: 'a1',
      enemies: [
        { kind: 'ward', at: 'h8', element: 'fire' },
        { kind: 'scrap', at: 'a2' },
        { kind: 'redactor', at: 'c3' },
      ],
    });
    const plan = planEnemyTurn(toEnemyTurn(s));
    const scrap = plan.final.enemies.find((e) => e.kind === 'scrap')!;
    const boss = plan.final.enemies.find((e) => e.kind === 'redactor')!;
    expect(scrap.stolen).toBe(1);
    expect(scrap.delivered).toBe(true);
    expect(boss.marks).toBe(1);
    const kinds = plan.intents['7a'].map((i) => i.kind);
    expect(kinds.slice(0, 3)).toEqual(['steal', 'move', 'deliver']);
    expect(kinds.slice(3).every((k) => k === 'retreat' || k === 'wait')).toBe(true);
    expect(plan.final.log.some((l) => l.paper && l.text.includes('steals a fragment'))).toBe(true);
  });

  it('marks cap at 5: scraps stop stealing, and a late delivery adds nothing', () => {
    const s = board({
      size: 8,
      player: 'a1',
      enemies: [
        { kind: 'ward', at: 'h8', element: 'fire' },
        { kind: 'scrap', at: 'a2' },
        { kind: 'scrap', at: 'f5' },
        { kind: 'redactor', at: 'e5' },
      ],
    });
    s.enemies.find((e) => e.kind === 'redactor')!.marks = 5;
    s.enemies.find((e) => e.id === '7b')!.stolen = 1;
    const after = runEnemyTurn(s);
    expect(after.enemies.find((e) => e.id === '7a')!.stolen).toBe(0);
    expect(after.enemies.find((e) => e.id === '7b')!.delivered).toBe(true);
    expect(after.enemies.find((e) => e.kind === 'redactor')!.marks).toBe(5);
  });

  it('once the wards fall, scraps run at you and only block (no stealing)', () => {
    const s = board({ size: 8, player: 'a1', enemies: [{ kind: 'scrap', at: 'a4' }, { kind: 'redactor', at: 'h8' }] });
    const plan = planEnemyTurn(toEnemyTurn(s));
    const scrap = plan.final.enemies.find((e) => e.kind === 'scrap')!;
    expect(coordLabel(scrap.pos)).toBe('a2');
    expect(scrap.stolen).toBe(0);
    expect(plan.intents['7a'].map((i) => i.kind)).toEqual(['move', 'move', 'block']);
  });

  it('after the wards fall, scraps never steal or deliver, even with marks below 5', () => {
    const s = board({
      size: 8,
      player: 'a1',
      enemies: [
        { kind: 'scrap', at: 'a2' }, // already next to you
        { kind: 'scrap', at: 'd1' }, // still carrying an undelivered fragment
        { kind: 'redactor', at: 'h8' },
      ],
    });
    s.enemies.find((e) => e.kind === 'redactor')!.marks = 2;
    s.enemies.find((e) => e.id === '7b')!.stolen = 1;
    const plan = planEnemyTurn(toEnemyTurn(s));
    const scrap = (id: string) => plan.final.enemies.find((e) => e.id === id)!;
    expect(scrap('7a').stolen).toBe(0);
    expect(plan.intents['7a']).toEqual([{ kind: 'block', note: 'blocks your path.' }]);
    expect(coordLabel(scrap('7b').pos)).toBe('b1');
    expect(scrap('7b').delivered).toBeFalsy();
    expect(plan.intents['7b'].map((i) => i.kind)).toEqual(['move', 'move', 'block']);
    // Marks only drop (Chaos spends one); scraps add none.
    expect(plan.final.enemies.find((e) => e.kind === 'redactor')!.marks).toBe(1);
  });

  it('chaos mode: 4 actions, and the action after each explosion is a cooldown', () => {
    let s = board({ size: 8, player: 'a1', enemies: [{ kind: 'redactor', at: 'b2' }] });
    s.enemies[0].marks = 2;
    const plan = planEnemyTurn(toEnemyTurn(s));
    expect(plan.intents['8a'].map((i) => i.kind)).toEqual(['explode', 'cooldown', 'explode', 'cooldown']);
    s = plan.final;
    expect(s.enemies[0].mode).toBe('chaos');
    expect(s.enemies[0].marks).toBe(1);
    expect(s.player.hp).toBe(20 - 6);
    // The zone is the 3x3 block around the Redactor, including its own tile (b2).
    expect(s.erasureZone.map(coordLabel).sort()).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3']);
  });

  it('the chaos cooldown resets each turn', () => {
    const s = board({ size: 8, player: 'a1', enemies: [{ kind: 'redactor', at: 'c2' }] });
    s.enemies[0].marks = 3;
    let plan = planEnemyTurn(toEnemyTurn(s));
    expect(plan.intents['8a'].map((i) => i.kind)).toEqual(['move', 'explode', 'cooldown', 'explode']);
    plan = planEnemyTurn(toEnemyTurn(plan.final));
    expect(plan.intents['8a'][0].kind).toBe('explode');
    expect(plan.final.player.hp).toBe(20 - 12);
  });

  it('with no marks left the redactor has 3 actions', () => {
    let s = board({ size: 8, player: 'a1', enemies: [{ kind: 'redactor', at: 'b2' }] });
    s = runEnemyTurn(s);
    expect(s.enemies[0].mode).toBe('spent');
    expect(s.player.hp).toBe(20 - 9);
    // Only Chaos explosions leave an Erasure zone.
    expect(s.erasureZone).toEqual([]);
  });

  it('guarded explosions leave no Erasure zone either', () => {
    let s = board({ size: 8, player: 'a1', enemies: [{ kind: 'ward', at: 'h8', element: 'fire' }, { kind: 'redactor', at: 'b2' }] });
    s = runEnemyTurn(s);
    expect(s.enemies.find((e) => e.kind === 'redactor')!.mode).toBe('guarded');
    expect(s.player.hp).toBe(20 - 6);
    expect(s.erasureZone).toEqual([]);
  });

  it('the Erasure zone lasts through your next turn and costs a fragment only if you end it inside', () => {
    let s = board({ size: 8, player: 'a1', enemies: [{ kind: 'redactor', at: 'b2' }] });
    s.enemies[0].marks = 1;
    s = runEnemyTurn(s);
    expect(s.erasureZone).toHaveLength(9);
    // Your turn: step out of the 3x3 block (a1 -> a2 -> a3 -> a4), then end the turn safely.
    s = playerMove(playerMove(s, 'up'), 'up');
    expect(s.erasureZone).toHaveLength(9);
    s = playerMove(s, 'up');
    expect(s.phase).toBe('enemy');
    expect(s.erasureZone).toEqual([]);
    expect(s.log.some((l) => l.text.includes('ended your turn inside the Erasure zone'))).toBe(false);
  });

  it('ending your turn in the Erasure zone costs a fragment, then the zone fades', () => {
    let s = board({ size: 8, player: 'a1', enemies: [{ kind: 'redactor', at: 'h8' }] });
    s.erasureZone = [parseCoord('a1')];
    s = endPlayerTurn(s);
    expect(s.erasureZone).toHaveLength(0);
    expect(s.log.some((l) => l.paper && l.text.includes('Erasure zone'))).toBe(true);
  });
});

describe('loot popup', () => {
  it('records the drop when a spell kills an enemy, and clears on acknowledge', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'rat', at: 'a2' }, { kind: 'archer', at: 'b1' }] });
    s.enemies.forEach((e) => (e.hp = 1));
    s.player.mana = 6;
    const after = playerCast(s, spec('rock', 1, 'cross', 1), null);
    expect(after.pendingLoot.map((l) => [l.enemyId, l.discard])).toEqual([
      ['1a', ['Fire fragment']],
      ['2a', ['Beam fragment']],
    ]);
    expect(acknowledgeLoot(after).pendingLoot).toEqual([]);
  });

  it('warden loot mentions the potion and the unlocked exit; wards drop nothing', () => {
    let s = board({ player: 'a1', enemies: [{ kind: 'warden', at: 'c3' }, { kind: 'ward', at: 'e5', element: 'rock' }], exit: { at: 'f6', locked: true } });
    s = gmRemoveEnemy(s, '5a', true);
    expect(s.pendingLoot).toHaveLength(1);
    expect(s.pendingLoot[0].extras.join(' ')).toMatch(/Heal Potion.*unlocked/);
    s = gmRemoveEnemy(acknowledgeLoot(s), '6a', true);
    expect(s.pendingLoot).toEqual([]);
  });

  it('a burn kill during the enemy turn shows up after the turn', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'rat', at: 'd4' }] });
    s.enemies[0].hp = 1;
    s.enemies[0].status.burn = 2;
    const after = runEnemyTurn(s);
    expect(after.enemies).toHaveLength(0);
    expect(after.pendingLoot[0].discard).toEqual(['Fire fragment']);
  });

  it('a scrap returns what it stole; removing without loot shows nothing', () => {
    let s = board({ size: 8, player: 'a1', enemies: [{ kind: 'scrap', at: 'h8' }, { kind: 'rat', at: 'h1' }] });
    s.enemies[0].stolen = 2;
    s = gmRemoveEnemy(s, '7a', true);
    expect(s.pendingLoot[0].toHand).toEqual(['The 2 fragments it stole']);
    expect(s.pendingLoot[0].discard).toEqual([]);
    s = gmRemoveEnemy(acknowledgeLoot(s), '1a', false);
    expect(s.pendingLoot).toEqual([]);
  });
});

describe('turn previews (used by the hover card)', () => {
  it('redactor next-turn actions follow wards and marks', () => {
    const s = board({ size: 8, player: 'a1', enemies: [{ kind: 'ward', at: 'h8', element: 'fire' }, { kind: 'redactor', at: 'e5' }] });
    const boss = () => s.enemies.find((e) => e.kind === 'redactor')!;
    expect(actionsNextTurn(s, boss())).toBe(2);
    s.enemies = s.enemies.filter((e) => e.kind !== 'ward');
    boss().marks = 1;
    expect(actionsNextTurn(s, boss())).toBe(4);
    boss().marks = 0;
    expect(actionsNextTurn(s, boss())).toBe(3);
  });

  it('warden charge preview matches the turn it actually charges', () => {
    let s = board({ player: 'a1', pillars: ['b2'], enemies: [{ kind: 'warden', at: 'e3' }] });
    expect(wardenChargedNextTurn(s.enemies[0])).toBe(false);
    s = runEnemyTurn(s);
    expect(wardenChargedNextTurn(s.enemies[0])).toBe(true);
    const plan = planEnemyTurn(endPlayerTurn(s));
    expect(plan.steps.some((st) => st.entries.some((l) => l.text.includes('gains a telegraph charge')))).toBe(true);
  });
});

describe('intents', () => {
  it('the preview matches what the enemies actually do', () => {
    const s = createGame(7);
    expect(previewIntents(s)).toEqual(planEnemyTurn(endPlayerTurn(s)).intents);
  });

  it('an archer that needs one step shows move, then shoot for 2', () => {
    const s = board({ player: 'a1', enemies: [{ kind: 'archer', at: 'b5' }] });
    expect(previewIntents(s)['2a']).toEqual([{ kind: 'move' }, { kind: 'shoot', value: 2 }]);
  });

  it('is recalculated after the player acts', () => {
    let s = board({ player: 'a1', enemies: [{ kind: 'rat', at: 'd1' }] });
    expect(previewIntents(s)['1a'].map((i) => i.kind)).toEqual(['move', 'move', 'attack']);
    s = playerMove(s, 'up');
    expect(previewIntents(s)['1a'].map((i) => i.kind)).toEqual(['move', 'move', 'move']);
  });

  it('wards show a spawn intent only on spawn turns', () => {
    const s = board({ size: 8, player: 'a1', enemies: [{ kind: 'ward', at: 'h8', element: 'fire' }] });
    expect(previewIntents(s)['6a']).toBeUndefined();
    s.turn = 2;
    expect(previewIntents(s)['6a']).toEqual([{ kind: 'spawn' }]);
  });
});

describe('determinism', () => {
  it('same state gives the same enemy turn (safe for undo/redo)', () => {
    const s = toEnemyTurn(createGame(7));
    const a = planEnemyTurn(s).final;
    const b = planEnemyTurn(s).final;
    expect(a.enemies).toEqual(b.enemies);
    expect(a.rng).toBe(b.rng);
  });

  it('plays a full room-1 enemy turn from the kit layout', () => {
    const s = toEnemyTurn(createGame(1));
    const plan = planEnemyTurn(s);
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.final.phase).toBe('player');
  });
});
