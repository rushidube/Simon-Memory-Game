/* Simon Game — sequence generation, input checking, and scoring. */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PAD_COLORS = ["yellow", "green", "red", "purple"];

// Matches AudioManager's BUTTON_TONE_DURATION so a pad's light and its note
// begin and end together.
const FLASH_DURATION_MS = 280;
const NEXT_LEVEL_DELAY_MS = 1000;
const LEVEL_INTRO_DELAY_MS = 700;
const GAME_OVER_FLASH_DURATION_MS = 600;

// Staggers the game-over and high-score sounds after the wrong-answer
// sound so a loss reads as a small sequence (failure → close → celebrate)
// instead of three sounds firing on top of each other.
const GAME_OVER_SOUND_DELAY_MS = 250;
const HIGH_SCORE_SOUND_DELAY_MS = 750;

// Guards against a rapid double-click firing the restart chime/reset twice.
const RESTART_COOLDOWN_MS = 300;

const COUNTDOWN_STEPS = ["3", "2", "1", "Go!"];
const COUNTDOWN_STEP_MS = 700;
const COUNTDOWN_SOUND_KEYS = {
    "3": "countdownTick3",
    "2": "countdownTick2",
    "1": "countdownTick1",
    "Go!": "countdownGo",
};

// Sequence playback speeds up slightly as the player progresses, but never
// past MIN_STEP_INTERVAL_MS — fast enough to feel lively, never unfair.
const BASE_STEP_INTERVAL_MS = 600;
const MIN_STEP_INTERVAL_MS = 350;
const SPEED_UP_EVERY_N_LEVELS = 3;
const SPEED_UP_DECREMENT_MS = 30;

const IDLE_MESSAGE = "Ready to test your memory?";
const WATCH_MESSAGE = `<span class="status-title">👀 Simon's Turn</span><span class="status-subtitle">Watch carefully...</span>`;
const YOUR_TURN_MESSAGE = `<span class="status-title">🎮 Your Turn</span><span class="status-subtitle">Repeat the sequence</span>`;
const LEVEL_COMPLETE_MESSAGES = ["✔ Great job!", "✔ Level Complete!", "✔ Keep Going!"];

// ---------------------------------------------------------------------------
// DOM references
// Cached once so gameplay code never has to re-query the DOM.
// ---------------------------------------------------------------------------

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

// Maps a color name ("red") to its pad element, so the game loop can look
// up "which element is red" instead of running a selector query every turn.
const padsByColor = {};
padElements.forEach((pad) => {
    padsByColor[pad.id] = pad;
});

// ---------------------------------------------------------------------------
// Utilities
// Generic helpers with no knowledge of Simon's rules.
// ---------------------------------------------------------------------------

function getRandomItem(list) {
    const randomIndex = Math.floor(Math.random() * list.length);
    return list[randomIndex];
}

function retriggerAnimation(element, className) {
    element.classList.remove(className);
    void element.offsetWidth; // force reflow so the animation can replay
    element.classList.add(className);
}

// localStorage can throw (Safari private browsing, quota, disabled storage)
// rather than just fail quietly — a high score that can't persist shouldn't
// take the rest of the game down with it.
function readStoredHighScore() {
    try {
        return Number(localStorage.getItem("highScore")) || 0;
    } catch {
        return 0;
    }
}

