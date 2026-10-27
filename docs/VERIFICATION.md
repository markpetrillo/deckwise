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


## Direct recall — October 11, 2026

- All 53 tests pass; TypeScript checking, Vite production build, and service-worker generation pass.
- Input tests cover all 52 mappings in both directions, leading zeros, incomplete/invalid entries, rank/suit order, editing, and backup compatibility.
- Format-aware tests verify independent mastery, intervals, report filtering, assistance/timing exclusions, and delete/restore rebuilding.
- Interaction tests run the actual app code against an in-memory DOM: touch input, Check answer gating, first-miss correction, raw timing, keyboard entry, pause/hint/reveal, five-choice preservation, and Progress/Practice format selection.
- Local preview runs at http://127.0.0.1:5188. Browser automation could not start because its runtime failed; no screenshot or browser layout QA is claimed. Styles target two rank rows on ordinary phones and a third row on very narrow screens.


## Sequence Direct recall

- 66 tests pass, including actual app interaction tests for complete forward and random-start backward direct runs, wrapping, penalties, pause, reveal, partial runs, format preferences, records, and legacy history.
- Incremental input tests verify that rank/suit edits update only the answer panel while leaving the prompt and session controls intact.
- Sequence backup validation, format-specific timing, date/direction/format report filters, and recovery round-trips are covered.
- Typecheck, production bundle, service-worker generation, and diff checks pass.
- Browser visual inspection remains unavailable because the UI automation runtime cannot initialize; no screenshot or browser rendering check is claimed.


## Direct-recall layout and retry cleanup

- 69 tests pass; TypeScript checking, production bundling, service-worker generation, and diff checks pass.
- Rank tiles use an explicit two-row grid: seven ranks above six centered ranks. The six-column fallback that stranded the King is removed; the phone screenshots supplied by Mark were reviewed as the visual baseline.
- Real-app interaction tests verify that wrong digit and rank/suit submissions clear the input while keeping the rejected answer in the feedback, including during partial retry entry. Forward/backward sequence retries preserve the original first-response time, correction outcome, and five-second penalties.
- Browser rendering verification could not run because the approved UI automation runtime failed to initialize. No rendered layout check is claimed.


## Submit card answers on suit selection — October 12, 2026

- Card-answer Direct recall has no Check answer button: rank first, then suit immediately submits in number → card and both sequence directions. Numeric answers keep their existing confirmation.
- 73 tests pass, including complete 52-card runs, touch/letter-key suit submission, unselected-rank guards, duplicate-miss protection, immediate retry clearing, timing, pause, hints, reveals, and native Enter activation handling.
- TypeScript checking, production build, service-worker generation, and diff checks pass. All old history retains its original response times, including the former card confirmation step.
- Browser rendering verification remains unavailable because the approved UI automation runtime cannot initialize; in-memory interaction tests execute the real application handlers.

## Numbered sequence targets and two-card context — October 14, 2026

- 75 tests pass, including real-app handlers for both answer formats, full forward/backward runs, random-start wrapping, and context stability during misses, reveal, and pause. The current target never appears in context until advancing to the next question.
- TypeScript checking, Vite production build, service-worker generation, and diff checks pass.
- Rendered browser checks passed at 390×844 and 320×667: forward target 10 shows positions 8/9; backward target 50 shows positions 52/51; direct-recall number 36 fits its small prompt. No horizontal overflow; compact suit controls stay above navigation. Inspected both sequence layouts and number typography.
- Completed a full 52-answer Multiple choice run in the browser: 52/52, 100% first-answer accuracy, no penalties, and automatic completion. UI context follows only answers from the current run, with empty reserved slots at the start. Existing grading, timing, history, and scheduler are preserved.


## Compact Progress selectors and reload restoration — October 15, 2026

- 89 tests pass. TypeScript checking, production bundling, service-worker generation, and diff checks pass.
- Real-app interaction checks cover the four accessible selector groups, per-quiz filter retention, Progress navigation/reload/reopening, sorting, time window, scroll position, Browse position, sequence setup, Practice setup, and Settings.
- Reload recovery checks cover partial numeric/card input, misses and correction timing, reveal/Next behavior, both sequence directions through completion of all 52 unique cards, existing context, pause, exclusion of closed-page time, and prevention of duplicate history.
- Recovery validation rejects mismatched sessions, formats, sequence positions, malformed values, and stale first-miss data. UI storage failure leaves normal answer saving usable; new tabs do not resume another tab's quiz.
- Reviewed Mark's supplied phone screenshot. The browser automation helper timed out twice during initialization, so no rendered layout check is claimed for this change.

