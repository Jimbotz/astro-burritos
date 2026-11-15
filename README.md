# EarthScope · Hidden Climate Signals

**Which climate signals are changing, and can we trust them?**

EarthScope finds long-term climate trends in NASA data for almost any place on Earth, and shows the statistical evidence behind each one. When the data cannot support a claim, it says so.

> EarthScope is an independent NASA Space Apps Challenge 2026 project. It is not an official NASA product, and NASA does not endorse it.

- **Live app:** https://earthscope-chi.vercel.app
- **Technical report:** [`reporte/EarthScope_Report_v2.pdf`](reporte/EarthScope_Report_v2.pdf) (LaTeX source: [`reporte/main.tex`](reporte/main.tex))
- **30-second demo video:** [`video/renders/earthscope-30s.mp4`](video/renders/earthscope-30s.mp4)
- **10-minute demo script:** [`docs/demo-script.md`](docs/demo-script.md)

## Contents

1. [The challenge](#the-challenge)
2. [The problem](#the-problem)
3. [Objectives](#objectives)
4. [Who it is for](#who-it-is-for)
5. [How EarthScope solves it](#how-earthscope-solves-it)
   - [What it answers](#what-it-answers)
   - [What it does](#what-it-does)
   - [Why trust it](#why-trust-it)
   - [A one-minute tour](#a-one-minute-tour)
6. [Data sources](#data-sources)
7. [AI tools used](#ai-tools-used)
8. [Run it locally](#run-it-locally)
9. [Deploy](#deploy)
10. [API](#api)
11. [Variables](#variables)
12. [Project layout](#project-layout)
13. [Limitations](#limitations)
14. [Future work](#future-work)
15. [Credits](#credits)
16. [Team](#team)

## The challenge

EarthScope is the entry of team *astro-burritos* to the NASA Space Apps Challenge 2026 challenge [“Be an Earth System Trend Detective!”](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/).

The challenge asks teams to use NASA Earth data to discover **what** is changing, **where**, **how much**, and whether the change is **significant**:

- choose Earth-science variables and get them for a region;
- plot a time series long enough to show a trend;
- compute the rate of change and its significance (for example with a Mann–Kendall test or confidence intervals).

Its intended audience is high-school and college students, so variables need simple definitions and a few worked examples.

## The problem

Open climate data are abundant, but using them correctly is hard. Four obstacles stand between NASA's archives and a trustworthy local answer:

1. **Access and format.** Data come as gridded fields, parameter codes (`T2M`, `PRECTOTCORR`, …) and fill values. Choosing the right variable, endpoint, time standard and aggregation already takes expertise.
2. **Naive statistics overstate change.** Climate series are short and autocorrelated: a warm year tends to follow a warm year. A plain least-squares line or a textbook Mann–Kendall test treats every year as independent, so it reports “significant” trends far too often.
3. **Many tests, many false alarms.** With 13 variables, or dozens of grid cells on a map, some will look significant by chance unless the multiple comparisons are controlled.
4. **Absence of evidence is read as evidence of absence.** When a test finds nothing in 24 years of data, the honest conclusion is “these data cannot detect a trend of this size”, not “nothing has changed”.

There is also a support problem. A reanalysis value describes a grid cell of roughly 55 km × 65 km with its own mean elevation, not a city or a weather station. Calling it “the temperature of Puebla” is misleading.

The result is a gap with two failure modes. Either the data go unused because they are too hard to handle, or they are used carelessly and produce confident claims that do not hold up.

**Why it matters.** Local climate evidence drives concrete decisions: which crops and planting dates to choose, how to size water storage, when to expect heat stress. In regions with few weather stations, satellite and reanalysis products are often the only long, consistent record. And public trust in climate science depends on claims being right: a tool that exaggerates a trend damages that trust.

## Objectives

**General objective.** Build a public web application that lets anyone detect long-term climate trends in NASA data for almost any place on Earth, and judge how much each result can be trusted.

**Specific objectives:**

1. Retrieve NASA POWER data live, with no accounts or keys, for any country or state selected on an interactive globe.
2. Report each trend as a rate per decade with its 95% interval, an autocorrelation-corrected p-value and the minimum detectable trend.
3. Allow the words “increase” or “decrease” only when a trend passes robustness criteria declared in advance.
4. Show the spatial pattern on a map of native grid cells, with field-wide control of false discoveries.
5. Cross-check results against a second NASA rain record and a second place.
6. Offer an exploratory projection only when it passes an out-of-sample skill test, always with its uncertainty.
7. Turn the climate result into two planning lenses (water and heat) for Mexican municipalities, without operational, agronomic or medical instructions.

## Who it is for

- **High-school and college students** (the challenge's audience): a local, plain-language answer, plus a lesson in reading evidence. Why does one trend earn an arrow and another does not? Every underlined term opens a short explanation.
- **Citizens** who want to know what has changed where they live.
- **Teachers and science communicators**, who can share a link to a reproducible result instead of a screenshot of an unknown source.
- **Local planners and agricultural extension workers** in regions with few stations: a consistent 0.5° record with honest uncertainty. The impact lenses target municipal water management and heat-exposure planning.
- **Researchers**, who get a fast first look with the exact NASA requests, the methods and the minimum detectable trend in the evidence file.

## How EarthScope solves it

The guiding principle is that **claims are earned**: every number comes from NASA at request time, and the strength of the wording follows the strength of the evidence.

### What it answers

| Question | How EarthScope answers it |
|---|---|
| **What** is changing? | 13 processed variables from NASA POWER: temperature, extremes, warm days and nights, rain, humidity and soil wetness |
| **Where**? | Any country or state on a 3D globe and a 2D map of native NASA POWER cells (0.5° × 0.625°) |
| **How much**? | A rate per decade with its 95% interval, and the smallest trend these data could detect |
| **Is it significant**? | Five robustness checks before any “increase” or “decrease” appears. A second NASA rain record and a second place cross-check the result |

### What it does

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
5. **Impact lenses.** Two planning lenses on top of the climate result (`GET /api/impact`):
   - **Water Signal** (municipal water management): precipitation, FAO-56 reference evapotranspiration (ET0), the climate water balance, root-zone wetness and the CONAGUA Drought Monitor, validated against SMN stations.
   - **Heat Signal** (heat exposure): warm days and nights (TX90p, TN90p) corroborated by the annual extremes (TXx, TNn), kept separate from INEGI 2020 population exposure.

   Each lens returns one of five states (insufficient data, no detectable signal, watch, planning signal, corroborated signal). With it come the components behind the state, a suggested planning action that is never a command, indicator cards, thematic maps for Puebla, Tlaxcala and Oaxaca, its sources and what it cannot conclude. See [`docs/backend/impact-lenses.md`](docs/backend/impact-lenses.md).
6. **Exploratory projection.** For four variables (T2M, TXx, TNn, precipitation), one straight line is fitted per cell and animated 10 years past the data.
   - It is drawn only when the line beats the plain average on held-out years.
   - It always shows a 95% prediction interval and its warnings, and every year past the data is labelled as extrapolated.

The URL keeps the query, including the comparison place, so any result can be shared as a link.

### Why trust it

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
- **The statistics are checked.** They are a TypeScript port of a Python reference written during the data audit, and the tests assert that both give the same numbers on the real Puebla and Tehuacán series.

### A one-minute tour

1. **Warming that passes every test.** Puebla, Mexico, 2001–2024:
   - mean air temperature rose **+0.45 °C per decade** (95% interval +0.23 to +0.70; Hamed–Rao p = 0.009);
   - warm nights rose **+5.5 percentage points per decade**;
   - both pass all 5 robustness checks.
2. **Same signal in a second place.** Tehuacán, about 110 km to the southeast, shows the same signal for mean temperature (+0.62 °C per decade). Warm days (TX90p) rise detectably in Tehuacán but not in Puebla: part of the signal is shared, part is local.
3. **Two NASA records disagree on rain.** In Tlaxcala, the MERRA-2 rain record alone shows a rise of +185 mm per decade (p < 0.001). The satellite-based GPM IMERG record of the same cell shows −27 mm per decade (not significant), and their 95% intervals do not overlap. EarthScope labels this **Disagree** and makes no rain claim.
4. **“No trend detected” is not “no change”.** When a test finds nothing, EarthScope shows how large a trend would have to be before these years could detect it.

Each of these is one click: the **Try an example** buttons, or the links in the [demo script](docs/demo-script.md).

## Data sources

Every source is public and needs no login, key or token. EarthScope uses no data from the Space Apps partner space agencies.

### Live: requested at run time

| Source | Product | Use |
|---|---|---|
| [NASA POWER](https://power.larc.nasa.gov/) API v2.10 ([docs](https://power.larc.nasa.gov/docs/services/api/)), NASA Langley Research Center | [MERRA-2](https://gmao.gsfc.nasa.gov/gmao-products/merra-2/) reanalysis (NASA GMAO) through the `monthly/point`, `daily/point` and `monthly/regional` endpoints; native cell 0.5° × 0.625°; from 1981. Solar radiation comes from CERES SYN1deg (from 2001) and GEWEX SRB (before) | Every variable, the map grid, the projection and the daily series of the impact lenses |
| [GPM IMERG](https://gpm.nasa.gov/data/imerg) monthly precipitation, NASA Global Precipitation Measurement mission, through the same POWER API (`IMERG_PRECTOT`) | 0.1° pixels, served only in UTC, from 1998 | The second rain record of the cross-check card |

### Bundled public snapshots: impact lenses

These files were downloaded on 2026-11-15 and are shipped as processed subsets. Each one records its URL, download date and SHA-256 in [`data/impact/manifests/`](data/impact/manifests/). The raw downloads (about 600 MB) are git-ignored and can be rebuilt with `scripts/impact/` (see [Run it locally](#regenerate-the-bundled-data-optional)).

| Source | Product | Use |
|---|---|---|
| CONAGUA / SMN, Base de Datos Climatológica Nacional (`smn.conagua.gob.mx/tools/RESOURCES/Normales_Climatologicas/Diarios/<state>/dia<id>.txt`) | Daily station records, 45 stations, 1981–2025 | Water lens: validation of POWER rain |
| [CONAGUA / SMN, Monitor de Sequía de México](https://smn.conagua.gob.mx/tools/RESOURCES/Monitor%20de%20Sequia%20en%20Mexico/MunicipiosSequia.xlsx) | Municipalities in drought, 2,478 municipalities, 2003-01-31 to 2026-10-31 | Water lens: observed drought per municipality |
| [INEGI, Censo de Población y Vivienda 2020, ITER](https://www.inegi.org.mx/contenidos/programas/ccpv/2020/datosabiertos/iter/iter_00_cpv2020_csv.zip) | Main results by locality: 189,432 localities, 2,469 municipalities | Heat lens: exposed population and urban share |
| [INEGI, Marco Geoestadístico 2020](https://www.inegi.org.mx/temas/mg/) | Municipal areas of Puebla (217), Tlaxcala (60) and Oaxaca (570) | Municipal outlines of the lens maps |

### Offline validation

| Source | Product | Use |
|---|---|---|
| [NOAA GHCN-Daily](https://www.ncei.noaa.gov/products/land-based-station/global-historical-climatology-network-daily), NOAA NCEI | Public station files: Puebla airport and Tlaxcala | Check of POWER against stations. Maximum temperature agrees; rain barely does |

### Methods (not observations)

- **FAO-56 Penman–Monteith** ([Allen et al., 1998](https://www.fao.org/4/X0490E/x0490e0b.htm)): reference evapotranspiration (ET0) of the water lens.
- **Trend and multiple-testing statistics:** Mann (1945), Kendall (1975), Hamed & Rao (1998), Sen (1968), Gilbert (1987), Yue et al. (2002), Benjamini & Hochberg (1995) and Wilks (2016). Full references are in the [technical report](reporte/EarthScope_Report_v2.pdf).

### Maps and imagery (visual only, never data)

| Source | Use |
|---|---|
| [Natural Earth](https://www.naturalearthdata.com/) (public domain): countries at 1:50m, states and provinces at 1:10m | Globe outlines, place selectors, the 2D map and the server-side area lookup |
| [NASA Blue Marble](https://science.nasa.gov/earth/earth-observatory/collections/blue-marble/), NASA Earth Observatory | Globe texture, through the example images of `three-globe` |

### Planned, optional and excluded

| Status | Source | Why |
|---|---|---|
| **Planned** | MODIS/VIIRS vegetation and land-surface temperature through the ORNL DAAC subset service (no login) | Vegetation and urban-heat trends |
| **Planned** | KNMI Climate Explorer (anonymous use) | A manual audit of one result against a named reference dataset |
| **Optional, not used** | Open-Meteo Historical Weather API (ERA5 / ERA5-Land) | Possible comparison. The app does not use it and works without it |
| **Excluded** | Giovanni, AppEEARS, GES DISC (direct IMERG, GLDAS), Hydrology Time Series | They need a NASA Earthdata login. The same products are reached through open routes: IMERG through POWER, MODIS through ORNL |
| **Excluded** | NOAA CDO API v2 | It needs a token. GHCN-Daily is used through its public files instead |

More detail: [`docs/backend/data-sources-no-auth.md`](docs/backend/data-sources-no-auth.md) (impact-lens sources and their quality checks), [`docs/science/dataset-provenance.md`](docs/science/dataset-provenance.md) and [`docs/roadmap/data-strategy.md`](docs/roadmap/data-strategy.md).

## AI tools used

The team used generative AI as a development assistant. **EarthScope contains no language model at runtime**: headlines, verdicts and lens states follow deterministic, documented rules.

| Tool | Maker | Where it was used | How |
|---|---|---|---|
| Claude Code | Anthropic | Application code, API routes, interface components, tests and the TypeScript port of the Python statistics; the data-audit and threshold-sensitivity scripts; the HyperFrames composition and recording scripts of the demo video | Proposed and refactored code and scripts, which the team reviewed, ran and tested |
| Gemini | Google | Application code, tests and the statistics port | Proposed and refactored code, which the team reviewed, ran and tested |
| Codex | OpenAI | Application code, tests and the statistics port | Proposed and refactored code, which the team reviewed, ran and tested |

**Safeguards:**

- **No AI-generated data.** Every climate value comes from NASA POWER at request time. AI never produced, filled in or adjusted climate values.
- **Numerical checks.** Tests assert agreement between the TypeScript statistics and the independent Python reference on real series, and replay real NASA responses. A change that alters a published number fails the tests.
- **Rules fixed in advance.** The robustness criteria, the concordance rules and the projection skill test were declared before seeing results and were not retuned. Their sensitivity is measured and published.
- **Human review.** Team members reviewed, ran and tested all AI-assisted code and analyses before merging, and checked the scientific statements against the cited methods and sources.
- **No generated media.** No image, video or voice generation model was used. Screenshots and demo footage are real captures of the running app with live NASA data. No AI-generated content uses or modifies NASA branding.

The full statement is chapter 7 of the [technical report](reporte/EarthScope_Report_v2.pdf).

## Run it locally

### Requirements

- Git.
- Node.js **22.18 or newer** (check with `node -v`).
- pnpm 12. `corepack enable` installs the exact version declared in `package.json`. Without Corepack, replace `pnpm` with `npx pnpm@12.3.4` in the commands below.
- Internet access: data are requested live from NASA POWER.

No API keys, accounts or environment variables are needed.

### Steps

1. **Clone the repository.**

   ```bash
   git clone https://github.com/Jimbotz/astro-burritos.git
   cd astro-burritos
   ```

2. **Install the dependencies.**

   ```bash
   corepack enable
   pnpm install
   ```

3. **Start the development server.**

   ```bash
   pnpm dev
   ```

   Open http://localhost:3000. A first visit opens on Puebla, already analyzed. Pick another place, period or variable and press **Analyze**.

4. **Run the checks (optional).**

   ```bash
   pnpm test           # vitest: statistics, services and routes on saved real POWER responses (works offline), rendered components
   pnpm lint           # ESLint (Next.js core-web-vitals + TypeScript)
   pnpm exec tsc --noEmit
   ```

5. **Run a production build (optional).**

   ```bash
   pnpm build          # production build with type checking
   pnpm start          # http://localhost:3000
   ```

### Run with Docker

```bash
docker build -t earthscope .
docker run --rm -p 3000:3000 earthscope   # http://localhost:3000
```

The container also needs internet access, because data are requested live from NASA POWER.

### Regenerate the bundled data (optional)

The repository already contains every processed file the app needs. Run these only to rebuild them from the original sources. They need curl, unzip, npm and Python 3 (standard library only).

```bash
bash scripts/build-geo.sh                              # Natural Earth boundaries → public/geo/
bash scripts/impact/fetch-raw.sh                       # INEGI + Drought Monitor (≈ 420 MB, no login)
python -I scripts/impact/smn_catalog.py                # SMN station catalog
python -I scripts/impact/ingest_public.py population drought geometry stations manifests
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/ts-resolve.mjs scripts/impact/preprocess-power.ts   # per-cell POWER snapshot
```

### Troubleshooting

- **Port 3000 is busy:** `pnpm dev -p 3001`.
- **An error about NASA POWER:** POWER was down or too slow. Press retry. The app never falls back to stored values.
- **429 Too Many Requests:** the per-client rate limit. Wait the seconds given in `Retry-After`.

## Deploy

- **Vercel:** import the repository at vercel.com/new. It needs no settings or environment variables, and every push to `main` deploys.
- **Any Docker host** (Render, Fly.io, Google Cloud Run, a VPS): build the image above and expose port 3000. Put it behind a proxy that sets `X-Forwarded-For`, or the per-client rate limit treats every visitor as one client.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/variables` | Catalog: 13 variables, processing profiles, rules, verdict labels |
| `GET /api/point?latitude=19.04&longitude=-98.2&startYear=2001&endYear=2024` | All variables for one native cell (one monthly and one daily POWER request) |
| `GET /api/crosscheck?latitude=19.40&longitude=-98.16&startYear=2001&endYear=2024` | MERRA-2 vs. GPM IMERG rain for one cell: level, year-to-year agreement, trend agreement and reasons |
| `GET /api/impact?lens=water&country=MEX&state=Puebla` · `?lens=heat&municipalityCode=21156` · `POST /api/impact` | Impact lenses: decision support, indicators, map layers, sources and limits |
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
components/          Client UI (globe, 2D map, projection panel, cross-check cards, impact lenses, evidence file)
lib/analysis/        Statistics: annual rules, robust trends, region/field FDR, projection, concordance, IMERG footprint, FAO-56 ET0, water and heat lenses
lib/api/             API v2 contract, validation, services, area lookup, rate limit
lib/nasa/            NASA POWER client (MERRA-2 point, daily, regional tiles; IMERG box; retries; cancellation)
lib/data/            Bundled CONAGUA/SMN and INEGI data, municipal geometry and source manifests (impact lenses)
lib/variables/       Variable catalog, the single source of truth
data/impact/         Impact-lens manifests, processed public subsets and test fixtures (raw downloads are git-ignored)
docs/                API guide, audit, methodology, validation protocol, threshold sensitivity, demo script
scripts/             Geo build and check, threshold sensitivity, impact-lens ingestion (scripts/impact/)
tests/               Vitest suites and saved NASA POWER fixtures
reporte/             Technical report (LaTeX source, figures and compiled PDF)
video/               30-second demo video (HyperFrames project, separate from the app build)
```

## Limitations

**Climate data**

- At 0.5° × 0.625°, a single cell can mix a valley and a mountain range, so local stations can differ by several degrees. In Tlaxcala the cell is about 290 m higher than the station, and POWER underestimates the night-time warming measured there, while maximum temperature agrees.
- 24 years is short. Many trends are “not detectable” because the minimum detectable trend is larger than the signal, not because nothing changed.
- MERRA-2 rain captures the seasonal cycle but poorly reproduces year-to-year changes, so precipitation is shown without trend claims.
- MERRA-2 and IMERG are only partly independent: both lean on rain gauges, and IMERG uses MERRA-2 fields. Agreement supports a result; it does not prove it.
- IMERG changed satellite constellations in 2014 (TRMM to GPM). A rain trend that crosses that year can come from the instruments. The card says so when the period crosses it.
- POWER serves IMERG only in UTC and MERRA-2 in local solar time. Monthly totals differ only by the hours at month boundaries.
- The projection is a straight line. It shows where the recent trend points, with its uncertainty. It cannot anticipate changes of rate, has no physics in it and is not a climate forecast.

**Impact lenses**

- Their bundled data (INEGI, CONAGUA/SMN) cover Mexico, and their municipal maps cover only Puebla, Tlaxcala and Oaxaca.
- Water: the climate water balance is an estimate, not the water physically available in dams or aquifers. Root-zone wetness comes from a land-surface model (MERRA-2), not soil measurements. ET0 is the demand of a reference grass (FAO-56), not of the actual crop or vegetation.
- Heat: it is not a medical diagnosis. Exposure is the 2020 census population, with no vulnerability, age, housing or access to shade. The urban heat island is not resolved at this scale.
- The lenses are planning signals to prioritize monitoring, research and preparedness. They never give operational, agronomic or medical instructions.

## Future work

- Add MODIS/VIIRS vegetation and land-surface temperature through the ORNL DAAC subset service (no login), to study vegetation and urban-heat trends.
- A multi-source pipeline that aligns several NASA products on a common window ([`docs/roadmap/data-strategy.md`](docs/roadmap/data-strategy.md); `lib/analysis/common-window.ts` is its first piece).
- A manual audit of selected results against named reference datasets, such as the KNMI Climate Explorer.
- More station validation outside central Mexico.

## Credits

- **Data:** NASA POWER (MERRA-2 and GPM IMERG), CONAGUA/SMN, INEGI and NOAA NCEI GHCN-Daily (see [Data sources](#data-sources)). Boundaries: Natural Earth.
- **Open-source code:** [Next.js](https://nextjs.org/) 16 and [React](https://react.dev/) 19; [three-globe](https://github.com/vasturiano/three-globe) and [react-globe.gl](https://github.com/vasturiano/react-globe.gl) on [three.js](https://threejs.org/); [SWR](https://swr.vercel.app/); [Tailwind CSS](https://tailwindcss.com/) 4, [shadcn/ui](https://ui.shadcn.com/), [Base UI](https://base-ui.com/) and [Lucide](https://lucide.dev/); [Vitest](https://vitest.dev/), [ESLint](https://eslint.org/) and [TypeScript](https://www.typescriptlang.org/).
- **Demo video:** [HyperFrames](https://hyperframes.heygen.com), [GSAP](https://gsap.com/), [FFmpeg](https://ffmpeg.org/) and [Playwright](https://playwright.dev/).
- **Fonts:** Fira Sans, Overpass and Fira Code, the Space Apps brand typefaces ([Google Fonts](https://fonts.google.com/)).
- **Globe textures** (`public/textures`):
  - `earth-blue-marble-4k.jpg`, `earth-water.png`, `earth-topology.png` and `earth-night.jpg` (not used) are byte-identical to the example images of the `three-globe` package (v2.45.6). The Blue Marble image is NASA imagery.
  - `earth-blue-marble.jpg` and `earth-topology.jpg` are smaller versions added in the first commit.
  - The source of `earth-clouds-4k.webp` is not recorded yet.

## Team

NASA Space Apps Challenge 2026 team *astro-burritos*:

- Jayme Said Barbosa Hernández
- Guillermo Carreto Sánchez
- Juan Carlos Flores Mora
- Samuel Soriano Chávez
