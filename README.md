# Court Ledger

A free, private, installable badminton doubles tracker. This first version stores results in the browser's IndexedDB on the current device, with JSON backup and restore.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The static production site is written to `dist/`.

## Use it

1. Open the app on a phone.
2. Tap **Add match**.
3. Either use the keyboard microphone or type: `Bharat and Vikram beat Gaurav and Sagar 21 17`.
4. Check the editable result card and tap **Confirm result**.
5. Export a JSON backup regularly from **History**. An Excel workbook with the standings, pairing matrix, and raw match ledger is also available.

## Private test lab

Open `/secret-test` directly to exercise the layout with realistic data without touching the live ledger. It can:

- load a built-in 30-day fixture (165 games; five or six games per day);
- download that fixture as JSON or Excel; and
- upload an edited Court Ledger JSON backup or an Excel file containing a `Matches` sheet.

The route is deliberately not linked from the app and never reads from or writes to the live IndexedDB ledger. It is a UI test tool, not an access-control boundary; anyone who knows the URL can open it.

The app deliberately calculates standings and teammate-pair results from individual match records; it never keeps editable aggregate totals.

## Deploy to Cloudflare Pages

1. Put this directory in a GitHub repository.
2. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git**.
3. Choose the repository and configure:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node version: `22`
4. Deploy. The app will receive a free `pages.dev` URL and can be installed from a mobile browser.

No Cloudflare environment variables are required for this personal local-storage version.

## Data and privacy

- Match data is stored only in the browser on the current device.
- Clearing browser/site data removes the local ledger, so use JSON export before moving phones or clearing browser data.
- There are no accounts, analytics, network data writes, or AI API costs.

## Planned shared upgrade

The `feature/cloudflare-d1-api` branch introduces a Cloudflare Workers API through same-origin Pages Functions and D1 as the canonical shared match database. IndexedDB remains a local cache. Google Sheets backup and Google login are deliberately deferred to later phases.

See [Shared backend architecture](docs/shared-backend-architecture.md) for the proposed API, security model, D1 schema, deployment boundaries, diagrams, and delivery sequence.

### Local shared-backend verification

```bash
npm ci
npm run worker:migrate:local
npm run worker:typecheck
npm run worker:test
npm run build
npx wrangler pages functions build --outdir /tmp/court-ledger-functions
```

Generate Vikram's owner recovery token with `npm run worker:generate-owner-token`. Save the raw token in a password manager and place only the displayed SHA-256 hash in a Git-ignored local `.dev.vars` file or the Cloudflare Pages Preview secret named `OWNER_RECOVERY_TOKEN_HASH`.
