/**
 * Concordance between two annual records: two sources for one place (MERRA-2 vs IMERG rain in GET /api/crosscheck)
 * or one source for two places (the place comparison in the interface). Both use the same three questions:
 *
 * 1. Level: do they give the same amount? (difference of the means over the common complete years)
 * 2. Year to year: do they see the same high and low years? (Pearson r after removing each record's own OLS line,
 *    so a shared trend does not inflate it)
 * 3. Trend: do they tell the same trend story? (classification below)
 *
 * The rules use conventional values, fixed before any result was computed with them, and are never tuned per place
 * (the project rule for every threshold; see docs/science/methodology.md).
 */
import type { AnnualPoint } from './annual-rules'
import { olsFit } from './robust-stats'
import { MIN_TREND_YEARS } from './robust-assessment'

export const CONCORDANCE_RULES = {
  /** A record "detects" a trend when its Hamed–Rao Mann–Kendall p is below alpha. */
  alpha: 0.05,
  /** Rates are compared through their 95% intervals (Sen–Gilbert for rain, the primary interval for places). */
  interval: 0.95,
  /** Same minimum as any trend in EarthScope. */
  minCommonYears: MIN_TREND_YEARS,
  /** |r| of the detrended annual values: ≥ 0.7 strong, < 0.4 weak, moderate in between. */
  strongCorrelation: 0.7,
  weakCorrelation: 0.4,
  /** Means within ±10% count as the same level. */
  levelTolerancePercent: 10,
} as const

export type Agreement = 'agree' | 'disagree' | 'inconclusive' | 'insufficient-data'
/**
 * same-direction: both detect a trend of the same sign with overlapping intervals · opposite-directions: both detect
 * trends of opposite sign · incompatible-rates: the two intervals do not overlap · one-detects: only one record finds
 * a trend · neither-detects: neither finds one · too-few-years: fewer than 10 complete years in one of them.
 */
export type AgreementReason = 'same-direction' | 'opposite-directions' | 'incompatible-rates' | 'one-detects' | 'neither-detects' | 'too-few-years'
export type YearToYear = 'strong' | 'moderate' | 'weak'

export type TrendEvidence = { slopePerDecade: number | null; ci95PerDecade: [number, number] | null; pValue: number | null; nYears: number }

export type TrendComparison = {
  agreement: Agreement
  reason: AgreementReason
  /** Whether each record detects a trend (p < alpha), in the order the records were given. */
  detected: [boolean, boolean]
  intervalsOverlap: boolean | null
}

export type LevelComparison = {
  years: number[]
  meanA: number | null
  meanB: number | null
  /** (meanB − meanA) / meanA × 100. */
  differencePercent: number | null
  sameLevel: boolean | null
  /** Pearson r of the detrended annual values over the common complete years. */
  correlation: number | null
  yearToYear: YearToYear | null
}

export function compareTrends(a: TrendEvidence, b: TrendEvidence, rules = CONCORDANCE_RULES): TrendComparison {
  if (a.slopePerDecade === null || b.slopePerDecade === null || !a.ci95PerDecade || !b.ci95PerDecade || a.pValue === null || b.pValue === null || a.nYears < rules.minCommonYears || b.nYears < rules.minCommonYears) {
    return { agreement: 'insufficient-data', reason: 'too-few-years', detected: [false, false], intervalsOverlap: null }
  }
  const detected: [boolean, boolean] = [a.pValue < rules.alpha, b.pValue < rules.alpha]
  const intervalsOverlap = a.ci95PerDecade[0] <= b.ci95PerDecade[1] && b.ci95PerDecade[0] <= a.ci95PerDecade[1]
  const opposite = Math.sign(a.slopePerDecade) !== Math.sign(b.slopePerDecade)
  if (detected[0] && detected[1] && opposite) return { agreement: 'disagree', reason: 'opposite-directions', detected, intervalsOverlap }
  if (!intervalsOverlap) return { agreement: 'disagree', reason: 'incompatible-rates', detected, intervalsOverlap }
  if (detected[0] && detected[1]) return { agreement: 'agree', reason: 'same-direction', detected, intervalsOverlap }
  return { agreement: 'inconclusive', reason: detected[0] || detected[1] ? 'one-detects' : 'neither-detects', detected, intervalsOverlap }
}

export function pearson(x: number[], y: number[]) {
  const n = x.length
  if (n < 3 || n !== y.length) return null
  const mx = x.reduce((sum, value) => sum + value, 0) / n
  const my = y.reduce((sum, value) => sum + value, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let index = 0; index < n; index += 1) {
    sxy += (x[index] - mx) * (y[index] - my)
    sxx += (x[index] - mx) ** 2
    syy += (y[index] - my) ** 2
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null
}

const detrend = (years: number[], values: number[]) => {
  const fit = olsFit({ x: years, y: values })
  return values.map((value, index) => value - (fit.intercept + fit.slope * years[index]))
}

/** Level and year-to-year agreement over the years both records have complete. */
export function compareLevels(a: AnnualPoint[], b: AnnualPoint[], rules = CONCORDANCE_RULES): LevelComparison {
  const byYear = new Map(b.filter((point) => point.complete && point.value !== null).map((point) => [point.year, point.value as number]))
  const pairs = a.filter((point) => point.complete && point.value !== null && byYear.has(point.year)).map((point) => ({ year: point.year, a: point.value as number, b: byYear.get(point.year) as number }))
  const years = pairs.map((pair) => pair.year)
  if (pairs.length < rules.minCommonYears) return { years, meanA: null, meanB: null, differencePercent: null, sameLevel: null, correlation: null, yearToYear: null }
  const meanA = pairs.reduce((sum, pair) => sum + pair.a, 0) / pairs.length
  const meanB = pairs.reduce((sum, pair) => sum + pair.b, 0) / pairs.length
  const differencePercent = meanA !== 0 ? ((meanB - meanA) / Math.abs(meanA)) * 100 : null
  const correlation = pearson(detrend(years, pairs.map((pair) => pair.a)), detrend(years, pairs.map((pair) => pair.b)))
  const yearToYear = correlation === null ? null : correlation >= rules.strongCorrelation ? 'strong' : correlation < rules.weakCorrelation ? 'weak' : 'moderate'
  return { years, meanA, meanB, differencePercent, sameLevel: differencePercent === null ? null : Math.abs(differencePercent) < rules.levelTolerancePercent, correlation, yearToYear }
}
