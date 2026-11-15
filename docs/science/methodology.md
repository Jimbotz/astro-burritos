# EarthScope methodology

EarthScope is an independent NASA Space Apps project. Its question is: **which climate signals are changing at a place, and can we trust them?** This file summarizes how every number on the page is produced. The API contract with field-level detail is in [`docs/backend/api-v2.md`](../backend/api-v2.md). The audit behind each rule is in [`docs/backend/frontend-data-handoff.md`](../backend/frontend-data-handoff.md).

## Data and spatial support

- **NASA POWER API v2.10**, public and without a login. Every variable comes from **MERRA-2** through POWER: monthly point, daily point and monthly regional endpoints, community `AG`, local solar time.
- **GPM IMERG** monthly precipitation through the same POWER API (`IMERG_PRECTOT`, 0.1°, from 1998). It is used only by the rain cross-check. POWER serves it only in UTC.
- **Support.** POWER's point endpoint returns the nearest native MERRA-2 cell (0.5° latitude × 0.625° longitude). Every value is labelled as that cell, with its mean elevation, never as a city or a station.
- **No stored or mock data.** Values are requested at analysis time. If POWER fails, the page shows the error and a retry path.

## Processing (every series)

1. POWER's `YYYY13` annual record, fill values (`-999`) and non-numeric values are dropped. Nothing is imputed.
2. Records outside each variable's physical bounds are removed and counted.
3. A year counts only when it is complete: 12 of 12 months, or every day for daily rules. An 11-month rain total would bias the year low (audit finding A1).
4. Annual aggregation follows each variable's rule:
   - day-weighted mean;
   - monthly mm/day × calendar days, summed (rain);
   - the cell's own wet season (its 6 rainiest consecutive months of 1991–2020);
   - annual maximum or minimum;
   - mean of daily values;
   - % of days above the calendar-day 90th percentile of 1991–2020.
5. Baseline 1991–2020, with at least 25 complete years. Anomalies are absolute or in %, per the variable's profile.

## Trend assessment

For each annual series in the chosen window (at least 10 complete years):

- **Rates.** An OLS slope with a block-bootstrap interval, or a Sen slope with a Gilbert interval, per the variable's profile. The headline rate is per decade, in the profile's scale.
- **Primary p-value.** Mann–Kendall corrected for autocorrelation (Hamed–Rao 1998). Benjamini–Hochberg q-values control false discoveries across the 13 variables; seasonal sub-series form their own family.
- **Detectability.** The minimum detectable trend for these years. “No trend detectable” is never shown as “no change”.
- **Five pre-declared robustness criteria:**
  - R1: q < 0.05;
  - R2: the primary interval excludes zero;
  - R3: trend-free prewhitening p < 0.05;
  - R4: leaving out any one year keeps the sign, and at least 90% of those runs stay significant;
  - R5: a sensitivity window keeps the direction with p < 0.10.
- **Verdicts.**
  - **Robust:** 5 of 5 criteria.
  - **Probable:** at least 3, including R1.
  - **Weak:** Hamed–Rao p < 0.10.
  - **No detectable trend:** anything else.
- **Claim policy.** “Increase” or “decrease” appears only for a robust or probable verdict of a variable whose trend may be stated.
  - Precipitation never gets a trend claim (`trendPolicy: 'show-without-claim'`). Against GHCN stations, POWER rain barely tracks the year-to-year changes (annual r 0.12–0.33), and its trend sign depends on the start year.

## Map

Each native cell inside the state gets its own trend.
- **Field significance:** Benjamini–Hochberg across the cells, with q < 0.10. Significant cells are outlined on the map; in the projection, cells that are not significant are hatched.
- **Regional series:** the cells are averaged with weights of coverage × cos(latitude) into a regional series, which is assessed like a point series.

## Cross-check: concordance between two records

The same three questions compare **two sources for one place** (rain: MERRA-2 against GPM IMERG) and **one source for two places** (any variable). Code: `lib/analysis/concordance.ts`, `lib/analysis/footprint.ts`, `lib/api/crosscheck-service.ts`.

