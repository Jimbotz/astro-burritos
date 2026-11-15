# EarthScope reproduction guide

## Run locally

```bash
pnpm install
pnpm test
pnpm build
pnpm dev
```

Open `http://localhost:3000`, keep Puebla and the default period, choose a variable, and press **Analyze region**. The browser calls the local `/api/point` route (every variable at the point) and `GET /api/region?country=…&state=…` (the map grid). Only those server routes call NASA POWER. Responses are cached for one day and include the exact source URLs and retrieval timestamps.

## Verify the scientific path

1. Compare the source URL in the Evidence File with the NASA POWER response.
2. Confirm that monthly `YYYY01`–`YYYY12` values are used and `YYYY13` is not used as an input observation.
3. For precipitation, check that the annual value is the sum of monthly `mm/day × days in month`.
4. Run `pnpm test` and inspect the trend warnings for incomplete years or degenerate residuals.

## Honest fallback

The MVP does not ship a fixture or pretend an offline result is live. If NASA POWER is unavailable, the UI shows an error and retry path. A future offline demo must version a real NASA response with its URL, retrieval time, product metadata, and a persistent `DEMO — illustrative data` label; no mock climate values should be introduced.
