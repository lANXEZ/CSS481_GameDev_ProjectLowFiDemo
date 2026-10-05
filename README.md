# Broken Grimoire: board tracker & simulation

A companion app for the paper playtest of *Broken Grimoire* (`Broken_Grimoire_Demo_Kit_1.pdf`), with the art from
the print-and-cut kit (`Broken_Grimoire_Cutouts_A4_2.pdf`). The toggle at the top right switches between two modes:

- **Board tracker.** The paper board, cards and tokens stay the real game. The app tracks the whole board next to it:
  every unit's position and HP, statuses, the turn order, and what each monster does on its turn, so the GM doesn't
  have to work out enemy moves or keep HP in their head.
- **Simulation.** The app plays the whole game itself, cards included: your deck, hand and discard pile, crafting
  spells from the cards in your hand, loot cards, Page Scraps stealing real cards and the Erasure zone erasing them.
  The enemy turn plays itself.

Each mode keeps its own saved run and undo history, so trying the simulation never disturbs a paper playtest.

**Rules:** see [GAME_RULES.md](GAME_RULES.md) for how every unit, spell and status works in the current version.

## Running it

```bash
npm install
npm run dev      # open the printed localhost URL
npm test         # rules engine tests (vitest)
npm run build    # static build in dist/, can be hosted anywhere (e.g. GitHub Pages)
```

The current game is saved in the browser, so a refresh doesn't lose the playtest.

## Using it at the table (Board tracker)

1. **Your turn.** Move by clicking a gold dot on the board (or with the arrow keys). Build a spell from
   element + shape chips. Beams preview their tiles when you hover a direction, and Cross shows its hit tiles
   right away. Meditate, drink a potion or reroll with the buttons. The turn ends automatically after 3 actions.
2. **Enemy turn.** The app works out every monster's actions. Use *Next step* to walk through them one at
   a time; the board shows each step, and you copy it onto the paper board. *Finish enemy turn* applies it.
3. **Do on the table.** Anything the players must do with paper components (discard fragments, take loot, place a
   Page Scrap token, hand a card to a Scrap) is shown in the gold *Do on the table* box and tagged *Table* in the log.
4. **Loot.** When an enemy dies (from a spell, from Burn on its own turn, or through *Defeat* in the GM panel), a popup
   shows which loot cards to add to your discard pile, the Max Potion and exit unlock for the Warden, or the fragments
   a Page Scrap stole (back to your hand). Confirm it once they're on the table. Undo goes back to before the kill.
5. **Intentions.** Chips above every enemy show what it will do on its next turn, like *Slay the Spire*. They update
   after each of your actions. **Hover a token** for its name, behaviour and plan in words.
6. **Fixing mismatches.** Click any token to edit its HP, statuses or position, defeat it or remove it (the printed
   reference card is there too). With nothing selected, *Table fixes* lets you place extra units or lock/unlock the
   exit. Every fix is logged as a GM entry.
7. **Undo / redo** with the buttons or Ctrl+Z / Ctrl+Y. **Export playtest log** downloads the full log as JSON.

## Playing in Simulation mode

1. **Your hand** is under the board. Click 2–3 cards to craft a spell (one element and one shape, either doubled, or
   three Fires for Unstable Fire); the panel on the right shows the cost and lets you aim and cast it. To **reroll**,
   pick the cards you want to swap and press *Reroll*: they're discarded and you draw that many. Escape or *Clear*
   drops the selection.
2. **Deck, discard pile, erased cards and the Max Potion** sit next to the hand. Hover a pile for what's in it.
3. **Enemy turn** plays itself step by step on the board. *Pause* to look at a step, *Skip to your turn* to jump ahead.
   Your hand refills to 5 when your turn starts.
4. **Undo** works exactly as in the tracker (draws and steals are seeded, so they replay the same way).

## Art

All art (room boards, unit tokens, status tokens, fragment and loot cards, card back, enemy reference cards) is cut
from the print-and-cut kit PDF into `public/art/` by a script. When the kit changes, re-run it:

```bash
pip install pymupdf pillow
python scripts/extract_art.py                     # finds Broken_Grimoire_Cutouts_A4*.pdf in the project root
python scripts/extract_art.py path/to/kit.pdf     # or name the file
```

The room boards are stitched back together from the kit's two A4 sheets, with the pillars, START and EXIT printed in.

## Project layout

```
src/engine/   Rules engine: pure TypeScript, no UI, fully unit-tested
  data.ts       all numbers, enemy cards and room layouts
  cards.ts      fragment cards for Simulation mode: deck, hand, discard, crafting
  game.ts       setup, room changes, player actions
  enemies.ts    enemy AI, turn planning (step-by-step snapshots) and intention previews
  overrides.ts  GM corrections
src/ui/       React interface (board is SVG over the printed map)
  art.ts        where each piece of kit art lives
public/art/   art cut from the kit (generated by scripts/extract_art.py)
```
