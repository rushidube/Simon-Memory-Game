# Simon Game

A browser-based memory game inspired by the classic Simon toy, built with
plain HTML, CSS, and JavaScript — no frameworks, no build step, no
dependencies.

## Overview

Watch the color sequence the game plays back, then repeat it in the same
order. Every round the sequence grows by one color; one wrong pad ends the
run. It's the same rule the original 1978 electronic toy used, implemented
as a small, dependency-free web app with a procedural audio engine,
keyboard support, and a fluid responsive layout.

## Features

- **Classic Simon rules** — the computer replays the full color sequence
  each round, one pad at a time, and you repeat it back.
- **A short countdown** before each game (3 → 2 → 1 → Go!) so play never
  starts mid-blink.
- **Adaptive pacing** — the sequence plays back slightly faster every few
  levels, capped at a floor so it never becomes unfair.
- **A procedural audio engine** — every sound (button tones, countdown
  ticks, success/failure cues, a high-score fanfare) is synthesized live
  with the Web Audio API (oscillators + gain envelopes), so there's
  nothing to download and nothing that can fail to load. The four pad
  notes reproduce the original 1978 hardware's A-major arpeggio.
- **Fluid responsive layout** — sizing scales with `clamp()` across
  desktop, laptop, tablet, and mobile, plus a dedicated adjustment for
  short/landscape viewports.
- **Keyboard accessible** — every control is a real, focusable `<button>`;
  game status changes are announced via `aria-live`; focus is always
  visible.
- Respects `prefers-reduced-motion`.
- Persists your high score in `localStorage`, and degrades gracefully if
  storage is unavailable (e.g. Safari private browsing).

## Technologies used

- HTML5 (semantic markup, ARIA)
- CSS3 — custom properties, `clamp()`, Flexbox, keyframe animations
- Vanilla JavaScript (ES6+) — no framework, no build tooling
- Web Audio API — procedural sound synthesis

## Folder structure

```
index.html
css/
  style.css          Design tokens in :root, sectioned by component
js/
  app.js               Game state, sequence logic, UI updates, event wiring
  audio.js             Web Audio synthesis engine — every game sound, no audio files
assets/
  images/
    favicon.png
LICENSE
.gitignore
README.md
```

## How to run locally

Clone the repo and open `index.html` directly in a browser, or serve the
folder with any static file server:

```bash
git clone https://github.com/<your-username>/simon-game.git
cd simon-game
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Game rules

1. Press **Start Game**. After a short countdown, the game flashes one
   color.
2. Repeat the sequence by pressing the matching pads in order.
3. Each round the game replays the full sequence so far and adds one more
   color.
4. Pressing the wrong pad ends the game and shows your score.
5. Beat your previous best to set a new high score.

## Screenshots

*Add screenshots to `assets/images/` and reference them here before
publishing, e.g.:*

```
![Gameplay screenshot](assets/images/screenshot-gameplay.png)
![Game over screenshot](assets/images/screenshot-gameover.png)
```

## Browser compatibility

Tested in current versions of Chrome, Edge, Firefox, and Safari. The Web
Audio API has shipped in every evergreen browser for years; on the rare
browser configuration where it's unavailable or blocked, the game still
plays normally with no audio. `:focus-visible` degrades gracefully on
pre-2022 Safari versions to the browser's default focus outline.

## Accessibility support

- Semantic `<button>` elements for every interactive control — no
  clickable `<div>`s.
- Full keyboard support: Tab to navigate, Enter/Space to activate.
- Visible focus indicators on every control.
- Game status changes are announced via `aria-live="polite"` for screen
  reader users.
- Color contrast checked against WCAG AA for all text.
- Respects `prefers-reduced-motion`.

## Future improvements

- Optional sound mute/volume control
- Difficulty presets (slower/faster base pace)
- Local leaderboard of best scores, not just a single high score
- Alternate keyboard input (number keys mapped to pads)
- Automated tests for the sequence/scoring logic

## Credits

- Game concept based on the original Simon electronic game (Milton
  Bradley, 1978).
- Font: [Poppins](https://fonts.google.com/specimen/Poppins) via Google
  Fonts.
- Built by Rushikesh Dube.

## License

Released under the [MIT License](LICENSE).
