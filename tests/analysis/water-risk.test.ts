import { describe, expect, it } from 'vitest'
import type { AnnualPoint } from '../../lib/analysis/annual-rules'
import { baselineDistribution, quantile } from '../../lib/analysis/impact-stats'
import { classifyWater, demandStress, observedDrought, storageStress, supplyStress, waterSensitivity, WATER_THRESHOLDS, type DroughtYears } from '../../lib/analysis/water-risk'
import { droughtSummaryFrom, droughtYearsFrom, municipalDrought, nearestStation, validateStation, type Station } from '../../lib/data/conagua'

/** 1991–2024: a baseline around `mean` with a ±spread cycle, and the last 5 years set by `recent`. */
function series(mean: number, spread: number, recent: Array<number | null>, end = 2024): AnnualPoint[] {
  const out: AnnualPoint[] = []
  for (let year = 1991; year <= end; year += 1) {
    const offset = end - year
    const value = offset < recent.length ? recent[recent.length - 1 - offset] : mean + spread * Math.sin(year * 1.7)
    out.push({ year, value, validCount: value === null ? 0 : 12, expectedCount: 12, complete: value !== null })
  }
  return out
}
const drought = (years: Array<[number, boolean]>): DroughtYears => years.map(([year, value]) => ({ year, covered: true, drought: value }))
const noDrought = drought([[2020, false], [2021, false], [2022, false], [2023, false], [2024, false]])

describe('water stress components', () => {
  it('supply stress needs low rain in at least 3 of the last 5 years', () => {
    expect(supplyStress(series(900, 100, [700, 650, 960, 690, 980]), 2024)).toMatchObject({ active: true, hits: [2020, 2021, 2023] })
    expect(supplyStress(series(900, 100, [700, 960, 950, 690, 980]), 2024)).toMatchObject({ active: false, hits: [2020, 2023] })
  })

  it('demand stress: ET0 above the 80th percentile in 3 of 5 years', () => {
    expect(demandStress(series(1450, 30, [1600, 1610, 1590, 1440, 1620]), null, 2024).active).toBe(true)
  })

  it('storage stress: low root-zone wetness persistently', () => {
    expect(storageStress(series(0.37, 0.03, [0.30, 0.31, 0.29, 0.40, 0.30]), 2024)).toMatchObject({ active: true, reason: 'below-percentile' })
  })

  it('a missing recent year makes a component not evaluable (never a zero)', () => {
    expect(supplyStress(series(900, 100, [700, 650, null, 690, 980]), 2024)).toMatchObject({ active: null, reason: 'not-evaluable' })
  })

  it('observed drought needs D1+ in 2 of the last 5 covered years, and enough coverage', () => {
    expect(observedDrought(drought([[2020, true], [2021, false], [2022, true], [2023, false], [2024, false]]), 2024).active).toBe(true)
    expect(observedDrought(noDrought, 2024).active).toBe(false)
    expect(observedDrought(drought([[2023, true], [2024, true]]), 2024).active).toBeNull() // only 2 of 5 covered
    expect(observedDrought(null, 2024).active).toBeNull() // municipality without drought history
  })
})

