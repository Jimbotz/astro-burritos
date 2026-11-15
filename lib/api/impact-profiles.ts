/**
 * Processing profiles of the two impact-lens series that are not catalog variables: FAO-56 ET0 and the climate water
 * balance (precipitation − ET0). The catalog variables (precipitation, GWETROOT, TX90p, TN90p, TXx, TNn, TX, TN, T2M)
 * keep their own profiles from lib/variables/catalog.ts, so their trends match the rest of EarthScope.
 */
import type { ProcessingProfile } from '../variables/catalog'

const AREA_MEAN = { es: 'Media regional ponderada por área', en: 'Area-weighted regional mean' }

/** ET0 behaves like temperature (smooth, continuous): OLS with a block-bootstrap interval; relevant from 15 mm/decade (~1%). */
export const ET0_PROFILE: ProcessingProfile = {
  trendScale: 'absolute', displayUnit: 'mm/década', primaryMethod: 'ols-hamed-rao', anomaly: { kind: 'absolute', unit: 'mm' }, nativeBounds: { min: 0, max: 15 }, seasons: [],
  regionalAggregation: 'area-mean', regionalLabel: AREA_MEAN, relevanceThreshold: 15, expectedValue: null, minBlockLength: 2,
  rationale: {
    es: 'ET0 anual FAO-56 (mm). Tendencia OLS con intervalo bootstrap por bloques; relevante desde 15 mm por década, cerca de 1% de la ET0 anual del altiplano.',
    en: 'Annual FAO-56 ET0 (mm). OLS trend with a block-bootstrap interval; relevant from 15 mm per decade, about 1% of the highland annual ET0.',
  },
  projection: null,
}

/** The balance carries precipitation's noise and skew: Sen slope with a Gilbert interval, and no increase/decrease claim. */
export const BALANCE_PROFILE: ProcessingProfile = {
  ...ET0_PROFILE,
  primaryMethod: 'sen-mann-kendall', nativeBounds: { min: null, max: null }, relevanceThreshold: 25,
  rationale: {
    es: 'Balance climático = precipitación − ET0 (mm). Sen con intervalo de Gilbert; sin afirmación de tendencia porque hereda la incertidumbre de la lluvia.',
    en: 'Climate balance = precipitation − ET0 (mm). Sen with a Gilbert interval; no trend claim, because it inherits the uncertainty of rain.',
  },
}
