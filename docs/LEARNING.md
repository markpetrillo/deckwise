# How practice works

## Directional observations

An association is a (direction, position) pair. The 104 card/number skills are independent; sequence-forward/backward history, scoring, and personal bests stay separate. Combined reports never create a combined mastery model.

The recall score is an inspectable practice cue, not a calibrated recall probability. Multiple-choice recognition still differs from unprompted recall. Timing cannot identify lucky guesses or separate thinking from motor input.

## Raw attempt lifecycle

Every submitted question keeps its unique attempt ID, session ID, Mnemonica position, direction, first-submission timestamp, first-answer correctness, wrong-selection count, hint/reveal flags, interruption flag, recent-exposure flag, and first-response active elapsed milliseconds.

First submissions save immediately. Corrections enrich the same record without changing first correctness, timestamp, or response time. New attempts add optional finalResult (correct, corrected, revealed, or unresolved) and finalElapsedMs when completed. A hinted correct response retains hint=true and earns no independent credit. Unanswered abandoned prompts do not become failures. A submitted miss stays saved even if never corrected. Incomplete sessions close at their last recorded activity on reopening.

Slow, interrupted, and implausible timings remain in history, CSV, and backups. No timing-based deletion occurs.

## Timing and eligibility

A monotonic clock measures active question-to-first-response time; feedback, corrections, pauses, and background time do not become first-response latency. Session active time includes corrections and therefore differs from recall time.

Independent accuracy excludes recent exposure. Among remaining attempts, correct first responses without hints/reveals count as successes; first misses and assistance count as failures. Interruptions preserve observed correctness.

The shared timingEligible rule additionally requires no interruption, a finite first-response time greater than zero, and at most 120,000 ms. The two-minute ceiling excludes implausible timing only from derived metrics. Genuine 8-, 20-, or 90-second searches remain eligible. Median is the primary speed statistic; eligible sample counts and timing exclusions accompany it.

Pause, visibility changes, or a timer-heartbeat gap over five seconds invalidate the unanswered prompt's timing. New interrupted attempts retain their measured active elapsed time with interrupted=true. A first response already recorded before a pause retains its eligibility.

## Exposure and cooldown

The last four prompt positions are unavailable across directions within a session. Separately, positions answered or exposed within the last minute are flagged as recent exposure. Browsing marks visible positions and hints mark displayed neighbors. Same-session repeats after a minute can contribute independent evidence.

On reload the one-minute guard is reconstructed from recent saved attempts and their hinted neighbors. Unsubmitted browsing/hints are only known while the page stays open. Historical exposure flags stay unchanged because actual past exposures cannot be reconstructed precisely.

## Recent and lifetime model

Every mapping derives lifetime independent accuracy, median correct time, and timed sample count from retained attempts. The recent window contains the last 12 non-exposed attempts ordered by timestamp, including misses and assistance. Recent median, P75, and sample counts use eligible correct times inside that window, preventing recent failures from leaving an arbitrarily old speed estimate in place.

Recent accuracy weights halve every four subsequent eligible attempts: newest weight 1, then 2^(-age/4). A small prior centered on lifetime accuracy tempers sparse evidence. Its strength falls from two pseudocounts to half a pseudocount as the recent window reaches eight answers. Old success cannot mask regression, and old learning failures cannot prevent recent automaticity. The no-history prior is 50%.

```
priorStrength = 2 - 1.5 × min(1, recent eligible answers / 8)
weightedAccuracy = (weighted recent successes + priorStrength × lifetimeAccuracy)
                   / (sum of recent weights + priorStrength)
accuracyConfidence = min(1, lifetime eligible answers / 8)
timingConfidence = min(1, recent eligible timed answers / 5)
accuracyScore = 100 × weightedAccuracy × (0.75 + 0.25 × accuracyConfidence)
```

For target T milliseconds, automatic speed is T/2. Median quality is min(1, (T/2)/recentMedian); P75 quality is min(1, T/recentP75). Missing timing uses neutral quality 0.5, never zero seconds. Lapse rate is the fraction of recent times exceeding both T and twice the median. This catches 0.9, 1.1, 1.0, 6.8, 1.2 seconds even when P75 appears fast.

```
fluency = (0.8 × medianQuality + 0.2 × P75Quality) × (1 - 0.25 × lapseRate)
supportedFluency = 0.5 + timingConfidence × (fluency - 0.5)
recallScore = accuracyScore × (0.55 + 0.45 × supportedFluency)
```

Categories:

- Unseen: no eligible accuracy samples; score zero.
- Building: fewer than four recent eligible observations.
- Needs work: weighted independent accuracy below 75%.
- Untimed: no eligible recent correct timing.
- Automatic: at least eight recent eligible observations and five times, weighted accuracy at least 90%, median and P75 within T/2, lapse rate and error pressure no greater than 10%.
- Fast: median within T without sufficient automaticity evidence.
- Calculated: median above T and within 2T.
- Searching: median above 2T.

At the default three-second target, automatic speed is 1.5 seconds. The existing target setting controls these boundaries.

Consistency is Few timed samples below five times; Variable when lapse rate is at least 15% or P75 exceeds both T and 1.5× median; otherwise Steady.

## Persistent intervals

Existing memory records/due dates remain intact on load. Records retain due timestamp, interval days, successes, failures, and the legacy capped slow counter.

- Wrong, hinted, or revealed: review in 0.02 days, about 29 minutes.
- Independent non-exposed success: at least one day; multiply interval by 2 within target or 1.35 above it, capped at 60 days.
- With speed adaptation enabled, invalid/unknown timing uses conservative 1.35 growth and cannot increase or erase slow priority.
- Correct recent exposure cannot increase the previous interval or success count. Failure still triggers relearning.
- Speed opt-out removes speed from selection and uses normal success growth.

