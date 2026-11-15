/**
 * Cleaning and annual aggregation rules for API v2.
 *
 * Rules (validated in the v2 audit):
 * - POWER's YYYY13 annual record, fill values and non-numeric values are dropped; nothing is imputed.
 * - A year counts only when it is complete: 12/12 months (or every day for daily rules).
 *   The legacy /api/series applies the same rule since finding A1 was fixed (it used to accept 11/12).
 * - Temperatures/humidity: day-weighted mean. Precipitation: mm/day × calendar days.
 */
import type { AggregationRule, SeasonId } from '../variables/catalog'

export type SeriesMap = Map<string, number>
export type AnnualPoint = {
  year: number
  value: number | null
  validCount: number
  expectedCount: number
  complete: boolean
  /** Difference from the 1991–2020 mean of the same series (absolute or %, per the variable profile). */
  anomaly?: number | null
}
export type MonthlyPoint = { date: string; value: number }
export type ClimatologyPoint = { month: number; value: number | null; years: number }

export const BASE_PERIOD = { startYear: 1991, endYear: 2020 } as const

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function daysInYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365
}

export const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`

/** Parses a POWER parameter object (YYYYMM or YYYYMMDD keys) into YYYY-MM / YYYY-MM-DD keys. */
export function parsePowerSeries(raw: Record<string, unknown> | undefined, fillValue = -999): SeriesMap {
  const out: SeriesMap = new Map()
  if (!raw) return out
  for (const [key, rawValue] of Object.entries(raw)) {
    const value = typeof rawValue === 'number' ? rawValue : Number(rawValue)
    if (!Number.isFinite(value) || value === fillValue || value === -999) continue
    if (/^\d{6}$/.test(key)) {
      const month = Number(key.slice(4, 6))
      if (month < 1 || month > 12) continue // YYYY13 is POWER's own annual aggregate
      out.set(`${key.slice(0, 4)}-${key.slice(4, 6)}`, value)
    } else if (/^\d{8}$/.test(key)) {
      out.set(`${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`, value)
    }
  }
  return out
}

/** Annual values from monthly records. */
export function annualFromMonthly(rule: AggregationRule, monthly: SeriesMap, startYear: number, endYear: number): AnnualPoint[] {
  if (rule === 'wet-season-sum') {
    // Rain of the cell's own wet season (its 6 rainiest months of 1991–2020); undefined where rain has no clear season.
    const seasons = cellSeasons(monthly)
    if (!seasons) return Array.from({ length: endYear - startYear + 1 }, (_, index) => ({ year: startYear + index, value: null, validCount: 0, expectedCount: 6, complete: false }))
    return seasonalValues(monthly, seasons.wet.months, seasons.wet.crossesYear, startYear, endYear, 'sum')
  }
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  const out: AnnualPoint[] = []
  for (let year = startYear; year <= endYear; year += 1) {
    const present = months.filter((month) => monthly.has(monthKey(year, month)))
    const complete = present.length === months.length
    let value: number | null = null
    if (complete) {
      const values = months.map((month) => monthly.get(monthKey(year, month)) as number)
      if (rule === 'day-weighted-mean') value = months.reduce((sum, month, index) => sum + values[index] * daysInMonth(year, month), 0) / daysInYear(year)
      else if (rule === 'sum') value = months.reduce((sum, month, index) => sum + values[index] * daysInMonth(year, month), 0)
      else if (rule === 'annual-max') value = Math.max(...values)
      else if (rule === 'annual-min') value = Math.min(...values)
      else throw new Error(`Rule ${rule} needs daily records.`)
    }
    out.push({ year, value, validCount: present.length, expectedCount: months.length, complete })
  }
  return out
}

function percentile(sorted: number[], q: number) {
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

/** Calendar-day percentile thresholds over the 1991–2020 base, 5-day centred window (29 Feb uses 28 Feb). */
export function calendarThresholds(daily: SeriesMap, q = 0.9): Map<string, number> | null {
  for (let year = BASE_PERIOD.startYear; year <= BASE_PERIOD.endYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) for (let day = 1; day <= daysInMonth(year, month); day += 1) {
      if (!daily.has(`${monthKey(year, month)}-${String(day).padStart(2, '0')}`)) return null
    }
  }
  const pools = new Map<string, number[]>()
  for (let year = BASE_PERIOD.startYear; year <= BASE_PERIOD.endYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) for (let day = 1; day <= daysInMonth(year, month); day += 1) {
      if (month === 2 && day === 29) continue
      const value = daily.get(`${monthKey(year, month)}-${String(day).padStart(2, '0')}`) as number
      for (let offset = -2; offset <= 2; offset += 1) {
        const date = new Date(Date.UTC(2001, month - 1, day + offset))
        const key = `${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
        const pool = pools.get(key) ?? []
        pool.push(value)
        pools.set(key, pool)
      }
    }
  }
  const thresholds = new Map<string, number>()
  for (const [key, pool] of pools) thresholds.set(key, percentile(pool.sort((a, b) => a - b), q))
  return thresholds
}

