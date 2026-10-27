# How Deckwise learns

Plain-English reference for the current learning, scoring, practice and reporting rules. This matches Settings → How learning works.

## What a skill means

Deckwise learns card → number and number → card separately for each of the 52 positions: 104 random-access mappings. Multiple choice and Direct recall keep separate evidence and review dates. Forward and backward sequence skills are separate again. Mixed and All formats are optional combined reports, not merged skills.

## What gets saved

Every question retains its position, direction, answer format, timestamp, first-answer result, first-response time, hints, reveals, exposure/interruption flags and session. Corrections retain the original first miss and add the final outcome and correction time. From this update, each complete submitted answer also retains the entered position/card and its time. Earlier guesses remain unknown; Deckwise never invents them.

Raw slow answers stay in history. Deleting a session moves it to recoverable history and rebuilds the learning evidence without it; restoring brings that evidence back. Backups preserve both active and recoverable history.

## Accuracy and timing eligibility

Independent accuracy counts a question as successful only when the first answer is correct without a hint or reveal. A correction helps learning but does not turn the first miss into a success. Recently exposed questions are excluded from independent-accuracy totals.

Recall timing additionally needs an uninterrupted, independently correct answer with a response time above zero and no more than 120 seconds. Pauses and hidden-page time do not count. A timer gap over five seconds pauses practice and marks unanswered timing as interrupted. Answers seen within the last minute are marked recently exposed. Exclusions affect particular calculations, never erase the raw answer.

## Median, P75 and consistency

The median is the middle correct response time after sorting; with an even number of times it is the average of the two middle times. It is the primary speed measure. P75 estimates the time below which three quarters of the observations lie, interpolating between neighboring sorted times when needed.

A search lapse is an eligible correct time slower than both your speed target and twice the recent median. With at least five timed observations, recall is Variable if at least 15% are search lapses, or P75 exceeds both the target and one-and-a-half times the median. Otherwise it is Steady. Fewer observations are labeled Few timed samples.

## Recent accuracy and confidence

Each mapping uses its last 12 eligible answers. Moving four answers into the past halves an answer’s influence, so recent deterioration can outweigh older successes. Lifetime accuracy provides a small stabilizing prior: initially the equivalent of two answers, shrinking to half an answer after eight recent observations. The weighted success total plus that prior is divided by their combined weight.

Accuracy confidence grows to full strength after eight eligible answers. Timing confidence grows to full strength after five eligible timed correct answers. The accuracy score starts at three quarters of weighted accuracy and rises to its full value as evidence reaches eight answers. This prevents a single lucky answer from declaring mastery.

## The recall score

Speed quality compares half your target with the recent median and stops improving once that standard is reached. Median speed supplies 80% of fluency; P75 relative to your full target supplies 20%. Search lapses reduce this fluency by up to a quarter in proportion to their frequency. Until five timed answers exist, fluency is blended with a neutral half-strength estimate.

The final 0–100 recall score starts from the confidence-adjusted accuracy score. Fifty-five percent of it is protected from speed differences; the remaining 45% depends on supported fluency. Accuracy therefore limits the score, while slow but correct recall still has room to improve. This is a transparent practice heuristic, not a measured probability of remembering.

## Recall labels

Unseen means no eligible answers; Building means fewer than four recent eligible answers. Weighted accuracy below 75% is Needs work. Without usable correct timing the label is Untimed. Fast means the median is within your configured target; Calculated means above the target but no more than twice it; Searching means slower still.

Automatic is stricter: at least eight recent eligible answers and five timed correct answers; weighted accuracy at least 90%; both median and P75 within half your target; no more than 10% search lapses; and error pressure no greater than 10%. With a three-second target, that half-target standard is 1.5 seconds.

## Recent error pressure

Error pressure considers the last 12 attempts, with the same four-answer half-life. First misses, hints and reveals add failure pressure. Failures after recent exposure receive half the usual weight. Subsequent independent successes gradually reduce the pressure. This captures setbacks without letting one slip permanently outweigh strong history.

## How adaptive practice selects a prompt

Each eligible mapping starts with one unit of selection weight. Add up to six units for weakness, three for recent error pressure, one for uncertain evidence, two for age since eligible recall, two if its review date has arrived, and up to two for the number of intervening answers. Age reaches its full contribution after 14 days; coverage weight reaches its cap after 104 intervening same-skill answers. A mapping seen in the last minute receives only a quarter of its calculated weight.

