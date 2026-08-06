# Statistics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a slide-out Statistics Dashboard that tracks long-term player
performance across sessions, persisted in `localStorage`, without touching
existing gameplay, visual design, or the `highScore` key.

**Architecture:** One new, DOM-free data-engine module (`js/stats.js`,
mirroring `AudioManager`'s IIFE shape) owns all `localStorage` I/O and stat
math under its own `simonStats` key. `app.js` gets a handful of one-line
calls into that module at checkpoints its game loop already passes through,
plus new (additive) functions that render and toggle a slide-out panel.
`index.html`/`style.css` get new, self-contained markup/styles appended
without altering anything existing.

**Tech Stack:** Vanilla JS (ES6+), `localStorage`, CSS custom properties —
same stack as the rest of the project. No new dependencies, no build step.

## Global Constraints

- Do not redesign the existing UI or change core Simon Game mechanics.
- No new `localStorage` keys other than `simonStats`; `highScore` is never
  read or written by this feature.
- No new frameworks, build tools, or external dependencies.
- Reuse existing CSS design tokens (`--color-*`, `--radius-*`, `--shadow-*`,
  `--ease-standard`, `--transition-*`) wherever they already fit; add new
  tokens only where genuinely needed.
- `localStorage` writes happen only at the level-complete and game-over
  checkpoints that already exist in the game loop — never per button-press,
  never on a new timer/interval.
- Streak = consecutive correct *pad presses* across all history, reset only
  by a wrong press (not by starting a new game). "Games Played" increments
  only on a natural Game Over, not on Restart.
- Display "—" for a stat with no recorded value yet (Average Score,
  Fastest Level Time, Last Game Score, Last Played Date); display "0" for
  every other stat when it's genuinely zero.
- Reference spec: `docs/superpowers/specs/2026-08-06-statistics-dashboard-design.md`

## Verification approach (no test framework in this repo)

This project has no test runner (`package.json`, Jest, etc. don't exist,
and per the constraints above, none should be added). Every task instead
verifies against a **real running instance of the game in a browser**:

```bash
cd "<repo root>"
python -m http.server 8899
```

Then open `http://localhost:8899/index.html` in a browser, and run the
JS snippets given in each task's steps directly in that page's console (or
via an equivalent browser-automation tool with console/JS-execution
access). Each step tells you exactly what to run and what output to expect.
Stop the server (`Ctrl+C` / kill the process) once a task's verification
passes.

---

### Task 1: StatsManager core module

**Files:**
- Create: `js/stats.js`

**Interfaces:**
- Produces: `StatsManager` global object with methods
  `recordGameStart()`, `recordLevelReached(level)`,
  `recordCorrectPress()`, `recordIncorrectPress()`,
  `recordLevelComplete(durationMs)`,
  `recordGameOver({ finalScore, isNewHighScore })`, `getStats()`, `reset()`.
  `getStats()` returns a plain object with keys: `gamesPlayed`,
  `totalScore`, `highestLevel`, `correctPresses`, `incorrectPresses`,
  `longestStreak`, `currentStreak`, `totalPlayTimeMs`, `fastestLevelMs`,
  `sequencesCompleted`, `lastScore`, `lastPlayedDate`, `highScoresAchieved`,
  `recentScores` (array, max length 10).

- [ ] **Step 1: Write `js/stats.js`**

```js
/* Simon Game — Statistics Dashboard data engine.

   Owns every read/write of the `simonStats` localStorage key and all the
   derived-stat math (average score, streaks, fastest level). No DOM
   access — app.js is the only thing that renders these numbers.

   Mirrors AudioManager's module shape: one IIFE, one small public API,
   private state closed over inside. */

const StatsManager = (() => {
    const STORAGE_KEY = "simonStats";
    const RECENT_SCORES_LIMIT = 10;

    function defaultStats() {
        return {
            gamesPlayed: 0,
            totalScore: 0,
            highestLevel: 0,
            correctPresses: 0,
            incorrectPresses: 0,
            longestStreak: 0,
            currentStreak: 0,
            totalPlayTimeMs: 0,
            fastestLevelMs: null,
            sequencesCompleted: 0,
            lastScore: null,
            lastPlayedDate: null,
            highScoresAchieved: 0,
            recentScores: [],
        };
    }

    // localStorage can throw (Safari private browsing, quota, disabled
    // storage) — same defensive pattern app.js already uses for highScore,
    // so a stats read/write failure can't take the rest of the game down.
    function readStats() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return defaultStats();
            // Merge over defaults so a stat added in a future version that's
            // missing from an older saved blob still gets a valid default
            // instead of `undefined`.
            return { ...defaultStats(), ...JSON.parse(raw) };
        } catch {
            return defaultStats();
        }
    }

    function writeStats(stats) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
        } catch {
            // Storage unavailable — the session still tracks stats in
            // memory via `current`, it just won't survive a reload.
        }
    }

    // In-memory copy, kept in sync with localStorage on every write. Reads
    // (getStats) hit this instead of re-parsing localStorage every call.
    let current = readStats();

    // Session-scoped, not persisted: the moment the current game started,
    // so recordGameOver can compute this session's elapsed play time.
    let sessionStartTime = null;

    function persist() {
        writeStats(current);
    }

    function recordGameStart() {
        sessionStartTime = Date.now();
    }

    function recordLevelReached(level) {
        if (level > current.highestLevel) {
            current.highestLevel = level;
        }
    }

    function recordCorrectPress() {
        current.correctPresses += 1;
        current.currentStreak += 1;
        if (current.currentStreak > current.longestStreak) {
            current.longestStreak = current.currentStreak;
        }
    }

    function recordIncorrectPress() {
        current.incorrectPresses += 1;
        current.currentStreak = 0;
    }

    function recordLevelComplete(durationMs) {
        current.sequencesCompleted += 1;
        if (current.fastestLevelMs === null || durationMs < current.fastestLevelMs) {
            current.fastestLevelMs = durationMs;
        }
        persist();
    }

    function recordGameOver({ finalScore, isNewHighScore }) {
        current.gamesPlayed += 1;
        current.totalScore += finalScore;
        current.lastScore = finalScore;
        current.lastPlayedDate = new Date().toISOString();

        current.recentScores.push(finalScore);
        if (current.recentScores.length > RECENT_SCORES_LIMIT) {
            current.recentScores.shift();
        }

        if (sessionStartTime !== null) {
            current.totalPlayTimeMs += Date.now() - sessionStartTime;
            sessionStartTime = null;
        }

        if (isNewHighScore) {
            current.highScoresAchieved += 1;
        }

        persist();
    }

    function getStats() {
        return { ...current };
    }

    function reset() {
        current = defaultStats();
        sessionStartTime = null;
        persist();
    }

    return {
        recordGameStart,
        recordLevelReached,
        recordCorrectPress,
        recordIncorrectPress,
        recordLevelComplete,
        recordGameOver,
        getStats,
        reset,
    };
})();
```

- [ ] **Step 2: Add the script tag to `index.html`**

Find this line near the end of `index.html`:

```html
    <script src="js/audio.js"></script>
    <script src="js/app.js"></script>
```

Replace it with:

```html
    <script src="js/stats.js"></script>
    <script src="js/audio.js"></script>
    <script src="js/app.js"></script>
```

- [ ] **Step 3: Verify in a browser**

Start a static server from the repo root and open the page:

```bash
python -m http.server 8899
```

Navigate to `http://localhost:8899/index.html`, open the console, and run:

```js
StatsManager.reset();
StatsManager.recordGameStart();
StatsManager.recordLevelReached(1);
StatsManager.recordCorrectPress();
StatsManager.recordLevelComplete(1200);
StatsManager.recordLevelReached(2);
StatsManager.recordCorrectPress();
StatsManager.recordIncorrectPress();
StatsManager.recordGameOver({ finalScore: 1, isNewHighScore: true });
JSON.stringify(StatsManager.getStats());
```

Expected: an object with `gamesPlayed: 1`, `totalScore: 1`,
`highestLevel: 2`, `correctPresses: 2`, `incorrectPresses: 1`,
`longestStreak: 2`, `currentStreak: 0`, `sequencesCompleted: 1`,
`fastestLevelMs: 1200`, `lastScore: 1`, `highScoresAchieved: 1`,
`recentScores: [1]`, `totalPlayTimeMs` greater than 0,
`lastPlayedDate` a valid ISO string.

Then reload the page and run `StatsManager.getStats()` again — the same
values should still be there (confirms persistence). Run
`localStorage.getItem("highScore")` — confirm it's untouched by any of the
calls above (still whatever it was before, not related to this test).

Stop the server once this passes.

- [ ] **Step 4: Commit**

```bash
git add js/stats.js index.html
git commit -m "feat(stats): add StatsManager data engine

Self-contained module owning the simonStats localStorage key and all
derived-stat calculations. No DOM access, no wiring into gameplay yet.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Wire StatsManager into the game loop

**Files:**
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `StatsManager.recordGameStart()`, `recordLevelReached(level)`,
  `recordCorrectPress()`, `recordIncorrectPress()`,
  `recordLevelComplete(durationMs)`,
  `recordGameOver({ finalScore, isNewHighScore })` — from Task 1.
- Produces: a module-level `levelStartTime` variable in `app.js`, reset to
  `null` inside `resetGame()`, consumed by the level-complete branch of
  `checkAnswer`.

- [ ] **Step 1: Add `levelStartTime` to game state**

In `js/app.js`, find:

```js
let gameSequence = [];
let userSequence = [];
let isGameActive = false; // a session is running (countdown through game over)
let isPlayerTurn = false; // the player, specifically, may click pads right now
let currentLevel = 0;
let highScore = readStoredHighScore();
```

Replace with:

```js
let gameSequence = [];
let userSequence = [];
let isGameActive = false; // a session is running (countdown through game over)
let isPlayerTurn = false; // the player, specifically, may click pads right now
let currentLevel = 0;
let highScore = readStoredHighScore();

// Timestamp for the moment the player's turn began on the current level —
// consumed by StatsManager.recordLevelComplete to time that level.
let levelStartTime = null;
```

- [ ] **Step 2: Record game start**

Find:

```js
startButton.addEventListener("click", () => {
    if (isGameActive) return;

    isGameActive = true;
    startButton.disabled = true;
    lockPads(true);
    AudioManager.play("start");

    runCountdown(startNextLevel);
});
```

Replace with:

```js
startButton.addEventListener("click", () => {
    if (isGameActive) return;

    isGameActive = true;
    StatsManager.recordGameStart();
    startButton.disabled = true;
    lockPads(true);
    AudioManager.play("start");

    runCountdown(startNextLevel);
});
```

- [ ] **Step 3: Record the level reached and the level's start time**

Find:

```js
function startNextLevel() {
    userSequence = [];
    currentLevel += 1;
    updateLevelDisplay(currentLevel);
    setStatusMessage(`Level ${currentLevel}`);
```

Replace with:

```js
function startNextLevel() {
    userSequence = [];
    currentLevel += 1;
    StatsManager.recordLevelReached(currentLevel);
    updateLevelDisplay(currentLevel);
    setStatusMessage(`Level ${currentLevel}`);
```

Find (inside `playSequence`):

```js
    const totalDuration = gameSequence.length * stepInterval;
    setTimeout(() => {
        if (isStaleSession(sessionId)) return;
        isPlayerTurn = true;
        lockPads(false);
        setStatusMessage(YOUR_TURN_MESSAGE);
    }, totalDuration);
```

Replace with:

```js
    const totalDuration = gameSequence.length * stepInterval;
    setTimeout(() => {
        if (isStaleSession(sessionId)) return;
        isPlayerTurn = true;
        levelStartTime = Date.now();
        lockPads(false);
        setStatusMessage(YOUR_TURN_MESSAGE);
    }, totalDuration);
```

- [ ] **Step 4: Record correct/incorrect presses and level completion**

Find:

```js
function checkAnswer(index) {
    const isCorrect = userSequence[index] === gameSequence[index];

    if (!isCorrect) {
        AudioManager.play("wrong");
        handleGameOver();
        return;
    }

    const sequenceComplete = userSequence.length === gameSequence.length;
    if (!sequenceComplete) return;

    // Lock immediately — otherwise the pads stay clickable for the full
    // pause before the next sequence starts, and an extra click in that
    // window pushes past the end of gameSequence and reads as a wrong
    // answer right after the player won the round.
    isPlayerTurn = false;
    lockPads(true);

    AudioManager.play("levelComplete");
    setStatusMessage(getLevelCompleteMessage(currentLevel));

    const sessionId = gameSessionId;
    setTimeout(() => {
        if (isStaleSession(sessionId)) return;
        startNextLevel();
    }, NEXT_LEVEL_DELAY_MS);
}
```

Replace with:

```js
function checkAnswer(index) {
    const isCorrect = userSequence[index] === gameSequence[index];

    if (!isCorrect) {
        AudioManager.play("wrong");
        StatsManager.recordIncorrectPress();
        handleGameOver();
        return;
    }

    StatsManager.recordCorrectPress();

    const sequenceComplete = userSequence.length === gameSequence.length;
    if (!sequenceComplete) return;

    // Lock immediately — otherwise the pads stay clickable for the full
    // pause before the next sequence starts, and an extra click in that
    // window pushes past the end of gameSequence and reads as a wrong
    // answer right after the player won the round.
    isPlayerTurn = false;
    lockPads(true);

    AudioManager.play("levelComplete");
    setStatusMessage(getLevelCompleteMessage(currentLevel));

    if (levelStartTime !== null) {
        StatsManager.recordLevelComplete(Date.now() - levelStartTime);
        levelStartTime = null;
    }

    const sessionId = gameSessionId;
    setTimeout(() => {
        if (isStaleSession(sessionId)) return;
        startNextLevel();
    }, NEXT_LEVEL_DELAY_MS);
}
```

- [ ] **Step 5: Record game over and clear `levelStartTime` on reset**

Find:

```js
function handleGameOver() {
    const finalScore = currentLevel - 1;
    const isNewHighScore = finalScore > highScore;
```

Replace with:

```js
function handleGameOver() {
    const finalScore = currentLevel - 1;
    const isNewHighScore = finalScore > highScore;
    StatsManager.recordGameOver({ finalScore, isNewHighScore });
```

Find:

```js
function resetGame() {
    gameSessionId += 1; // invalidate any timers still in flight
    isGameActive = false;
    isPlayerTurn = false;
    gameSequence = [];
    userSequence = [];
    currentLevel = 0;
    startButton.disabled = false;
    lockPads(false);
}
```

Replace with:

```js
function resetGame() {
    gameSessionId += 1; // invalidate any timers still in flight
    isGameActive = false;
    isPlayerTurn = false;
    gameSequence = [];
    userSequence = [];
    currentLevel = 0;
    levelStartTime = null;
    startButton.disabled = false;
    lockPads(false);
}
```

- [ ] **Step 6: Verify — regression + stats accumulation**

Start the server, open the page, open the console.

Regression check first (confirms nothing existing broke): click Start,
wait for the countdown, and play a few rounds normally in the UI. Confirm
the level badge, sequence playback, and win/lose behavior all look exactly
as before.

Then verify stats actually accumulate from real play. Run in the console:

```js
StatsManager.reset();
```

Play one full game through the UI: click Start, wait for the countdown,
then deliberately answer correctly for a couple of levels, then
deliberately click a wrong pad to end the game. After the Game Over
message appears, run:

```js
JSON.stringify(StatsManager.getStats());
```

Expected: `gamesPlayed: 1`, `correctPresses` greater than 0,
`incorrectPresses: 1`, `sequencesCompleted` equal to the number of levels
you completed, `highestLevel` equal to the level you failed on,
`lastScore` equal to the number of levels you completed, `fastestLevelMs`
a positive number, `totalPlayTimeMs` a positive number, `recentScores` an
array containing that one score.

Also confirm `localStorage.getItem("highScore")` still reflects normal
high-score behavior (unaffected by this change).

Stop the server once this passes.

- [ ] **Step 7: Commit**

```bash
git add js/app.js
git commit -m "feat(stats): wire StatsManager into existing game checkpoints

Adds one-line StatsManager calls at the checkpoints the game loop already
passes through (start, level reached, correct/incorrect press, level
complete, game over). No existing control flow changed.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Panel markup, trigger button, and base panel CSS

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`

**Interfaces:**
- Produces DOM elements consumed by Task 4/5/6:
  `#statsToggleBtn`, `#statsOverlay`, `#statsPanel`, `#statsCloseBtn`,
  `#statsList`, `#statsChart`, `#statsResetBtn`, `#statsResetConfirm`,
  `#statsResetConfirmBtn`, `#statsResetCancelBtn`.
- Produces CSS classes toggled by later tasks: `.is-open` (on
  `#statsOverlay` and `#statsPanel`).

- [ ] **Step 1: Add the trigger button**

In `index.html`, find:

```html
        <div class="scoreboard">
            <div id="level">Level : 0</div>
            <div id="highscore">High Score : 0</div>
        </div>
```

Replace with:

```html
        <div class="scoreboard">
            <div id="level">Level : 0</div>
            <div id="highscore">High Score : 0</div>
            <button id="statsToggleBtn" class="stats-trigger" type="button" aria-label="View statistics" aria-haspopup="dialog" aria-expanded="false" aria-controls="statsPanel">📊</button>
        </div>
```

- [ ] **Step 2: Add the panel markup**

Find:

```html
    <script src="js/stats.js"></script>
    <script src="js/audio.js"></script>
    <script src="js/app.js"></script>
```

Replace with:

```html
    <div id="statsOverlay" class="stats-overlay" hidden></div>
    <aside id="statsPanel" class="stats-panel" role="dialog" aria-modal="true" aria-labelledby="statsPanelTitle" hidden>
        <div class="stats-panel-header">
            <h2 id="statsPanelTitle">Statistics</h2>
            <button id="statsCloseBtn" class="stats-close-btn" type="button" aria-label="Close statistics">✕</button>
        </div>

        <div id="statsList" class="stats-list"></div>

        <div class="stats-chart-section">
            <h3 class="stats-chart-title">Recent Scores</h3>
            <div id="statsChart" class="stats-chart"></div>
        </div>

        <div class="stats-reset-section">
            <button id="statsResetBtn" class="stats-reset-btn" type="button">Reset Statistics</button>
            <div id="statsResetConfirm" class="stats-reset-confirm" hidden>
                <p>Are you sure you want to reset all statistics?<br>This action cannot be undone.</p>
                <div class="stats-reset-actions">
                    <button id="statsResetConfirmBtn" class="stats-reset-confirm-btn" type="button">Yes, Reset</button>
                    <button id="statsResetCancelBtn" class="stats-reset-cancel-btn" type="button">Cancel</button>
                </div>
            </div>
        </div>
    </aside>

    <script src="js/stats.js"></script>
    <script src="js/audio.js"></script>
    <script src="js/app.js"></script>
```

- [ ] **Step 3: Append the base CSS**

Add this new section at the very end of `css/style.css`:

```css
/* ==========================================================================
   Statistics Dashboard
   Slide-out panel + backdrop, reusing the scoreboard's existing glass-card
   language (--color-panel-bg / --color-panel-border / --shadow-panel)
   rather than introducing a new visual style. Only one new token
   (--stats-panel-width) was actually needed.
   ========================================================================== */

:root{
    --stats-panel-width: min(360px, 92vw);
}

.stats-trigger{
    appearance: none;
    -webkit-appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.1rem;
    height: 2.1rem;
    padding: 0;
    margin-left: 2px;
    font-size: 1rem;
    line-height: 1;
    color: var(--color-text-muted);
    background-color: var(--color-panel-bg);
    border: 1px solid var(--color-panel-border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-panel);
    cursor: pointer;
    transition: color var(--transition-fast), border-color var(--transition-fast), transform var(--transition-release);
}

@media (hover: hover) and (pointer: fine){
    .stats-trigger:hover{
        color: var(--color-text-primary);
        border-color: rgba(255, 255, 255, 0.32);
        transform: translateY(-1px);
    }
}

.stats-overlay{
    position: fixed;
    inset: 0;
    background-color: rgba(6, 8, 16, 0.55);
    opacity: 0;
    z-index: 60;
    transition: opacity var(--transition-release);
}

.stats-overlay.is-open{
    opacity: 1;
}

.stats-panel{
    position: fixed;
    top: 0;
    right: 0;
    z-index: 61;
    display: flex;
    flex-direction: column;
    gap: var(--space-7);
    width: var(--stats-panel-width);
    height: 100%;
    padding: var(--space-8) var(--space-7);
    overflow-y: auto;
    background:
        linear-gradient(155deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0) 30%),
        var(--color-bg-end);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border-left: 1px solid var(--color-panel-border);
    box-shadow: -18px 0 40px rgba(0, 0, 0, 0.35);
    transform: translateX(100%);
    transition: transform var(--transition-release);
    text-align: left;
}

.stats-panel.is-open{
    transform: translateX(0);
}

.stats-panel-header{
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.stats-panel-header h2{
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
}

.stats-close-btn{
    appearance: none;
    -webkit-appearance: none;
    width: 2rem;
    height: 2rem;
    padding: 0;
    font-size: 0.95rem;
    color: var(--color-text-muted);
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: color var(--transition-fast), border-color var(--transition-fast);
}

.stats-close-btn:hover{
    color: var(--color-text-primary);
    border-color: rgba(255, 255, 255, 0.32);
}

.stats-list{
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.stats-row{
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-5);
    background-color: var(--color-panel-bg);
    border: 1px solid var(--color-panel-border);
    border-radius: var(--radius-sm);
    transition: border-color var(--transition-fast), background-color var(--transition-fast);
}

@media (hover: hover) and (pointer: fine){
    .stats-row:hover{
        border-color: rgba(255, 255, 255, 0.24);
        background-color: rgba(255, 255, 255, 0.08);
    }
}

.stats-row-icon{
    font-size: 0.95em;
}

.stats-row-label{
    flex: 1;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--color-text-muted);
}

.stats-row-value{
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--color-text-primary);
}

.stats-chart-title{
    margin: 0 0 var(--space-4);
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-muted);
}

.stats-chart{
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    height: 72px;
    padding: var(--space-3);
    background-color: var(--color-panel-bg);
    border: 1px solid var(--color-panel-border);
    border-radius: var(--radius-sm);
}

.stats-bar{
    flex: 1;
    min-height: 4px;
    background-color: var(--color-accent);
    border-radius: 3px 3px 0 0;
}

.stats-chart-empty{
    margin: 0;
    font-size: 0.8rem;
    color: var(--color-text-muted);
}

.stats-reset-section{
    margin-top: auto;
    padding-top: var(--space-6);
    border-top: 1px solid var(--color-panel-border);
}

.stats-reset-btn{
    width: 100%;
    padding: var(--space-4);
    font-family: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-red);
    background: transparent;
    border: 1px solid rgba(217, 89, 128, 0.4);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background-color var(--transition-fast), border-color var(--transition-fast);
}

.stats-reset-btn:hover{
    background-color: rgba(217, 89, 128, 0.1);
    border-color: rgba(217, 89, 128, 0.6);
}

.stats-reset-confirm p{
    margin: 0 0 var(--space-4);
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--color-text-muted);
}

.stats-reset-actions{
    display: flex;
    gap: var(--space-4);
}

.stats-reset-confirm-btn,
.stats-reset-cancel-btn{
    flex: 1;
    padding: var(--space-4);
    font-family: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    border-radius: var(--radius-sm);
    cursor: pointer;
}

.stats-reset-confirm-btn{
    color: #fff;
    background-color: var(--color-red);
    border: none;
}

.stats-reset-cancel-btn{
    color: var(--color-text-muted);
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.18);
}

.stats-close-btn:focus-visible,
.stats-trigger:focus-visible,
.stats-reset-btn:focus-visible,
.stats-reset-confirm-btn:focus-visible,
.stats-reset-cancel-btn:focus-visible{
    outline: var(--focus-ring-width) solid var(--focus-ring-color);
    outline-offset: var(--focus-ring-offset);
}

@media (max-width: 420px){
    .stats-panel{
        padding: var(--space-6) var(--space-5);
    }
}
```

- [ ] **Step 4: Verify — static rendering**

Start the server, open the page. Confirm the 📊 icon appears next to the
High Score card and the rest of the page looks unchanged. In the console,
run:

```js
document.getElementById("statsOverlay").hidden = false;
document.getElementById("statsPanel").hidden = false;
document.getElementById("statsOverlay").classList.add("is-open");
document.getElementById("statsPanel").classList.add("is-open");
```

Expected: a dimmed backdrop appears and a panel slides in from the right
with the title "Statistics", a close button, an empty stats list area, a
"Recent Scores" heading with an empty chart box, and a "Reset Statistics"
button. Then run:

```js
document.getElementById("statsOverlay").classList.remove("is-open");
document.getElementById("statsPanel").classList.remove("is-open");
```

Expected: the panel slides back out and the backdrop fades out (it stays
in the DOM with `hidden` still `false` at this point — that's expected,
Task 4 wires the actual hide-after-transition logic). Stop the server.

- [ ] **Step 5: Commit**

```bash
git add index.html css/style.css
git commit -m "feat(stats): add stats panel markup, trigger button, and base CSS

Static markup and styling only — panel open/close/render logic comes in a
later task. Reuses existing design tokens throughout.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Panel open/close interaction logic

**Files:**
- Modify: `js/app.js`

**Interfaces:**
- Consumes: DOM elements from Task 3 (`#statsToggleBtn`, `#statsOverlay`,
  `#statsPanel`, `#statsCloseBtn`).
- Produces: `openStatsPanel()`, `closeStatsPanel()` — consumed by Task 6's
  reset-confirm flow (`closeStatsPanel` is not called by reset, but both
  functions live in the same new "Statistics panel" section other tasks
  extend).

- [ ] **Step 1: Add DOM references**

In `js/app.js`, find:

```js
const startButton = document.getElementById("startBtn");
const restartButton = document.getElementById("restartBtn");
const statusMessage = document.getElementById("statusMessage");
const levelDisplay = document.getElementById("level");
const highScoreDisplay = document.getElementById("highscore");
const padContainer = document.querySelector(".btn-container");
const padElements = document.querySelectorAll(".btn");
```

Replace with:

```js
const startButton = document.getElementById("startBtn");
const restartButton = document.getElementById("restartBtn");
const statusMessage = document.getElementById("statusMessage");
const levelDisplay = document.getElementById("level");
const highScoreDisplay = document.getElementById("highscore");
const padContainer = document.querySelector(".btn-container");
const padElements = document.querySelectorAll(".btn");

const statsToggleBtn = document.getElementById("statsToggleBtn");
const statsOverlay = document.getElementById("statsOverlay");
const statsPanel = document.getElementById("statsPanel");
const statsCloseBtn = document.getElementById("statsCloseBtn");
const statsList = document.getElementById("statsList");
const statsChart = document.getElementById("statsChart");
const statsResetBtn = document.getElementById("statsResetBtn");
const statsResetConfirm = document.getElementById("statsResetConfirm");
const statsResetConfirmBtn = document.getElementById("statsResetConfirmBtn");
const statsResetCancelBtn = document.getElementById("statsResetCancelBtn");
```

- [ ] **Step 2: Add the panel open/close functions**

Find the end of the file:

```js
document.addEventListener("visibilitychange", () => {
    if (!document.hidden || !isGameActive) return;

    stopAllPadEffects();
    returnToIdle();
});
```

Replace with:

```js
document.addEventListener("visibilitychange", () => {
    if (!document.hidden || !isGameActive) return;

    stopAllPadEffects();
    returnToIdle();
});

// ---------------------------------------------------------------------------
// Statistics panel
// ---------------------------------------------------------------------------

let statsLastFocusedElement = null;

function getFocusableStatsElements() {
    return [...statsPanel.querySelectorAll("button")].filter((el) => el.offsetParent !== null);
}

function handleStatsKeydown(event) {
    if (event.key === "Escape") {
        closeStatsPanel();
        return;
    }
    if (event.key !== "Tab") return;

    const focusable = getFocusableStatsElements();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function handleStatsPanelTransitionEnd(event) {
    if (event.target !== statsPanel || event.propertyName !== "transform") return;
    if (!statsPanel.classList.contains("is-open")) {
        statsOverlay.hidden = true;
        statsPanel.hidden = true;
    }
}

function openStatsPanel() {
    statsLastFocusedElement = document.activeElement;
    statsOverlay.hidden = false;
    statsPanel.hidden = false;
    // Force a reflow before adding the open class so the slide-in
    // transition actually plays instead of snapping straight to open.
    void statsPanel.offsetWidth;
    statsOverlay.classList.add("is-open");
    statsPanel.classList.add("is-open");
    statsToggleBtn.setAttribute("aria-expanded", "true");
    statsCloseBtn.focus();
    document.addEventListener("keydown", handleStatsKeydown);
}

function closeStatsPanel() {
    statsOverlay.classList.remove("is-open");
    statsPanel.classList.remove("is-open");
    statsToggleBtn.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", handleStatsKeydown);
    if (statsLastFocusedElement) statsLastFocusedElement.focus();
}

statsPanel.addEventListener("transitionend", handleStatsPanelTransitionEnd);
statsToggleBtn.addEventListener("click", openStatsPanel);
statsCloseBtn.addEventListener("click", closeStatsPanel);
statsOverlay.addEventListener("click", closeStatsPanel);
```

- [ ] **Step 3: Verify — mouse and keyboard interaction**

Start the server, open the page. Click the 📊 icon: confirm the panel
slides in, the backdrop dims, and focus lands on the close button (✕).
Press `Escape`: confirm the panel slides out, and after the transition
finishes, run in the console:

```js
JSON.stringify({ overlayHidden: statsOverlay.hidden, panelHidden: statsPanel.hidden });
```

Expected: both `true` (confirms the `transitionend` handler re-hid them,
not just visually slid them off).

Click the 📊 icon again, then click the dimmed backdrop area (outside the
panel): confirm it also closes. Click the icon once more, then press `Tab`
repeatedly: confirm focus cycles only among the panel's own buttons and
never escapes to the page behind it. Confirm that after closing (via any
method), keyboard focus returns to the 📊 icon button
(`document.activeElement.id === "statsToggleBtn"`).

Stop the server.

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat(stats): add panel open/close interaction logic

Escape key, backdrop click, and the close button all close the panel;
focus moves into the panel on open and back to the trigger on close; Tab
is trapped inside the panel while it's open.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Render stat rows and the recent-scores chart

**Files:**
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `StatsManager.getStats()` from Task 1; `statsList`, `statsChart`
  DOM refs from Task 4; `openStatsPanel()` from Task 4 (extended here to
  render before showing).
- Produces: `formatDuration(ms)`, `formatDate(isoString)`,
  `renderStatsList(stats)`, `renderStatsChart(stats)`, `renderStatsPanel()`
  — `renderStatsPanel()` is consumed by Task 6's reset flow.

- [ ] **Step 1: Add formatting helpers, row config, and render functions**

Find (added in Task 4):

```js
// ---------------------------------------------------------------------------
// Statistics panel
// ---------------------------------------------------------------------------

let statsLastFocusedElement = null;
```

Replace with:

```js
// ---------------------------------------------------------------------------
// Statistics panel
// ---------------------------------------------------------------------------

function formatDuration(ms) {
    const totalSeconds = Math.round(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function formatDate(isoString) {
    return new Date(isoString).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

// Each row: an icon, a label, and a function deriving its display string
// from a StatsManager.getStats() snapshot. Centralizing this as config
// (rather than 13 near-identical DOM-building blocks) is what
// renderStatsList loops over.
const STAT_ROWS = [
    { icon: "🎮", label: "Games Played", value: (s) => String(s.gamesPlayed) },
    { icon: "🪜", label: "Highest Level Reached", value: (s) => String(s.highestLevel) },
    { icon: "📊", label: "Average Score", value: (s) => (s.gamesPlayed === 0 ? "—" : (s.totalScore / s.gamesPlayed).toFixed(1)) },
    { icon: "✅", label: "Correct Presses", value: (s) => String(s.correctPresses) },
    { icon: "❌", label: "Incorrect Presses", value: (s) => String(s.incorrectPresses) },
    { icon: "🔥", label: "Longest Streak", value: (s) => String(s.longestStreak) },
    { icon: "⚡", label: "Current Streak", value: (s) => String(s.currentStreak) },
    { icon: "⏱", label: "Total Time Played", value: (s) => formatDuration(s.totalPlayTimeMs) },
    { icon: "🚀", label: "Fastest Level Time", value: (s) => (s.fastestLevelMs === null ? "—" : formatDuration(s.fastestLevelMs)) },
    { icon: "🔁", label: "Sequences Completed", value: (s) => String(s.sequencesCompleted) },
    { icon: "🏁", label: "Last Game Score", value: (s) => (s.lastScore === null ? "—" : String(s.lastScore)) },
    { icon: "📅", label: "Last Played", value: (s) => (s.lastPlayedDate === null ? "—" : formatDate(s.lastPlayedDate)) },
    { icon: "🏆", label: "High Scores Achieved", value: (s) => String(s.highScoresAchieved) },
];

function renderStatsList(stats) {
    statsList.innerHTML = STAT_ROWS.map(
        (row) => `<div class="stats-row">
            <span class="stats-row-icon" aria-hidden="true">${row.icon}</span>
            <span class="stats-row-label">${row.label}</span>
            <span class="stats-row-value">${row.value(stats)}</span>
        </div>`
    ).join("");
}

function renderStatsChart(stats) {
    const scores = stats.recentScores;
    if (scores.length < 2) {
        statsChart.innerHTML = `<p class="stats-chart-empty">Play a few games to see your trend</p>`;
        return;
    }

    const max = Math.max(...scores);
    statsChart.innerHTML = scores
        .map((score) => {
            const heightPercent = max === 0 ? 4 : Math.max(4, Math.round((score / max) * 100));
            return `<div class="stats-bar" style="height:${heightPercent}%" role="img" aria-label="Score ${score}"></div>`;
        })
        .join("");
}

function renderStatsPanel() {
    const stats = StatsManager.getStats();
    renderStatsList(stats);
    renderStatsChart(stats);
}

let statsLastFocusedElement = null;
```

- [ ] **Step 2: Render before showing the panel**

Find (added in Task 4):

```js
function openStatsPanel() {
    statsLastFocusedElement = document.activeElement;
    statsOverlay.hidden = false;
```

Replace with:

```js
function openStatsPanel() {
    renderStatsPanel();
    statsLastFocusedElement = document.activeElement;
    statsOverlay.hidden = false;
```

- [ ] **Step 3: Verify — rendered content matches real stats**

Start the server, open the page, open the console. Run:

```js
StatsManager.reset();
```

Play two full games through the UI with different outcomes (e.g. reach
level 3 and lose on the first game, level 5 and lose on the second), so
there's real, varied data. Then click the 📊 icon and confirm visually:
Games Played shows `2`, Average Score shows the mean of your two scores
to one decimal place, Last Game Score matches your second game, Last
Played shows today's date, and the "Recent Scores" chart shows two bars
(taller bar for the higher score). Confirm every row shows a value, not
`undefined` or `NaN` anywhere.

Then run in the console (with the panel still open):

```js
statsList.textContent.includes("Games Played") && statsList.textContent.includes("2");
```

Expected: `true`.

Now reset and reopen without playing any games, to check the empty state:

```js
StatsManager.reset();
```

Close and reopen the panel (click 📊 again). Confirm: Games Played shows
`0`, Average Score shows `—`, Fastest Level Time shows `—`, Last Game
Score shows `—`, Last Played shows `—`, Total Time Played shows `0s`, and
the chart area shows "Play a few games to see your trend" instead of an
empty box.

Stop the server.

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat(stats): render stat rows and recent-scores chart

Panel content is rendered from StatsManager.getStats() each time it's
opened. Applies the '—' vs '0' display rule from the spec, and shows an
empty-state message in the chart until at least 2 games are recorded.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Reset Statistics flow

**Files:**
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `StatsManager.reset()` from Task 1; `renderStatsPanel()` from
  Task 5; `statsResetBtn`, `statsResetConfirm`, `statsResetConfirmBtn`,
  `statsResetCancelBtn` DOM refs from Task 4.
- Produces: `resetStatsConfirmUI()` — also called from `closeStatsPanel()`
  so the confirm state never lingers if the panel is closed mid-confirm.

- [ ] **Step 1: Add the reset-confirm functions**

Find (added in Task 5):

```js
function renderStatsPanel() {
    const stats = StatsManager.getStats();
    renderStatsList(stats);
    renderStatsChart(stats);
}

let statsLastFocusedElement = null;
```

Replace with:

```js
function renderStatsPanel() {
    const stats = StatsManager.getStats();
    renderStatsList(stats);
    renderStatsChart(stats);
}

function resetStatsConfirmUI() {
    statsResetBtn.hidden = false;
    statsResetConfirm.hidden = true;
}

function handleStatsResetClick() {
    statsResetBtn.hidden = true;
    statsResetConfirm.hidden = false;
    statsResetConfirmBtn.focus();
}

function handleStatsResetCancel() {
    resetStatsConfirmUI();
    statsResetBtn.focus();
}

function handleStatsResetConfirm() {
    StatsManager.reset();
    resetStatsConfirmUI();
    renderStatsPanel();
    statsResetBtn.focus();
}

let statsLastFocusedElement = null;
```

- [ ] **Step 2: Reset the confirm UI whenever the panel closes, and wire the buttons**

Find (added in Task 4):

```js
function closeStatsPanel() {
    statsOverlay.classList.remove("is-open");
    statsPanel.classList.remove("is-open");
    statsToggleBtn.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", handleStatsKeydown);
    if (statsLastFocusedElement) statsLastFocusedElement.focus();
}

statsPanel.addEventListener("transitionend", handleStatsPanelTransitionEnd);
statsToggleBtn.addEventListener("click", openStatsPanel);
statsCloseBtn.addEventListener("click", closeStatsPanel);
statsOverlay.addEventListener("click", closeStatsPanel);
```

Replace with:

```js
function closeStatsPanel() {
    statsOverlay.classList.remove("is-open");
    statsPanel.classList.remove("is-open");
    statsToggleBtn.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", handleStatsKeydown);
    resetStatsConfirmUI();
    if (statsLastFocusedElement) statsLastFocusedElement.focus();
}

statsPanel.addEventListener("transitionend", handleStatsPanelTransitionEnd);
statsToggleBtn.addEventListener("click", openStatsPanel);
statsCloseBtn.addEventListener("click", closeStatsPanel);
statsOverlay.addEventListener("click", closeStatsPanel);
statsResetBtn.addEventListener("click", handleStatsResetClick);
statsResetCancelBtn.addEventListener("click", handleStatsResetCancel);
statsResetConfirmBtn.addEventListener("click", handleStatsResetConfirm);
```

- [ ] **Step 3: Verify — reset clears stats and leaves highScore untouched**

Start the server, open the page, open the console. Seed some data and a
high score:

```js
StatsManager.reset();
StatsManager.recordGameStart();
StatsManager.recordLevelReached(3);
StatsManager.recordCorrectPress();
StatsManager.recordGameOver({ finalScore: 3, isNewHighScore: true });
localStorage.setItem("highScore", "3");
```

Open the panel (click 📊). Click "Reset Statistics": confirm the button
disappears and is replaced in place by the warning text ("Are you sure you
want to reset all statistics? This action cannot be undone.") plus "Yes,
Reset" and "Cancel" buttons — confirm nothing was actually cleared yet
(`StatsManager.getStats().gamesPlayed` is still `1`).

Click "Cancel": confirm the warning disappears and the "Reset Statistics"
button reappears, and `StatsManager.getStats().gamesPlayed` is still `1`.

Click "Reset Statistics" again, then "Yes, Reset". Confirm the panel
immediately re-renders to its empty state (Games Played: `0`, Average
Score: `—`, etc.) and run:

```js
JSON.stringify(StatsManager.getStats());
```

Expected: every field back to its default (`gamesPlayed: 0`,
`recentScores: []`, `fastestLevelMs: null`, etc). Then run:

```js
localStorage.getItem("highScore");
```

Expected: `"3"` — unchanged by the reset.

Finally, open "Reset Statistics" confirm state once more, then close the
whole panel (press Escape) without clicking Yes or Cancel. Reopen the
panel and confirm it shows the plain "Reset Statistics" button again, not
stuck on the warning text.

Stop the server.

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat(stats): add Reset Statistics confirm flow

In-panel confirm (no native confirm() dialog) clears only the simonStats
key; highScore is never touched. Confirm state is also cleared if the
panel is closed mid-confirm.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- None (documentation only).

- [ ] **Step 1: Add a Statistics Dashboard section**

In `README.md`, find:

```markdown
## Game rules
```

Find the section that follows it (`## Screenshots`) and insert a new
section between the end of "Game rules" and the start of "Screenshots":

```markdown
## Statistics Dashboard

Click the 📊 icon next to the scoreboard to open a slide-out panel
tracking your performance across every session, not just the current one:

- **Games Played**, **Highest Level Reached**, **Average Score**
- **Correct/Incorrect Presses**, **Longest/Current Streak** — streak
  counts consecutive correct pad presses across your whole history, reset
  only by an actual wrong press (not by starting a new game)
- **Total Time Played**, **Fastest Level Completion Time**
- **Sequences Completed**, **Last Game Score**, **Last Played**, **High
  Scores Achieved**
- A mini bar chart of your last 10 game scores

All of it lives under its own `simonStats` key in `localStorage`,
completely separate from `highScore`. **Reset Statistics** (inside the
panel, behind a confirmation step) clears only that key — your high score
is never touched.
```

- [ ] **Step 2: Verify**

```bash
grep -c "Statistics Dashboard" README.md
```

Expected: `1` or more (confirms the section heading was added).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document the Statistics Dashboard

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Final regression pass

**Files:** None (verification-only task).

**Interfaces:** None.

- [ ] **Step 1: Full smoke test**

Start the server, open the page, open the console (watching for any error
messages throughout).

Run through the original RC1 behaviors, unmodified: Start Game →
countdown → play and win several rounds correctly → deliberately lose →
confirm the Game Over message, High Score behavior, and Restart button all
work exactly as before. Confirm keyboard play (Tab to a pad, Space/Enter
to answer) still works.

Then run through the new feature end to end: open the 📊 panel mid-idle,
confirm it reflects the game you just played; close it; start and
complete another game; reopen the panel and confirm the numbers updated;
use Reset Statistics and confirm it clears correctly; confirm `highScore`
in `localStorage` was never altered by any stats action across this whole
pass.

- [ ] **Step 2: Check for console errors**

With the console open throughout Step 1, confirm zero errors or warnings
originating from `app.js`, `stats.js`, or `audio.js` (unrelated browser
extension warnings, if any, don't count).

- [ ] **Step 3: Final commit**

If Steps 1–2 pass with no code changes needed, there's nothing new to
commit — this task is verification-only. If any fix was needed to pass
verification, commit it with a message describing exactly what regression
it fixes, then re-run Step 1 in full before considering this task done.