## Unified Practice, deck views, and focused drills — October 15, 2026

- All 99 tests pass, along with TypeScript checking, production bundling, service-worker generation, and diff checks.
- New focused-drill tests cover format/direction isolation, observed-only ranking, five mappings with three spaced turns each, first misses, hints, interruptions, early finish, reload recovery, backup validation, recoverable deletion, and exclusion from full-deck records. Both sequence and position drills execute the real app handlers.
- Interaction tests preserve the prior full-run, direct-input, timing, scheduling, report, and recovery coverage. New checks cover quiz ownership in Practice, all three Deck views, grid jumping, Ribbon preferences, legacy screen migration, and disclosure state across sorting and reload.
- Rendered browser checks passed at 390×844 and 320×667. Inspected Practice selectors, direct sequence input/context, Cards/Ribbon/Grid, and compact Progress. Ribbon navigation reaches card 52; Grid exposes all 52 cards. The 320px Practice screen has no horizontal overflow.
- Completed a real browser focused drill from an independently missed sequence mapping: three correct answers, automatic completion, 100% independent accuracy, and a normal results dialog. The automated suite additionally completes five-mapping, 15-answer drills in both quiz families. Separate local-origin data was used throughout; live progress was untouched.
- A fresh browser tab restored Practice/Position and the selected format/session length. Temporary responsive viewport overrides are reset after verification.
## Report-window audit and centered Ribbon — October 17, 2026

- All 106 tests pass, along with TypeScript checking, Vite production bundling, service-worker generation, and diff checks.

- Added report-filter tests for exact weekly/monthly boundaries, one millisecond outside them, daylight-saving offset changes, quiz/direction/format isolation, and unknown legacy format classification. Real-app interaction tests toggle each report period and verify answer counts, accuracy, median, session counts, date span, shared Practice window, and unchanged raw history.
- Browser testing used a temporary localhost-only fixture containing 48 synthetic answers at 1, 10, and 40 days old. Position/Mixed/Direct recall changed from 4 of 12 answers, 100%, 1.5s for 7 days; to 8 of 12, 75%, 2.0s for 30 days; to 12 of 12, 50%, 2.0s for All time. Report selector order was confirmed in the browser. Live user data was not accessed or changed.
- Ribbon interaction coverage checks first/last positions, arrows, fractional swipe positions, slider input, restored center selection, switching views, and unchanged answer history. Rendering checks after a temporary viewport change were interrupted by browser-control timeouts; no successful rendered Ribbon-center check is claimed.
- The temporary browser fixture is removed before commit and is excluded from the production build.
## Practice setup and navigation cleanup — October 17, 2026

- All 109 tests pass. TypeScript checking, production build, service-worker generation, and diff checks pass.
- Interaction coverage confirms matching Practice/Progress order, fresh Position/Mixed defaults, preserved saved Sequence/direction preferences, removal of Practice results and period controls, retained session lengths, collapsed Recently deleted with restore action, and 7/30-day/All-time numbers and scope labels in the per-card table.
- Existing full runs, direct input, grading, timing, scheduling, backups, delete/restore, and reload tests remain passing. Both Deck arrows use mirrored SVG paths with shared dimensions and stroke styling.
- The local browser preview started on a separate origin. The browser-control connection timed out before the page could be inspected, so no successful rendered visual check or screenshot is claimed for this cleanup.
## Rolling general-practice chart — October 17, 2026

- All 119 tests pass, including unchanged grading, scoring, timing, scheduling, sequence, backup/restore, and UI-state regression coverage. TypeScript checking, production bundling, service-worker generation, and diff checks pass.
- Trend tests verify focused-drill/sequence/orphan exclusion, non-mutating raw history, pooling one/two-minute sessions by day, answer-level medians, the latest-100 window, proportional recent regression, minimum answer/mapping/timed evidence, exposure/assist/miss/interruption/outlier rules, legacy formats, direction/date filters, local-day grouping, display limits retaining earlier window context, and delete/restore recomputation.
- Real-app interaction tests prove that adding 15 focused misses changes report totals/history while leaving the general-practice graph identical. All formats produces independent charts; drill-only and sparse histories show an evidence-building state rather than a misleading point.
- The local preview started on a separate origin. Browser-control initialization timed out before the updated chart could be inspected. No successful rendered browser check or screenshot is claimed for this release.
## Benchmarks, delayed rechecks, confusions, and English guide — October 17, 2026

