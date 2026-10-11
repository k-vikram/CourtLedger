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

The next layer can replace only the storage adapter with Google Sheets API access. The match data shape and all statistics calculations can remain unchanged.
