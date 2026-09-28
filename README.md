# Broken Grimoire: board tracker

A companion app for the paper playtest of *Broken Grimoire* (`Broken_Grimoire_Demo_Kit_5.pdf`).
The paper board, cards and tokens stay the real game. This app tracks the whole board next to it:
every unit's position and HP, statuses, the turn order, and what each monster does on its turn,
so the GM doesn't have to work out enemy moves or keep HP in their head.

## Running it

```bash
npm install
npm run dev      # open the printed localhost URL
npm test         # rules engine tests (vitest)
npm run build    # static build in dist/, can be hosted anywhere (e.g. GitHub Pages)
```

The current game is saved in the browser, so a refresh doesn't lose the playtest.

## Using it at the table

1. **Your turn.** Move by clicking a gold dot on the board (or with the arrow keys). Build a spell from
   element + shape chips. Beams preview their tiles when you hover a direction, and Cross shows its hit tiles
   right away. Meditate, drink a potion or reroll with the buttons. The turn ends automatically after 3 actions.
2. **Enemy turn.** The app works out every monster's actions. Use *Next step* to walk through them one at
   a time; the board shows each step, and you copy it onto the paper board. *Finish enemy turn* applies it.
3. **Do on the table.** Anything the players must do with paper components (discard fragments, take loot, place a
   Page Scrap token, shred a card) is shown in the gold *Do on the table* box and tagged *Table* in the log.
4. **Fixing mismatches.** Click any token to edit its HP, statuses or position, defeat it or remove it. With nothing
   selected, *Table fixes* lets you place extra units or lock/unlock the exit. Every fix is logged as a GM entry.
5. **Undo / redo** with the buttons or Ctrl+Z / Ctrl+Y. **Export playtest log** downloads the full log as JSON.

## Rules as implemented

These follow the kit, plus the changes agreed with the team. Anything marked *(default)* is a judgement call.
All numbers live in `src/engine/data.ts` (`RULES`, `ENEMY_DEFS`, `ROOMS`).

### Turns

- There are no rounds. Turns alternate: player turn, enemy turn, player turn, and so on.
- The player has 3 actions per turn. The turn ends when they are spent (or the player ends it early).
- On the enemy turn every monster acts in order of type number (Rat 1 → Redactor 8), then by deploy order.
  Units in the same type are labelled `a`, `b`, `c`… in deploy order (e.g. `3a`, `3b`).
- Units never share a tile, and pillars block movement and line of sight. Monsters act one after another, so an
  earlier unit claims a tile first and later units path around occupied tiles.
- If several shortest paths are equally good, one is chosen at random. The random seed is part of the saved game,
  so undo/redo replays the exact same enemy turn.
- "Adjacent" means the 4 orthogonal tiles *(default)*. The Redactor's blast is the exception and covers all 8 tiles around it.

### Player

- Move 1 tile orthogonally. A locked exit can't be entered. Stepping on an open exit offers to move to the next room
  (enemies still alive forfeit their fragments). HP and potions carry over; mana resets to 3.
- Cast = 1 action + mana. Cost = fragments + 1 per doubled part. Exactly one element and one shape, 2–3 fragments.
- Damage: **Fire 1** (changed from 2), Water 2, Rock 2. A doubled element does +2.
- Beam: 2 tiles in one of 4 directions (4 tiles if doubled). Cross: the 4 tiles around you (2 out each way if doubled).
  Pillars stop both *(default)*. Spells never hurt the caster.
- Burn: 1 dmg right before each action, 3 ticks, and it wears off after a turn in which the unit takes no action.
- **Root and Stun last 1 turn:** a rooted unit can't move during its next turn; a stunned unit can't attack during its next turn.
- Unstable Fire (Fire ×3): 5 mana, once per room, hits the 3×3 around you. **A spin wheel decides 6 or 7 damage**,
  and you take 3 Burn.
- Meditate +3 mana (cap 6). Potion +5 HP (cap 20). Reroll is logged as a table action.

### Monsters

| # | Unit | HP | Actions | Behaviour |
|---|------|----|---------|-----------|
| 1 | Rat | 2 | 3 | Walks to you, 1 dmg to an adjacent tile. |
| 2 | Archer | 3 | 2 | 2 dmg, range 4, straight or diagonal, blocked by pillars. If you're adjacent at the start of its turn, it spends both actions backing off in the direction directly away from you. |
| 3 | Brute | 6 | 2 | Walks to you, 3 dmg to an adjacent tile. |
| 4 | Leech | 4 | 2 | Walks to you, drains 1 mana from an adjacent tile. |
| 5 | Warden | 8 | 2 | See below. |
| 6 | Page Ward | 4 | 0 | Only hurt by its own element. Spawns a Page Scrap on a free tile next to it at the end of every enemy turn. |
| 7 | Page Scrap | 1 | 3 | Walks to you, touch steals a fragment, then flees for the rest of its life *(default)*. Killing it returns what it stole to your discard pile. |
| 8 | The Redactor | 18 | 2 / 5 / 3 | See below. |

Normal monsters attack at most once per turn and stop after attacking *(default)*.

**Warden (reworked).** It has no normal attack and spends its actions running away from you.
On its 2nd, 4th, 6th… turn it holds one telegraph charge. With the charge, if you're on one of its 8 lines of sight
(straight or diagonal, pillars block), it spends 1 action marking that line from itself to the board edge (or the first pillar).
Its **very next action** fires 5 dmg down the marked line. If the mark used its first action, the shot comes on its
second action, the same turn. If the mark used its last action, the shot comes on the first action of its next turn,
so you get one turn to step out. If it never sees you on a charged turn, the charge is lost. Stun cancels a marked
line *(default)*. Killing it drops the Heal Potion and unlocks the exit.

**The Redactor (reworked).**
- *While any Page Ward stands:* immune to damage, 2 actions. At the end of each of its turns it shreds a fragment
  (a table action) and gains 1 mark.
- *After all Wards fall:* each turn it spends 1 mark to be in **Redacting mode** with 5 actions. When it has no marks
  left, it has 3 actions from then on.
- *Attack:* whenever you're in the 8 tiles around it, an action makes it explode for 3 dmg (no friendly fire). It can
  explode on **every** action, so a 5-action Redacting turn can deal up to 15. Exploded tiles become the
  **redaction zone**. If you end your next turn inside it, you permanently lose one fragment. Then the zone fades.

## Project layout

```
src/engine/   Rules engine: pure TypeScript, no UI, fully unit-tested
  data.ts       all numbers, enemy cards and room layouts
  game.ts       setup, room changes, player actions
  enemies.ts    enemy AI and turn planning (returns step-by-step snapshots)
  overrides.ts  GM corrections
src/ui/       React interface (board is SVG)
```