- All 135 tests pass; TypeScript checking, production bundling, service-worker generation and diff checks pass.
- Whole-day tests include 200 answers split between faster morning and slower evening practice, and both ends of the oldest selected calendar day. No last-100 cutoff or small-day suppression remains; existing timing/exposure eligibility is preserved.
- Six real-app benchmark flows cover all 52 or 104 mappings exactly once in both formats, including first misses, correction, pause/reload recovery, completion, partial results, and valid backups. Unit tests reject duplicate/misordered/incomplete benchmark plans and verify delete/restore.
- Recheck tests cover availability before/at 30 minutes, next-day readiness, one-pass completion, format isolation, newer mapping ownership, expiry without history deletion, configurable drill sizes, reload and backup metadata.
- Submission/confusion tests cover raw wrong/correct sequences through reload, immutable first grading/timing, pair normalization, format isolation, corrupt payload rejection, unknown legacy guesses, and recoverable deletion. Integration launches and completes confusion drills.
- Settings opens the 18-section English guide, and the document copy is generated from the same text. Actual chart, session, scoring and scheduling changes were inspected; existing sequence runs and adaptive-learning tests remain passing.
- Local preview ran on a separate origin. Browser-control initialization again timed out before rendered UI inspection; no browser screenshot or successful visual QA is claimed.
## Drill-result eligibility and recheck wording — October 18, 2026

- All 138 tests pass. TypeScript checking, production bundling, service-worker generation and diff checks pass.
- A regression test first reproduced the supplied screenshot: all 18 correct answers in a recently exposed six-mapping drill were saved, yet the completion dialog had no independent accuracy or median. It now verifies visible 100% practice accuracy, a practice median, explicit zero independent samples/18 recently seen, unchanged raw exposure flags, valid backups and historical drill feedback.
- Unit coverage checks that repeat-inclusive practice feedback still excludes hints, reveals, first misses, interruptions, nonpositive times and outliers from the appropriate metrics. Raw attempts, ordinary independent summaries and the mapping model remain unchanged by the display calculation.
- UI checks cover disabled-before-ready rechecks, 30-minute and next-day gates, singular/plural mapping counts, source-drill context, overlapping-drill ownership, one-pass targets and access to additional checks beyond the first three.
- The English guide and document copy describe the feedback distinction and the meaning of recheck counts/delays. Existing scoring, scheduling, timing eligibility, daily-graph exclusions and history are preserved; no data migration is needed.
- No rendered browser inspection is claimed: browser/computer automation was not available through the current tool set. The actual app handlers are covered by the isolated UI interaction tests; live user progress was not accessed or changed.

## Guided Practice and weakest-drill organization — October 26, 2026

- All 155 tests pass, including TypeScript checking, production bundling, service-worker generation and diff checks.
- Weakest drills now live in Practice above delayed rechecks, preserving 5/6/8 sizes, mixed position directions, optional both-direction sequence drills, correction history, pause/reload, completion and recheck metadata. Progress retains reports, sorting, confusion-pair actions and history. Practice ranking uses its own direction/format and recent-weighted retained evidence, independent of report date filters.
- Guidance unit tests cover cold starts, direction/format isolation, delayed-check priority, first baseline coverage, weekly benchmark evidence gates, partial-benchmark cooldown, post-drill spacing, supported slow/error evidence, recurring recorded confusions, substantial historical success with recent regression, single-slip protection, direction gaps and introduction of the untried sequence direction.
- Actual app-handler tests launch suggested benchmarks, confusion drills, backward runs and a complete weakest-drill/30-minute-recheck loop. They verify the new section order, manual actions, valid backups, retained raw history and Continue practice navigation. Existing input, reveal confirmation, scoring, timing, chart and data-integrity coverage remains passing.
- Suggested next is computed locally without new stored learning state. Source scoring, review dates, eligibility and graph exclusions are unchanged. The English guide documents all recommendation thresholds; older UI preferences default safely for the optional both-direction sequence-drill scope.
- No rendered browser check is claimed; browser automation was unavailable through the current tool set. Verification used isolated UI fixtures and did not access or alter live practice history.