The previous four positions are held out to provide spacing. Of the remaining selection probability, 15% is uniform exploration and 85% follows those weights. After 156 other answers in the same direction and format, the longest-waiting eligible mapping is forced into practice, with the four-position holdout still taking priority. Mixed uses both directions and prevents more than six consecutive questions in one direction.

With Prioritize slower recall disabled, selection uses accuracy score and accuracy confidence in place of the speed-adjusted score and timing confidence. Times and speed labels are still recorded and reported.

## Review dates and the due count

A new independent success receives an initial one-day interval. Later fast, independently correct answers normally double the previous interval. Slow correct answers—or correct answers without eligible timing when speed adaptation is enabled—grow it by 35% instead. Intervals are capped at 60 days. A first miss, hint or reveal sets a short interval of 0.02 days, about 29 minutes. Recently exposed successes do not extend an established interval.

Due counts only previously attempted mappings whose review timestamp has arrived, within the selected direction and answer format. Mixed can count both directions of one card, up to 104 mappings. Due adds priority; it is not a fixed queue. Sequence speed adaptation uses the greater of your target or 125% of the latest 30 eligible times’ median once at least ten times exist. Fixed sequence runs keep their order.

## Practice-focus recommendations

Direction comparisons use up to 100 eligible answers per direction within the selected report pool. A recommendation needs at least 20 answers across two sessions in each direction, with at least ten shared cards. An accuracy difference of ten percentage points takes priority. Otherwise a speed recommendation needs ten timed answers per direction, a median gap of at least one second, and the slower direction at least 25% slower. If that slower direction is also at least five accuracy points better, the UI describes the tradeoff instead of declaring it weaker.

Subset cues inspect recent mappings: usually-correct but slow needs four eligible answers, three timed answers, weighted accuracy at least 75%, and median above your target. Miss-concentration cues count the fewest mappings covering at least 70% of the latest 100 eligible first misses/answers in the selected pool, and are shown after at least five misses. Variable-recall cues use the consistency rule. These are practical suggestions, not statistical significance tests.

## Suggested next exercise

Practice shows one optional recommendation, computed from saved history and the selected quiz, direction and format. It never starts an exercise automatically or writes a new mastery score. Ready delayed rechecks come first; the card names the actual direction of the check even if the source drill includes both directions.

A first random-access benchmark is suggested after at least 52 eligible answers covering 26 card positions. A later comparable benchmark needs at least seven days since completion, 52 new eligible answers and three completed ordinary practice sessions since it. A benchmark is not suggested within a day of the latest comparable benchmark attempt, including an unfinished one, or within 30 minutes of an intensive drill. These are practical frequency rules, not experimentally optimized intervals.

Next, a pair with at least three actually recorded wrong entries in the past week can receive a confusion drill. Otherwise, supported weak mappings can receive a weakest drill: at least four recent eligible answers, with weighted accuracy below 85% and at least two recent first misses or two assists, or a median above your speed target, or Variable recall. Overlapping mappings completed in an intensive drill within the last 24 hours are not prescribed another intensive drill. Manual drills remain available whenever you choose them.

When targeted work is not the next suggestion, broad adaptive practice can favor the weaker random-access direction using the existing shared-card comparison rules and a 30-day evidence pool in the selected format. With little evidence, normal practice builds coverage. A completed sequence run in one direction can introduce the other direction if it has no completed run in the same format. Otherwise a full run in the selected direction is suggested. Results offer Continue practice so the next suggestion can reflect the completed exercise.

## Weakest drills and choosing five, six or eight

The weakest list lives in Practice and uses its selected direction and answer format. It uses all retained history, with the existing recent weighting and confidence rules, rather than a Progress date filter. It ranks observed mappings by lowest recall score, then higher error pressure, then stable position/direction order. Unseen mappings are omitted. Sequence drills can use the selected direction or both directions. Progress keeps its reports, per-card rankings, confusion pairs and history.

Choose five, six or eight mappings; five remains the default. Each mapping receives three turns, separated by the other selected mappings: four intervening prompts with five mappings, five with six, and seven with eight. The drill result shows first-try accuracy without hints or reveals and a practice median that includes recent repetitions. Timing still excludes interruptions, assistance, zero times and answers over two minutes. It also shows how many answers qualify as independent samples and how many were recently seen. Practice results appear in drill history too; raw exposure flags and mastery eligibility stay unchanged. Three passes are an inspectable practice choice, not proof of mastery or a claim that three independently correct recalls occurred. There is no established Mnemonica-specific optimum of five or six.

