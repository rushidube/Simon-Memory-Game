# Statistics Dashboard — Design Spec

Status: Approved for implementation
Target release: v1.1 (post-RC1)

## Goal

Add a long-term Statistics Dashboard to the existing Simon Game that tracks
player performance across sessions, persisted in `localStorage`. No redesign
of existing UI, no change to core gameplay logic.

## Non-goals

- No new gameplay mechanics.
- No change to `highScore` storage or behavior — it remains its own,
  untouched `localStorage` key.
- No settings/theme/sound/difficulty preferences — this project doesn't have
  any yet, so there is nothing else for Reset Statistics to preserve today.
  The implementation must still be written so it only ever touches its own
  `simonStats` key, so it stays correct automatically if those features are
  added later.
- No charting library, no canvas — CSS-only bar chart.

## Data model

New `localStorage` key: `simonStats`. Shape:

```js
{
  gamesPlayed: 0,
  totalScore: 0,          // sum of finalScore across all completed games — denominator source for Average Score
  highestLevel: 0,         // max currentLevel ever reached (see definition below)
  correctPresses: 0,
  incorrectPresses: 0,
  longestStreak: 0,
  currentStreak: 0,
  totalPlayTimeMs: 0,
  fastestLevelMs: null,    // null until first level is ever completed
  sequencesCompleted: 0,
  lastScore: null,
  lastPlayedDate: null,    // ISO string
  highScoresAchieved: 0,
  recentScores: []         // last 10 finalScores, newest last, capped by dropping oldest
}
```

### Stat definitions (the two that need pinning down)

- **Streak** (`currentStreak` / `longestStreak`) counts consecutive *correct
  pad presses*, continuously across the player's whole history — not reset
  by starting a new game, only reset by an actual wrong press. A "game-win
  streak" doesn't apply to this game since there's no win condition, only an
  ever-continuing level count.
- **"Games Played"** increments only on a natural Game Over (a wrong
  answer). Pressing **Restart** mid-game does not count as a played game —
  no score was produced.
- **Highest Level Ever Reached** (`highestLevel`) is the deepest level the
  sequence ever grew to (`currentLevel`), tracked independently of score. It
  can be one higher than the player's best completed score, since it counts
  the level they were *on* when they failed, not just levels they cleared.

### Display rules — when to show "—" vs "0"

