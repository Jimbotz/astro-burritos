# Heat-exposure lens: methodology

**Question:** *Where and when are extremely warm days and nights intensifying, and which population is exposed?*

The label is **climate exposure to heat**. There are no health, vulnerability or mortality data in the lens, so it never speaks of a "health impact" or a "health risk". It never says that heat caused illness, and it gives no medical advice. API contract: [`docs/backend/impact-lenses.md`](../backend/impact-lenses.md).

## Sources

| Source | Use | Access |
|---|---|---|
| NASA POWER daily point API v2.10 (MERRA-2): T2M_MAX, T2M_MIN, T2M | TX90p, TN90p, TXx, TNn, TX, TN, T2M | Public API, live |
| INEGI Censo 2020 (ITER): 189,432 localities with coordinates | Population and urban share per cell and per municipality | Bundled snapshot (SHA-256 in the manifest) |
| INEGI Marco Geoestadístico 2020 | Municipal outlines | Bundled snapshot |

## Indicators

| Index | Definition |
|---|---|
| **TX90p** (warm days) | % of days whose maximum temperature exceeds the 90th percentile of the same calendar day |
| **TN90p** (warm nights) | % of days whose minimum temperature exceeds the 90th percentile of the same calendar day |
| **TXx** | The highest daily maximum of the year: each cell's hottest day |
| **TNn** | The lowest daily minimum of the year: each cell's coldest night |
| **TX, TN, T2M** | Annual means of daily maximum, minimum and mean temperature |

The calendar-day percentile of TX90p and TN90p (`calendarThresholds`, shared with the rest of EarthScope):
- uses a 5-day moving window around each calendar day;
- uses the 1991–2020 base, which must be complete;
- February 29 is not in the base;
- the result is reported with the valid days of each year.

A year counts for these indices only when every day is present. That is stricter than the 90% minimum of the lens rules, and it matches the rest of EarthScope.

A regional average of TXx or TNn does not mean every cell had the same extreme day.

## Trend statistics

Each index uses its catalog profile:
- TX90p, TN90p, TXx, TNn: Sen + Gilbert (bounded or extreme-value data);
- TX, TN, T2M: OLS + block bootstrap.

All of them get the Hamed–Rao Mann–Kendall p, prewhitening, a jackknife and a sensitivity window. Benjamini–Hochberg q-values are computed within the lens family (7 series).

## Classification (hazard)

```ts
const HEAT_THRESHOLDS = { alpha: 0.05, minCompleteYears: 20, recentWindowYears: 5, recentLoadPercentile: 0.8,
  highExposurePopulation: 100_000, highUrbanFraction: 0.5 }
```

| Status | Rule |
|---|---|
| `insufficient-data` | Neither TX90p nor TN90p has 10 complete years |
| `no-detectable` | No robust trend and no extraordinary recent load |
| `watch` | No planning signal, but the last 5 years of TX90p or TN90p average above the 1991–2020 80th percentile |
| `planning-signal` | TX90p or TN90p meets all of: Hamed–Rao Mann–Kendall p < 0.05; primary 95% interval excludes zero; rate above the relevance threshold; ≥ 20 complete years; upward |
| `corroborated` | Planning signal confirmed by its extreme rising with p < 0.05 and an interval that excludes zero: TXx for warm days, TNn for warm nights |

The response lists each criterion with ✓ or ✗.

**Period dependence** is real, and the tests check it with saved data. In the Puebla cell, TN90p meets every criterion for 2001–2024 (p = 0.001) but not for 1995–2014 (p = 0.097). TX90p meets them for 1991–2010 but not for 2001–2024.

## Exposure and priority

Hazard and exposure stay separate. Priority is their explicit combination, and the map shows them as separate layers.

**Exposure.**
- Each locality with coordinates adds its 2020 population to the MERRA-2 cell that contains it. Population is never spread uniformly over an area.
- Localities grouped without coordinates (one- and two-dwelling localities) are not placed in a cell.
- Urban = localities of 2,500 people or more (INEGI definition).
- Scale: the municipality for a municipal request; the reference cell otherwise.

**Priority.**

| Priority | Rule |
|---|---|
| `high-exposure-signal` | Planning or corroborated hazard over ≥ 100,000 people, or an urban majority |
| `signal-lower-exposure` | Hazard signal with exposure below those thresholds |
| `exposure-without-signal` | High exposure, no robust hazard |
| `no-priority` | Neither |
| `exposure-unknown` | No population data (outside Mexico) |

The colour is red only for a corroborated hazard with high exposure, as the backend's `severity: "alert"` says.

## Measured results (2001–2024)

| Place | Status | Detail |
|---|---|---|
| Puebla (city cell) | `corroborated` | TN90p +5.5 pp/decade (robust, q = 0.004), confirmed by TNn +1.10 °C/decade (p = 0.004). 3,316,098 people in the cell, 93% urban → `high-exposure-signal` |
| Tehuacán (municipality) | `corroborated` | TX90p +8.5 pp/decade (robust), confirmed by TXx +0.44 °C/decade (p = 0.027). 327,312 people → `high-exposure-signal` |
| Oaxaca (state; seat of Oaxaca de Juárez) | `planning-signal` | TN90p +7.1 and TX90p +5.5 pp/decade (robust); TXx and TNn not significant |

## Limitations

- MERRA-2 reanalysis values, not station measurements. The 0.5° × 0.625° cell does not resolve the urban heat island or a specific neighbourhood.
- Exposure is the 2020 census population. It includes no age, housing, health, shade or cooling access, so it is not vulnerability.
- Historical trends only: no alerts, no forecasts and no attribution.
- The snapshot maps cover Puebla, Tlaxcala and Oaxaca (63 cells). Elsewhere only the reference cell is analysed, and population exists only for Mexico.
