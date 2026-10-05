# Deckwise MVP — product requirements

Status: initial implementation. Name selected by Mark on October 4, 2026.

## Purpose

Make personally useful five-minute Mnemonica practice available as an installable, mobile-first website. Public hosting provides convenient access; broad adoption and feature parity with other trainers are not MVP goals.

## Required experiences

### Browse the deck

All 52 cards appear in canonical Mnemonica order, numbered from the top of the deck. Large original card faces occupy the gallery. Native horizontal touch scrolling snaps to one card per viewport. Buttons, keyboard navigation, and a slider provide accessible alternatives.

### Practice both directions

Show a card and ask for its position, or show a position and ask for its card. Mixed mode alternates randomly. Show five distinct options: one correct and four random alternatives. The five full card-shaped buttons occupy a single row across the available width, without overlap or a fan arrangement. Numeric choices sort ascending. Card choices sort by rank Ace–King, then suit C/D/H/S.

Five minutes is the default. Users can choose 1, 3, 5, or 10 minutes. Timer counts active practice, including feedback; pausing or hiding the app suspends it. Users may finish early. Answers remain visible for review until the user advances.

Wrong choices are disabled for that question, allowing correction. The first mistake remains a failed independent attempt regardless of later correction. Optional neighbor hints and answer reveal are tracked. Desktop keys 1–5 select answers and Enter advances a completed question.

### Save, adapt, and report

Record correctness, first-response timing, mistakes, assistance, interruptions, recent exposure, direction, position, session, and timestamp. Save on every submitted answer and relevant interaction. Maintain independent state for card→number and number→card.

Use errors, due dates, speed, and practice coverage to weight otherwise random selection. Maintain persistent review intervals across sessions. Avoid four most recent prompts. Same-session repeats and recently viewed card associations must not count as evidence of durable recall.

Reports include accuracy, valid median answer time, speed-target percentage, misses, hints, coverage, daily history, per-card/per-direction results, and session details. Filter results by direction and 7 days/30 days/all time. Export portable JSON backups and raw-result CSV. Validate backups before confirmation and replacement.

## Design

Quiet warm paper background, deep green controls, serif headings, crisp original card faces. One primary action per screen. Touch targets remain independent and unobstructed. Small phone layouts, keyboard navigation, semantic controls, screen-reader card names, reduced motion, and visible focus states are required.

## Hosting and persistence

Dedicated `deckwise` GitHub repository and Vercel project. Static Vite/TypeScript application, without a backend or account requirement. Progress is local to each browser. Installable PWA with manifest, home-screen icons, and precached production assets. Existing history survives releases.

## Acceptance criteria

1. Every mapping is correct and unique; all 52 gallery cards are available.
2. Every question includes exactly five unique, correctly ordered choices with one correct answer.
3. Grading preserves first-answer failures after correction and treats hints/reveal as assisted or failed recall.
4. Response timing excludes detected interruptions and feedback reading.
5. Both recall directions maintain independent schedules and statistics.
6. Weak associations receive higher selection weight while coverage remains possible.
7. History survives reload, and validated backup restoration retains data.
8. App installation metadata is valid; cached production practice works offline.
9. Core interactions work at phone and desktop sizes without horizontal page overflow.
10. Documentation explains the scheduler, limitations, storage, installation, and deployment.

## Deferred

Other stacks, custom stacks, free-recall entry, guided progressive learning, mnemonic editing, neighbor questions, sequence drills, ACAAN, distance calculations, spot checks, toolbox, localization, cloud sync, notifications, leaderboards, and commercial features. These are future possibilities rather than commitments.

## Research context

[MemDeck](https://memdeck.org/guide/) inspired the basic drill. [StackDrill](https://github.com/n3urs/MnemonicaStack) already implements weighted Mnemonica practice and Leitner reviews. [SlimStampen research](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2021.780131/full) demonstrates accuracy/response-time adaptation in vocabulary learning. That evidence motivates experimentation; it does not validate Deckwise's particular scheduling rules or establish effectiveness for magic performance.
