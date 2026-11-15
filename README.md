# EarthScope · Hidden Climate Signals

EarthScope finds long-term climate trends in NASA data for any place or region, and shows the statistical evidence behind each one. It was built for the NASA Space Apps Challenge 2026 challenge [“Be an Earth System Trend Detective!”](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/).

> EarthScope is an independent Space Apps project. It is not an official NASA product, and NASA does not endorse it.

## What it does

1. **Pick a place and a variable.** Choose a country or state on the 3D globe or in the lists, a period (2001–2024 by default), one of 13 processed climate variables and a map layer.
2. **Press Analyze.** The server fetches NASA POWER (MERRA-2) data and returns, for the analysis point:
   - a plain-language headline;
   - the annual series with gaps for incomplete years;
   - the trend with its verdict (robust, probable, weak or no detectable trend) and the minimum trend these data could detect;
   - seasonal sub-series and the evidence file.
3. **See it on the map.** The 2D map colors every native NASA POWER cell (0.5° × 0.625°) inside the state with the recent anomaly, the trend per decade or the average. Cells with a trend that is significant across the field are outlined.
4. **Exploratory projection.** For four variables (T2M, TXx, TNn, precipitation), one straight line is fitted per cell. The animation runs through the data years and 10 years past them, colored by value or by change since the last data year. It is drawn only when the line beats the plain average on held-out years. It always comes with a 95 % prediction interval and its warnings, and every year past the data is labelled as extrapolated.

The demo examples (warming in Puebla, coldest nights in Tlaxcala, rain in Oaxaca) fill in a query in one click. The URL keeps the query, so a result can be shared as a link.

## Why trust it

- **No mock data.** Every number comes from NASA POWER at request time. If POWER fails, the page shows the error and a retry button, never fixture values.
- **Claims are earned.** “Increase” or “decrease” appears only when the trend survives five robustness checks:
  - Hamed–Rao Mann–Kendall corrected for autocorrelation, with Benjamini–Hochberg across variables;
  - a block-bootstrap or Gilbert interval;
  - trend-free prewhitening;
  - a jackknife;
  - a second window.

  Otherwise the page says “weak signal” or “no trend detectable with these data”, and shows the minimum detectable trend. It never says “no change”.
- **Honest support.** Each value represents a MERRA-2 cell with its mean elevation, not a city or a station.
- **Precipitation without trend claims.** POWER reproduces the seasonal cycle of rain but not its year-to-year variation. The audit found an annual correlation of 0.33 and 0.12 with GHCN stations, and the sign of the trend depends on the start year. Rain is therefore shown as series, anomalies and climatology only.
- **The projection has to pass a test.** It must improve on the mean by at least 10 % across two rolling 5-year windows (2015–2019 and 2020–2024), and must not lose to the mean in the latest one. Curvature, growing scatter and interval undercoverage are reported as warnings.
- **The thresholds are checked.** [`docs/science/threshold-sensitivity.md`](docs/science/threshold-sensitivity.md) measures how each threshold would change the results.

## Quick start

Requirements: Node ≥ 22.18 and pnpm 12 (`corepack enable` or `npx pnpm@12.3.4`).

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm test           # vitest: statistics, services and routes on saved real POWER responses, rendered components
pnpm lint           # ESLint (Next.js core-web-vitals + TypeScript)
pnpm build          # production build with type checking
```

No API keys are needed. NASA POWER is public.

### Run with Docker

```bash
docker build -t earthscope .
docker run --rm -p 3000:3000 earthscope   # http://localhost:3000
```

The container needs internet access, because data is requested live from NASA POWER.

### Deploy

- **Vercel:** import the repository at vercel.com/new. It needs no settings or environment variables, and every push to `main` deploys.
- **Any Docker host** (Render, Fly.io, Google Cloud Run, a VPS): build the image above and expose port 3000. Put it behind a proxy that sets `X-Forwarded-For`, or the per-client rate limit treats every visitor as one client.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/variables` | Catalog: 13 variables, processing profiles, rules, verdict labels |
| `GET /api/point?latitude=19.04&longitude=-98.2&startYear=2001&endYear=2024` | All variables for one native cell (one monthly and one daily POWER request) |
| `GET /api/region?variable=T2M&country=MEX&state=Puebla` | Map grid for a state or country by id. The CDN caches it for 24 h |
| `GET /api/region?variable=T2M&minLat=…&maxLat=…&minLon=…&maxLon=…` | Map grid for a bounding box |
| `POST /api/region` | Map grid for any GeoJSON polygon |
| `GET /api/series` | Legacy T2M/precipitation endpoint. Deprecated in favor of `/api/point` |

Every error comes back as `{ "error": "…" }` with an HTTP status code.
- Regions above about 2,500 cells get 413, and regions that cross the antimeridian get 422.
- Analyses that miss the cache are limited per client (429 with `Retry-After`).
- A cancelled request stops the remaining NASA POWER calls.

The full contract is in [`docs/backend/api-v2.md`](docs/backend/api-v2.md), and the TypeScript types are in [`lib/api/v2.ts`](lib/api/v2.ts).

## Variables

| Map and point | Point only (daily data) |
|---|---|
| Mean temperature (T2M) · Diurnal range · Hottest day (TXx) · Coldest night (TNn) · Annual precipitation · Wet-season rain · Specific humidity · Relative humidity · Root-zone soil wetness | Mean daily maximum and minimum · Warm days (TX90p) · Warm nights (TN90p) |

The audit evaluated 17 more variables and excluded them. Examples are product changes in cloud and radiation records, non-homogenized wind and pressure, and unreliable daily rain indices. Each exclusion has its reason in `lib/variables/catalog.ts`.

## Project layout

```text
app/                 Next.js App Router: one page, API routes, error and not-found pages
components/          Client UI (globe, 2D map, projection panel, evidence file)
lib/analysis/        Statistics: annual rules, robust trends, region/field FDR, projection, line diagnostics
lib/api/             API v2 contract, validation, services, area lookup, rate limit
lib/nasa/            NASA POWER client (point, daily, regional tiles; retries; cancellation)
lib/variables/       Variable catalog, the single source of truth
docs/                API guide, audit, methodology, validation protocol, threshold sensitivity
scripts/             Geo build and check, threshold sensitivity
tests/               Vitest suites and saved NASA POWER fixtures
```

## Data sources

| Source | Status |
|---|---|
| NASA POWER (MERRA-2), monthly, daily and regional | In use for every value |
| GPM IMERG Final V07 (0.1°) | Planned: independent rain record (needs a NASA Earthdata login) |
| MODIS vegetation, GLDAS soil moisture | Planned |
| GHCN-Daily stations | Offline validation (temperature agrees; rain does not, see above) |

Boundaries come from Natural Earth (public domain).

## Limitations

- At 0.5° × 0.625°, a single cell can mix a valley and a mountain range, so local stations can differ by several degrees.
- 24 years is short. Many trends are “not detectable” because the minimum detectable trend is larger than the signal, not because nothing changed.
- The projection is a straight line. It shows where the recent trend points, with its uncertainty. It is not a climate forecast and has no physics in it.

## Team

NASA Space Apps Challenge 2026 team *astro-burritos*.