1. **Level:** do they give the same amount? The difference of the means over the years both records have complete. Within ±10% counts as the same level.
2. **Year to year:** do they see the same high and low years? Pearson r after removing each record's own OLS line, so a shared trend cannot inflate it. r ≥ 0.7 is strong, r < 0.4 is weak, and anything between is moderate.
3. **Trend.** A record detects a trend when its Hamed–Rao p < 0.05.
   - **Agree:** both detect a trend of the same sign and their 95% intervals overlap.
   - **Disagree:** both detect trends of opposite sign, or the two 95% intervals do not overlap.
   - **Inconclusive:** anything else (one or neither detects, with compatible rates).
   - **Not enough years:** fewer than 10 complete years in either record.

These are conventional values (α = 0.05, 95% intervals, the usual r bands). They were fixed in code before any comparison was computed with them, and they are never tuned per place, as with every other EarthScope threshold.

**Rain specifics (`GET /api/crosscheck`).**
- **Footprint.** POWER's regional endpoint needs a 2° range, so EarthScope reads the 2° × 2° IMERG box centred on the MERRA-2 cell. It then averages the 0.1° pixels over the cell's own bounds, weighting each pixel by its overlap with the cell × cos(latitude). For Puebla, 42 pixels cover 100% of the cell. A month counts only when every overlapping pixel has a value.
- **Window and rules.**
  - The window starts no earlier than 1998, IMERG's first year.
  - Both records go through the same bounds and the 12/12 rule.
  - The wet season is the MERRA-2 cell's own and is applied to both.
  - Rates are Sen slopes with Gilbert intervals in mm per decade.
- **No direction is ever stated.** The card says whether two records agree, never that rain rises or falls.
- **Reasons shown with each result:**
  - the two records are only partly independent: both lean on rain gauges, and IMERG uses MERRA-2 fields;
  - IMERG changed from the TRMM to the GPM satellites in 2014, flagged when the window crosses it;
  - the station validation of POWER rain;
  - the minimum detectable trend, when neither record detects one;
  - a level gap of more than 10%;
  - weak year-to-year agreement.
- **Measured examples (2001–2024).**
  - Puebla, annual rain: **Inconclusive**. Neither record detects a trend: MERRA-2 +66 mm/decade with p = 0.05005, IMERG +22 mm/decade with p = 0.50. The means are within 4% and the detrended r is 0.68.
  - Tlaxcala, annual rain: **Disagree**. MERRA-2 +185 mm/decade (95% interval +110 to +293, p < 0.001) against IMERG −27 mm/decade (−87 to +35, p = 0.36).

**Places.** The comparison uses each place's headline rate, its primary 95% interval and its Hamed–Rao p from `GET /api/point`, with the same classification. Each place is its own MERRA-2 cell. For rain, the rates are shown without a claim.

## Exploratory projection

For T2M, TXx, TNn and precipitation, one OLS line per cell is extended 10 years past the data.
- **When it is drawn:** only when the line beats the training mean on two rolling 5-year validation windows of the regional series. The pooled skill must be at least 10%, and the line must not lose in the latest window.
- **What comes with it:** a 95% prediction interval widened for AR(1) residuals, and warnings for curvature, growing variance and interval undercoverage. Each warning comes from a diagnostic check.
- **Label:** it is always labelled “exploratory, not a forecast”. Details are in `docs/backend/api-v2.md` §3.3.

## Interpretation limits

- MERRA-2 is a reanalysis (a model constrained by observations), not a direct satellite measurement. IMERG is a satellite estimate calibrated with gauges. Neither is ground truth.
- A p-value below 0.05 is evidence against a zero slope under the model's assumptions. It is not causality, an alert or a forecast. A p-value above 0.05 does not prove that nothing changed.
- 24 years is short. Many real changes are smaller than the minimum detectable trend.
- A 0.5° × 0.625° cell can mix a valley and a mountain range. Stations inside it can differ by several degrees.
- The station validation (GHCN-Daily, Puebla airport and Tlaxcala) covers few sites with large gaps, and Tehuacán has no stations after 2009.
- No causal attribution or AI-generated scientific interpretation is produced by the app.
