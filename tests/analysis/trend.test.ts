import { describe, expect, it } from 'vitest'
import { aggregateAnnual, calculateTrend } from '../../lib/analysis/trend'
import { calculateLag1ResidualAutocorrelation, calculateMannKendall, calculateSenSlope } from '../../lib/analysis/robust-trend'
import { parsePowerMonthlyPayload } from '../../lib/nasa/client'
import type { AnnualObservation, NasaObservation } from '../../lib/nasa/types'

function monthlyObservation(year: number, month: number, value: number, unit = '°C'): NasaObservation {
  return {
    date: `${year}-${String(month).padStart(2, '0')}`,
    year,
    month,
    value,
    unit,
    daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  }
}

function annualObservation(year: number, value: number): AnnualObservation {
  return { year, value, unit: '°C', validObservationCount: 12, expectedObservationCount: 12, completeness: 1 }
}

describe('NASA POWER monthly parsing', () => {
  it('excludes the POWER annual YYYY13 record and fill values', () => {
    const observations = parsePowerMonthlyPayload({
      properties: { parameter: { T2M: { '200101': 10, '200102': -999, '200113': 10.5 } } },
      header: { fill_value: -999 },
    }, { parameter: 'T2M', latitude: 19.04, longitude: -98.2, startYear: 2001, endYear: 2001 })

    expect(observations).toHaveLength(1)
    expect(observations[0].date).toBe('2001-01')
  })
})

describe('annual aggregation', () => {
  it('converts monthly mm/day to a calendar-day annual total', () => {
    const observations = Array.from({ length: 12 }, (_, index) => monthlyObservation(2001, index + 1, 1, 'mm/day'))
    const [annual] = aggregateAnnual(observations, 'PRECTOTCORR')
    expect(annual.value).toBe(365)
    expect(annual.unit).toBe('mm/year')
  })

  it('uses a day-weighted annual temperature mean', () => {
    const observations = Array.from({ length: 12 }, (_, index) => monthlyObservation(2001, index + 1, 10))
    const [annual] = aggregateAnnual(observations, 'T2M')
    expect(annual.value).toBe(10)
    expect(annual.completeness).toBe(1)
  })

  it('records incomplete years instead of filling missing months', () => {
    const observations = Array.from({ length: 10 }, (_, index) => monthlyObservation(2001, index + 1, 10))
    const [annual] = aggregateAnnual(observations, 'T2M')
    expect(annual.validObservationCount).toBe(10)
    expect(annual.completeness).toBeCloseTo(10 / 12)
  })
})

describe('ordinary least squares trend', () => {
  it('recovers a linear slope and R² from a synthetic validation series', () => {
    const annual = Array.from({ length: 10 }, (_, index) => annualObservation(2001 + index, 2 + 0.5 * index))
    const trend = calculateTrend(annual)
    expect(trend.slopePerYear).toBeCloseTo(0.5)
    expect(trend.rSquared).toBeCloseTo(1)
    expect(trend.pValue).toBeNull()
    expect(trend.senSlopePerYear).toBeCloseTo(0.5)
    expect(trend.mannKendall?.tau).toBe(1)
    expect(trend.mannKendall?.pValue).toBeLessThan(0.05)
    expect(trend.autocorrelation.flagged).toBeNull()
  })

  it('does not manufacture significance for a constant series', () => {
    const trend = calculateTrend(Array.from({ length: 10 }, (_, index) => annualObservation(2001 + index, 2)))
    expect(trend.slopePerYear).toBe(0)
    expect(trend.rSquared).toBeNull()
    expect(trend.pValue).toBeNull()
    expect(trend.significantAt05).toBeNull()
    expect(trend.mannKendall?.pValue).toBeNull()
  })

  it('excludes any year without all 12 months, including 11 of 12 (audit finding A1)', () => {
    const elevenMonths: AnnualObservation = { year: 2005, value: 4, unit: '°C', validObservationCount: 11, expectedObservationCount: 12, completeness: 11 / 12 }
    const trend = calculateTrend([...Array.from({ length: 3 }, (_, index) => annualObservation(2001 + index, index)), elevenMonths])
    expect(trend.nYears).toBe(3)
    expect(trend.warnings[0]).toContain('all 12 monthly values')
  })

  it('keeps every year that has all 12 months', () => {
    const trend = calculateTrend(Array.from({ length: 5 }, (_, index) => annualObservation(2001 + index, index)))
    expect(trend.nYears).toBe(5)
    expect(trend.warnings.some((text) => text.includes('monthly values'))).toBe(false)
  })
})

describe('robust trend estimators', () => {
  it('computes Sen slope and a monotonic Mann–Kendall signal', () => {
    const points = Array.from({ length: 6 }, (_, index) => ({ year: 2001 + index, value: 3 + 2 * index }))
    expect(calculateSenSlope(points)).toBe(2)
    const result = calculateMannKendall(points)
    expect(result.tau).toBe(1)
    expect(result.significantAt05).toBe(true)
  })

  it('flags a residual series with strong lag-1 autocorrelation for later correction', () => {
    const result = calculateLag1ResidualAutocorrelation([1, 2, 1, 2, 1, 2])
    expect(Math.abs(result.lag1ResidualCorrelation as number)).toBeGreaterThan(0.8)
    expect(result.flagged).toBe(true)
  })
})