/** Annual values from daily records (daily-mean or percent-days-above-p90). */
export function annualFromDaily(rule: AggregationRule, daily: SeriesMap, startYear: number, endYear: number, thresholds?: Map<string, number> | null): AnnualPoint[] {
  const out: AnnualPoint[] = []
  for (let year = startYear; year <= endYear; year += 1) {
    const expected = daysInYear(year)
    const values: Array<{ key: string; value: number }> = []
    for (let month = 1; month <= 12; month += 1) for (let day = 1; day <= daysInMonth(year, month); day += 1) {
      const key = `${monthKey(year, month)}-${String(day).padStart(2, '0')}`
      const value = daily.get(key)
      if (value !== undefined) values.push({ key, value })
    }
    const complete = values.length === expected
    let value: number | null = null
    if (complete) {
      if (rule === 'daily-mean') value = values.reduce((sum, item) => sum + item.value, 0) / expected
      else if (rule === 'percent-days-above-p90') {
        if (thresholds) {
          const above = values.filter((item) => {
            const md = item.key.slice(5) === '02-29' ? '02-28' : item.key.slice(5)
            return item.value > (thresholds.get(md) as number)
          }).length
          value = (100 * above) / expected
        }
      } else throw new Error(`Rule ${rule} needs monthly records.`)
    }
    out.push({ year, value, validCount: values.length, expectedCount: expected, complete: complete && value !== null })
  }
  return out
}

/** Monthly series for charts, in the variable's own meaning (precipitation as monthly totals). */
export function monthlySeries(rule: AggregationRule, records: SeriesMap, startYear: number, endYear: number, daily = false): MonthlyPoint[] {
  const out: MonthlyPoint[] = []
  for (let year = startYear; year <= endYear; year += 1) for (let month = 1; month <= 12; month += 1) {
    if (daily) {
      const values: number[] = []
      for (let day = 1; day <= daysInMonth(year, month); day += 1) {
        const value = records.get(`${monthKey(year, month)}-${String(day).padStart(2, '0')}`)
        if (value !== undefined) values.push(value)
      }
      if (values.length === daysInMonth(year, month)) out.push({ date: monthKey(year, month), value: values.reduce((sum, value) => sum + value, 0) / values.length })
    } else {
      const value = records.get(monthKey(year, month))
      if (value === undefined) continue
      out.push({ date: monthKey(year, month), value: rule === 'sum' ? value * daysInMonth(year, month) : value })
    }
  }
  return out
}

/** Removes native records outside physical limits (counted, never clipped). */
export function applyBounds(series: SeriesMap, bounds: { min: number | null; max: number | null }) {
  const kept: SeriesMap = new Map()
  let removed = 0
  for (const [key, value] of series) {
    if ((bounds.min !== null && value < bounds.min) || (bounds.max !== null && value > bounds.max)) removed += 1
    else kept.set(key, value)
  }
  return { series: kept, removed }
}

// ---------- Seasons of each cell ----------

const MONTH_ABBR = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
} as const

/** The 6 rainiest consecutive months must hold at least this share of the 1991–2020 annual rain to call them a season. */
export const MIN_WET_SHARE = 0.6
/** Below this mean annual rain (hyper-arid places) a "wet season" is a handful of showers, so no seasons are defined. */
export const MIN_ANNUAL_RAIN_MM = 100

export type SeasonDefinition = { id: SeasonId; months: number[]; crossesYear: boolean; label: { es: string; en: string } }

/**
 * Seasons derived from the cell's own rain, so they work anywhere: the wet season is the 6 consecutive months with the
 * most rain in the 1991–2020 climatology, the dry season the other 6 (May–Oct / Nov–Apr in central Mexico).
 */
export type CellSeasons = { method: 'wettest-6-months'; basePeriod: '1991-2020'; minWetShare: number; wetShare: number; wet: SeasonDefinition; dry: SeasonDefinition }

/** Mean monthly rain total (mm) per calendar month over 1991–2020 from mm/day records; null if a month has < 25 base years. */
export function rainClimatology(precip: SeriesMap | undefined): number[] | null {
  if (!precip) return null
  const totals = Array.from({ length: 12 }, () => ({ sum: 0, years: 0 }))
  for (let year = BASE_PERIOD.startYear; year <= BASE_PERIOD.endYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const value = precip.get(monthKey(year, month))
      if (value === undefined) continue
      totals[month - 1].sum += value * daysInMonth(year, month)
      totals[month - 1].years += 1
    }
  }
  return totals.some((total) => total.years < 25) ? null : totals.map((total) => total.sum / total.years)
}

/** Six consecutive calendar months starting at `start` (1–12), wrapping past December. */
const sixMonths = (start: number) => Array.from({ length: 6 }, (_, index) => ((start - 1 + index) % 12) + 1)

