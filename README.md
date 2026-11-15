# EarthScope · Hidden Climate Signals

**Which climate signals are changing, and can we trust them?**

EarthScope finds long-term climate trends in NASA data for almost any place on Earth, and shows the statistical evidence behind each one. When the data cannot support a claim, it says so. It was built for the NASA Space Apps Challenge 2026 challenge [“Be an Earth System Trend Detective!”](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/).

> EarthScope is an independent Space Apps project. It is not an official NASA product, and NASA does not endorse it.

**Live app:** https://earthscope-chi.vercel.app · **10-minute demo script:** [`docs/demo-script.md`](docs/demo-script.md)

## What it answers

The challenge asks four questions. EarthScope answers each one with NASA data and says how much to trust the answer.

| Question | How EarthScope answers it |
|---|---|
| **What** is changing? | 13 processed variables from NASA POWER: temperature, extremes, warm days and nights, rain, humidity and soil wetness |
| **Where**? | Any country or state on a 3D globe and a 2D map of native NASA POWER cells (0.5° × 0.625°) |
| **How much**? | A rate per decade with its 95% interval, and the smallest trend these data could detect |
| **Is it significant**? | Five robustness checks before any “increase” or “decrease” appears. A second NASA rain record and a second place cross-check the result |

## A one-minute tour

1. **Warming that passes every test.** Puebla, Mexico, 2001–2024:
   - mean air temperature rose **+0.45 °C per decade** (95% interval +0.23 to +0.70; Hamed–Rao p = 0.009);
   - warm nights rose **+5.5 percentage points per decade**;
   - both pass all 5 robustness checks.
2. **Same signal in a second place.** Tehuacán, about 110 km to the southeast, shows the same signal for mean temperature (+0.62 °C per decade). Warm days (TX90p) rise detectably in Tehuacán but not in Puebla: part of the signal is shared, part is local.
3. **Two NASA records disagree on rain.** In Tlaxcala, the MERRA-2 rain record alone shows a rise of +185 mm per decade (p < 0.001). The satellite-based GPM IMERG record of the same cell shows −27 mm per decade (not significant), and their 95% intervals do not overlap. EarthScope labels this **Disagree** and makes no rain claim.
4. **“No trend detected” is not “no change”.** When a test finds nothing, EarthScope shows how large a trend would have to be before these years could detect it.

Each of these is one click: the **Try an example** buttons, or the links in the [demo script](docs/demo-script.md).

## What it does

1. **Pick a place and a variable.** Choose a country or state on the 3D globe or in the lists, a period (2001–2024 by default), one of 13 processed climate variables and a map layer.
2. **Press Analyze.** The server fetches NASA POWER data and returns, for the analysis cell:
   - a plain-language headline;
   - the annual series with gaps for incomplete years;
   - the trend with its verdict (robust, probable, weak or no detectable trend) and its minimum detectable trend;
   - seasonal sub-series and the evidence file.
3. **See it on the map.** The 2D map colors every native NASA POWER cell inside the state with the recent anomaly, the trend per decade or the average. Cells whose trend is significant across the field are outlined.
4. **Cross-check the signal.** Two cards test whether the result holds up:
   - **Two NASA rain records.** MERRA-2 against GPM IMERG for the same cell, both from the NASA POWER API. The card asks three questions: same amount, same wet and dry years, same trend. Its verdict is **Agree**, **Disagree** or **Inconclusive**, with the reasons to trust it or not.
   - **Two places, same rules.** The same variable, period and tests at a second place (Puebla vs. Tehuacán by default). Is the signal local or shared?
5. **Exploratory projection.** For four variables (T2M, TXx, TNn, precipitation), one straight line is fitted per cell and animated 10 years past the data.
   - It is drawn only when the line beats the plain average on held-out years.
   - It always shows a 95% prediction interval and its warnings, and every year past the data is labelled as extrapolated.

The URL keeps the query, including the comparison place, so any result can be shared as a link.

## Why trust it

- **No mock data.** Every number comes from NASA POWER at request time. If POWER fails, the page shows the error and a retry button, never stored values.
- **Claims are earned.** “Increase” or “decrease” appears only when the trend survives five robustness checks:
  - Hamed–Rao Mann–Kendall corrected for autocorrelation, with Benjamini–Hochberg across the 13 variables;
  - a block-bootstrap or Gilbert interval that excludes zero;
  - trend-free prewhitening;
  - a jackknife;
  - a second window.

  Otherwise the page says “weak signal” or “no trend detectable with these data”, and shows the minimum detectable trend. It never says “no change”.
- **A second opinion for rain.** POWER reproduces the seasonal cycle of rain but barely its year-to-year changes: against GHCN stations, the annual correlation was 0.33 and 0.12. So rain never gets a trend claim. The rain card shows whether a satellite-based NASA record (GPM IMERG) agrees.
- **Rules fixed in advance.**
  - A record detects a trend when its Hamed–Rao p < 0.05.
  - Two records **agree** when both detect a trend of the same sign with overlapping 95% intervals.
  - They **disagree** when the signs are opposite or the intervals do not overlap.
  - Anything else is **inconclusive**.
  - The same rules compare two places.
