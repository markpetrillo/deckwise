# How practice works

## Observations, not a memory score

Deckwise records observable answers and timing. It does not claim to measure memory directly or report a calibrated probability of recall.

An association is a `(direction, position)` pair. There are 104 core associations. Correctly identifying the number for a card does not automatically advance its inverse association.

## Attempt lifecycle

Each question has one unique attempt ID. The first submission records its correctness and elapsed response time immediately. Later wrong submissions update the mistake count on the same attempt; a later correct answer does not change first-answer correctness. Hints and reveals are recorded, including after the first wrong submission. Duplicate writes cannot create duplicate attempts.

An unanswered question abandoned on exit does not become a failure. An already submitted wrong answer remains saved even if the session is closed before correction. Incomplete sessions are closed at their last recorded activity when the app reopens.

## Timing

The browser's monotonic clock measures the question-to-first-submission interval. Feedback reading and answer correction time do not become first-response time. Pausing or switching away from the app invalidates the current unfinished question's timing but preserves objectively observed correctness. A gap greater than five seconds in the timer heartbeat pauses the app conservatively to handle device sleep.

The session timer measures active practice, including feedback and correction. Question timing measures first-response latency. These are intentionally different.

Timing is compared separately in each direction. The speed threshold is the larger of the user's target and 1.25× the median of up to 30 recent eligible correct answers, once at least 10 exist. Speed adaptation may be disabled. Timing cannot reliably distinguish a confident answer from a lucky guess or separate thinking from motor input.

## Persistent intervals

For each association, store due timestamp, interval in days, independent-success count, failure count, and a capped slow-answer priority.

- Wrong, hinted, or revealed: schedule in approximately 29 minutes (`0.02` days).
- Independent first-attempt success: at least one day, multiplying the previous interval by 2 for fluent answers or 1.35 for slow answers; cap at 60 days.
- Correct answer with recent exposure: do not increase the previous interval or independent-success count. A failure still triggers relearning.
- Slow independent success increments a capped fluency priority; other outcomes reduce it gradually.

Intervals use rolling 24-hour days, not a midnight-based calendar schedule. This is a heuristic initial model, not FSRS, Anki compatibility, or an empirically optimized algorithm.

## Weighted random selection

Remove the four most recent prompt positions from the 52-card pool, across directions, to reduce direct answer exposure. Draw randomly with these weights:

```
Unpracticed association: 4
Previously practiced association:
  1
  + 4 when due
  + 2 per failed/assisted result among the last five attempts
  + current slow-answer priority (0–5, if speed adaptation enabled)
```

Every eligible card retains a positive weight. Mistakes increase frequency without guaranteeing a fixed retry position. This queue is intentionally usable for full-deck random practice even when few reviews are due; it is not a due-only Anki queue.

## Recent exposure and reports

Any repeated prompt position within the same session is marked recent exposure. A card viewed in the gallery within the last minute is also marked. Neighbors shown as hints are marked as exposures. Recent exposure is conservative across directions.

Independent accuracy uses attempts without recent exposure, with hinted/revealed/wrong-first answers counted as failures. Total answers, mistakes, hint use, coverage, and session history include all attempts. Median timing and speed-target statistics require a correct first answer without hints/reveal, interruption, or recent exposure. Daily charts use local calendar days. Filters affect displayed results and CSV exports; backups always include all history.

This guards against immediate repetition inflating evidence. It still measures multiple-choice recognition, not free recall, and delayed performance should be evaluated before making claims about learning gains.

## Storage and reliability

Versioned JSON is persisted under `deckwise.v1` in localStorage after submissions and settings changes. The memory schedule is included in a complete backup. Restore checks version, ranges, types, IDs, association keys, and session references before requesting replacement confirmation. Files above 20 MB are rejected.

The app reports storage failures and provides an export action. Multiple tabs detect conflicting changes; active practice pauses and asks for a reload. Cross-device synchronization is intentionally absent. Browser storage is finite; export regularly if accumulating a large history.

Pause freezes active session time. Switching away from the app or a browser scheduling gap over five seconds also pauses until Resume. An interrupted unanswered question keeps correctness grading but excludes its first-response time from speed statistics. A first response already recorded before a pause retains its timing. End session saves completed answers; it never grades an unanswered prompt.