function seasonDefinition(id: SeasonId, months: number[]): SeasonDefinition {
  const range = (lang: 'en' | 'es') => `${MONTH_ABBR[lang][months[0] - 1]}–${MONTH_ABBR[lang][months[5] - 1]}`
  return {
    id, months, crossesYear: months[0] > months[5],
    label: id === 'wet' ? { es: `Temporada de lluvias (${range('es')})`, en: `Wet season (${range('en')})` } : { es: `Temporada seca (${range('es')})`, en: `Dry season (${range('en')})` },
  }
}

/**
 * Wet and dry season of one cell, or null when the climatology is missing or rain has no clear season. The thresholds
 * default to MIN_WET_SHARE and MIN_ANNUAL_RAIN_MM; scripts/threshold-sensitivity.ts varies them.
 */
export function cellSeasons(precip: SeriesMap | undefined, thresholds: { minWetShare: number; minAnnualRainMm: number } = { minWetShare: MIN_WET_SHARE, minAnnualRainMm: MIN_ANNUAL_RAIN_MM }): CellSeasons | null {
  const climatology = rainClimatology(precip)
  if (!climatology) return null
  const annual = climatology.reduce((sum, value) => sum + value, 0)
  if (!(annual >= thresholds.minAnnualRainMm)) return null
  let wettestStart = 1
  let wettest = -Infinity
  for (let start = 1; start <= 12; start += 1) {
    const total = sixMonths(start).reduce((sum, month) => sum + climatology[month - 1], 0)
    if (total > wettest) { wettest = total; wettestStart = start }
  }
  const wetShare = wettest / annual
  if (wetShare < thresholds.minWetShare) return null
  return {
    method: 'wettest-6-months', basePeriod: '1991-2020', minWetShare: thresholds.minWetShare, wetShare,
    wet: seasonDefinition('wet', sixMonths(wettestStart)),
    dry: seasonDefinition('dry', sixMonths(((wettestStart + 5) % 12) + 1)),
  }
}

/**
 * Seasonal values. In a season that crosses the year, the months from its first month to December belong to the
 * previous calendar year (the dry season labelled 2010 is Nov 2009 – Apr 2010). Monthly records use a day-weighted
 * mean (or a sum for precipitation); daily records use the mean of every day.
 */
export function seasonalValues(records: SeriesMap, months: number[], crossesYear: boolean, startYear: number, endYear: number, mode: 'day-weighted-mean' | 'sum' | 'daily-mean'): AnnualPoint[] {
  const out: AnnualPoint[] = []
  for (let year = startYear; year <= endYear; year += 1) {
    const slots = months.map((month) => ({ year: crossesYear && month >= months[0] ? year - 1 : year, month }))
    let present = 0
    let weighted = 0
    let days = 0
    let complete = true
    for (const slot of slots) {
      const dim = daysInMonth(slot.year, slot.month)
      if (mode === 'daily-mean') {
        let count = 0
        for (let day = 1; day <= dim; day += 1) {
          const value = records.get(`${monthKey(slot.year, slot.month)}-${String(day).padStart(2, '0')}`)
          if (value !== undefined) { weighted += value; count += 1 }
        }
        days += count
        if (count === dim) present += 1
        else complete = false
      } else {
        const value = records.get(monthKey(slot.year, slot.month))
        if (value === undefined) { complete = false; continue }
        present += 1
        weighted += value * dim
        days += dim
      }
    }
    const value = complete && days > 0 ? (mode === 'sum' ? weighted : weighted / days) : null
    out.push({ year, value, validCount: present, expectedCount: months.length, complete: complete && value !== null })
  }
  return out
}

/** Mean of complete years in 1991–2020; null when fewer than 25 base years are available. */
export function baselineMean(points: AnnualPoint[]) {
  const base = points.filter((point) => point.complete && point.value !== null && point.year >= BASE_PERIOD.startYear && point.year <= BASE_PERIOD.endYear)
  return base.length >= 25 ? base.reduce((sum, point) => sum + (point.value as number), 0) / base.length : null
}

/** Adds anomalies against the 1991–2020 baseline (absolute difference or % of the baseline). */
export function withAnomalies(points: AnnualPoint[], kind: 'absolute' | 'percent', baseline: number | null): AnnualPoint[] {
  return points.map((point) => ({
    ...point,
    anomaly: baseline === null || point.value === null || !point.complete ? null : kind === 'percent' ? (baseline > 0 ? ((point.value - baseline) / baseline) * 100 : null) : point.value - baseline,
  }))
}

/** 1991–2020 monthly climatology from a monthly series. */
export function monthlyClimatology(series: MonthlyPoint[]): ClimatologyPoint[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1
    const values = series.filter((point) => Number(point.date.slice(5, 7)) === month && Number(point.date.slice(0, 4)) >= BASE_PERIOD.startYear && Number(point.date.slice(0, 4)) <= BASE_PERIOD.endYear).map((point) => point.value)
    return { month, value: values.length >= 25 ? values.reduce((sum, value) => sum + value, 0) / values.length : null, years: values.length }
  })
}
