/**
 * Baseline and recent-window statistics shared by the impact lenses: percentiles against the 1991–2020 distribution
 * of annual values, recent years, moving averages and anomalies. Only complete years count; nothing is imputed.
 */
import { BASE_PERIOD, type AnnualPoint } from './annual-rules'

export const MIN_BASE_YEARS = 25

/** Linear-interpolation quantile (type 7) of an ascending array. */
export function quantile(sorted: number[], q: number) {
  if (!sorted.length) return null
  const position = (sorted.length - 1) * q
  const low = Math.floor(position)
  const high = Math.ceil(position)
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low)
}

const completeValues = (points: AnnualPoint[], from: number, to: number) => points.filter((point) => point.complete && point.value !== null && point.year >= from && point.year <= to).map((point) => point.value as number)

export type Baseline = { values: number[]; mean: number; sd: number; years: number }

/** The 1991–2020 distribution of complete annual values; null with fewer than 25 complete base years. */
export function baselineDistribution(points: AnnualPoint[], minYears = MIN_BASE_YEARS): Baseline | null {
  const values = completeValues(points, BASE_PERIOD.startYear, BASE_PERIOD.endYear).sort((a, b) => a - b)
  if (values.length < minYears) return null
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1))
  return { values, mean, sd, years: values.length }
}

/** Share of baseline years at or below `value` (0–1). */
export function percentileRank(value: number, baseline: Baseline) {
  return baseline.values.filter((item) => item <= value).length / baseline.values.length
}

/** The `years` calendar years ending at endYear, each with its complete value or null. */
export function recentWindow(points: AnnualPoint[], endYear: number, years = 5) {
  const window = Array.from({ length: years }, (_, index) => endYear - years + 1 + index)
  return window.map((year) => {
    const point = points.find((item) => item.year === year)
    return { year, value: point && point.complete && point.value !== null ? point.value : null }
  })
}

export type RecentStats = { years: number[]; mean: number | null; baselineMean: number | null; percentile: number | null; anomaly: number | null; anomalyPercent: number | null; movingAverage5: number | null; yearsBelowP20: number | null; yearsAboveP80: number | null }

/** Recent-years statistics of an annual series against its 1991–2020 baseline (null parts when they cannot be computed). */
export function recentStats(points: AnnualPoint[], endYear: number, years = 5, low = 0.2, high = 0.8): RecentStats {
  const window = recentWindow(points, endYear, years)
  const values = window.map((item) => item.value).filter((value): value is number => value !== null)
  const baseline = baselineDistribution(points)
  // The 5-year mean needs at least 4 complete years of the 5, so a single year cannot stand in for the window.
  const mean = values.length >= years - 1 ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  const p20 = baseline ? quantile(baseline.values, low) : null
  const p80 = baseline ? quantile(baseline.values, high) : null
  return {
    years: window.map((item) => item.year),
    mean,
    baselineMean: baseline?.mean ?? null,
    percentile: mean !== null && baseline ? percentileRank(mean, baseline) : null,
    anomaly: mean !== null && baseline ? mean - baseline.mean : null,
    anomalyPercent: mean !== null && baseline && baseline.mean !== 0 ? ((mean - baseline.mean) / Math.abs(baseline.mean)) * 100 : null,
    movingAverage5: mean,
    yearsBelowP20: p20 === null ? null : values.filter((value) => value < p20).length,
    yearsAboveP80: p80 === null ? null : values.filter((value) => value > p80).length,
  }
}

/** Difference series a − b for the years both have complete (e.g. precipitation − ET0). */
export function differenceSeries(a: AnnualPoint[], b: AnnualPoint[]): AnnualPoint[] {
  const other = new Map(b.map((point) => [point.year, point]))
  return a.map((point) => {
    const match = other.get(point.year)
    const complete = point.complete && point.value !== null && Boolean(match?.complete) && match?.value !== null && match?.value !== undefined
    return { year: point.year, value: complete ? (point.value as number) - (match!.value as number) : null, validCount: complete ? 1 : 0, expectedCount: 1, complete }
  })
}
