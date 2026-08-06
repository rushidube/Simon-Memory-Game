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
