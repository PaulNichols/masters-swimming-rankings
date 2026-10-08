# Masters Swimming Rankings

Static React + Vite + TypeScript dashboard for tracking Masters Swimming ranking history.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Data

Canonical version 1 data lives in [`public/data/rankings.json`](public/data/rankings.json), so GitHub is the source of truth for the shared site.

To publish updated data for everyone, replace `public/data/rankings.json`, commit, and push. GitHub Pages will redeploy from the workflow.

Run `npm run update:data` to refresh every configured swimmer from MSARC and E1000. If direct HTTP requests receive a browser-check or unexpected page, the updater automatically switches to a temporary browser session and lets the source site's JavaScript check complete. Windows uses installed Microsoft Edge; on other platforms install Chromium with `npx playwright install chromium`. GitHub's scheduled workflow installs its browser automatically.

Every response is checked before parsing. The updater rejects missing tables, empty previously populated histories, and reduced history counts for any swimmer/year. A failed refresh exits with an error and leaves the existing JSON intact, preventing the scheduled workflow from committing or deploying incomplete data. Intentional historical record deletions need review before lowering the retained baseline. Static achievements are preserved.

Run `npm test` for source validation and data-preservation tests, and `npm run test:browser` for the browser fallback integration test. Run `npm run validate:data` before publishing to check the generated JSON against the committed baseline, including any data collected using Codex's browser.

Source verification may also reject an automated browser. In that case the local Codex automation continues through its in-app browser, verifies every configured source, and publishes only a complete refresh. If neither browser can access the sources, the automation reports the blocker and retains the last valid dataset; the GitHub-only scheduled job fails safely.

## Deployment

The app is configured for GitHub Pages at:

```text
https://paulnichols.github.io/masters-swimming-rankings/
```