- **Honest support.** Each value represents a 0.5° × 0.625° MERRA-2 cell with its mean elevation, not a city or a station. IMERG’s 0.1° pixels are averaged over that same cell before the comparison.
- **The projection has to pass a test.** It must improve on the mean by at least 10% across two rolling 5-year windows and must not lose to it in the latest one.
- **The thresholds are checked.** [`docs/science/threshold-sensitivity.md`](docs/science/threshold-sensitivity.md) measures how each threshold would change the results.

## Data sources

Every source the app uses is public and needs no login or key.

| Status | Source | Use |
|---|---|---|
| **Live now** | [NASA POWER](https://power.larc.nasa.gov/) API v2.10: MERRA-2 (monthly, daily and regional) | Every variable, the map grid and the projection |
| **Live now** | GPM IMERG monthly precipitation, through the same NASA POWER API (`IMERG_PRECTOT`, 0.1°, 1998 onward) | The second rain record of the cross-check card |
| **Validation** | NOAA GHCN-Daily stations (Puebla airport, Tlaxcala), public NCEI files | Offline check: maximum temperature agrees; rain barely does |
| **Planned** | MODIS/VIIRS vegetation and land-surface temperature through the ORNL DAAC subset service (no login) | Vegetation and urban-heat trends |
| **Planned** | KNMI Climate Explorer (anonymous use) | A manual audit of one result against a named reference dataset |
| **Not used** | Giovanni, AppEEARS, Hydrology Time Series | They need a NASA Earthdata login. The same products are reached through open routes: IMERG through POWER, MODIS through ORNL |

Boundaries come from Natural Earth (public domain). The full source review is in [`docs/roadmap/data-strategy.md`](docs/roadmap/data-strategy.md) and [`docs/science/dataset-provenance.md`](docs/science/dataset-provenance.md).

## Quick start

Requirements: Node ≥ 22.18 and pnpm 12 (`corepack enable` or `npx pnpm@12.3.4`).

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm test           # vitest: statistics, services and routes on saved real POWER responses, rendered components
pnpm lint           # ESLint (Next.js core-web-vitals + TypeScript)
pnpm build          # production build with type checking
```

No API keys or accounts are needed.

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
| `GET /api/crosscheck?latitude=19.40&longitude=-98.16&startYear=2001&endYear=2024` | MERRA-2 vs. GPM IMERG rain for one cell: level, year-to-year agreement, trend agreement and reasons |
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
components/          Client UI (globe, 2D map, projection panel, cross-check cards, evidence file)
lib/analysis/        Statistics: annual rules, robust trends, region/field FDR, projection, concordance, IMERG footprint
lib/api/             API v2 contract, validation, services, area lookup, rate limit
lib/nasa/            NASA POWER client (MERRA-2 point, daily, regional tiles; IMERG box; retries; cancellation)
lib/variables/       Variable catalog, the single source of truth
docs/                API guide, audit, methodology, validation protocol, threshold sensitivity, demo script
scripts/             Geo build and check, threshold sensitivity
tests/               Vitest suites and saved NASA POWER fixtures
```

## Limitations

- At 0.5° × 0.625°, a single cell can mix a valley and a mountain range, so local stations can differ by several degrees.
- 24 years is short. Many trends are “not detectable” because the minimum detectable trend is larger than the signal, not because nothing changed.
- MERRA-2 and IMERG are only partly independent: both lean on rain gauges, and IMERG uses MERRA-2 fields. Agreement supports a result; it does not prove it.
- IMERG changed satellite constellations in 2014 (TRMM to GPM). A rain trend that crosses that year can come from the instruments. The card says so when the period crosses it.
- POWER serves IMERG only in UTC and MERRA-2 in local solar time. Monthly totals differ only by the hours at month boundaries.
- The projection is a straight line. It shows where the recent trend points, with its uncertainty. It is not a climate forecast and has no physics in it.

## Credits

- Climate data: NASA POWER (MERRA-2 and GPM IMERG). Station validation: NOAA NCEI GHCN-Daily. Boundaries: Natural Earth.
- Globe textures (`public/textures`):
  - `earth-blue-marble-4k.jpg`, `earth-water.png`, `earth-topology.png` and `earth-night.jpg` (not used) are byte-identical to the example images of the `three-globe` package (v2.45.6). The Blue Marble image is NASA imagery.
  - `earth-blue-marble.jpg` and `earth-topology.jpg` are smaller versions added in the first commit.
  - The source of `earth-clouds-4k.webp` is not recorded yet.

## Team

NASA Space Apps Challenge 2026 team *astro-burritos*:

- Guillermo Carreto Sánchez
- Jayme Said Barbosa Hernández
- Samuel Soriano Chávez
