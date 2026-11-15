import { describe, expect, it } from 'vitest'
import { annualFromDaily, annualFromMonthly, applyBounds, baselineMean, calendarThresholds, cellSeasons, daysInMonth, monthlyClimatology, monthlySeries, parsePowerSeries, seasonalValues, withAnomalies, type AnnualPoint, type SeriesMap } from '../../lib/analysis/annual-rules'

function monthlyYear(year: number, value: (month: number) => number, skip: number[] = []): SeriesMap {
  const map: SeriesMap = new Map()
  for (let month = 1; month <= 12; month += 1) if (!skip.includes(month)) map.set(`${year}-${String(month).padStart(2, '0')}`, value(month))
  return map
}

/** Monthly rain (mm/day) for every year in [a, b] following one calendar-month profile. */
function rainYears(a: number, b: number, profile: (month: number) => number): SeriesMap {
  const map: SeriesMap = new Map()
  for (let year = a; year <= b; year += 1) for (const [key, value] of monthlyYear(year, profile)) map.set(key, value)
  return map
}

function dailyRange(a: number, b: number, value: (year: number, month: number, day: number) => number): SeriesMap {
  const map: SeriesMap = new Map()
  for (let year = a; year <= b; year += 1) for (let month = 1; month <= 12; month += 1) for (let day = 1; day <= daysInMonth(year, month); day += 1) {
    map.set(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, value(year, month, day))
  }
  return map
}

describe('cleaning', () => {
  it('drops the YYYY13 annual record, fill values and non-numeric values', () => {
    const series = parsePowerSeries({ '200101': 1.5, '200102': -999, '200103': 'n/a', '200113': 9, '20010105': 2 })
    expect([...series.entries()]).toEqual([['2001-01', 1.5], ['2001-01-05', 2]])
  })
})

describe('monthly aggregation', () => {
  it('requires 12 of 12 months: an 11-month year is incomplete and has no value', () => {
    const [point] = annualFromMonthly('sum', monthlyYear(2001, () => 2, [8]), 2001, 2001)
    expect(point).toEqual({ year: 2001, value: null, validCount: 11, expectedCount: 12, complete: false })
  })

  it('sums precipitation with real calendar days and weights means by days', () => {
    expect(annualFromMonthly('sum', monthlyYear(2004, () => 1), 2004, 2004)[0].value).toBe(366)
    expect(annualFromMonthly('day-weighted-mean', monthlyYear(2001, () => 10), 2001, 2001)[0].value).toBeCloseTo(10, 12)
  })

  it('builds annual extremes', () => {
    expect(annualFromMonthly('annual-max', monthlyYear(2001, (m) => m), 2001, 2001)[0].value).toBe(12)
    expect(annualFromMonthly('annual-min', monthlyYear(2001, (m) => m), 2001, 2001)[0].value).toBe(1)
  })

  it('reports precipitation monthly series as monthly totals', () => {
    const series = monthlySeries('sum', monthlyYear(2001, () => 2), 2001, 2001)
    expect(series[1]).toEqual({ date: '2001-02', value: 56 })
  })
})

describe('daily aggregation', () => {
  it('averages every day and rejects a year with a missing day', () => {
    const daily = dailyRange(2001, 2002, (_, month) => month)
    daily.delete('2002-06-15')
    const [complete, incomplete] = annualFromDaily('daily-mean', daily, 2001, 2002)
    expect(complete.complete).toBe(true)
    expect(complete.value).toBeCloseTo((31 * 1 + 28 * 2 + 31 * 3 + 30 * 4 + 31 * 5 + 30 * 6 + 31 * 7 + 31 * 8 + 30 * 9 + 31 * 10 + 30 * 11 + 31 * 12) / 365, 10)
    expect(incomplete).toMatchObject({ complete: false, value: null, validCount: 364 })
  })

  it('counts days above the 1991–2020 calendar-day 90th percentile', () => {
    const daily = dailyRange(1991, 2022, (year, month, day) => (year <= 2020 ? (year * 7 + month * 3 + day) % 10 : year === 2021 ? 100 : -100))
    const thresholds = calendarThresholds(daily, 0.9)
    expect(thresholds).not.toBeNull()
    const [y2021, y2022] = annualFromDaily('percent-days-above-p90', daily, 2021, 2022, thresholds)
    expect(y2021.value).toBe(100)
    expect(y2022.value).toBe(0)
    const base = annualFromDaily('percent-days-above-p90', daily, 1991, 2020, thresholds)
    const meanShare = base.reduce((sum, point) => sum + (point.value as number), 0) / base.length
    expect(meanShare).toBeGreaterThan(0)
    expect(meanShare).toBeLessThan(15)
  })

  it('refuses percentile thresholds when the base period is incomplete', () => {
    const daily = dailyRange(1991, 2020, () => 1)
    daily.delete('2000-03-01')
    expect(calendarThresholds(daily)).toBeNull()
  })
})