Position practice uses the configured target directly; the old adaptive direction-wide limit remains for legacy sequence memory. Days are rolling 24-hour periods. Session deletion/restoration still rebuilds memory chronologically with current settings.

## Adaptive random practice

Build the directional 52-position pool and remove the last four prompt positions. Each remaining mapping gets:

```
weight = 1
       + 6 × weakness
       + 3 × recentErrorPressure
       + uncertainty
       + 2 × staleness
       + 2 when due
       + min(2, directional prompts since last appearance / 52)
```

Weakness is (100-recallScore)/100, or (100-accuracyScore)/100 with speed adaptation off. Unseen mappings use weakness 0.3. Uncertainty is one minus the lesser of accuracy/timing confidence (accuracy alone with speed off). Staleness grows with days since the last non-exposed observation, capped after 14 days.

Recent error pressure uses the last 12 raw mapping attempts with the four-attempt half-life. Wrong/assisted answers increase pressure; exposed failures contribute half weight. Exposed successes cannot improve accuracy or fluency. Selection weight is quartered for mappings answered in the past minute.

Ordinary draws blend 85% adaptive probability and 15% uniform exploration. Every eligible position retains probability. Automatic mappings need fewer checks, regression raises priority, and sparse evidence keeps receiving checks.

Coverage protection overrides randomness after 156 directional prompts without an appearance: choose the longest-waiting eligible mapping, with position as tie-breaker. Cooldown takes precedence. This prevents indefinite starvation even under persistently biased draws. Mixed practice otherwise chooses directions 50/50, forcing the opposite direction after six consecutive answers in one direction.

## Progress and focus

Existing direction/period filters, top statistics, trends, session history, recovery, and sequence records remain. Per-card results add small recall labels and timed sample counts, plus sorting by position, weakest recall, slowest recent recall, lowest recent weighted accuracy, or latest first miss. Unseen rows follow observed rows for performance sorts.

Labels and sorting use the last 12 eligible answers within the selected reporting period. Mixed identifies the relevant weakest/worst tested direction for the selected sort, never an averaged skill. Card details separately show the current full-history model, recent/lifetime accuracy, medians and counts, P75, consistency, misses, and assistance.

Direction comparison preserves its matched-card safeguards: 20 eligible answers and two sessions per direction over 10 shared cards. A 10-point accuracy gap takes priority. Speed recommendations require 10 clean times per direction, a one-second gap, and 25% slowdown, and explain similar accuracy where appropriate. Additional concise cues identify the mappings accounting for 70% of recent first misses, or sufficiently sampled correct-but-slow/variable mappings.

Reporting filters affect results and CSV. Selection always uses full retained history. CSV adds final outcome and correction-time columns, leaving unknown legacy values blank. Backups include active and recoverable deleted history.

## Compatibility and storage

The deckwise.v1 storage key and version 1 remain. New fields are optional additive extensions; no destructive migration or data rewrite is needed. Old backups round-trip without invented outcomes/times. Previously nulled interrupted times cannot be recovered. Historical exposure flags, first-answer evidence, settings, and saved due dates remain unchanged.

Validation checks optional field types/ranges and existing IDs, positions, directions, session references, settings, and deleted recovery history. Invalid backups cannot replace saved data. Restore retains replacement confirmation and the 20 MB size limit.

The app persists submissions/settings, reports storage failures with an export action, and pauses for conflicting cross-tab edits. Progress remains device/browser-local. Export before clearing storage. Derived metrics are recomputed from raw history and never replace it.


## Multiple choice and Direct recall

Practice offers a saved answer-format preference: Multiple choice or Direct recall. The selected format applies to card → number, number → card, and mixed position practice. Sequence quizzes retain their existing five-choice interface.

Direct recall shows all 13 ranks and four suits for number → card, or a ten-digit keypad for card → number. Rank and suit may be entered in either order. Positions accept one or two digits, including leading zeros such as 07. Check answer submits a complete valid answer; editing, partial entries, 00, and values above 52 are not graded. Clear/backspace allow correction before submission. Repeating an already submitted wrong answer is disabled as in multiple choice.

First-response time measures through Check answer, including selection and confirmation. Each complete wrong submission increments the existing mistake count; correcting later never changes the first miss or its recorded time. Hints, reveals, pauses, interruptions, and recent-exposure rules remain shared. Keyboard entry supports digits/Backspace/Enter for positions and A–9/T/J/Q/K with C/D/H/S for card answers.

New sessions and attempts record answerFormat. Missing format fields in older backups are classified as multiple-choice because it was the only available interface; the raw fields are not rewritten. Existing multiple-choice memory keys remain unchanged. Direct-recall keys use a direct-recall: prefix, and validation rejects invalid formats, mismatched session/attempt formats, and direct-recall sequence entries.

The recall model, review intervals, error pressure, timed evidence, and coverage protection are separate for each (format, direction, position). Five-choice performance cannot mask weak direct recall. The existing speed target applies to both formats, but direct-recall times include additional input steps, so format-specific reports are the useful comparison.

Practice start statistics follow the selected format. Progress adds Multiple choice, Direct recall, and All formats filters alongside existing direction and period controls. Session history and raw attempts label format; CSV adds answerFormat. All formats is an optional combined report, never the scheduler's evidence pool. Practice shortcuts from a format-specific report select that format too. Session deletion/restore and full backups preserve both formats.
