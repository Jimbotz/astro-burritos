/**
 * Municipal water-management lens (IMPLEMENTACION_LENTES_IMPACTO §7): four stress components and a classification.
 *
 * - supplyStress: annual precipitation below the 1991–2020 20th percentile, or more than 1 SD below its mean,
 *   in at least 3 of the last 5 complete years.
 * - demandStress: annual FAO-56 ET0 above the 80th percentile in at least 3 of the last 5 years, or a robust upward
 *   ET0 trend whose last 5 years sit above the baseline mean in at least 3 of them (persistence).
 * - storageStress: root-zone wetness (GWETROOT) below the 20th percentile in at least 3 of the last 5 years, or below
 *   the baseline mean in all 5 (persistently negative anomaly).
 * - observedDrought: the SMN Drought Monitor lists the municipality in drought (category D1 or worse) in at least 2 of
 *   the last 5 years that the monitor covers, and it covers at least 4 of those 5 years.
 *
 * "Climatic water availability" is a climate balance; it is not the volume of aquifers, dams, rivers or pipes.
 */
import type { AnnualPoint } from './annual-rules'
import type { RobustTrend } from './robust-assessment'
import { baselineDistribution, quantile, recentWindow } from './impact-stats'
import type { ImpactStatus } from '../api/impact-types'

export const WATER_THRESHOLDS = {
  lowPrecipitationPercentile: 0.2,
  highEt0Percentile: 0.8,
  lowRootZoneWetnessPercentile: 0.2,
  persistentYears: 3,
  recentWindowYears: 5,
  minimumAnnualCompleteness: 0.9,
  alpha: 0.05,
  /** observedDrought: years in drought (D1+) among the last 5, and how many of them the monitor must cover. */
  droughtYears: 2,
  minDroughtCoverageYears: 4,
} as const

export type WaterThresholds = typeof WATER_THRESHOLDS
export type ComponentReason = 'not-evaluable' | 'below-percentile' | 'below-sd' | 'above-percentile' | 'robust-upward-trend' | 'persistent-negative-anomaly' | 'observed' | 'not-persistent' | 'not-observed'

export type ComponentResult = {
  /** null when the component cannot be evaluated (coverage); false when evaluated and below its threshold. */
  active: boolean | null
  /** Years of the recent window that meet the condition, and the years that could be evaluated. */
  hits: number[]
  evaluated: number[]
  reason: ComponentReason
  threshold: number | null
}

const notEvaluable = (): ComponentResult => ({ active: null, hits: [], evaluated: [], reason: 'not-evaluable', threshold: null })

/** The recent window can be judged only when every one of its years is complete and the baseline exists. */
function recent(points: AnnualPoint[], endYear: number, rules: WaterThresholds) {
  const window = recentWindow(points, endYear, rules.recentWindowYears)
  const complete = window.filter((item) => item.value !== null) as Array<{ year: number; value: number }>
  return { window, complete, ok: complete.length === window.length }
}

export function supplyStress(precip: AnnualPoint[], endYear: number, q: number = WATER_THRESHOLDS.lowPrecipitationPercentile, rules: WaterThresholds = WATER_THRESHOLDS): ComponentResult {
  const baseline = baselineDistribution(precip)
  const { complete, ok } = recent(precip, endYear, rules)
  if (!baseline || !ok) return notEvaluable()
  const low = quantile(baseline.values, q) as number
  const hits = complete.filter((item) => item.value < low || item.value < baseline.mean - baseline.sd).map((item) => item.year)
  const active = hits.length >= rules.persistentYears
  const belowPercentile = complete.filter((item) => item.value < low).length >= rules.persistentYears
  return { active, hits, evaluated: complete.map((item) => item.year), reason: active ? (belowPercentile ? 'below-percentile' : 'below-sd') : 'not-persistent', threshold: low }
}

export function demandStress(et0: AnnualPoint[], trend: RobustTrend | null, endYear: number, q: number = WATER_THRESHOLDS.highEt0Percentile, rules: WaterThresholds = WATER_THRESHOLDS): ComponentResult {
  const baseline = baselineDistribution(et0)
  const { complete, ok } = recent(et0, endYear, rules)
  if (!baseline || !ok) return notEvaluable()
  const high = quantile(baseline.values, q) as number
  const hits = complete.filter((item) => item.value > high).map((item) => item.year)
  if (hits.length >= rules.persistentYears) return { active: true, hits, evaluated: complete.map((item) => item.year), reason: 'above-percentile', threshold: high }
  const robustUp = trend !== null && trend.claimAllowed && (trend.verdict === 'robust') && (trend.primary.slopePerDecade ?? 0) > 0
  const aboveMean = complete.filter((item) => item.value > baseline.mean).map((item) => item.year)
  if (robustUp && aboveMean.length >= rules.persistentYears) return { active: true, hits: aboveMean, evaluated: complete.map((item) => item.year), reason: 'robust-upward-trend', threshold: baseline.mean }
  return { active: false, hits, evaluated: complete.map((item) => item.year), reason: 'not-persistent', threshold: high }
}