describe('climatology', () => {
  it('needs at least 25 of the 30 base years per month', () => {
    const series = Array.from({ length: 24 }, (_, i) => ({ date: `${1991 + i}-01`, value: 5 }))
    expect(monthlyClimatology(series)[0]).toEqual({ month: 1, value: null, years: 24 })
    const full = Array.from({ length: 30 }, (_, i) => ({ date: `${1991 + i}-01`, value: 5 }))
    expect(monthlyClimatology(full)[0].value).toBe(5)
  })
})

describe('profile rules', () => {
  it('removes records outside physical bounds and counts them', () => {
    const series: SeriesMap = new Map([['2001-01', 50], ['2001-02', 101], ['2001-03', -1]])
    const result = applyBounds(series, { min: 0, max: 100 })
    expect([...result.series.keys()]).toEqual(['2001-01'])
    expect(result.removed).toBe(2)
  })

  it('assigns November–December to the next dry season and needs every month', () => {
    const map: SeriesMap = new Map()
    for (const [year, month] of [[2009, 11], [2009, 12], [2010, 1], [2010, 2], [2010, 3], [2010, 4]]) map.set(`${year}-${String(month).padStart(2, '0')}`, month >= 11 ? 20 : 10)
    const [dry2010] = seasonalValues(map, [11, 12, 1, 2, 3, 4], true, 2010, 2010, 'day-weighted-mean')
    const days = 30 + 31 + 31 + 28 + 31 + 30
    expect(dry2010.value).toBeCloseTo((20 * 61 + 10 * (days - 61)) / days, 10)
    map.delete('2009-12')
    expect(seasonalValues(map, [11, 12, 1, 2, 3, 4], true, 2010, 2010, 'day-weighted-mean')[0]).toMatchObject({ complete: false, value: null, validCount: 5 })
  })

  it('computes the 1991–2020 baseline only with 25 or more complete years and derives anomalies', () => {
    const points: AnnualPoint[] = Array.from({ length: 34 }, (_, i) => ({ year: 1991 + i, value: i < 30 ? 10 : 12, validCount: 12, expectedCount: 12, complete: true }))
    expect(baselineMean(points)).toBe(10)
    expect(withAnomalies(points, 'absolute', 10).at(-1)?.anomaly).toBe(2)
    expect(withAnomalies(points, 'percent', 10).at(-1)?.anomaly).toBeCloseTo(20, 10)
    expect(baselineMean(points.slice(0, 24))).toBeNull()
  })
})

describe('seasons of each cell (6 rainiest months of 1991–2020)', () => {
  // Central Mexico: rain from May to October.
  const puebla = rainYears(1981, 2024, (m) => (m >= 5 && m <= 10 ? 5 : 0.4))
  // Southern hemisphere summer rain (e.g. southern Brazil interior): October to March.
  const south = rainYears(1981, 2024, (m) => (m >= 10 || m <= 3 ? 6 : 0.5))

  it('finds May–Oct / Nov–Apr in central Mexico', () => {
    const seasons = cellSeasons(puebla)!
    expect(seasons.wet.months).toEqual([5, 6, 7, 8, 9, 10])
    expect(seasons.wet.crossesYear).toBe(false)
    expect(seasons.dry.months).toEqual([11, 12, 1, 2, 3, 4])
    expect(seasons.dry.crossesYear).toBe(true)
    expect(seasons.wet.label.en).toBe('Wet season (May–Oct)')
    expect(seasons.dry.label.es).toBe('Temporada seca (nov–abr)')
    expect(seasons.wetShare).toBeGreaterThan(0.8)
  })

  it('finds a wet season that crosses the year in the southern hemisphere', () => {
    const seasons = cellSeasons(south)!
    expect(seasons.wet.months).toEqual([10, 11, 12, 1, 2, 3])
    expect(seasons.wet.crossesYear).toBe(true)
    expect(seasons.wet.label.en).toBe('Wet season (Oct–Mar)')
    expect(seasons.dry.months).toEqual([4, 5, 6, 7, 8, 9])
  })

  it('declines to define seasons where rain is spread through the year or the base period is missing', () => {
    expect(cellSeasons(rainYears(1981, 2024, (m) => 3 + (m % 2) * 0.2))).toBeNull()
    expect(cellSeasons(rainYears(2001, 2024, (m) => (m >= 5 && m <= 10 ? 5 : 0.4)))).toBeNull()
    expect(cellSeasons(rainYears(1981, 2024, (m) => (m >= 6 && m <= 9 ? 0.2 : 0.01)))).toBeNull() // ≈ 26 mm a year: desert
  })

  it('totals the wet season of each cell, labelling a crossing season by the year it ends', () => {
    // Oct 2009 – Mar 2010 at 6 mm/day: 31+30+31 + 31+28+31 = 182 days.
    const [point] = annualFromMonthly('wet-season-sum', south, 2010, 2010)
    expect(point).toMatchObject({ year: 2010, complete: true, value: 182 * 6 })
    expect(annualFromMonthly('wet-season-sum', puebla, 2001, 2001)[0].value).toBe(184 * 5)
    expect(seasonalValues(south, [10, 11, 12, 1, 2, 3], true, 1981, 1981, 'sum')[0].complete).toBe(false) // Oct–Dec 1980 not fetched
  })
})
