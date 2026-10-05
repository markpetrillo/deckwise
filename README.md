# Deckwise

A small, mobile-first Mnemonica practice app. Browse all 52 cards and spend five minutes building quicker recall, with practice that adapts to your answers.

**Live app:** https://deckwise-sigma.vercel.app · **Repository:** https://github.com/markpetrillo/deckwise

## MVP

- Full-deck gallery with touch scrolling, snap-to-card navigation, arrow keys, and position slider.
- Card → number, number → card, and mixed multiple-choice practice.
- Exactly five separate answer cards. Numbers are ascending; card choices sort Ace–King, then Clubs, Diamonds, Hearts, Spades.
- First-answer grading, retries, neighbor hints, reveal, pause, and 1/3/5/10-minute sessions.
- Independent scheduling for the 104 directional associations; errors and slow answers increase practice priority.
- Accuracy, median response time, speed-target results, daily trends, per-card breakdowns, session history, and raw-attempt details.
- Device-local history and review dates, validated backup/restore, and CSV export.
- Installable PWA, versioned offline cache, CC0 classic English SVG card images, accessible controls, and reduced-motion support.

There is no account or cloud sync. Progress belongs to the browser/device where you practice. Export a backup before clearing browser data or changing devices. Hosting-provider request logs are outside the app; Deckwise includes no analytics SDK or tracking pixels.

## Development

Requires Node 22+ and npm.

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

`npm run build` type-checks the application and tests, bundles the app, and writes a content-versioned service worker. Offline behavior requires the production build on HTTPS or localhost; the development server intentionally does not register a service worker.

## Documentation

- [Product requirements and release scope](docs/PRD.md)
- [Grading, timing, scheduling, and statistics](docs/LEARNING.md)
- [Deployment, installation, and maintenance](docs/DEPLOYMENT.md)
- [Verification evidence](docs/VERIFICATION.md)

## Learning model

Deckwise uses a transparent heuristic scheduler, not FSRS or a validated memory-probability model. It combines persistent due dates with a weighted random practice queue. Recognition from five choices is not equivalent to free recall, and fast guesses cannot be identified reliably from timing alone. See [LEARNING.md](docs/LEARNING.md) for the exact rules.

## Credits

Mnemonica was created by Juan Tamariz. This is an independent practice companion, not an official or endorsed product. Card order checked against [MemDeck’s lookup](https://memdeck.org/toolbox/) and the independently maintained [StackDrill order](https://github.com/n3urs/MnemonicaStack#the-stack). Card artwork is by Adrian Kennard, released under [CC0](https://www.me.uk/cards/), distributed through [letele/playing-cards](https://github.com/letele/playing-cards). The license is included in public/cards/LICENSE.txt.

Personal interface: navy palette, minimal deck/practice labels, and a clean Ace of Spades without the source artwork’s promotional QR/text. CC0 attribution and license remain in Settings and the repository.

Deckwise install icon: cobalt spade mark in a 5:7 playing-card silhouette, matching the header logo. SVG, 192 px, 512 px, maskable 512 px, and Apple 180 px assets.

Correct answers automatically advance after a brief feedback interval. Pause freezes both timing and the transition; revealed answers wait for Next. Delete individual completed sessions from Progress using the trash control. Deletion removes their attempts from reports and rebuilds adaptive memory from the remaining history using the current settings.
