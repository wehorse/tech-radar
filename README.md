# wehorse Tech Radar

Our engineering technology choices and adoption status.

## Run locally

Requires Node.js 24 or later.

```sh
nvm use
npm ci
npm run dev
```

Open http://127.0.0.1:5173.

## Checks and build

```sh
npm test
npm run build
npm run preview
```

## Update the radar

Edit `src/data/radar.json`. Update `edition` and `reviewedAt` for each review, and set movement markers relative to the previous edition.

## Deploy

In GitHub **Settings → Pages**, select **GitHub Actions** as the source. Pushes to `master` run checks and deploy the site. The production output is `dist/`.
