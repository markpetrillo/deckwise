# Deployment and installation

## Hosting

- Public app: https://deckwise-sigma.vercel.app
- Repository: https://github.com/markpetrillo/deckwise
- Vercel dashboard: https://vercel.com/mark-petrillos-projects/deckwise
- Production branch: `main`
- Local checkout: `C:\dev\deckwise`

Deckwise is a static Vite application hosted on Vercel, built from its own GitHub repository. `vercel.json` specifies the Vite framework, `npm run build`, `dist` output, and no-cache service-worker headers.

Git pushes to the production branch trigger Vercel builds after the Git integration is connected. CI also runs the core tests and production build on pushes and pull requests. No database or application secrets are required.

## Release

```sh
npm ci
npm test
npm run build
```

Review the app in a phone-sized browser, then push to `main`. Verify the Vercel deployment finishes successfully and check the public production URL. For a manually linked checkout, run `vercel link` before `vercel --prod`.

Never commit `.vercel/`, local credentials, `.env` files, `node_modules`, or generated `dist` output. Icons are committed assets, generated from the original brand motif.

## Offline updates

The build hashes the production assets and generates a unique service-worker cache name. Installation precaches all bundled assets, the manifest, and install icons. Navigations use the network with a cached application fallback; assets prefer their precached version. Activation removes old Deckwise caches.

Updates wait for existing app windows to close before taking over. Close all Deckwise tabs/app windows and reopen when expecting a new release. This prevents an update replacing assets in the middle of a practice session. Local progress uses a separate persistent key and survives cache replacement.

## Install

- **iPhone/iPad:** open the public URL in Safari, tap Share → Add to Home Screen. Enable Open as Web App if offered.
- **Android:** open in Chrome, use Install app or Add to Home screen.
- **Desktop:** Chrome/Edge provide an install control in the address bar or browser menu.

Visit once online and verify “Offline app ready” in Settings. Installation availability and wording depend on the browser. The app remains usable as a website when installation is unavailable.

## Progress portability

Settings → Export a backup downloads complete JSON. To move devices, open Deckwise on the new device and restore that file. Restore replaces that browser's current progress after confirmation. CSV exports are for reporting, not restoration.

## Rollback

Use Vercel's deployment dashboard to promote a previously verified deployment. Data schema changes require a migration before release; do not silently discard existing `deckwise.v1` data.
