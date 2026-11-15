/**
 * Heat-exposure lens (IMPLEMENTACION_LENTES_IMPACTO §8): a climate hazard from warm days and nights, corroborated by
 * the annual extremes, kept separate from population exposure. It is "climate exposure to heat", not a health impact:
 * there are no health, vulnerability or mortality data in it.
 *
 * - planning-signal: TX90p or TN90p rises with a significant Hamed–Rao Mann–Kendall test (p < 0.05), a primary
 *   95% interval that excludes zero, a rate above the variable's relevance threshold and at least 20 complete years.
 * - corroborated: a planning signal confirmed by its extreme (TXx for warm days, TNn for warm nights) rising with
 *   p < 0.05 and an interval that excludes zero.
 * - watch: no planning signal, but the last 5 years of TX90p or TN90p average above the 1991–2020 80th percentile.
 * - no-detectable: none of the above. insufficient-data: neither index has 10 complete years.
 */
import type { AnnualPoint } from './annual-rules'
import { MIN_TREND_YEARS, type RobustTrend } from './robust-assessment'
import { baselineDistribution, quantile, recentWindow } from './impact-stats'
import type { HeatPriorityStatus, ImpactStatus } from '../api/impact-types'

export const HEAT_THRESHOLDS = {
  alpha: 0.05,
  minCompleteYears: 20,
  recentWindowYears: 5,
  recentLoadPercentile: 0.8,
  /** Exposure that makes a hazard a "high-exposure" signal: people in the area, or an urban majority. */
  highExposurePopulation: 100_000,
  highUrbanFraction: 0.5,
} as const

export type SignalCriteria = { mannKendall: boolean; intervalExcludesZero: boolean; exceedsRelevance: boolean; enoughYears: boolean; upward: boolean }

export function heatSignal(trend: RobustTrend | null, rules = HEAT_THRESHOLDS): { meets: boolean; criteria: SignalCriteria } {
  const ci = trend?.display.ci95 ?? null
  const criteria: SignalCriteria = {
    mannKendall: trend?.pValueHamedRao !== null && trend?.pValueHamedRao !== undefined && trend.pValueHamedRao < rules.alpha,
    intervalExcludesZero: ci !== null && ci[0] * ci[1] > 0,
    exceedsRelevance: trend?.display.exceedsRelevance === true,
    enoughYears: (trend?.nYears ?? 0) >= rules.minCompleteYears,
    upward: (trend?.display.slope ?? 0) > 0,
  }
  return { meets: Object.values(criteria).every(Boolean), criteria }
}

/** An annual extreme confirms a signal when it rises with p < alpha and an interval that excludes zero. */
export function extremeConfirms(trend: RobustTrend | null, rules = HEAT_THRESHOLDS) {
  if (!trend || trend.pValueHamedRao === null || !trend.display.ci95 || trend.display.slope === null) return false
  return trend.pValueHamedRao < rules.alpha && trend.display.ci95[0] > 0 && trend.display.slope > 0
}

/** Recent thermal load: mean of the last 5 complete years against the 1991–2020 80th percentile of the same index. */
export function recentLoad(points: AnnualPoint[], endYear: number, rules = HEAT_THRESHOLDS) {
  const window = recentWindow(points, endYear, rules.recentWindowYears).filter((item) => item.value !== null) as Array<{ year: number; value: number }>
  const baseline = baselineDistribution(points)
  if (!baseline || window.length < rules.recentWindowYears - 1) return { mean: null, threshold: null, high: null }
  const mean = window.reduce((sum, item) => sum + item.value, 0) / window.length
  const threshold = quantile(baseline.values, rules.recentLoadPercentile) as number
  return { mean, threshold, high: mean > threshold }
}

export type HeatInputs = { tx90p: { trend: RobustTrend | null; annual: AnnualPoint[] }; tn90p: { trend: RobustTrend | null; annual: AnnualPoint[] }; txx: RobustTrend | null; tnn: RobustTrend | null }

export function classifyHeat(inputs: HeatInputs, endYear: number, rules = HEAT_THRESHOLDS) {
  const warmDays = heatSignal(inputs.tx90p.trend, rules)
  const warmNights = heatSignal(inputs.tn90p.trend, rules)
  const hotExtreme = extremeConfirms(inputs.txx, rules)
  const coldExtreme = extremeConfirms(inputs.tnn, rules)
  const loadDays = recentLoad(inputs.tx90p.annual, endYear, rules)
  const loadNights = recentLoad(inputs.tn90p.annual, endYear, rules)
  const enough = (trend: RobustTrend | null) => (trend?.nYears ?? 0) >= MIN_TREND_YEARS
  let status: ImpactStatus
  if (!enough(inputs.tx90p.trend) && !enough(inputs.tn90p.trend)) status = 'insufficient-data'
  else if ((warmDays.meets && hotExtreme) || (warmNights.meets && coldExtreme)) status = 'corroborated'
  else if (warmDays.meets || warmNights.meets) status = 'planning-signal'
  else if (loadDays.high || loadNights.high) status = 'watch'
  else status = 'no-detectable'
  return {
    status,
    components: { warmDays: warmDays.meets, warmNights: warmNights.meets, hotExtreme, coldExtreme },
    criteria: { warmDays: warmDays.criteria, warmNights: warmNights.criteria },
    recentLoad: { warmDays: loadDays, warmNights: loadNights },
  }
}

/**
 * Hazard and exposure stay separate; priority is their explicit combination.
 * high-exposure-signal: planning-signal or corroborated hazard over ≥ 100,000 people or an urban majority.
 */
export function heatPriority(status: ImpactStatus, exposure: { population: number | null; urbanFraction: number | null }, rules = HEAT_THRESHOLDS): HeatPriorityStatus {
  if (exposure.population === null) return 'exposure-unknown'
  const hazard = status === 'planning-signal' || status === 'corroborated'
  const high = exposure.population >= rules.highExposurePopulation || (exposure.urbanFraction ?? 0) >= rules.highUrbanFraction
  if (hazard && high) return 'high-exposure-signal'
  if (hazard) return 'signal-lower-exposure'
  if (high) return 'exposure-without-signal'
  return 'no-priority'
}
