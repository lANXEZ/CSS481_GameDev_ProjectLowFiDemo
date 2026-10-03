# Broken Grimoire: board tracker

A companion app for the paper playtest of *Broken Grimoire* (`Broken_Grimoire_Demo_Kit_5.pdf`).
The paper board, cards and tokens stay the real game. This app tracks the whole board next to it:
every unit's position and HP, statuses, the turn order, and what each monster does on its turn,
so the GM doesn't have to work out enemy moves or keep HP in their head.

**Rules:** see [GAME_RULES.md](GAME_RULES.md) for how every unit, spell and status works in the current version.

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
   Page Scrap token, hand a card to a Scrap) is shown in the gold *Do on the table* box and tagged *Table* in the log.
4. **Loot.** When an enemy dies (from a spell, from Burn on its own turn, or through *Defeat* in the GM panel), a popup
   shows which loot cards to add to your discard pile, the Heal Potion and exit unlock for the Warden, or the fragments
   a Page Scrap stole (back to your hand). Confirm it once they're on the table. Undo goes back to before the kill.
5. **Intentions.** Chips above every enemy show what it will do on its next turn, like *Slay the Spire*. They update
   after each of your actions. **Hover a token** for its name, behaviour and plan in words.
6. **Fixing mismatches.** Click any token to edit its HP, statuses or position, defeat it or remove it. With nothing
   selected, *Table fixes* lets you place extra units or lock/unlock the exit. Every fix is logged as a GM entry.
7. **Undo / redo** with the buttons or Ctrl+Z / Ctrl+Y. **Export playtest log** downloads the full log as JSON.

## Project layout

```
src/engine/   Rules engine: pure TypeScript, no UI, fully unit-tested
  data.ts       all numbers, enemy cards and room layouts
  game.ts       setup, room changes, player actions
  enemies.ts    enemy AI, turn planning (step-by-step snapshots) and intention previews
  overrides.ts  GM corrections
src/ui/       React interface (board is SVG)
```
