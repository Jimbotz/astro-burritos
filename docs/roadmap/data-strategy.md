# EarthScope: objective and multi-source data strategy

## Product objective

EarthScope will answer one auditable question:

> **Between 2001 and the latest complete common year, which temperature, precipitation and vegetation trends are detectable in NASA and reference products over Puebla and Tehuacán, how large are they, where do products agree or disagree after spatial harmonization, and how robust are they to window, autocorrelation and missing-year tests?**

This objective is intentionally narrower than “explain climate change.” EarthScope will describe signals detectable in products, compare products with explicitly partial independence, expose uncertainty and provenance, and avoid causal attribution, alerts and unsupported forecasts. A comparison is not proof that either product is the truth.

The first geographic study is Puebla, Mexico, with Tehuacán as a contrasting semi-arid region. “Puebla” and “Tehuacán” will mean declared municipal or study-area geometries, while the POWER result will retain the coarser MERRA-2 grid-cell footprint. A later region can be added only when its geometry, coverage and source comparability are documented.

## Mandatory source plan

The next data milestone must use more than NASA POWER and must include the following source families from the challenge brief:

| Priority | Source | Role in EarthScope | Variable family | Important boundary |
| --- | --- | --- | --- | --- |
| Current | [NASA POWER Monthly API](https://power.larc.nasa.gov/docs/services/api/temporal/monthly/) | Baseline point series | T2M, PRECTOTCORR | MERRA-2-derived meteorology; not direct satellite measurement |
| Required 1 | [NASA GPM IMERG](https://gpm.nasa.gov/data/imerg), accessed and explored through [Giovanni](https://giovanni.gsfc.nasa.gov/giovanni/) | Higher-resolution precipitation comparison | `GPM_3IMERGM_07` monthly precipitation | Use the exact CMR/GES DISC coverage returned at ingestion. The current common-window candidate is 2001–2024 until the final 2025 months are complete and verified. Independence is partial because IMERG Final uses gauge information and MERRA-2 inputs. |
| Required 2 | [NASA AppEEARS](https://appeears.earthdatacloud.nasa.gov/) | Land-surface time series with quality layers | Primary candidate: Terra MODIS `MOD13Q1.061` NDVI/EVI or `MOD13A3.061`; VIIRS only as an overlap comparison | Do not splice MODIS and VIIRS. Fix one collection, QA rule and minimum valid composites before looking at results. Earthdata authentication and asynchronous extraction may be required. |
| Required 3 | [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/) | True visual context and time-aware map layers | Satellite imagery or pre-rendered science layers | GIBS tiles are visualizations; their colors are not numeric observations for trend tests |
| Required 4 | [NOAA GHCN-Daily](https://www.ncei.noaa.gov/products/land-based-station/global-historical-climatology-network-daily) via HTTPS/Access Data; CDO is optional for discovery | Station reference where coverage exists | Station temperature/precipitation | Station records are not continuous by default. Build a station manifest first; do not claim 2001–2025 validation without >=90% coverage evidence. |
| Audit | [KNMI Climate Explorer](https://climexp.knmi.nl/) | External sanity check for a named dataset | CRU/GPCC/reanalysis reference series when explicitly selected | KNMI is a tool, not a source by itself; record the underlying dataset and avoid counting GHCN twice as an independent source. |
| Supporting | NASADEM | Elevation and valley/mountain stratification | Elevation mask | Use only to define a pre-registered topographic stratum; do not use it as a climate trend source. |
| Deferred | [SWOT](https://www.asc-csa.gc.ca/eng/satellites/swot/) | Possible later water case study | Water surface elevation, area, slope or discharge-derived products | Removed from the MVP: short/irregular coverage and weak fit for Tehuacán/Puebla water questions |
| Conditional | [RADARSAT/Geo.ca and the SAR tutorial](https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial) | Later land/wetness/change case in suitable Canadian regions | SAR backscatter or derived land/water classes | Geographic scope and licensing must be confirmed before inclusion |

Giovanni, AppEEARS and GIBS are access/analysis/visualization services as well as entry points. The canonical bundle must record the underlying dataset and product, not only the service name. POWER and IMERG are complementary products, not fully independent ground truth: both can incorporate gauge information or related atmospheric constraints.

## Deep processing pipeline

Every source will pass through the same five layers. Raw data is immutable; cleaned and derived data are reproducible artifacts.

1. **Ingest/raw:** save the exact request or download URL, response headers, product/version, retrieval time, source model, native resolution, coordinate reference system, time standard, license/attribution and a checksum. Store the original file or a documented external identifier.
2. **Quality control:** validate schema, coordinates, timestamps, duplicate keys, fill values, non-numeric values, impossible ranges, source-specific QA flags, missing periods, spatial masks and station metadata. Outliers are flagged first, never silently deleted. No missing value becomes zero.
3. **Harmonization:** convert units only with a documented rule; normalize timestamps to an explicit standard; retain native values beside normalized values; define whether an input is a rate, mean, accumulation, index or model/reanalysis estimate; map each pixel/point to a named region and preserve the source grid.
4. **Scientific features:** generate monthly and annual summaries, completeness, anomalies against a fixed baseline, seasonal aggregates and spatial summaries. Use area-weighting for polygons and document pixel inclusion. Do not compare products until period, units, support, spatial scale and meaning are compatible. For POWER, show the native grid-cell footprint instead of implying municipal precision.
5. **Analysis/delivery:** produce trend, uncertainty, cross-source comparison and visualization-ready artifacts. Every number carries a `seriesId`, source, unit, period, quality summary and transformation chain so frontend can render it without reconstructing science.

### Pre-registered statistical safeguards

- Keep OLS as the transparent baseline. Its slope is evaluated with a two-sided t-test and a 95% confidence interval, with the independent-residual assumption shown as a limitation.
- Add Mann–Kendall with Sen's slope as a non-parametric robustness pair. The current implementation is the uncorrected baseline and must be labeled provisional whenever residual autocorrelation is detected; the production gate requires Hamed–Rao or TFPW correction, or a block-bootstrap interval.
- Remove the seasonal cycle with a fixed climatology before comparing monthly signals. For precipitation, report both annual totals and May–October wet-season totals.
- Use two windows chosen before inspecting results: 1981–latest complete year for POWER sensitivity and 2001–latest common complete year for MODIS/IMERG comparisons. With the current source coverage, the common-window candidate is 2001–2024; “latest complete year” is derived from each source manifest, never hardcoded in the UI.
- Apply Benjamini–Hochberg false-discovery-rate control to the pre-declared family of site × variable × source hypotheses. Report raw p-values and adjusted q-values.
- Define **robust trend** before seeing results: after BH correction, the trend keeps its sign and its selected interval excludes zero across all pre-registered methods and windows, and no source-difference interval shows a magnitude discrepancy.
- Use this dashboard classification, not as a formal test of equality: **agreement with trend** means both intervals exclude zero with the same sign and the interval of the paired difference includes zero; **agreement without detectable trend** means both intervals include zero; **sign discrepancy** means both intervals exclude zero with opposite signs; **magnitude discrepancy** means the signs match but the paired-difference interval excludes zero; everything else is **inconclusive**.
- Report agreement/disagreement between products; never average products with different physical meanings.

### Temporal alignment policy

Different ingestion periods are expected and are part of the data quality model. Every source manifest must retain exact available months, complete years, missing periods and the retrieval date. The backend exposes three analysis modes:

- `source-native`: preserve each source's full history for coverage exploration; trends from different windows are not treated as directly comparable.
- `common-complete-window`: the default for cross-source comparisons. Intersect exact monthly coverage, drop partial boundary years, and select the longest contiguous run of complete calendar years shared by all selected sources.
- `fixed-window`: use only a pre-registered interval. A source that cannot meet the completeness rule is `blocked-by-quality`; it is never silently truncated or imputed.

The visualization should show both a coverage timeline and the selected analysis window. A partial current year remains visible as provisional coverage but is excluded from annual trend statistics. If no common window exists, the comparison is `no-overlap` and each source is rendered independently.

## Frontend-ready data contract

The canonical TypeScript contract lives in `lib/analysis/types.ts` as `EarthScopeDataBundle`. It is designed to be serializable JSON:

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "<ISO timestamp>",
  "study": {
    "id": "puebla-tehuacan-2001-present",
    "objective": "<objective>",
    "researchQuestion": "<question>",
    "regions": [],
    "baselinePeriod": { "startYear": 2001, "endYear": "<latest complete common year>" }
  },
  "sources": [],
  "series": [],
  "analyses": [],
  "qualitySummary": {
    "invalidObservationCount": 0,
    "incompleteSeriesCount": 0,
    "unresolvedWarnings": []
  }
}
```

Frontend should consume `series[].observations` and `analyses[]`; it must not infer units, source identity, completeness or statistical meaning from a label. A map view can use `location`, `period`, `sourceId` and a separately validated raster/tile descriptor without treating tile colors as values.

## Linear regression and future values

The current product estimates historical trend only. Future prediction is removed from the EarthScope objective for the hackathon. Extrapolating a line is not automatically a forecast and should not be presented as a deliverable while the common source window is short and spatial support is unresolved.

If a later research phase needs a projection, it must be a separate artifact:

1. Build a cleaned, seasonal-aware series and reserve a temporal holdout before fitting.
2. Fit OLS only as an interpretable baseline, with diagnostics for residual autocorrelation, non-linearity, heteroscedasticity and influential years.
3. Report both confidence intervals for the mean line and prediction intervals for new observations; never show only a single future line.
4. Validate the holdout with MAE, RMSE and interval coverage. If a variable fails, label it `blocked-by-quality` rather than drawing a future curve.
5. Store the result as `RegressionProjection` with `interpretation: exploratory-extrapolation`, not as a climate forecast. Rainfall, vegetation indices, water level and satellite retrievals may require different transformations or models; “one linear regression for every field” is not scientifically defensible.
6. Only after independent review expose the projection as a clearly separated optional layer in the UI.

**Status (2026-11-14):** an exploratory projection now exists as an optional control in step 3 of the map, only for T2M, TXx, TNn and PRECTOTCORR (`lib/analysis/projection.ts`, `POST /api/region` → `projection`). It covers points 1–5 partially: annual values (no seasonal cycle), one OLS line per cell, two rolling-origin 5-year holdout windows scored on the area-weighted regional series against the training mean (pooled MAE, RMSE, skill, bias, 95% interval coverage, plus each window's skill), prediction intervals widened for AR(1) residuals, `blocked-by-quality` when the pooled skill is below 10% or the most recent window is worse than the mean, and `interpretation: exploratory-extrapolation`. Measured on 2026-11-15, no variable beats the mean by 10% in 2015–2019, so the projection shows only where the recent warming dominates (T2M in Puebla and Oaxaca). Still missing: non-linearity and heteroscedasticity diagnostics and the independent review of point 6. The map layer stays off until the user turns it on and is labeled “not a forecast”.

## Action plan and gates

### Phase A — Data contract and provenance

- Freeze the study question, region polygons and baseline period.
- Implement source adapters around the canonical types.
- Add raw snapshot manifests and checksums.
- Gate: every observation can be traced back to a source request/download and native unit.

### Phase B — Precipitation comparison

- Select and validate `GPM_3IMERGM_07` through the CMR/GES DISC metadata and Giovanni. Do not assume 2025 is complete; compute `commonEndYear = min(POWER, IMERG, selected MODIS, station/reference manifests)`.
- Define Puebla/Tehuacán study polygons and aggregate both products to the same declared support; retain the native POWER cell as a separate context.
- Compare anomalies and trends, not absolute totals alone. Retain two separate series and label their partial dependence.
- Audit units, gauge adjustment, coverage, missingness, spatial support and wet-season behavior.
- Gate: a second person can reproduce the comparison from the manifest.

### Phase C — Land surface and validation

- Select one AppEEARS vegetation or land-surface-temperature product and preserve its QA layer.
- Build a GHCN-Daily station inventory around the sites, then use only station-years that pass the declared completeness rule. NOAA is a reference subset, not a continuous 2001–2025 validation source by assumption.
- Use KNMI Climate Explorer only after naming the underlying CRU/GPCC/reanalysis dataset; do not count the same GHCN record twice.
- Gate: quality flags, station metadata and cross-source disagreement are visible in the data bundle.

### Phase D — Map context and scope control

- Add only validated GIBS layers with date/product compatibility; keep them visual/contextual.
- Keep SWOT outside the MVP unless a named water feature, repeated observations and a defensible question are approved.
- Evaluate RADARSAT/Geo.ca only for a region and question where SAR is physically relevant.
- Gate: each layer has a product-specific legend, date, resolution and attribution.

### Phase E — Robustness and missing-year review

- Remove one complete year at a time, remove the last complete year, and rerun the full cleaning and trend pipeline with a fixed manifest.
- Report the distribution of slopes, the percentage of runs that preserve sign, and the percentage that change significance.
- Do not randomly mask months while requiring 12/12 annual completeness unless the experiment is explicitly about record loss; it removes most years and confounds the result with a coverage gate.
- Gate: the report says “robust”, “sensitive” or “inconclusive” using pre-registered rules; no future curve is required.

## Validation and model comparison protocol

Trend significance and prediction skill are different questions and will be reported separately.

### 1. Trend evidence

For every pre-declared series, report the OLS slope, t-test p-value, 95% confidence interval, Mann–Kendall p-value, Sen's slope, number of valid periods, completeness and all warnings. A significant trend in one test but not the other is a robustness disagreement, not a forced PASS/FAIL.

### 2. Missing-year robustness tests

The current question is historical robustness, not future skill. For each variable with enough history:

- remove the last complete year;
- remove each complete year once, retaining a manifest of the deletion;
- rerun cleaning, aggregation, OLS, Mann–Kendall and Sen's slope;
- report slope distribution, sign retention, interval coverage and significance retention;
- keep raw data immutable and never impute the removed year.

t-tests, Mann–Kendall and confidence intervals validate trend evidence and uncertainty. Forecast metrics are out of scope until the historical question and source coverage are stable.

### 3. Cross-source verification

There is no universal “truth source” for every Earth-system variable. The comparison hierarchy is:

1. harmonize spatial support and time period;
2. compare anomalies and seasonal totals in common units;
3. evaluate bias, correlation, MAE and paired differences;
4. use GHCN-Daily station data as an external reference where station metadata and coverage are adequate;
5. use NASA product validation documentation and sensitivity across products as evidence of confidence, not as proof of correctness.

If a product has no adequate reference at the target scale, the result is labeled `not independently validated` rather than assigned a confidence score.
