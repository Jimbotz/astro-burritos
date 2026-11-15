# Water-management lens: methodology

**Question:** *Does the region show persistent signals of rising atmospheric demand and falling climatic water availability?*

"Climatic water availability" is a climate balance. It is not the volume of aquifers, dams, rivers, pipes or supply networks. The lens issues monitoring and planning signals, never operational, agronomic or rationing instructions. API contract: [`docs/backend/impact-lenses.md`](../backend/impact-lenses.md).

## Sources

| Source | Use | Access |
|---|---|---|
| NASA POWER daily point API v2.10 (MERRA-2; CERES SYN1deg / GEWEX SRB radiation) | Precipitation, ET0 inputs, root-zone wetness | Public API, live |
| CONAGUA / SMN daily station records (45 stations) | Validation of POWER rain; observed dry years | Bundled snapshot (2026-11-15, SHA-256 per file) |
| SMN Mexican Drought Monitor (municipalities, 2003 to 2026-10) | Observed drought per municipality | Bundled snapshot |
| INEGI Marco Geoestadístico 2020 | Municipal outlines for the maps | Bundled snapshot |
| FAO-56 | ET0 method | Method reference |

Details and checksums: [`docs/backend/data-sources-no-auth.md`](../backend/data-sources-no-auth.md).

## Series (reference cell and every snapshot cell)

All daily records first pass the quality checks of `lib/analysis/impact-quality.ts`:
- fill values become missing, never zero;
- out-of-range values, impossible dates, duplicates and unit mismatches are flagged.

Monthly means need at least 90% valid days. A year needs 12 of 12 months.

**Precipitation**

```text
monthly precipitation = PRECTOTCORR monthly mean (mm/day) × days in the month
annual precipitation  = Σ monthly precipitation
wet-season rain       = Σ over the cell's 6 rainiest consecutive months of 1991–2020
```

**Reference evapotranspiration**, FAO-56 Penman–Monteith, daily, G = 0:

```text
ET0 = [0.408 Δ (Rn − G) + γ · 900/(T + 273) · u2 · (es − ea)] / [Δ + γ (1 + 0.34 u2)]
```

| Term | How it is obtained |
|---|---|
| T | (T2M_MAX + T2M_MIN) / 2 |
| es | [e°(Tmax) + e°(Tmin)] / 2, with e°(T) = 0.6108 exp(17.27 T / (T + 237.3)) |
| ea | e°(T2MDEW) |
| Δ | 4098 e°(T) / (T + 237.3)² |
| γ | 0.665 × 10⁻³ × PS (kPa) |
| u2 | WS10M × 4.87 / ln(67.8 × 10 − 5.42) (FAO-56 eq. 47) |
| Rn | (ALLSKY_SFC_SW_DWN − SW_UP) + (LW_DWN − LW_UP) in MJ/m²/day |

- **Net radiation.** Rn is the net radiation of the actual surface, from POWER's components, not the FAO 0.23 grass albedo. This is stated in every response.
- **Implausible values.** Inputs outside physical bounds, Tmin > Tmax and ET0 outside 0–15 mm/day are flagged and left out.
- **Sums.** Monthly ET0 = mean of the valid days × days in the month; annual ET0 = Σ monthly.
- **Not EVPTRNS.** POWER's EVPTRNS is not ET0 and is not used.
- **Check.** The implementation reproduces FAO-56 Example 18 (3.9 mm/day; `tests/analysis/et0.test.ts`).

**Climate water balance**

```text
annual balance   = annual precipitation − annual ET0
seasonal balance = wet-season rain − ET0 of the same months
```

Label shown with it: *Estimated climate balance. It does not represent water physically available in dams or aquifers.*

**Root-zone wetness.** GWETROOT is a 0–1 fraction of plant-available water, estimated by MERRA-2's land-surface model; it is never shown as a soil measurement.
- Anomaly = value − 1991–2020 mean.
- Also reported: percentile, 5-year moving mean and persistence.

**Observed drought.** The Drought Monitor is normalized to `municipalityCode, date, droughtCategory, sourceId`. Per municipality the lens reports:
- months and years with drought (D1 or worse; D0 is "abnormally dry", not drought);
- longest run of consecutive months and worst category;
- share of months affected and years in drought among the last five.

A municipality without records is `insufficient-data`: the absence of records does not mean the absence of drought.

