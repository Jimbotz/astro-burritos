import { describe, expect, it } from 'vitest'
import { et0Daily, et0Series, ET0_PARAMETERS, psychrometricConstant, saturationVapourPressure, vapourPressureSlope, windAt2m } from '../../lib/analysis/et0'
import type { SeriesMap } from '../../lib/analysis/annual-rules'

describe('FAO-56 building blocks', () => {
  it('matches the FAO-56 tables and examples', () => {
    expect(saturationVapourPressure(21.5)).toBeCloseTo(2.564, 3) // Table 2.3
    expect(vapourPressureSlope(16.9)).toBeCloseTo(0.122, 3) // Example 18
    expect(psychrometricConstant(100.1)).toBeCloseTo(0.0666, 4)
    expect(windAt2m(3.2, 10)).toBeCloseTo(2.4, 1) // Example 14: 3.2 m/s at 10 m → 2.4 m/s at 2 m
  })

  it('reproduces FAO-56 Example 18 (Brussels, 6 July): ET0 ≈ 3.9 mm/day', () => {
    // Tmax 21.5, Tmin 12.3, ea 1.409 kPa (dew point 12.07 °C), u2 2.078 m/s (u10 2.78), Rn 13.28 MJ/m²/day, P 100.1 kPa.
    const value = et0Daily({ tMax: 21.5, tMin: 12.3, tDew: 12.07, wind10m: 2.078 / windAt2m(1), swDown: 13.28, swUp: 0, lwDown: 0, lwUp: 0, pressure: 100.1 })
    expect(value).toBeCloseTo(3.9, 1)
  })
})

function daily(days: number, valuesFor: (index: number) => Record<string, number> | null, year = 2001, month = 1) {
  const series = Object.fromEntries(ET0_PARAMETERS.map((parameter) => [parameter, new Map() as SeriesMap])) as Record<(typeof ET0_PARAMETERS)[number], SeriesMap>
  for (let day = 1; day <= days; day += 1) {
    const values = valuesFor(day)
    if (!values) continue
    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    for (const parameter of ET0_PARAMETERS) series[parameter].set(key, values[parameter])
  }
  return series
}
const normal = { T2M_MAX: 24, T2M_MIN: 8, T2MDEW: 4, WS10M: 2.5, ALLSKY_SFC_SW_DWN: 20, ALLSKY_SFC_SW_UP: 3, ALLSKY_SFC_LW_DWN: 25, ALLSKY_SFC_LW_UP: 32, PS: 78 }

describe('daily ET0 series and completeness', () => {
  it('keeps a month with ≥ 90% valid days (scaled, stated) and drops one below, never filling zeros', () => {
    // January 2001: 28 of 31 days (90.3%) → kept; days 29–31 missing are not zero.
    const kept = et0Series(daily(31, (day) => (day <= 28 ? normal : null)), 2001, 2001)
    expect(kept.monthly.has('2001-01')).toBe(true)
    expect(kept.quality.scaledMonths).toBe(1)
    expect(kept.quality.missingDays).toBe(365 - 28)
    expect(kept.notes).toContain('scaled-months')
    // 27 of 31 (87%) → dropped.
    const dropped = et0Series(daily(31, (day) => (day <= 27 ? normal : null)), 2001, 2001)
    expect(dropped.monthly.has('2001-01')).toBe(false)
  })

  it('flags impossible inputs and Tmin > Tmax instead of computing with them', () => {
    const series = et0Series(daily(31, (day) => (day === 1 ? { ...normal, PS: -999 } : day === 2 ? { ...normal, T2M_MIN: 30 } : normal)), 2001, 2001)
    expect(series.quality.flags['out-of-bounds:PS']).toBe(1)
    expect(series.quality.flags['tmin-above-tmax']).toBe(1)
    expect(series.daily.has('2001-01-01')).toBe(false)
    expect(series.daily.has('2001-01-03')).toBe(true)
    expect(series.notes).toContain('actual-surface-albedo')
  })
})