A stat shows **"0"** when zero is a real, meaningful recorded value (a
counter that's genuinely never incremented): Total Games Played, Highest
Level, Total Correct/Incorrect Presses, Longest/Current Streak, Total Time
Played (`0s`), Sequences Completed, High Scores Achieved.

A stat shows **"—"** when there's no value to compute yet, because it's
undefined rather than zero: Average Score (`gamesPlayed === 0`), Fastest
Level Completion Time (`fastestLevelMs === null`), Last Game Score
(`lastScore === null`), Last Played Date (`lastPlayedDate === null`).

## Architecture

Follows the codebase's existing two-file JS pattern: `audio.js` is a
self-contained engine with no DOM knowledge, `app.js` owns all game logic
and DOM/UI. This feature adds one new engine-style module and extends
`app.js` at existing checkpoints — it does not restructure either file.

### `js/stats.js` (new)

An IIFE named `StatsManager`, structured like `AudioManager`. Owns all
`localStorage` I/O and calculation logic. No DOM access. Public API:

- `recordGameStart()` — call when a game session begins (Start button).
  Internally captures `Date.now()` in a module-level variable; this is what
  `recordGameOver` later diffs to get the session's elapsed time. Callers
  never pass timestamps around — `StatsManager` owns that state.
- `recordLevelReached(level)` — call each time a new level begins (i.e.
  right after `currentLevel += 1`), so `highestLevel` tracks the deepest
  level the sequence ever grew to, including the level the player was on
  when they eventually failed it — not just levels they cleared.
- `recordCorrectPress()` — call on every correct pad press.
- `recordIncorrectPress()` — call on the wrong press that ends a game. Note:
  under the current game rules exactly one wrong press always ends the
  current game, so `incorrectPresses` will always equal `gamesPlayed` in
  practice. They're still tracked as separate counters because they're
  separate concepts and the spec calls for both explicitly.
- `recordLevelComplete(durationMs)` — call when a level's sequence is fully
  repeated correctly. `durationMs` is measured by the caller from the
  moment `isPlayerTurn` becomes `true` for that level (end of
  `playSequence`) to this call firing.
- `recordGameOver({ finalScore, isNewHighScore })` — call once, from
  `handleGameOver`, after the above per-press/per-level calls have already
  run for that game.
- `getStats()` — returns the current persisted stats object, for rendering.
- `reset()` — reinitializes `simonStats` to its zero/null defaults.

### `app.js` (extended, not restructured)

One-line calls added at checkpoints that already exist in the current game
loop — no existing function's control flow changes:

- `startButton` click handler → `StatsManager.recordGameStart()`
- `startNextLevel()`, right after `currentLevel += 1` → `StatsManager.recordLevelReached(currentLevel)`
- `checkAnswer`, correct-press branch → `StatsManager.recordCorrectPress()`
- `checkAnswer`, wrong-answer branch → `StatsManager.recordIncorrectPress()`
- `checkAnswer`, level-complete branch → `StatsManager.recordLevelComplete(durationMs)`
  (duration measured from when `isPlayerTurn` becomes `true` for that level
  to this branch firing)
- `handleGameOver()` → `StatsManager.recordGameOver({ finalScore, isNewHighScore })`

Plus new, self-contained functions for opening/closing/rendering the panel
(not mixed into existing game-logic functions).

### Write batching (performance)

`localStorage` is written at most twice per level: once when a level
completes, once at game over. Both are moments the existing code already
pauses at (a `setTimeout`-gated transition). Correct/incorrect counts and
streak update in memory during a level and flush to `localStorage` at
those checkpoints — no per-click write, no new timers/intervals introduced.

## UI/UX

- **Trigger**: a small `📊` icon button added to the `.scoreboard` row,
  after the High Score card. `aria-label="View statistics"`,
  `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls="statsPanel"`.
- **Panel**: slide-out from the right (`role="dialog" aria-modal="true"`,
  `aria-labelledby` pointing at its title). A backdrop dims the board
  underneath without removing it from view. Opens/closes with a short
  transform+opacity transition consistent with the app's existing
  `--ease-standard`/`--transition-*` tokens. Escape key and backdrop click
  both close it. Focus moves into the panel on open, and back to the
  trigger button on close. Minimal focus trap: Tab cycles within the panel
  while open.
- **Layout**: title + close button, then a list of stat rows (small icon +
  label + value — reusing the existing `.score-icon`/`.score-label`/
  `.score-value` visual language from the scoreboard cards rather than
  inventing a new type of row), then the recent-scores chart, then Reset
  Statistics at the bottom, visually separated.
- **Chart**: up to the last 10 finished games as CSS bars, height scaled to
  the max value in that set. Each bar carries an `aria-label` with the
  actual score (bars alone aren't screen-reader accessible). If fewer than
  2 games have been played, the chart area shows "Play a few games to see
  your trend" instead of a near-empty chart.
- **Reset flow**: "Reset Statistics" button, clicked once, swaps in place
  (same panel, no second modal) to the warning text *"Are you sure you want
  to reset all statistics? This action cannot be undone."* plus "Yes,
  Reset" / "Cancel" buttons. On confirm: clears only `simonStats` via
  `StatsManager.reset()`, re-renders the panel to its zero/"—" state.
  `highScore` is never touched by this flow.
- **New CSS tokens**: only where genuinely needed (e.g. panel width). All
  colors, radii, shadows, easing reuse the existing `:root` tokens already
  defined in `style.css`. The existing global `prefers-reduced-motion`
  block already covers any new animation — no separate handling needed.

## Accessibility

- Dialog semantics as above (`role="dialog"`, `aria-modal`, labelled title).
- Keyboard: Tab/Shift+Tab cycle within the open panel; Escape closes it.
- Focus management: focus enters the panel on open, returns to the trigger
  on close.
- Chart bars have textual `aria-label`s carrying the real score value.

## Documentation

A new "Statistics Dashboard" section is added to `README.md`, matching the
existing doc style, covering: what's tracked, why each stat is useful,
where it's stored (`simonStats` in `localStorage`, separate from
`highScore`), and how the derived values (Average Score, streaks) are
calculated.

## Out of scope / explicitly deferred

- Per-session (as opposed to lifetime) breakdowns.
- Exporting/importing stats.
- Any stat not listed in the Data model section above.