## Trend statistics

Every series reuses the EarthScope assessment (`lib/analysis/robust-assessment.ts`): Hamed–Rao Mann–Kendall p, a block-bootstrap or Gilbert interval, prewhitening, jackknife, a sensitivity window and the minimum detectable trend. Benjamini–Hochberg q-values are computed within the lens family (7 series).

| Series | Method | Claim |
|---|---|---|
| Precipitation, wet-season rain | Sen + Gilbert (catalog profile) | Never: `show-without-claim` |
| Climate balance (annual, seasonal) | Sen + Gilbert | Never (it inherits rain's uncertainty) |
| ET0 (annual, seasonal) | OLS + block bootstrap; relevant from 15 mm/decade (~1% of the highland annual ET0) | Only robust or probable verdicts |
| GWETROOT | Catalog profile (OLS + block bootstrap, 5-year blocks) | Only robust or probable verdicts |

## Components (last 5 complete years of the effective window)

```ts
const WATER_THRESHOLDS = { lowPrecipitationPercentile: 0.2, highEt0Percentile: 0.8, lowRootZoneWetnessPercentile: 0.2,
  persistentYears: 3, recentWindowYears: 5, minimumAnnualCompleteness: 0.9, alpha: 0.05, droughtYears: 2, minDroughtCoverageYears: 4 }
```

Percentiles are against the 1991–2020 distribution of annual values, which needs at least 25 complete base years. A component can be evaluated only when all 5 recent years are complete; otherwise it is `null` (not evaluable).

| Component | Active when |
|---|---|
| `supplyStress` | Annual precipitation below P20, or more than 1 SD below the base mean, in ≥ 3 of the last 5 years |
| `demandStress` | Annual ET0 above P80 in ≥ 3 of the last 5 years, or a robust upward ET0 trend with ≥ 3 of the last 5 years above the base mean |
| `storageStress` | GWETROOT below P20 in ≥ 3 of the last 5 years, or below the base mean in all 5 |
| `observedDrought` | D1+ drought in ≥ 2 of the last 5 years, with the monitor covering ≥ 4 of them |

**Nearby-station evidence.** The bundled SMN station closest to the point, within 30 km, has ≥ 2 of its last 5 complete years below its own 1991–2020 P20. This needs ≥ 15 complete base years at the station. The same station gives the POWER–CONAGUA annual correlation and mean difference.

## Classification

| Status | Rule |
|---|---|
| `insufficient-data` | Fewer than two climate components can be evaluated, or no common complete window |
| `no-detectable` | No component active |
| `watch` | One component active |
| `planning-signal` | Two or more components active (each already persistent in 3 of the last 5 years) |
| `corroborated` | Planning signal plus observed evidence: Drought Monitor or a nearby station. This is the "priority" of §7.9 |

**Sensitivity.** The classification is re-run with percentiles 0.10, 0.20 and 0.30 (0.90 / 0.80 / 0.70 for ET0). If the status changes, the response says `sensitivity: "high"`.

These are conventional values, fixed before any result was computed with them. They are never tuned per place.

## Measured results (2001–2024)

| Place | Status | Why |
|---|---|---|
| Puebla (city cell) | `watch`, sensitivity high | D1+ drought in 4 of the last 5 years; rain, ET0 and wetness not persistent. POWER vs. station AFRICAM: r = 0.51, means within 2% |
| Tehuacán (municipality) | `corroborated` | Root-zone wetness below P20 in 4 of 5 years; D1+ drought in 5 of 5; the Tehuacán station has 2 of its last 5 years below its P20. POWER's cell mean is about twice the valley station's (a 55 km cell spans the surrounding mountains) |
| Oaxaca (state) | `watch`, sensitivity high | ET0 above P80 in 3 of 5 years |

## Limitations

- POWER rain follows the seasonal cycle but barely the year-to-year changes against stations (annual r 0.12–0.51 at the stations checked), so rain never gets a trend claim.
- A 0.5° × 0.625° cell is not a locality; a valley station can differ strongly from its cell.
- POWER radiation changes product in 2001. An ET0 trend across that change can come from the product; windows starting before 2001 carry a warning.
- The snapshot maps cover Puebla, Tlaxcala and Oaxaca (63 cells, 1991–2024). Elsewhere only the reference cell is analysed.
- The Drought Monitor is an expert assessment, not a measurement.
