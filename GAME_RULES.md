# Broken Grimoire: how everything works

This is the complete rulebook **as the board tracker implements it**: the demo kit PDF plus every change the
team has agreed since. If this file and the PDF disagree, this file is the current rule.

- Every number here lives in `src/engine/data.ts` (`RULES`, `ENEMY_DEFS`, `ROOMS`), so balance changes are data edits.
- Rules marked *(default)* were judgement calls made while building the app, not team decisions. They're easy to change.

**Contents:** [Turns](#turns) · [The wizard](#the-wizard-player) · [Spells](#spells) · [Statuses](#statuses) ·
[Enemies](#enemies) · [The board](#the-board) · [Rooms](#rooms) · [Loot](#loot) · [Intentions](#intentions-what-enemies-will-do)

---

## Turns

- There are **no rounds**. Turns alternate: player turn, enemy turn, player turn, and so on. Player turn *N* is
  followed by enemy turn *N*. The turn counter restarts at 1 in each room.
- **Player turn:** 3 actions. The turn ends when all 3 are spent, or earlier if the player ends it.
- **Enemy turn:** every enemy takes its own turn, one after another, in order of **type number** (Rat 1 → Redactor 8),
  then **deploy order** within a type. Each enemy spends its actions one at a time.
- **Labels:** units of the same type are lettered in deploy order (Brute `3a`, Brute `3b`). The board shows the name
  ("Brute", with a small "a"/"b" when the room has more than one). The log and hover card keep the number so it
  matches the numbered paper tokens.
- **Tiles:** units never share a tile. Pillars block movement. An enemy that acts earlier claims a tile first, and
  later enemies path around occupied tiles.
- **Ties:** when several shortest paths are equally good, one is picked at random. The random seed is saved with the
  game, so undo/redo and the intention preview always give the same result.
- **"Adjacent"** means the 4 orthogonal tiles *(default)*. The exceptions, which use all 8 surrounding tiles, are
  noted where they apply: the Redactor's blast, Scrap delivery, and Unstable Fire.

## The wizard (player)

| Stat | Value |
|---|---|
| HP | 20 (max 20). Carries over between rooms. |
| Mana | Starts at 3 in each room, max 6. |
| Actions | 3 per turn |

**Actions** (each costs 1 action):

| Action | Effect |
|---|---|
| Move | 1 tile up, down, left or right. Not onto pillars, units, or a locked exit. |
| Cast | Combine 2–3 fragments; costs mana (see [Spells](#spells)). |
| Unstable Fire | Fire ×3, see [Spells](#spells). |
| Meditate | +3 mana (max 6). |
| Drink potion | **+10 HP** (max 20). Only if you carry the Heal Potion. It carries between rooms. |
| Reroll | Discard your whole hand and draw 5. Done on the table; the app only logs it. |

- **Burn on you:** if you're burning, you take 1 damage right before each of your actions.
- **End of your turn:**
  1. If you're standing in the [Erasure zone](#erasure-zone), permanently remove one fragment from your hand. Then
     the zone fades.
  2. If you took no action at all this turn, your Burn wears off.
- **Start of your turn:** draw back up to 5 cards (on the table).
- **Leaving a room:** step onto an open exit. Enemies still alive forfeit their loot. HP and potion carry over;
  mana resets to 3.

## Spells

A cast is exactly **one element + one shape**, 2–3 fragments in total, and either part can be doubled.

- **Cost** = fragments used + 1 for each doubled part. So 2 fragments cost 2 mana, and 3 fragments with one part
  doubled cost 4.

| Element | Damage | Doubled | Effect on hit |
|---|---|---|---|
| Fire | **1** | 3 | Burn (3 ticks) |
| Water | 2 | 4 | Root (1 turn) |
| Rock | 2 | 4 | Stun (1 turn) |

| Shape | Area | Doubled |
|---|---|---|
| Beam | 2-tile line in one of the 4 directions | 4-tile line |
| Cross | The 4 tiles around you (not your own) | 2 tiles out each way (8 tiles) |

- Pillars stop a Beam and each arm of a Cross *(default)*. Spells never hurt the caster.
- The status is applied only if the target survives the hit.
- **Immunities:** a Page Ward is only affected by spells of its own element. The Redactor ignores all spells while
  any Page Ward stands. An immune target takes no damage and no status.

**Unstable Fire** (Fire ×3, no shape)

| | |
|---|---|
| Cost | 5 mana; usable once per room |
| Area | The 3×3 block around you (8 tiles) |
| Damage | 6 or 7, decided by the spin wheel |
| Cost to you | You gain Burn 3 |
| Notes | Enemies hit are *not* burned. Immunities still apply (a Fire Ward is hurt; the others aren't). |

## Statuses

| Status | Source | Effect |
|---|---|---|
| **Burn** | Fire spell, or Unstable Fire on yourself | 1 damage right before each action the unit takes. |
| **Root** | Water spell | The unit can't move during its next turn. It can still attack if already in range. |
| **Stun** | Rock spell | The unit can't attack during its next turn. It can still move. |

- **Burn duration:** lasts 3 ticks. Hitting a burning unit with Fire resets it to 3; it doesn't stack. It also wears
  off after a turn of its own in which the unit takes no action at all.
- **Burn and inaction:** standing still never burns, and neither does a Redactor cooldown action. A unit that can't
  act (rooted and out of range, for example) loses its Burn at the end of that turn.
- **Root and Stun** wear off at the end of the affected unit's next turn.

## Enemies

| # | Unit | HP | Actions | Attack | Drops |
|---|---|---|---|---|---|
| 1 | Rat | 2 | 3 | 1 dmg, adjacent | Fire fragment |
| 2 | Archer | 3 | 2 | 2 dmg, range 4, straight or diagonal | Beam fragment |
| 3 | Brute | 6 | 2 | 3 dmg, adjacent | Rock fragment |
| 4 | Leech | 4 | 2 | Drains 1 mana, adjacent | Water fragment |
| 5 | Warden | 8 | 2 | Telegraphed 5 dmg line | Heal Potion + unlocks the exit |
| 6 | Page Ward | 4 | 0 | None | Nothing |
| 7 | Page Scrap | 1 | **4** | Steals a fragment | Its stolen fragments go **back to your hand** |
| 8 | The Redactor | 18 | 2 / **4** / 3 | 3 dmg to all 8 tiles around it | Nothing; beating it wins |

Normal enemies attack **at most once per turn** and end their turn after attacking *(default)*.

### Rat, Brute, Leech
Take the shortest path toward a tile next to you, then attack once when adjacent. The Leech drains 1 mana instead
of dealing damage.

### Archer
- **If you're adjacent when its turn starts:** it spends both actions backing off. Each step goes directly away from
  you; if that tile is blocked, it takes whichever open step puts it farthest from you.
- **Otherwise:** it walks the shortest path to a tile with a clear shot, then shoots once for 2. A clear shot means
  within 4 tiles, straight or diagonal, with no pillar in between. Units don't block shots.

### Warden
It has no normal attack. Each action, it checks these in order:

1. **Marked line from last turn:** it fires down the line for 5 damage, which only hits you if you're still on it.
2. **Charged and can see you:** it **marks** a line from itself through you to the board edge (or the first pillar).
   **Marking ends its turn.**
3. **Can see you, no charge:** it holds still and watches.
4. **Can't see you:** it **walks the shortest path to a tile that can see you.**

- **Seeing you** means you're on one of its 8 lines (straight or diagonal) with no pillar in between, at any distance.
- **Charges** come on its own turns 2, 4, 6…. A charge it doesn't use that turn is lost.
- **The shot** always comes on the first action of its next turn, so you get exactly one turn to step off the red line.
- **Stun** cancels a marked line *(default)*. A stunned Warden can still mark, because marking isn't an attack.
- **Root** stops it walking, but it can still mark and fire.
- **Death:** it drops the Heal Potion and unlocks the exit.

### Page Ward
- **Never moves or attacks.** Only spells of its own element (Fire, Water or Rock) hurt it.
- **Spawning:** at the end of enemy turns 2, 4, 6… each standing Ward spawns one Page Scrap on a random free tile next
  to it. If there's no free tile, it skips that spawn.
- **While any Ward stands,** the Redactor is immune.

### Page Scrap
4 actions per turn. What it does depends on where it is in its cycle:

| Situation | Behaviour |
|---|---|
| Wards stand, empty-handed, Redactor has fewer than 5 marks | Runs to you. When next to you, **steals** a fragment (1 action). Hand it the card and tuck it under its token. |
| Wards stand, carrying a fragment it hasn't delivered | Runs to the Redactor. On reaching any of the 8 tiles around it, the Redactor **gains 1 mark**. This is free and costs no action. The fragment stays on the Scrap. |
| Wards stand, already delivered | Keeps away from you for good. It doesn't steal again. |
| Wards stand, Redactor at 5/5 marks | Won't steal, and keeps away from you. If it arrives with a fragment when marks are full, it adds nothing. |
| **All Wards have fallen** | Every Scrap runs at you and **blocks your path**: it stops on a tile next to you and does nothing else. No stealing. |

When a Scrap dies, every fragment it holds **goes back into your hand** (not the discard pile).

### The Redactor
It's always last in the enemy turn. Its mode is set at the start of each of its turns:

| Mode | When | Actions |
|---|---|---|
| **Guarded** | Any Page Ward stands | 2. Immune to every spell. |
| **Chaos** | All Wards are down and it has a mark | **4**. Spends 1 mark at the start of the turn. |
| **Spent** | All Wards are down and it has no marks | 3, for the rest of the fight. |

- **Marks** only come from Page Scraps delivering stolen fragments, up to a **maximum of 5**. They're shown as
  **5 dots above its token**, filled as marks are gained. The Redactor no longer shreds cards itself.
- **Each action:** if you're in any of the 8 tiles around it, it **explodes** for 3 damage. Only you take damage.
  Otherwise it takes one orthogonal step toward a tile next to you, diagonals included.
- **Chaos cooldown:** in Chaos mode, the action after an explosion is a **cooldown** that does nothing. The cooldown
  resets each turn, so a turn can start with an explosion even if the last one ended with one. At most 2
  explosions (6 damage) per Chaos turn.
- **Guarded and Spent modes** have no cooldown: it explodes on every action while you're in range.
- **Stun:** it can't explode. If you're next to it, it ends its turn on the spot; otherwise it still walks toward you.
- **Root** stops it walking, but it still explodes if you're next to it.
- **Explosions** turn the blasted tiles into the [Erasure zone](#erasure-zone).
- **Killing it wins the demo.**

## The board

| Element | Meaning |
|---|---|
| **Pillar** (PIL) | Blocks movement, line of sight, Archer shots, the Warden's line and spells. |
| **Exit** | Walk onto it to move to the next room. A **locked** exit (Room 2) can't be entered until the Warden dies. |
| **Marked line** (red hatching) | The Warden's line, which fires 5 dmg on its next turn. |
| <a id="erasure-zone"></a>**Erasure zone** (black bars) | Every tile the Redactor's explosions covered during the enemy turn. End your next turn inside it and you permanently lose one fragment from your hand. Then the zone fades. |
| **Dashed purple ring** | The Redactor is protected by its Wards. |
| **Thick black ring** | The Redactor is in Chaos mode. |
| **Badges** | On the token's right: **B***n* = Burn ticks left, **R** = rooted, **S** = stunned. On its left: **⚡** = the Warden holds a charge, **F***n* = fragments a Scrap is holding. |

## Rooms

| Room | Size | You start | Exit | Pillars | Enemies (deploy order) |
|---|---|---|---|---|---|
| 1 · The Cistern | 6×6 | a1 | f6, open | d4, c3 | Rat f4, Brute c5, Brute e2 |
| 2 · The Scriptorium | 6×6 | a1 | f6, locked until the Warden dies | b5, e5, b2, e2 | Archer a6, Archer e6, Leech d2, Warden c4 |
| 3 · The Redactor | 8×8 | d1 | none, beat the boss | b6, g6, b3, g3 | Ward (Fire) c7, Ward (Water) f7, Ward (Rock) d4, Redactor e5 |

## Loot

When an enemy dies (to a spell, to Burn, or through *Defeat* in the GM panel), a popup lists what to do on the table:

| Enemy | Loot |
|---|---|
| Rat, Archer, Brute, Leech | Add their fragment card from the loot pile to your **discard pile**. |
| Warden | Take the Heal Potion card and keep it with you. The exit unlocks. |
| Page Scrap | Its stolen fragments go **back to your hand**. |
| Page Ward, Redactor | Nothing to take. The Redactor's death wins the demo. |

## Intentions (what enemies will do)

Like *Slay the Spire*, every enemy shows small chips above its token that preview **its next turn**. The preview
assumes you end your turn right now, and it updates after every action you take. It's exact: when you end your
turn, the enemies do exactly what was shown, unless your later actions change the situation. Hover a token for the
same plan in words.

Repeated actions are merged into one chip, and damage values are written on the chip (`3×2` = two hits of 3).

| Chip | Meaning |
|---|---|
| Blue double arrow » | Moves (`×3` = three steps) |
| Grey-blue reverse arrow « | Backs away from you |
| Red sword | Melee attack, with damage |
| Red arrow | Archer shot, with damage |
| Blue drop | Drains mana |
| Orange crosshair | Warden marks a line |
| Orange bolt | Warden fires the marked line, with damage |
| Gold eye | Warden holds still with a clear line to you |
| Purple card | Page Scrap steals a fragment |
| Purple `+1` | Page Scrap gives the Redactor a mark |
| Tan shield | Page Scrap blocks your path |
| Orange burst | Redactor explodes, with damage |
| Grey hourglass | Redactor cooldown |
| Purple ⊕ | Page Ward spawns a Page Scrap at the end of the enemy turn |
| Grey pause ‖ | Does nothing (rooted, cornered or blocked) |
