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

On reload the one-minute guard is reconstructed from recent saved attempts and their hinted neighbors. A valid same-tab quiz checkpoint also preserves recent browsing/hint exposure across a reload; ordinary reopening without that checkpoint only reconstructs saved attempts. Historical exposure flags stay unchanged because actual past exposures cannot be reconstructed precisely.

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

Practice offers a saved answer-format preference: Multiple choice or Direct recall. The selected format applies to card → number, number → card, and mixed position practice. Sequence quizzes offer the same two answer formats with a separate saved preference, defaulting to multiple choice for existing users.

Direct recall shows all 13 ranks and four suits for number → card, or a ten-digit keypad for card → number. Card answers use rank first, then suit: selecting the suit immediately submits, with no Check answer button. Suits are disabled until a rank is selected, and previously tried wrong combinations remain disabled. Rank edits and incomplete entries are not graded. Positions accept one or two digits, including leading zeros such as 07; Check answer (or Enter) still submits numeric answers, while 00 and values above 52 are not graded. Clear/backspace allow correction before submission. A wrong submission keeps the rejected answer in the feedback and immediately clears all input for a fresh retry, in position and sequence practice. Partial edits leave that feedback visible. Repeating an already submitted wrong answer is disabled as in multiple choice. The rank picker uses two fixed, centered rows (seven ranks over six) so no rank is stranded on its own.

First-response time measures through suit selection for card answers, or Check answer for number answers, including all input time. Older direct-card times include the former confirmation step and remain unchanged. Each complete wrong submission increments the existing mistake count; correcting later never changes the first miss or its recorded time. Hints, reveals, pauses, interruptions, and recent-exposure rules remain shared. Keyboard entry supports digits/Backspace/Enter for positions and A–9/T/J/Q/K with C/D/H/S for card answers.

New sessions and attempts record answerFormat. Missing format fields in older backups are classified as multiple-choice because it was the only available interface; the raw fields are not rewritten. Existing multiple-choice memory keys remain unchanged. Direct-recall keys use a direct-recall: prefix, and validation rejects invalid formats, mismatched session/attempt formats, for both position and sequence sessions.

The recall model, review intervals, error pressure, timed evidence, and coverage protection are separate for each (format, direction, position). Five-choice performance cannot mask weak direct recall. The existing speed target applies to both formats, but direct-recall times include additional input steps, so format-specific reports are the useful comparison.

Practice start statistics follow the selected format. Progress adds Multiple choice, Direct recall, and All formats filters alongside existing direction and period controls. Session history and raw attempts label format; CSV adds answerFormat. All formats is an optional combined report, never the scheduler's evidence pool. Practice shortcuts from a format-specific report select that format too. Session deletion/restore and full backups preserve both formats.


## Sequence Direct recall

Practice → Sequence quiz now offers Multiple choice or Direct recall for forward, backward, and random-start runs. A separate optional sequenceAnswerFormat setting preserves the position-practice preference. Existing backups omit this setting and continue to default to multiple choice without rewriting old sessions or answers.

Direct recall uses all 13 ranks and four suits: select a rank, then select a suit to submit immediately. First, last, and random-start prompts name the requested starting card/position without revealing its identity. Every complete run covers 52 cards exactly once, wrapping as before. Incorrect first submissions, corrections, reveals, interrupted timing, pause, and early finish retain their existing semantics. Full-run scored time still adds five seconds per wrong submission or reveal.

Sequence attempts/sessions carry answerFormat and remain separate from both position directions. Sequence memory keys support the format prefix, and fluency comparisons use only the same sequence direction and format. Progress now filters sequence results by format as well as direction and period. Personal bests are separate for each (direction, format); All formats displays separate record cards and labels run formats in the trend/history. Incomplete and legacy countdown runs still do not qualify as full-deck bests.

Rank/suit and digit edits now replace only the answer panel. Prompt artwork, countdown/run timer, progress, and session controls stay mounted while an answer is composed. Focus is restored to the selected control without scrolling. The shared selectors, setup panels, start prompt, reduced-motion behavior, and responsive dialogs use the same restrained UI styles across both quiz types.


## Screen and reload state

Progress uses four consistent selector rows with accessible group names and no visible labels. Quiz type switches between Sequence quiz and Position practice; each retains its own direction and answer-format filters. Opening Progress no longer forces sequence results.

Navigation and display preferences use a separate validated deckwise.ui.v1 key: current screen, Deck mode and browsed card, sequence direction/start, report filters, card sort, history expansion, and scroll position. Practice mode, session length, answer formats, speed settings, and the shared statistics period retain their existing storage in settings. No answer-history schema or migration is required. UI preference storage failures do not disable training or overwrite progress.

