# MVP verification

Initial checks: October 4–5, 2026.

## Automated core checks

`npm test`: 10 tests passed.

- Full canonical order, uniqueness, and all original card renderings.
- Five unique choices including the answer; ascending numeric order.
- First-error persistence, hint/reveal grading, and directional isolation.
- Slow-correct retention credit and fluency priority.
- Interrupted timing and recent-exposure interval handling.
- Weighted selection and recent-prompt exclusion.
- Idempotent writes, backup round-trip, and damaged-backup rejection.

`npm run build`: strict TypeScript checks and Vite production build passed. npm dependency audit reported no vulnerabilities during initial installation.

## Browser checks

Isolated agent-browser session, Chromium, 390×844 phone viewport.

`tests/browser-smoke.js` passed these flows:

- Wrong answer saved immediately, then corrected without changing first-answer failure.
- Neighbor hints and reveal stored in attempt history.
- Pause disables answer controls and excludes interrupted timing.
- Session summary, 52-row card report, and raw session history render.
- Number→card answers sort by rank/suit and save their own direction.
- 52-card gallery and slider navigation reach the final card.
- Five separate touch targets exceed 44×44 pixels.

History persisted across reload. Compact phone (320×667) and desktop (1440×1000) checks showed no horizontal page overflow. Home, practice, and progress screenshots were visually inspected. No runtime browser errors were reported.

## Production and offline checks

Production manifest identifies Deckwise with standalone display and 192/512-pixel installation icons. Service worker installed and controlled the local production build. With Chromium network emulation set offline, the app reloaded from its cache and started a flashcard session with all five answer choices.

GitHub Actions ran the core tests and production build successfully. Vercel reported the initial production deployment READY. The public URL opened in a fresh browser session without authentication, displaying Deckwise and its practice controls.

## Limits

Desktop browser emulation does not establish behavior on every physical iPhone/Android device. Home-screen installation should be tried on Mark's actual phone. The heuristic scheduler's educational effectiveness has not been studied; delayed recall comparisons are a later evaluation task.