export function storageStress(wetness: AnnualPoint[], endYear: number, q: number = WATER_THRESHOLDS.lowRootZoneWetnessPercentile, rules: WaterThresholds = WATER_THRESHOLDS): ComponentResult {
  const baseline = baselineDistribution(wetness)
  const { complete, ok } = recent(wetness, endYear, rules)
  if (!baseline || !ok) return notEvaluable()
  const low = quantile(baseline.values, q) as number
  const hits = complete.filter((item) => item.value < low).map((item) => item.year)
  if (hits.length >= rules.persistentYears) return { active: true, hits, evaluated: complete.map((item) => item.year), reason: 'below-percentile', threshold: low }
  const negative = complete.filter((item) => item.value < baseline.mean).map((item) => item.year)
  if (negative.length === complete.length) return { active: true, hits: negative, evaluated: complete.map((item) => item.year), reason: 'persistent-negative-anomaly', threshold: baseline.mean }
  return { active: false, hits, evaluated: complete.map((item) => item.year), reason: 'not-persistent', threshold: low }
}

/** Drought Monitor years: each year the monitor covers, and whether any of its records is D1 or worse. */
export type DroughtYears = Array<{ year: number; covered: boolean; drought: boolean }>

export function observedDrought(years: DroughtYears | null, endYear: number, rules: WaterThresholds = WATER_THRESHOLDS): ComponentResult {
  if (!years) return notEvaluable()
  const window = Array.from({ length: rules.recentWindowYears }, (_, index) => endYear - rules.recentWindowYears + 1 + index)
  const covered = window.filter((year) => years.find((item) => item.year === year)?.covered)
  if (covered.length < rules.minDroughtCoverageYears) return { ...notEvaluable(), evaluated: covered }
  const hits = covered.filter((year) => years.find((item) => item.year === year)?.drought)
  const active = hits.length >= rules.droughtYears
  return { active, hits, evaluated: covered, reason: active ? 'observed' : 'not-observed', threshold: rules.droughtYears }
}

export type WaterComponents = { supplyStress: ComponentResult; demandStress: ComponentResult; storageStress: ComponentResult; observedDrought: ComponentResult }

/**
 * insufficient-data: fewer than two climate components can be evaluated · no-detectable: none active ·
 * watch: one active · planning-signal: two or more active (each already persistent over 3 of the last 5 years) ·
 * corroborated (the "priority" of §7.9): planning-signal with observed evidence (drought monitor or a nearby station).
 */
export function classifyWater(components: WaterComponents, stationEvidence: boolean | null = null): { status: ImpactStatus; active: string[]; evaluable: string[] } {
  const climate = ['supplyStress', 'demandStress', 'storageStress'] as const
  const evaluableClimate = climate.filter((id) => components[id].active !== null)
  const all = [...climate, 'observedDrought'] as const
  const evaluable = all.filter((id) => components[id].active !== null)
  const active = all.filter((id) => components[id].active === true)
  if (evaluableClimate.length < 2) return { status: 'insufficient-data', active, evaluable }
  if (active.length === 0) return { status: 'no-detectable', active, evaluable }
  if (active.length === 1) return { status: 'watch', active, evaluable }
  const observed = components.observedDrought.active === true || stationEvidence === true
  return { status: observed ? 'corroborated' : 'planning-signal', active, evaluable }
}

/** Re-runs the classification with percentile thresholds 0.10, 0.20 and 0.30 (0.90 / 0.80 / 0.70 for ET0). */
export function waterSensitivity(series: { precip: AnnualPoint[]; et0: AnnualPoint[]; wetness: AnnualPoint[]; et0Trend: RobustTrend | null; drought: DroughtYears | null }, endYear: number, stationEvidence: boolean | null) {
  const statuses = [0.1, 0.2, 0.3].map((q) => classifyWater({
    supplyStress: supplyStress(series.precip, endYear, q),
    demandStress: demandStress(series.et0, series.et0Trend, endYear, 1 - q),
    storageStress: storageStress(series.wetness, endYear, q),
    observedDrought: observedDrought(series.drought, endYear),
  }, stationEvidence).status)
  return { statuses: { '0.10': statuses[0], '0.20': statuses[1], '0.30': statuses[2] }, sensitivity: new Set(statuses).size > 1 ? 'high' as const : 'low' as const }
}
