/* Simon Game — audio engine.

   Fully synthesized with the Web Audio API — no MP3s, no fetch/decode
   step, zero playback latency. Every sound in the game is built from three
   small primitives:

     playTone(frequency, duration, options)  — one oscillator, one envelope
     playSequence(notes, options)             — several playTone calls, back-to-back
     stopTone()                               — silences whatever's sounding right now

   The four pad notes reproduce the original 1978 Milton Bradley Simon,
   which plays an A-major arpeggio across its four buttons — A3, C#4, E4,
   A4, low to high. That's what makes the game recognizable by ear alone,
   so it's reused verbatim here rather than picking "nice sounding"
   frequencies from scratch. Every other cue (start, success, failure,
   game over) is built from the same tone set so the whole game shares one
   consistent musical voice. */

const AudioManager = (() => {
    const MASTER_VOLUME = 0.85;

    // Clean triangle wave: warmer and slightly less clinical than a pure
    // sine, without square's harsh buzz. Closest match to the tone of the
    // original hardware's small speaker while staying "polished."
    const WAVE = "triangle";

    // The four pad notes — Simon's A-major arpeggio, low to high.
    const NOTES = {
        green: 220.0, // A3  — low
        red: 277.18, // C#4 — medium-low
        yellow: 329.63, // E4  — medium-high
        purple: 440.0, // A4  — high
    };

    const BUTTON_TONE_DURATION = 0.28; // seconds a pad's own note sounds for — see FLASH_DURATION_MS in app.js, kept in sync

    // ---------------------------------------------------------------------
    // Core engine
    // ---------------------------------------------------------------------

    let ctx = null;
    let masterGain = null;
    let activeVoice = null; // the most recently started { osc, gain } pair, for stopTone()

    // Returns null if Web Audio isn't available at all (some privacy-hardened
    // browsers disable it for fingerprinting resistance) so a missing API
    // silences the game's audio instead of throwing and breaking gameplay.
    function getContext() {
        if (!ctx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return null;

            ctx = new AudioContextClass();
            masterGain = ctx.createGain();
            masterGain.gain.value = MASTER_VOLUME;
            masterGain.connect(ctx.destination);
        }
        if (ctx.state === "suspended") ctx.resume();
        return ctx;
    }

    /**
     * Plays a single tone.
     *
     * @param {number} frequency - Hz
     * @param {number} duration  - seconds
     * @param {object} [options]
     * @param {"sine"|"triangle"|"square"|"sawtooth"} [options.wave]
     * @param {number} [options.gain]      - 0–1 peak volume
     * @param {number} [options.startTime] - absolute AudioContext time to start at (defaults to "now")
     * @returns {{osc: OscillatorNode, gain: GainNode}|null} the voice, so callers can chain or cut it early
     */
    function playTone(frequency, duration, { wave = WAVE, gain: gainValue = 0.35, startTime } = {}) {
        const audioCtx = getContext();
        if (!audioCtx) return null;

        const start = startTime ?? audioCtx.currentTime;
        const attack = 0.008; // fast attack so the note reads as an instant electronic "on"
        const release = Math.min(0.04, duration * 0.3); // quick release, never longer than the note itself

        const osc = audioCtx.createOscillator();
        osc.type = wave;
        osc.frequency.value = frequency;

        // Flat sustain between attack and release — a held electronic tone,
        // not a plucked/decaying instrument note.
        const envelope = audioCtx.createGain();
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(gainValue, start + attack);
        envelope.gain.setValueAtTime(gainValue, Math.max(start + attack, start + duration - release));
        envelope.gain.linearRampToValueAtTime(0, start + duration);

        osc.connect(envelope).connect(masterGain);
        osc.start(start);
        osc.stop(start + duration + 0.02);

        const voice = { osc, gain: envelope };
        activeVoice = voice;

        // Proper cleanup: once the oscillator finishes, drop the node
        // references so nothing lingers for the GC to chase down.
        osc.addEventListener("ended", () => {
            osc.disconnect();
            envelope.disconnect();
            if (activeVoice === voice) activeVoice = null;
        });

        return voice;
    }

    /**
     * Plays an array of notes back-to-back, scheduled up front (not via
     * setTimeout) so timing stays sample-accurate even under a busy main
     * thread — no drift, no overlap.
     *
     * @param {Array<{frequency: number, duration: number, gap?: number}>} notes
     *   `gap` (seconds, default 0.02) is silence inserted after that note.
     * @param {object} [options] - same shape as playTone's options, applied to every note
     */
    function playSequence(notes, { wave = WAVE, gain: gainValue = 0.35 } = {}) {
        const audioCtx = getContext();
        if (!audioCtx) return;

        let cursor = audioCtx.currentTime;
        notes.forEach(({ frequency, duration, gap = 0.02 }) => {
            playTone(frequency, duration, { wave, gain: gainValue, startTime: cursor });
            cursor += duration + gap;
        });
    }

    /** Immediately silences whatever tone is currently sounding (short fade to avoid a click). */
    function stopTone() {
        if (!activeVoice || !ctx) return;

        const { osc, gain } = activeVoice;
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.02);
        osc.stop(now + 0.03);
        activeVoice = null;
    }

    // ---------------------------------------------------------------------
    // Game sounds — each one built from playTone/playSequence above
    // ---------------------------------------------------------------------

    // A pad's own note — used both when Simon plays it and when the player
    // presses it, so the same color always sounds identical either way.
    function playPad(color, velocity = 1) {
        const frequency = NOTES[color];
        if (!frequency) return;
        playTone(frequency, BUTTON_TONE_DURATION, { gain: 0.42 * velocity });
    }

    // Startup sequence: Simon's own power-on self-test fires all four pads
    // in a quick low-to-high run. Under a second total.
    function playStart() {
        playSequence(
            ["green", "red", "yellow", "purple"].map((color) => ({
                frequency: NOTES[color],
                duration: 0.1,
                gap: 0.025,
            })),
            { gain: 0.32 }
        );
    }

    // Countdown ticks: three soft, rising taps, brighter "Go!" release —
    // kept out of the pad note set so they read as "get ready," not as an
    // extra colored button.
    function playCountdownTick(step) {
        const ticks = [493.88, 554.37, 659.25]; // B4, C#5, E5 — rising
        playTone(ticks[step], 0.08, { wave: "sine", gain: 0.22 });
    }

    function playCountdownGo() {
        playTone(880.0, 0.16, { wave: "triangle", gain: 0.34 });
    }

    // Level complete: a short C → E → G ascent — under a second, simple
    // and immediately satisfying.
    function playLevelComplete() {
        playSequence(
            [
                { frequency: 261.63, duration: 0.11, gap: 0.02 }, // C4
                { frequency: 329.63, duration: 0.11, gap: 0.02 }, // E4
                { frequency: 392.0, duration: 0.18, gap: 0 }, // G4
            ],
            { gain: 0.36 }
        );
    }

    // High score: the same ascent, extended one note further and slightly
    // brighter, so it reads as "level complete, plus."
    function playHighScore() {
        playSequence(
            [
                { frequency: 261.63, duration: 0.1, gap: 0.015 }, // C4
                { frequency: 329.63, duration: 0.1, gap: 0.015 }, // E4
                { frequency: 392.0, duration: 0.1, gap: 0.015 }, // G4
                { frequency: 523.25, duration: 0.24, gap: 0 }, // C5
            ],
            { gain: 0.4 }
        );
    }

    // Wrong answer: a short descending two-note buzz — the classic Simon
    // "that's not it" cue. Low and brief, not harsh.
    function playWrong() {
        playSequence(
            [
                { frequency: 196.0, duration: 0.14, gap: 0.02 }, // G3
                { frequency: 146.83, duration: 0.22, gap: 0 }, // D3
            ],
            { gain: 0.34 }
        );
    }

    // Game over: a longer descending run through the pad register itself
    // (A4 → E4 → C#4 → A3, i.e. the start fanfare played in reverse and
    // slowed down) — faithful and conclusive without being cinematic.
    function playGameOver() {
        playSequence(
            [
                { frequency: 440.0, duration: 0.18, gap: 0.03 }, // A4
                { frequency: 329.63, duration: 0.18, gap: 0.03 }, // E4
                { frequency: 277.18, duration: 0.18, gap: 0.03 }, // C#4
                { frequency: 220.0, duration: 0.34, gap: 0 }, // A3
            ],
            { gain: 0.38 }
        );
    }

    // Restart: a single soft, neutral blip — quiet enough not to compete
    // with the cues above, no strong emotional read either way.
    function playRestart() {
        playTone(329.63, 0.12, { wave: "sine", gain: 0.2 });
    }

    // ---------------------------------------------------------------------
    // Public dispatch — keeps app.js decoupled from the tone recipes above
    // ---------------------------------------------------------------------

    const COUNTDOWN_HANDLERS = {
        countdownTick3: () => playCountdownTick(0),
        countdownTick2: () => playCountdownTick(1),
        countdownTick1: () => playCountdownTick(2),
        countdownGo: playCountdownGo,
    };

    const EVENT_HANDLERS = {
        start: playStart,
        levelComplete: playLevelComplete,
        highScore: playHighScore,
        wrong: playWrong,
        gameOver: playGameOver,
        restart: playRestart,
        ...COUNTDOWN_HANDLERS,
    };

    function play(key, { velocity = 1 } = {}) {
        if (!getContext()) return;

        if (NOTES[key]) {
            playPad(key, velocity);
            return;
        }

        const handler = EVENT_HANDLERS[key];
        if (handler) handler();
    }

    return { play, playTone, playSequence, stopTone };
})();