Same-tab reloads checkpoint the current question and partial entry in session storage, alongside the session ID, active elapsed time, sequence position/context, recent selections, and exposure state. Recovery must agree with saved sessions and attempts; stale or malformed checkpoints are ignored. A recovered quiz is paused, excludes closed-page time, and marks an unanswered interrupted question ineligible for recall timing. Recorded first misses, first response times, penalties, and question IDs are preserved. The snapshot never creates an answer. Finished sessions cannot resume. Ordinary new tabs/reopening restore the last display preferences without taking over another tab's live quiz. Full JSON exports continue to contain history/settings, while these device-local display preferences stay separate.

## Practice organization and focused drills — October 15, 2026

Practice owns both Sequence quiz and Position practice. All existing full-deck runs, countdown lengths, answer formats, hints, reveals, penalties, records, and raw history remain. Deck offers Cards, a freely scrolling Ribbon for faster scanning, and a 52-card Grid; tapping a grid card opens it in Cards. Visible browsed cards continue to count as recent exposure for timing eligibility.

Progress lists up to five weakest observed mappings for the chosen direction, report period, and format, using the existing recall model: lowest score first, then greater error pressure, then stable position/direction order. Unseen mappings are omitted. Direction and answer format remain separate skills. All formats uses the corresponding saved practice format, falling back to the other format if it has no observed mappings; the drill button identifies the chosen format. Normal adaptive practice still selects from full retained history.

A focused drill fixes that set at its start and cycles through it three times. Five mappings therefore produce 15 answers, with four other prompts between repeats; fewer observed mappings produce a shorter drill. Prompts never reveal their own answer in the weakest list. Sequence drill context shows the actual preceding two neighbors for each requested direction, with the existing exposure tracking. Focused sessions share the usual first-answer grading, retry, hint/reveal, pause, interruption, raw timing, and scheduling rules. Their clock counts up, and they finish after the planned answers. Sequence penalties remain five seconds per wrong submission or reveal. Focused sessions cannot qualify as full-deck personal bests.

Session.focus is an optional additive field storing the selected position/direction mappings, answer target, elapsed active time, and completion status. Validation rejects malformed plans and answers outside the selected set. Existing version-1 backups need no rewrite; delete/restore and exports retain focused history. CSV adds practiceKind so drills can be identified later.

The full per-card table and session history are collapsed by default, with remembered open/closed state. Sorting, recent/lifetime details, sample counts, raw attempts, deletion, restoration, and exports remain available. Redundant headings and setup instructions are removed while accessible control group names remain. Old Deck/Sequence preferences safely migrate to Practice/Sequence; old Position practice preferences retain their selected mode. Active same-tab drills resume paused after reload under the existing checkpoint validation rules.
## Selector order, report windows, and centered Ribbon — October 17, 2026

Direct recall is the leftmost answer-format choice in both Practice and Progress. Reports put Position practice before Sequence quiz and Mixed before the two individual position directions. Existing saved selections and defaults retain their values; reordering controls does not change history or the selected mode.

The 7-day and 30-day windows are rolling periods of 7 or 30 times 24 hours, including answers exactly at the cutoff. Quiz family, direction, and answer format filter the evidence before summary metrics are calculated. Reports, Practice summaries, and full-run records share the same cutoff calculation; full-run records continue to use the session start date. A compact coverage line shows the answers in the window out of all retained answers matching the other report filters, plus the actual first/last answer dates. All formats can reveal older multiple-choice practice that is absent from a Direct recall report. Unchanged rounded accuracy or median values alone do not imply identical evidence.

The speed setting is relabeled Prioritize slower recall. Its behavior is unchanged: in adaptive position practice, slower or less consistent eligible correct recall increases selection priority, and slow independent answers grow review intervals by 1.35 rather than 2 after the initial one-day interval. Switching it off uses accuracy confidence instead of speed-adjusted mastery and timing confidence for selection. Speed remains recorded and reported. Fixed full-deck sequence runs retain their order, and manually selected focused drills retain their chosen mappings.

Ribbon uses equal space before card 1 and after card 52 so the selected card is centered. The counter, range slider, arrows, keyboard navigation, and restored position identify the center card. Scrolling remains free rather than snapping. Recent-exposure tracking covers visible cards on both sides of the center.
## Practice cleanup and report scope — October 17, 2026

Practice and Progress use the same left-to-right position options: Position practice before Sequence quiz, Mixed before Card → number and Number → card, and Direct recall before Multiple choice. Fresh installations default to Position practice and Mixed; valid saved selections still restore, and old Deck/Sequence preferences retain their compatible migration. Practice retains all quiz setup, session lengths, answer formats, and current due counts. Historical result cards and their period selector now live only in Progress; live-session statistics and results dialogs remain.

