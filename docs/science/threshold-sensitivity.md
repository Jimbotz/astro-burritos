# Threshold sensitivity

Measured on 2026-11-15 with real NASA POWER data (MERRA-2, 2001–2024). Every threshold below was fixed before this run. Nothing was retuned after seeing the results. This document reports how much the published results would change if a threshold moved, so a reader can judge which conclusions depend on a judgment call.

- Script: `scripts/threshold-sensitivity.ts`. It runs the production pipeline (`analyzeRegion`), and then re-scores the outputs.
- Output: `docs/science/data/threshold-sensitivity.json`.
- Reproduce (Node ≥ 22.18). POWER responses are cached in `node_modules/.cache/earthscope-power`:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/ts-resolve.mjs scripts/threshold-sensitivity.ts
```

The test regions are three states: Puebla (21 cells), Tlaxcala (4 cells) and Oaxaca (38 cells). The seasonal threshold is also tested in three contrasting climates.

## Thresholds and where they act

| Threshold | Value | Where | Effect | Varied here |
|---|---|---|---|---|
| Minimum projection skill (`minSkill`) | 10 % | `profile.projection` | Below it, the projection is blocked | Yes |
| Validation design (`holdoutWindows × holdoutYears`) | 2 × 5 years | `profile.projection` | Which years test the line | Yes |
| Most recent window must beat the mean | skill > 0 | `projection.ts` | Otherwise the projection is blocked | Through the design |
| Interval coverage (`minCoverage`) | 80 % | `profile.projection` | Warning only | No (warning) |
| Shape checks (`diagnosticAlpha`) | 0.05 | `profile.projection` | Curvature and growing-scatter warnings | Yes |
| Field FDR | q < 0.10 | `region.ts` | Significant cells, hatching | Yes |
| Wet-season share (`MIN_WET_SHARE`) | 0.60 | `annual-rules.ts` | A cell gets wet/dry seasons | Yes |
| Annual rain floor (`MIN_ANNUAL_RAIN_MM`) | 100 mm | `annual-rules.ts` | No seasons in hyper-arid cells | Yes |
| Year completeness | 12/12 months | `annual-rules.ts`, `trend.ts` | Incomplete years are gaps | Counted |

Not varied:

- The verdict criteria R1–R5 and the relevance thresholds. The audit pre-registered them (`docs/backend/frontend-data-handoff.md`), and moving them after looking at results would tune the answer.
- The AR(1) clamp at 0.95.
- The map and API size limits (800 and 2,500 cells). These are engineering limits, not statistical choices.

## 1. Projection: minimum skill

Status of the projection for each value of `minSkill`. All other rules stay at their defaults, and the default is shown in bold.

| State | Variable | 0 % | 5 % | **10 %** | 15 % | 20 % |
|---|---|---|---|---|---|---|
| Puebla | T2M | ok | ok | **ok** | ok | blocked |
| Puebla | TXx | blocked | blocked | **blocked** | blocked | blocked |
| Puebla | TNn | ok | blocked | **blocked** | blocked | blocked |
| Puebla | PRECTOTCORR | blocked | blocked | **blocked** | blocked | blocked |
| Tlaxcala | T2M | ok | blocked | **blocked** | blocked | blocked |
| Tlaxcala | TXx | blocked | blocked | **blocked** | blocked | blocked |
| Tlaxcala | TNn | ok | ok | **blocked** | blocked | blocked |
| Tlaxcala | PRECTOTCORR | blocked | blocked | **blocked** | blocked | blocked |
| Oaxaca | T2M | ok | ok | **ok** | ok | ok |
| Oaxaca | TXx | blocked | blocked | **blocked** | blocked | blocked |
| Oaxaca | TNn | blocked | blocked | **blocked** | blocked | blocked |
| Oaxaca | PRECTOTCORR | blocked | blocked | **blocked** | blocked | blocked |

## 2. Projection: validation design

The status and pooled skill for different numbers of windows (×) and window lengths in years. The 3 × 5 column equals 2 × 5. Its oldest window (2010–2014) would be fitted on only 2001–2009, 9 years, which is below `minFitYears` = 10, so that window is skipped.

| State | Variable | 1×5 | **2×5** | 3×5 | 2×4 | 2×6 |
|---|---|---|---|---|---|---|
| Puebla | T2M | ok (+26 %) | **ok (+20 %)** | ok (+20 %) | ok (+27 %) | ok (+13 %) |
| Puebla | TXx | blocked (−8 %) | **blocked (−6 %)** | blocked (−6 %) | blocked (−6 %) | blocked (−14 %) |
| Puebla | TNn | blocked (+8 %) | **blocked (+4 %)** | blocked (+4 %) | blocked (+3 %) | blocked (+1 %) |
| Puebla | PRECTOTCORR | blocked (−39 %) | **blocked (−35 %)** | blocked (−35 %) | blocked (−23 %) | blocked (−31 %) |
| Tlaxcala | T2M | blocked (+8 %) | **blocked (+5 %)** | blocked (+5 %) | blocked (+9 %) | blocked (−10 %) |
| Tlaxcala | TXx | blocked (−46 %) | **blocked (−18 %)** | blocked (−18 %) | blocked (−44 %) | blocked (−27 %) |
| Tlaxcala | TNn | ok (+15 %) | **blocked (+8 %)** | blocked (+8 %) | ok (+16 %) | blocked (−4 %) |
| Tlaxcala | PRECTOTCORR | blocked (−6 %) | **blocked (+20 %)** | blocked (+20 %) | ok (+19 %) | blocked (+3 %) |
| Oaxaca | T2M | ok (+37 %) | **ok (+26 %)** | ok (+26 %) | ok (+39 %) | ok (+23 %) |
| Oaxaca | TXx | blocked (−8 %) | **blocked (−7 %)** | blocked (−7 %) | blocked (+4 %) | blocked (−17 %) |
| Oaxaca | TNn | blocked (−24 %) | **blocked (−15 %)** | blocked (−15 %) | blocked (−2 %) | blocked (−18 %) |
| Oaxaca | PRECTOTCORR | blocked (+1 %) | **blocked (−21 %)** | blocked (−21 %) | blocked (+2 %) | blocked (−34 %) |

## 3. Projection: shape checks

These are the p-values of the curvature test and the changing-variance test on the regional series. The last three columns list the warnings each α would raise. Warnings are shown only when the projection passes, which happens for T2M in Puebla and Oaxaca.

| State | Variable | Curvature p | Scatter p (direction) | α = 0.01 | **α = 0.05** | α = 0.10 |
|---|---|---|---|---|---|---|
| Puebla | T2M | 0.0007 | 0.1426 (growing) | curvature | **curvature** | curvature |
| Puebla | TXx | 0.0307 | 0.9567 (shrinking) | — | **curvature** | curvature |
| Puebla | TNn | 0.2062 | 0.7075 (shrinking) | — | **—** | — |
| Puebla | PRECTOTCORR | 0.0325 | 0.0701 (growing) | — | **curvature** | curvature, growing-variance |
| Tlaxcala | T2M | 0.0018 | 0.0421 (growing) | curvature | **curvature, growing-variance** | curvature, growing-variance |
| Tlaxcala | TXx | 0.0266 | 0.8301 (shrinking) | — | **curvature** | curvature |
| Tlaxcala | TNn | 0.0396 | 0.7424 (growing) | — | **curvature** | curvature |
| Tlaxcala | PRECTOTCORR | 0.4576 | 0.0158 (growing) | — | **growing-variance** | growing-variance |
| Oaxaca | T2M | 0.0016 | 0.0339 (growing) | curvature | **curvature, growing-variance** | curvature, growing-variance |
| Oaxaca | TXx | 0.0167 | 0.2753 (growing) | — | **curvature** | curvature |
| Oaxaca | TNn | 0.1782 | 0.7801 (shrinking) | — | **—** | — |
| Oaxaca | PRECTOTCORR | 0.3499 | 0.2941 (growing) | — | **—** | — |

## 4. Field significance (Benjamini–Hochberg across the cells)

This counts the cells with a significant trend. Precipitation is left out, because it is shown without trend claims.

| State | Variable | Cells | q = 0.05 | **q = 0.10** | q = 0.20 |
|---|---|---|---|---|---|
| Puebla | T2M | 21 | 19 | **19** | 21 |
| Puebla | TXx | 21 | 0 | **0** | 0 |
| Puebla | TNn | 21 | 5 | **6** | 8 |
| Tlaxcala | T2M | 4 | 3 | **3** | 4 |
| Tlaxcala | TXx | 4 | 0 | **0** | 0 |
| Tlaxcala | TNn | 4 | 3 | **3** | 4 |
| Oaxaca | T2M | 38 | 37 | **37** | 38 |
| Oaxaca | TXx | 38 | 2 | **2** | 10 |
| Oaxaca | TNn | 38 | 3 | **3** | 7 |

## 5. Wet and dry seasons

This is the share of cells that get a wet/dry season, by wet-season share (rows) and annual rain floor (columns). The wet share is the fraction of the 1991–2020 annual rain that falls in the 6 wettest consecutive months.

**South-central Mexico.** 357 cells. The median wet share is 0.80 (range 0.63–0.97).

| minWetShare | 50 mm | **100 mm** | 200 mm |
|---|---|---|---|
| 0.5 | 100 % | **100 %** | 100 % |
| 0.55 | 100 % | **100 %** | 100 % |
| **0.6** | 100 % | **100 %** | 100 % |
| 0.65 | 98 % | **98 %** | 98 % |
| 0.7 | 85 % | **85 %** | 85 % |

**Ireland** (rain all year, winter maximum). 99 cells. The median wet share is 0.59 (range 0.55–0.61).

| minWetShare | 50 mm | **100 mm** | 200 mm |
|---|---|---|---|
| 0.5 | 100 % | **100 %** | 100 % |
| 0.55 | 96 % | **96 %** | 96 % |
| **0.6** | 20 % | **20 %** | 20 % |
| 0.65 | 0 % | **0 %** | 0 % |
| 0.7 | 0 % | **0 %** | 0 % |

**Central Amazon.** 99 cells. The median wet share is 0.66 (range 0.59–0.72).

| minWetShare | 50 mm | **100 mm** | 200 mm |
|---|---|---|---|
| 0.5 | 100 % | **100 %** | 100 % |
| 0.55 | 100 % | **100 %** | 100 % |
| **0.6** | 96 % | **96 %** | 96 % |
| 0.65 | 55 % | **55 %** | 55 % |
| 0.7 | 8 % | **8 %** | 8 % |

**Central Sahara** (hyper-arid). 88 cells. The median wet share is 0.63 (range 0.53–0.70).

| minWetShare | 50 mm | **100 mm** | 200 mm |
|---|---|---|---|
| 0.5 | 14 % | **0 %** | 0 % |
| 0.55 | 14 % | **0 %** | 0 % |
| **0.6** | 14 % | **0 %** | 0 % |
| 0.65 | 11 % | **0 %** | 0 % |
| 0.7 | 0 % | **0 %** | 0 % |

## 6. Completeness

The series behind the three states have 357 cells × 44 years × 12 months = 188,496 monthly values per parameter. For T2M, T2M_MAX, T2M_MIN and PRECTOTCORR, **0 months are missing**. Requiring 12/12 months instead of 11/12 therefore changes nothing in today's POWER data. The rule matters for sources with gaps, such as IMERG in 2025 (9 months), MODIS in 2000 (11 months), or a December not yet published. The legacy `/api/series` now applies it too (audit finding A1).

## Reading

- **Robust.** The T2M projection passes in Puebla and Oaxaca under every validation design. It also survives any `minSkill` up to 15 % (Puebla) or 20 % (Oaxaca). TXx and the precipitation projection stay blocked under almost every combination. The T2M field signal (19 of 21 cells in Puebla, 37 of 38 in Oaxaca) is the same at q = 0.05 and 0.10.
- **Borderline, and blocked by the default.**
  - TNn in Tlaxcala passes with `minSkill` ≤ 5 %, or with the 1 × 5 and 2 × 4 designs.
  - T2M in Tlaxcala passes only with `minSkill` = 0.
  - Precipitation in Tlaxcala passes only with 2 × 4. Under the default it is blocked because it loses to the mean in 2020–2024 (−6 %).

  These cases show that the result depends on the rule, so the map does not draw them. The thresholds stay as agreed. Tuning them per case to make a map appear is exactly what the validation is meant to prevent.
- **Curvature is real for T2M.** In all three states the regional T2M series bends upward at p ≤ 0.002, at every α. The same pattern explains the `interval-undercoverage` warning and the positive bias: recent years run above the straight line. Both projected cases show the curvature warning, which says that the line probably underestimates future values.
- **Growing scatter is marginal.** For T2M it appears at α = 0.05 (p = 0.03–0.04 in Oaxaca and Tlaxcala) and disappears at α = 0.01. It is shown as a warning, never as a block.
- **Field FDR at q = 0.10 matters only for weak signals.** In Oaxaca, TXx goes from 2 to 10 significant cells at q = 0.20. The value 0.10 follows Wilks (2016, *BAMS* 97, 2263–2273), who recommends α_FDR = 2 × the intended global level for spatially correlated fields.
- **The 0.60 wet-season share sits on a knife edge in maritime climates.** Ireland's cells range from 0.55 to 0.61, so 20 % of them get seasons at 0.60 and 96 % at 0.55. Neighboring cells can therefore differ. South-central Mexico, the project's focus, is insensitive to this threshold. In the Sahara, the 100 mm floor is what removes the spurious "wet season" (14 % of cells would get one at 50 mm). This is a known limitation, listed in the pending work. A smoother alternative would label how seasonal each cell is (its wet share) instead of an on/off switch.