## Delayed rechecks

After a completed weakest or confusion drill, a one-pass recheck becomes available after 30 minutes and another after 24 hours. Those delays are practical defaults, not experimentally proven optimal intervals for you. The count on each button is the number of mapping questions, not a drill number. A mapping includes its direction; a card checked in both directions counts twice. The delay is measured from completion of the original drill, not the duration of the check. Each entry identifies that drill by date and time. Starting a recheck is always your choice; it never interrupts a session.

Each mapping is rechecked from its newest completed intensive drill in that answer format. Newer drills supersede older pending checks for the same mapping. Completed checks are remembered in ordinary session history; unfinished checks remain available. If the first check was missed, the next-day check takes precedence. Pending checks expire after seven days, while all source/recheck history remains saved. Retest misses and assistance retain their usual grading and scheduling effects.

## Confusion pairs

Only actual recorded wrong submissions identify a confusion. The expected mapping and the mapping you entered form a pair within one direction and format. Confusing A for B or B for A contributes to the same pair. Pairs in the selected report window rank by wrong-submission count, then latest error. Correct submissions never add confusion counts, and old mistakes without recorded guesses cannot be reconstructed.

Practice pair alternates both mappings for three turns each. These targeted sessions are recorded as confusion drills, receive delayed rechecks after completion, and stay out of the general-practice chart.

## Balanced random-access benchmarks

A one-direction benchmark shuffles all 52 positions and asks each mapping once. Mixed covers all 104 mappings: each position appears once in a shuffled first pass, then its opposite direction appears in the second pass in the same position order, 52 prompts later. This provides broad spacing between a card’s two directions. There are no adaptive repeats or weakness-based selections within a benchmark.

Benchmarks use the selected answer format and the established first-answer, timing, correction, hint, reveal and pause rules. A completed run must cover its exact planned mappings; partial runs remain labeled partial. Results show independent accuracy, median eligible recall, active time and the share of eligible timed correct answers within your target. Benchmarks appear in their own comparison table and normal session history. Their eligible answers also contribute to the full-day general-practice graph.

## Daily graphs and report totals

Every eligible general-practice answer on a local calendar day is included in that day’s point: there is no last-100 cap and no preference for morning or evening. Short regular sessions pool into that same day. Focused weakest, confusion and recheck drills are excluded from this curve, but remain in the overall report totals, raw history, mastery models and scheduling.

A daily point shows independent accuracy and the median of all that day’s eligible correct times. Faint points flag fewer than 20 answers across ten mappings, or fewer than five timed answers; their actual observations still count. All formats keeps separate series. The graph has its own saved 7-day, 30-day, 90-day or All-time range, defaulting to 30 days independently of the report totals. Every active day in that graph range is displayed, without a separate 30-point cap. Report totals use rolling periods of 24-hour days. Daily graphs use whole local calendar days, including today, for their own selected range, so an oldest-day morning is never cut off by the current clock time. Direction and format filters still apply to both graph and reports.

Top report accuracy is independent successes divided by eligible questions. Within-target percentage is eligible timed correct answers at or below your target divided by all eligible timed correct answers. The All 52 cards table means 52 rows, not automatically lifetime data: it follows the selected window, direction and format. Card details separately label recent and lifetime evidence.

## Sequence runs and records

A full forward/backward sequence run covers 52 positions in order, wrapping for random starts. Scored time is active time plus five seconds for every wrong submission or reveal. Correcting later does not remove a penalty. Pauses are excluded. Only completed 52-card runs qualify for personal bests, separately by direction and answer format; focused drills and random-access benchmarks never qualify.

## Research and tuning

The evidence supports retrieval practice and spacing across repeated learning sessions. It does not establish an exact best drill size, a universal 30-minute delay, or validated score weights for Mnemonica. These implementation choices remain visible and tunable. Keep format and direction consistent when comparing your results.

Research: [Kornell: flashcard spacing](https://sites.williams.edu/nk2/files/2011/08/Kornell.2009b.pdf); [Rawson & Dunlosky: retrieval and relearning](https://pubmed.ncbi.nlm.nih.gov/21707204/).