describe('water classification', () => {
  const calm = series(900, 100, [900, 920, 880, 910, 930])
  const calmEt0 = series(1450, 30, [1450, 1440, 1460, 1450, 1455])
  const calmWet = series(0.37, 0.03, [0.37, 0.38, 0.36, 0.37, 0.38])
  const dry = series(900, 100, [700, 650, 960, 690, 980])
  const hot = series(1450, 30, [1600, 1610, 1590, 1440, 1620])

  it('no-detectable, watch, planning-signal and corroborated', () => {
    const components = (precip: AnnualPoint[], et0: AnnualPoint[], years: DroughtYears | null) => ({ supplyStress: supplyStress(precip, 2024), demandStress: demandStress(et0, null, 2024), storageStress: storageStress(calmWet, 2024), observedDrought: observedDrought(years, 2024) })
    expect(classifyWater(components(calm, calmEt0, noDrought)).status).toBe('no-detectable')
    expect(classifyWater(components(dry, calmEt0, noDrought)).status).toBe('watch')
    // Double stress component: rain and atmospheric demand.
    expect(classifyWater(components(dry, hot, noDrought))).toMatchObject({ status: 'planning-signal', active: ['supplyStress', 'demandStress'] })
    expect(classifyWater(components(dry, hot, drought([[2020, true], [2021, true], [2022, false], [2023, false], [2024, false]]))).status).toBe('corroborated')
    // A nearby station's observed dryness also corroborates a planning signal.
    expect(classifyWater(components(dry, hot, null), true).status).toBe('corroborated')
  })

  it('insufficient-data when fewer than two climate components can be evaluated', () => {
    const gappy = series(900, 100, [700, null, 960, 690, 980])
    expect(classifyWater({ supplyStress: supplyStress(gappy, 2024), demandStress: demandStress(series(1450, 30, [1450, null, 1460, 1450, 1455]), null, 2024), storageStress: storageStress(calmWet, 2024), observedDrought: observedDrought(null, 2024) }).status).toBe('insufficient-data')
  })

  it('reports high sensitivity when the status changes with the 0.10 / 0.20 / 0.30 thresholds', () => {
    // Rain between the 20th and 30th percentile and above mean − 1 SD: active only with the 0.30 threshold.
    const base = baselineDistribution(series(900, 100, []))!
    const p20 = quantile(base.values, 0.2)!
    const p30 = quantile(base.values, 0.3)!
    const value = Math.max((p20 + p30) / 2, base.mean - base.sd + 0.5)
    expect(value).toBeLessThan(p30)
    const borderline = series(900, 100, [value, value, 960, value, 980])
    const result = waterSensitivity({ precip: borderline, et0: calmEt0, wetness: calmWet, et0Trend: null, drought: noDrought }, 2024, null)
    expect(new Set(Object.values(result.statuses)).size).toBeGreaterThan(1)
    expect(result.sensitivity).toBe('high')
    expect(WATER_THRESHOLDS.lowPrecipitationPercentile).toBe(0.2)
  })
})

describe('bundled CONAGUA/SMN data', () => {
  it('summarizes municipal drought: months, years, longest run and worst category', () => {
    const dates = ['2020-01-31', '2020-02-29', '2020-03-31', '2021-01-31', '2022-01-31', '2023-01-31', '2024-01-31']
    const summary = droughtSummaryFrom(dates, '-12-30-', 2024)
    expect(summary).toMatchObject({ monthsWithDrought: 3, yearsWithDrought: [2020, 2022], maxDurationMonths: 2, maxCategory: 'D3', recentYearsWithDrought: 2, recentYearsCovered: 5 })
    expect(droughtYearsFrom(dates, '-12-30-').find((item) => item.year === 2023)).toEqual({ year: 2023, covered: true, drought: false }) // D0 is not drought
  })

  it('returns null for a municipality without Drought Monitor history (absence of records ≠ no drought)', async () => {
    expect(await municipalDrought('99999', 2024)).toBeNull()
    const puebla = await municipalDrought('21114', 2024)
    expect(puebla?.summary.coverage.firstDate).toBe('2003-01')
  })

  it('finds no station far from the bundled study cells (municipality without a station)', async () => {
    expect(await nearestStation(25.67, -100.31, 30)).toBeNull() // Monterrey
    expect((await nearestStation(18.46, -97.39, 30))?.station.name).toBe('TEHUACAN')
  })

  it('does not correlate a station with many gaps (fewer than 10 common years)', () => {
    const years = Array.from({ length: 34 }, (_, index) => 1991 + index)
    const station: Station = { stationId: 'CONAGUA_0', id: '0', name: 'GAPPY', municipality: 'X', state: 'X', stateCode: '21', status: 'OPERANDO', lat: 19, lon: -98, altitude: null, cellId: '19.000_-98.125', url: '', sha256: '', retrievedAt: '', firstDate: null, lastDate: null, years, precipitation: years.map((year) => (year % 5 === 0 ? 800 : null)), tmax: [], tmin: [] }
    const power = years.map((year) => ({ year, value: 900, validCount: 12, expectedCount: 12, complete: true }))
    expect(validateStation(station, 3, '19.000_-98.125', power, 2024)).toMatchObject({ correlation: null, evidence: null, commonYears: 6 })
  })
})
