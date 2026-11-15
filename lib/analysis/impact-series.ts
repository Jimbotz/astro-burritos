/**
 * Annual series of the impact lenses from POWER daily records, with the existing EarthScope rules:
 * monthly means need ≥ 90% valid days, years need 12 of 12 months (sums use mean × days in month, as for /api/point),
 * the wet season is the cell's own (cellSeasons), and TX90p/TN90p use the calendar-day 90th percentile of 1991–2020
 * with a 5-day window (calendarThresholds). Shared by scripts/impact/preprocess-power.ts and the live service.
 */
import { annualFromDaily, annualFromMonthly, applyBounds, calendarThresholds, cellSeasons, daysInMonth, monthKey, seasonalValues, type AnnualPoint, type CellSeasons, type SeriesMap } from './annual-rules'
import { et0Series, type Et0Parameter, type Et0Series } from './et0'
import { differenceSeries } from './impact-stats'

export const MIN_MONTH_DAY_SHARE = 0.9

/** Monthly mean of daily values (keys YYYY-MM) for months with at least 90% valid days. */
export function dailyToMonthlyMean(daily: SeriesMap, startYear: number, endYear: number, minShare = MIN_MONTH_DAY_SHARE): SeriesMap {
  const out: SeriesMap = new Map()
  for (let year = startYear; year <= endYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const dim = daysInMonth(year, month)
      let sum = 0
      let count = 0
      for (let day = 1; day <= dim; day += 1) {
        const value = daily.get(`${monthKey(year, month)}-${String(day).padStart(2, '0')}`)
        if (value !== undefined) { sum += value; count += 1 }
      }
      if (count / dim >= minShare) out.set(monthKey(year, month), sum / count)
    }
  }
  return out
}

export type WaterSeries = {
  seasons: CellSeasons | null
  precip: AnnualPoint[]
  precipWet: AnnualPoint[] | null
  et0: AnnualPoint[]
  et0Wet: AnnualPoint[] | null
  balance: AnnualPoint[]
  balanceWet: AnnualPoint[] | null
  wetness: AnnualPoint[]
  et0Detail: Et0Series
  outOfBounds: { precip: number; wetness: number }
}

/** Precipitation, ET0, climate water balance and root-zone wetness for one cell. */
export function waterSeriesFromDaily(inputs: Record<Et0Parameter | 'PRECTOTCORR' | 'GWETROOT', SeriesMap>, startYear: number, endYear: number): WaterSeries {
  const rain = applyBounds(inputs.PRECTOTCORR, { min: 0, max: 500 })
  const wet = applyBounds(inputs.GWETROOT, { min: 0, max: 1 })
  const precipMonthly = dailyToMonthlyMean(rain.series, startYear, endYear)
  const wetnessMonthly = dailyToMonthlyMean(wet.series, startYear, endYear)
  const et0Detail = et0Series(inputs, startYear, endYear)
  const seasons = cellSeasons(precipMonthly)
  const precip = annualFromMonthly('sum', precipMonthly, startYear, endYear)
  const et0 = annualFromMonthly('sum', et0Detail.monthly, startYear, endYear)
  const seasonal = (monthly: SeriesMap) => (seasons ? seasonalValues(monthly, seasons.wet.months, seasons.wet.crossesYear, startYear, endYear, 'sum') : null)
  const precipWet = seasonal(precipMonthly)
  const et0Wet = seasonal(et0Detail.monthly)
  return {
    seasons,
    precip,
    precipWet,
    et0,
    et0Wet,
    balance: differenceSeries(precip, et0),
    balanceWet: precipWet && et0Wet ? differenceSeries(precipWet, et0Wet) : null,
    wetness: annualFromMonthly('day-weighted-mean', wetnessMonthly, startYear, endYear),
    et0Detail,
    outOfBounds: { precip: rain.removed, wetness: wet.removed },
  }
}

export type HeatSeries = { tx90p: AnnualPoint[]; tn90p: AnnualPoint[]; txx: AnnualPoint[]; tnn: AnnualPoint[]; thresholdsAvailable: boolean }

/** Warm days and nights (% of days above the calendar-day p90 of 1991–2020) and the annual extremes from daily data. */
export function heatSeriesFromDaily(tMax: SeriesMap, tMin: SeriesMap, startYear: number, endYear: number): HeatSeries {
  const max = applyBounds(tMax, { min: -60, max: 60 }).series
  const min = applyBounds(tMin, { min: -70, max: 50 }).series
  const maxThresholds = calendarThresholds(max, 0.9)
  const minThresholds = calendarThresholds(min, 0.9)
  return {
    tx90p: annualFromDaily('percent-days-above-p90', max, startYear, endYear, maxThresholds),
    tn90p: annualFromDaily('percent-days-above-p90', min, startYear, endYear, minThresholds),
    txx: annualMaxFromDaily(max, startYear, endYear, 'max'),
    tnn: annualMaxFromDaily(min, startYear, endYear, 'min'),
    thresholdsAvailable: Boolean(maxThresholds && minThresholds),
  }
}

/** Hottest day (max of daily maxima) or coldest night (min of daily minima); a year needs every day. */
function annualMaxFromDaily(daily: SeriesMap, startYear: number, endYear: number, mode: 'max' | 'min'): AnnualPoint[] {
  const out: AnnualPoint[] = []
  for (let year = startYear; year <= endYear; year += 1) {
    let count = 0
    let extreme: number | null = null
    let expected = 0
    for (let month = 1; month <= 12; month += 1) {
      for (let day = 1; day <= daysInMonth(year, month); day += 1) {
        expected += 1
        const value = daily.get(`${monthKey(year, month)}-${String(day).padStart(2, '0')}`)
        if (value === undefined) continue
        count += 1
        extreme = extreme === null ? value : mode === 'max' ? Math.max(extreme, value) : Math.min(extreme, value)
      }
    }
    const complete = count === expected
    out.push({ year, value: complete ? extreme : null, validCount: count, expectedCount: expected, complete })
  }
  return out
}

/** Compact storage of an annual series aligned to `years` (null for incomplete years). */
export const packSeries = (points: AnnualPoint[] | null, years: number[]) => years.map((year) => {
  const point = points?.find((item) => item.year === year)
  return point && point.complete && point.value !== null ? Number(point.value.toFixed(3)) : null
})

export const unpackSeries = (values: Array<number | null>, years: number[]): AnnualPoint[] => years.map((year, index) => {
  const value = values[index] ?? null
  return { year, value, validCount: value === null ? 0 : 1, expectedCount: 1, complete: value !== null }
})

