# Court Ledger handover

## Current state

- Production branch: `main`.
- Production URL: <https://court-ledger.pages.dev>.
- The latest Pages build-output fix was merged in `fb21f4d`.
- Match data is local to each browser's IndexedDB. It is not stored in GitHub or Cloudflare.

## Run on a new laptop

```bash
git clone https://github.com/k-vikram/CourtLedger.git
cd CourtLedger
npm ci
npm run build
npm run dev
```

Vite prints the local URL when the development server starts.

## Move match data

Before changing browser, phone, or laptop, open the app's **Settings** tab and choose **Export JSON backup**. Copy that file securely. On the new device, use **Restore JSON backup** from the same tab.

Do not clear browser or site data before exporting: that removes the local ledger.

## Deployment

Cloudflare Pages is connected to GitHub and deploys `main`.

- Build command: `npm run build`
- Build output: `dist`
- Node version: `22`

[`wrangler.toml`](wrangler.toml) records `dist` as the Pages output directory. The CI check `npm run verify:pages-output` ensures the built HTML points to generated assets, not development files such as `/src/main.tsx`.

After merging a production change, check the GitHub Actions build and Cloudflare Pages deployment, then test the public URL in an Incognito window.

## Access on a new laptop

Authenticate GitHub CLI when needed:

```bash
gh auth login
```

Sign into the Cloudflare dashboard in a browser to manage the Pages project. No Cloudflare secret or environment variable is required for this current local-storage version.

## Useful commands

```bash
npm run build
npm run verify:pages-output
npm run dev
git status
```
