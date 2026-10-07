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

Complete backup downloading and restoration passed in a separate Chromium context with downloads explicitly enabled: exported five generated attempts, reset the test history, imported the file, and verified exact data equality. The native CLI's download action was unreliable in this Windows session; the independent browser check confirmed the app's download and restore paths.

## Production and offline checks

Production manifest identifies Deckwise with standalone display and 192/512-pixel installation icons. Service worker installed and controlled the local production build. With Chromium network emulation set offline, the app reloaded from its cache and started a flashcard session with all five answer choices.

GitHub Actions ran the core tests and production build successfully. Vercel reported the initial production deployment READY. The public URL opened in a fresh browser session without authentication, displaying Deckwise and its practice controls.

## Limits

Desktop browser emulation does not establish behavior on every physical iPhone/Android device. Home-screen installation should be tried on Mark's actual phone. The heuristic scheduler's educational effectiveness has not been studied; delayed recall comparisons are a later evaluation task.

## Dark redesign verification

All 10 unit tests pass, including all 52 local image files. Chromium at 390x844 and 320x667 passed wrong/correct retries, hint/reveal recording, both directions, reporting and gallery navigation. Verified the paused timer remains unchanged for 1.4 seconds and ending an unanswered session leaves attempt history and memory unchanged. All 52 gallery images loaded. Pause and End session remain visible on the compact phone. No JavaScript errors occurred. Card faces, gallery, dark practice screen and compact controls were visually inspected.
Production preview reloaded successfully under Chromium offline network emulation, with all 52 card images available from the service-worker cache.

Navy/minimalist update: all 10 unit tests and the complete browser smoke test passed. Deck and Practice labels were removed while accessible card names remain. The Ace of Spades has no promotional text or QR overlay. Inspected mobile screenshots and fixed delayed gallery scroll events after navigation. No runtime errors occurred in the final check.

Deckwise install icon: cobalt spade mark in a 5:7 playing-card silhouette, matching the header logo. SVG, 192 px, 512 px, maskable 512 px, and Apple 180 px assets.

## Practice and UI polish (October 5, 2026)

All 12 core tests pass, including session deletion compared with a clean history replay and protection of active sessions. Updated browser smoke tests pass in an isolated Chromium context. Focused checks verified fixed answer coordinates before feedback, after reveal, after correct answers, and after automatic advancement; a paused transition remains frozen; revealed answers require manual continuation. Session deletion cancel, confirm, attempt removal, and persistence after reload passed. Mobile 390x844 and compact 320x667 layouts, gallery, settings, progress, and the portrait icon were inspected; no runtime errors or horizontal overflow occurred. Correct answers advance after 1.1 seconds of active foreground time. Empty completed sessions can also be deleted.

## Sequence quiz and installation cache update

All 13 core tests pass. All 52 forward/backward adjacencies, including both end wraps, are tested. Sequence histories round-trip through backups and can be deleted without affecting position-practice memory. The existing browser smoke suite and focused sequence checks passed at 390x844 and 320x667: forward/backward/beginning/random starts, five unique choices, wrong then correct, paused automatic advancement, manual reveal continuation, stable answer coordinates, early finish, separate reports, deletion, and reload persistence. Deck arrows are equidistant around the centered counter. Setup, active quiz, and gallery screenshots were inspected; no browser runtime errors occurred. Fresh manifest, favicon, Apple, any, and maskable icon filenames prevent reuse of previous install assets while retaining the same app id and local storage.

## Timed full-deck runs and immediate advancement

All 14 core tests pass, including raw versus penalty-adjusted scoring, first-answer accuracy, complete versus partial runs, and new backup fields. Browser checks completed full forward and random-start backward runs, each with 52 unique answer targets and automatic stopping. Correct answers advanced synchronously in both quiz types. Verified pause freezes the stopwatch and excludes paused time; two wrong selections plus one reveal produce a 15-second penalty and 50/52 first-answer accuracy. Reveals still wait for Next. Separate forward/backward records, completion trends, partial-run exclusion, direction filters, deletion updates, reload persistence, and compact 320px reports passed without browser errors. Visually inspected full-deck results and speed/accuracy reporting. Previous countdown sequence sessions remain legacy history and do not qualify as full-deck records.

## Blank starting card and sequence-first navigation

All 14 core tests pass. The browser smoke test now covers choosing positions 1 through 52 from an empty prompt and stopping automatically on the Nine of Diamonds. Focused checks passed backward 52 through 1, random backward starts with 52 unique targets, immediate advancement, opening/reload defaults, Deck-before-Practice navigation, Sequence-before-Browse controls, sequence-first Progress filters, and retained browse/position practice functionality. No browser errors occurred. Visually inspected the blank initial prompt with five choices and the first-card instruction.

## Session minutes and recoverable deletion (October 6, 2026)

All 16 core tests pass. Restoring multiple sessions in reverse order rebuilds the original chronological evidence and review schedule exactly. Recovery survives JSON backup validation; malformed archives, duplicate session/attempt IDs, and orphaned deleted answers are rejected. Old backups without deleted history remain supported. Browser smoke tests and focused checks passed minute labels in position history/details, exclusion after deletion, restored sequence trend/personal best, restored position attempts and review memory, persistence after reload, and compact 320px recovery controls. Inspected Recently deleted UI; no browser errors occurred. Deleted history is included in backups and cleared by reset/browser data removal. Previously permanent deletions cannot be recovered without an earlier backup.

## Per-session position accuracy and speed overlay

All 17 core tests pass, including same-day session separation, direction-filtered evidence, latest-session limits, interrupted timing exclusion, and missing eligible metrics. Existing browser smoke tests and focused chart checks passed two overlaid SVG series with percent/seconds axes, exact-value rows, null-metric gaps, direction and period filters, deletion/restore updates, centered single-session points, and compact 320px layouts. The latest 20 sessions with answers appear chronologically within the selected reporting period. Empty sessions remain in history but do not generate chart points. Visually inspected the overlay and per-session timestamp/minutes table; no runtime errors occurred.

## Direction statistics and practice focus

All 19 core tests pass. Comparison tests cover sample/session/shared-card minimums, accuracy priority, speed thresholds, interrupted timing, accuracy-speed tradeoffs, recent exposure exclusion, and the 100-answer window. Browser smoke tests and focused checks verified Combined versus Card-to-number/Number-to-card statistics from mixed sessions (60%/2.0s versus 90%/4.0s), direction-filtered chart/history/detail evidence, the solid time series and exact label, recommendation updates after delete/restore, period filters, Practice shortcuts, and compact 320px layout. Inspected comparison cards and focus cue. No runtime errors occurred. Recommendations are heuristic practice guidance, with matched cards and minimum evidence, rather than statistical significance claims.

## Shared practice windows and cohesive selectors

All 21 core tests pass, including mode-specific evidence, rolling 7/30-day windows, all-time evidence, saved period validation, and compatibility with old settings. Browser smoke tests and focused checks verified all three Practice stats update by direction and period, the default 7-day window, persistence after reload, shared windows across sequence/position Progress, equal toggle widths, and compact 320px layouts. Practice and Progress share the same direction order, segmented controls, reporting-period controls, and restrained navy panels. Due counts reflect the current review schedule in the selected direction, independently of the historical reporting window.