Deck navigation uses matching left/right SVG arrows with the same stroke, size, and center alignment. Recently deleted starts collapsed and keeps its restore actions and recovery data. The All 52 cards title now includes the selected 7-day, 30-day, or All-time scope. Its 52 rows denote deck coverage, not lifetime evidence: row counts, accuracy, medians, and ranking use the selected report window/direction/format. Current recall details continue to show the last 12 eligible observations per mapping/direction with recency weighting and separately labeled lifetime context. No new session-count cutoff, data deletion, or scoring migration is introduced.
## Review-due count and Settings navigation — October 17, 2026

Settings is reached from the bottom navigation; the duplicate header gear is removed. The Practice due count counts existing memory records whose review timestamp is at or before now, scoped to the selected answer format and position direction. Mixed can count up to 104 card/direction mappings; a card due in both directions contributes two. Mappings without a memory record are omitted. This count is independent of Progress date filters and is neither a mistake count nor a fixed session queue. Being due adds selection weight alongside weakness, recent errors, uncertainty, age, coverage, and exploration.
## General-practice progress trend — October 17, 2026

The position-practice graph pools every eligible general-practice answer within each local calendar day. It uses retained attempts matching the selected direction and answer format, joined to existing non-sequence sessions without Session.focus. Focused drills and recently exposed answers stay out of the curve; their history remains saved. Drill attempts still contribute to report totals, individual sessions, mastery models and scheduling. Sequence full-run graphs and records are unchanged.

Each day shows independent accuracy and the median of its eligible correct response times. Small-sample points remain visible, with reduced opacity below 20 answers across ten mappings or five eligible timed answers. There is no answer cap or minimum that silently removes a day's data. Short regular sessions contribute according to their answers, and focus-only days produce no general-practice point. The latest 30 active days are displayed with actual date spacing and the configured target line. All formats draws separate charts to keep input methods comparable.

Daily observations come from adaptive general practice and balanced benchmarks; they are not calibrated estimates of complete-deck mastery. Deletion and restoration recompute the curve from retained history. Exact counts and coverage are available in the collapsed daily table; session-level details remain in Sessions.

## Whole-day evidence and added learning modes — October 17, 2026

The daily graph now includes every eligible general-practice answer for each selected local calendar day, with no 100-answer cap. All available morning and late-night answers contribute. Graph ranges use whole seven/thirty calendar days including today, while report totals retain their established rolling 24-hour windows. Small-sample days remain visible with faint points; their actual median/accuracy is retained. Focused weakest, confusion and recheck sessions remain excluded from the general-practice curve; benchmarks are included.

The optional settings.focusSize supports 5/6/8, defaulting to 5 without rewriting old settings. Focus plans can optionally identify confusion drills or one-pass delayed rechecks with their source session and stage. Rechecks are derived from completed intensive sessions: 30 minutes and 24 hours after the source, latest source per mapping/format, seven-day pending expiry, no automatic session start or notification. Recheck completion is ordinary saved history, so reload/delete/restore remains recomputable.

Position practice adds shuffled 52-mapping single-direction and 104-mapping Mixed benchmarks. Plans retain their exact order; Mixed gives each position its inverse direction 52 prompts later. Benchmarks keep the established grading/timing rules and appear in a separate comparison table plus session history. They cannot qualify as full-deck sequence personal bests.

New attempts optionally retain every valid submitted mapping and its timestamp/active elapsed time. Corrections preserve the first-answer evidence and complete submission sequence. Earlier guesses remain unknown. Confusion pairs combine opposite errors within the same direction/format and selected report period, rank by count/recency, and can launch a two-mapping, three-pass drill. JSON backups retain these additive fields; CSV adds submittedAnswers and identifies benchmark, confusion and recheck practice kinds. Validation checks submission integrity, benchmark coverage/order/completion, recheck source metadata, settings, and checkpoint consistency. No existing history or schema key is reset.

Settings → How learning works and docs/LEARNING-EXPLAINED.md provide the full English explanation of all formulas, thresholds and practical heuristics, including research links. The 5/6/8 sizes and 30-minute/24-hour recheck defaults are tunable design choices, not claims of Mnemonica-specific scientific optimality.
## Drill feedback and recheck clarity — October 18, 2026

Drill completion, live feedback and session history show first-try practice accuracy and practice median, including intentional recent repetitions. First-try success still requires a correct first answer without hints or reveal. Practice timing retains the interruption, assistance, nonpositive-time and two-minute exclusions. Results label the number of independent samples and recently seen answers. The saved recentExposure flag, independent report totals, mastery calculations, review scheduler and drill exclusion from the daily graph are unchanged. Existing saved drills can display practice feedback without any history migration.

Recheck buttons name their remaining mapping count, one question per mapping, direction, readiness, delay and source drill date/time. Newer intensive drills can take over overlapping mappings, so an older entry may contain fewer questions. Additional pending checks are reachable through More rechecks. The 30-minute and 24-hour gates remain measured from completion of the source drill; no notification or automatic session start is added. Benchmark setup now states full-deck coverage and no time limit.