function persistHighScore(score) {
    try {
        localStorage.setItem("highScore", score);
    } catch {
        // Storage unavailable — the session still tracks the score in memory.
    }
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

let gameSequence = [];
let userSequence = [];
let isGameActive = false; // a session is running (countdown through game over)
let isPlayerTurn = false; // the player, specifically, may click pads right now
let currentLevel = 0;
let highScore = readStoredHighScore();

// Timestamp for the moment the player's turn began on the current level —
// consumed by StatsManager.recordLevelComplete to time that level.
let levelStartTime = null;

// Bumped every time the game resets. Anything scheduled with setTimeout
// checks this before acting, so a mid-sequence Restart can't leak stray
// flashes or auto-advances from the game it just cancelled.
let gameSessionId = 0;

// Initial render. Builds the same markup updateLevelDisplay/
// updateHighScoreDisplay produce (see scoreCardHTML below) but sets it
// directly rather than calling them, so first paint doesn't also fire
// their badge-update pop — the scoreboard's own entrance animation
// already covers that.
levelDisplay.innerHTML = scoreCardHTML("🎚", "Level", 0);
highScoreDisplay.innerHTML = scoreCardHTML("🏆", "High Score", highScore);
statusMessage.innerText = IDLE_MESSAGE;

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

// `countdown` swaps in the bigger/bolder countdown-pop treatment (see
// style.css) instead of the standard fade — used only by runCountdown.
function setStatusMessage(html, { countdown = false } = {}) {
    statusMessage.innerHTML = html;
    statusMessage.classList.toggle("status-countdown", countdown);
    // The two animation classes share this element; drop whichever one
    // this call *isn't* using so a lingering class from the previous call
    // can't outrank the one meant to play now (same trap as the
    // badge-update/celebrate pair below).
    statusMessage.classList.remove(countdown ? "badge-update" : "countdown-pop");
    retriggerAnimation(statusMessage, countdown ? "countdown-pop" : "badge-update");
}

// Shared by the scoreboard update functions below and the initial render
// at the bottom of this section, so there's one source of truth for the
// card's markup instead of the string duplicated in two places.
function scoreCardHTML(icon, label, value) {
    return `<span class="score-icon" aria-hidden="true">${icon}</span><span class="score-label">${label}</span><span class="score-value">${value}</span>`;
}

function updateLevelDisplay(level) {
    levelDisplay.innerHTML = scoreCardHTML("🎚", "Level", level);
    retriggerAnimation(levelDisplay, "badge-update");
}

function updateHighScoreDisplay(score, celebrate = false) {
    highScoreDisplay.innerHTML = scoreCardHTML("🏆", "High Score", score);
    // The two update animations share a class list; drop whichever one
    // this call *isn't* using so a lingering "celebrate" from an earlier
    // high score can't outrank a later plain update (same CSS specificity,
    // decided by source order otherwise).
    highScoreDisplay.classList.remove(celebrate ? "badge-update" : "celebrate");
    retriggerAnimation(highScoreDisplay, celebrate ? "celebrate" : "badge-update");
}

function lockPads(shouldLock) {
    padContainer.classList.toggle("pads-locked", shouldLock);
    padElements.forEach((pad) => {
        pad.disabled = shouldLock;
    });
}

function getLevelCompleteMessage(level) {
    return LEVEL_COMPLETE_MESSAGES[level % LEVEL_COMPLETE_MESSAGES.length];
}

function buildGameOverMessage(finalScore, isNewHighScore) {
    const celebration = isNewHighScore
        ? `<span class="status-highlight">🏆 New High Score!</span><br>`
        : "";
    return `Game Over! Your score was <b>${finalScore}</b>.<br>
                    ${celebration}Highest Score : <b>${highScore}</b><br>
                    Press Start to play again`;
}

function flashGamePad(pad) {
    pad.classList.add("flash");
    AudioManager.play(pad.id);
    setTimeout(() => pad.classList.remove("flash"), FLASH_DURATION_MS);
}

function flashUserPad(pad) {
    pad.classList.add("userFlash");
    setTimeout(() => pad.classList.remove("userFlash"), FLASH_DURATION_MS);
}

// ---------------------------------------------------------------------------
// Game logic
// ---------------------------------------------------------------------------

function isStaleSession(sessionId) {
    return sessionId !== gameSessionId;
}

// How long the computer waits between each flash. Gets a little faster
// every few levels, but never below the floor.
function getStepInterval(level) {
    const speedUps = Math.floor((level - 1) / SPEED_UP_EVERY_N_LEVELS);
    const interval = BASE_STEP_INTERVAL_MS - speedUps * SPEED_UP_DECREMENT_MS;
    return Math.max(interval, MIN_STEP_INTERVAL_MS);
}

function runCountdown(onComplete) {
    const sessionId = gameSessionId;
    let step = 0;

    function showNextStep() {
        if (isStaleSession(sessionId)) return;

        const label = COUNTDOWN_STEPS[step];
        AudioManager.play(COUNTDOWN_SOUND_KEYS[label]);
        setStatusMessage(label, { countdown: true });
        step += 1;

        if (step < COUNTDOWN_STEPS.length) {
            setTimeout(showNextStep, COUNTDOWN_STEP_MS);
            return;
        }

        setTimeout(() => {
            if (!isStaleSession(sessionId)) onComplete();
        }, COUNTDOWN_STEP_MS);
    }

    showNextStep();
}

// Replays the full sequence so far, one pad at a time, then hands control
// back to the player.
function playSequence() {
    const sessionId = gameSessionId;
    isPlayerTurn = false;
    lockPads(true);
    setStatusMessage(WATCH_MESSAGE);

    const stepInterval = getStepInterval(currentLevel);

    gameSequence.forEach((color, i) => {
        setTimeout(() => {
            if (isStaleSession(sessionId)) return;
            flashGamePad(padsByColor[color]);
        }, i * stepInterval);
    });

    const totalDuration = gameSequence.length * stepInterval;
    setTimeout(() => {
        if (isStaleSession(sessionId)) return;
        isPlayerTurn = true;
        levelStartTime = Date.now();
        lockPads(false);
        setStatusMessage(YOUR_TURN_MESSAGE);
    }, totalDuration);
}

function startNextLevel() {
    userSequence = [];
    currentLevel += 1;
    StatsManager.recordLevelReached(currentLevel);
    updateLevelDisplay(currentLevel);
    setStatusMessage(`Level ${currentLevel}`);

    const randomColor = getRandomItem(PAD_COLORS);
    gameSequence.push(randomColor);

    const sessionId = gameSessionId;
    setTimeout(() => {
        if (isStaleSession(sessionId)) return;
        playSequence();
    }, LEVEL_INTRO_DELAY_MS);
}

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

function handleGameOver() {
    const finalScore = currentLevel - 1;
    const isNewHighScore = finalScore > highScore;
    StatsManager.recordGameOver({ finalScore, isNewHighScore });

    // Ends the session now, then remembers the id resetGame() just set.
    // The two cues below are scheduled *after* this and would otherwise
    // keep firing on top of a game the player already restarted — this
    // lets each one check "is the game-over screen I was scheduled for
    // still the current one?" before playing.
    resetGame();
    const endedSessionId = gameSessionId;

    setTimeout(() => {
        if (gameSessionId !== endedSessionId) return;
        AudioManager.play("gameOver");
    }, GAME_OVER_SOUND_DELAY_MS);

    if (isNewHighScore) {
        highScore = finalScore;
        persistHighScore(highScore);
        updateHighScoreDisplay(highScore, true);
        setTimeout(() => {
            if (gameSessionId !== endedSessionId) return;
            AudioManager.play("highScore");
        }, HIGH_SCORE_SOUND_DELAY_MS);
    }

    setStatusMessage(buildGameOverMessage(finalScore, isNewHighScore));

    document.body.classList.add("game-over-flash");
    setTimeout(() => {
        document.body.classList.remove("game-over-flash");
    }, GAME_OVER_FLASH_DURATION_MS);
}

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

// Cuts a currently-sounding tone and any mid-flash pad immediately —
// used only when something *external* interrupts a running game (a
// manual Restart, the tab losing focus), never on the natural win/lose
// path, where the last flash/tone is exactly the feedback the player
// needs to see and hear play out.
function stopAllPadEffects() {
    AudioManager.stopTone();
    padElements.forEach((pad) => pad.classList.remove("flash", "userFlash"));
}

// Shared by Restart and the tab-blur recovery below — both drop the game
// back to its pre-Start state. Cutting any in-flight tone/flash
// (stopAllPadEffects) is left to the caller, since Restart needs that to
// happen *before* its own chime plays, not bundled into this reset.
function returnToIdle() {
    resetGame();
    updateLevelDisplay(0);
    setStatusMessage(IDLE_MESSAGE);
}

function handlePadClick() {
    if (!isPlayerTurn) return;

    const pad = this;
    flashUserPad(pad);
    AudioManager.play(pad.id, { velocity: 0.9 });

    userSequence.push(pad.id);
    checkAnswer(userSequence.length - 1);
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

startButton.addEventListener("click", () => {
    if (isGameActive) return;

    isGameActive = true;
    StatsManager.recordGameStart();
    startButton.disabled = true;
    lockPads(true);
    AudioManager.play("start");

    runCountdown(startNextLevel);
});

restartButton.addEventListener("click", () => {
    if (restartButton.disabled) return;

    restartButton.disabled = true;
    setTimeout(() => {
        restartButton.disabled = false;
    }, RESTART_COOLDOWN_MS);

    stopAllPadEffects();
    AudioManager.play("restart");
    returnToIdle();
});

padElements.forEach((pad) => {
    pad.addEventListener("click", handlePadClick);
});

// A backgrounded tab throttles setTimeout to roughly once a second, so a
// sequence interrupted by a tab switch would otherwise queue up and dump
// a burst of stale flashes/sounds when the player tabs back in. Ending
// the run the moment it's hidden keeps that recovery honest instead of
// pretending a paused mid-sequence memory test is still fair.
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

    // Fallback: ensure hidden attributes are set if transitionend doesn't fire
    // (e.g., due to very short or missing CSS transitions)
    setTimeout(() => {
        if (!statsPanel.classList.contains("is-open")) {
            statsOverlay.hidden = true;
            statsPanel.hidden = true;
        }
    }, 250);
}

statsPanel.addEventListener("transitionend", handleStatsPanelTransitionEnd);
statsToggleBtn.addEventListener("click", openStatsPanel);
statsCloseBtn.addEventListener("click", closeStatsPanel);
statsOverlay.addEventListener("click", closeStatsPanel);
