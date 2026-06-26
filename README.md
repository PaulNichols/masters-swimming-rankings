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

Canonical version 1 data lives in [`public/data/rankings.json`](public/data/rankings.json), so GitHub is the source of truth for the shared site. Browser `localStorage` is still used as a local working copy for imports and experiments.

Use the app's Export button to save the current browser copy as JSON. To publish that data for everyone, replace `public/data/rankings.json`, commit, and push. GitHub Pages will redeploy from the workflow.

## Deployment

The app is configured for GitHub Pages at:

```text
https://paulnichols.github.io/masters-swimming-rankings/
```
