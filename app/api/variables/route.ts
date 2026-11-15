import { NextResponse } from 'next/server'
import { DEFAULT_WINDOW, SCHEMA_VERSION, type VariablesResponse } from '@/lib/api/v2'
import { EXCLUDED_VARIABLES, SEASON_RULE, VARIABLES } from '@/lib/variables/catalog'

export function GET() {
  const body: VariablesResponse = {
    schemaVersion: SCHEMA_VERSION,
    variables: VARIABLES,
    excluded: EXCLUDED_VARIABLES,
    defaults: { window: DEFAULT_WINDOW },
    seasons: SEASON_RULE,
    rules: {
      completeness: 'A year counts only with 12/12 months (or every day for daily variables). Nothing is imputed.',
      support: 'Every value represents a native MERRA-2 cell of 0.5° × 0.625°, not a city or station.',
      pValue: 'Primary p-value: Mann–Kendall corrected for autocorrelation (Hamed–Rao). OLS and plain Mann–Kendall are reported for reference.',
      family: 'Point responses adjust p-values with Benjamini–Hochberg over all point variables; region responses adjust across cells (field FDR, q < 0.10).',
      robustness: 'R1 q < 0.05 · R2 the primary-method 95% interval excludes 0 (block bootstrap for OLS, Gilbert for Sen) · R3 TFPW p < 0.05 · R4 jackknife of the primary slope keeps the sign and p < 0.05 in ≥ 90% · R5 same sign and p < 0.10 in the sensitivity window.',
      claims: 'Only state increase/decrease when trend.claimAllowed is true and the verdict is robust or probable.',
      units: 'Native slopes are per decade (trendUnit). trend.display is in the profile scale (profile.displayUnit): absolute, % of the 1991–2020 mean, or percentage points.',
      profiles: 'Each variable carries a processing profile: trend scale, primary method (OLS + block bootstrap or Sen + Gilbert interval), anomalies against 1991–2020, physical bounds, seasonal sub-series, regional aggregation and a relevance threshold.',
      relevance: 'A robust or probable trend whose |trend.display.slope| is below profile.relevanceThreshold reads as “significant but small” (warning below-relevance).',
      projection: 'Only variables with profile.projection get an exploratory linear extrapolation on the map (POST /api/region → projection, cells[].fit). One OLS line per cell. Validation uses the area-weighted regional series: its last holdoutYears are predicted from the earlier years and compared with the training mean. If the line does not improve on the mean by at least minSkill (10% of RMSE), status is blocked-by-quality and nothing is drawn. If fewer than minCoverage of held-out years fall inside the 95% prediction interval (widened for AR(1) residuals), the projection carries a warning. Not a forecast.',
    },
    verdicts: {
      robust: { es: 'Tendencia robusta', en: 'Robust trend' },
      probable: { es: 'Tendencia probable', en: 'Probable trend' },
      weak: { es: 'Indicio débil', en: 'Weak signal' },
      'not-detectable': { es: 'No se detecta tendencia con estos datos', en: 'No trend detectable with these data' },
      'insufficient-data': { es: 'Datos insuficientes', en: 'Insufficient data' },
    },
  }
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } })
}
