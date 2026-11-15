import { describe, expect, it } from 'vitest'
import { dailyYearCoverage, normalizePowerDaily, validateRecords, validSeries, type NormalizedRecord } from '../../lib/analysis/impact-quality'

const record = (overrides: Partial<NormalizedRecord> = {}): NormalizedRecord => ({
  date: '2024-07-15', year: 2024, month: 7, day: 15, latitude: 19.04, longitude: -98.2, cellId: '19.000_-98.125', variable: 'PRECTOTCORR', value: 4.2, unit: 'mm/day', sourceId: 'nasa-power',
  quality: { valid: false, flags: [], missing: false }, ...overrides,
})

describe('normalized records: flagged first, never dropped silently', () => {
  it('turns the -999 fill value into a missing value, never into zero', () => {
    const records = [record({ value: -999 })]
    const summary = validateRecords(records)
    expect(records[0].value).toBeNull()
    expect(records[0].quality).toMatchObject({ missing: true, valid: false })
    expect(records[0].quality.flags).toContain('fill-value')
    expect(summary.missing).toBe(1)
  })

  it('flags out-of-range values, impossible dates, bad coordinates, duplicates and unit mismatches', () => {
    const records = [
      record({ value: 600 }),
      record({ date: '2023-02-30', year: 2023, month: 2, day: 30 }),
      record({ date: '2024-07-18', day: 18, latitude: 95 }),
      record({ date: '2024-07-16', day: 16 }),
      record({ date: '2024-07-16', day: 16 }),
      record({ date: '2024-07-17', day: 17, unit: 'mm' }),
    ]
    const summary = validateRecords(records)
    expect(records.map((item) => item.quality.flags)).toEqual([['out-of-bounds'], ['date'], ['coordinates'], [], ['duplicate'], ['unit']])
    expect(records[0].value).toBe(600) // kept with its flag, not deleted
    expect(summary).toMatchObject({ total: 6, valid: 1, flagged: { 'out-of-bounds': 1, date: 1, coordinates: 1, duplicate: 1, unit: 1 } })
    expect(validSeries(records).PRECTOTCORR.size).toBe(1)
  })

  it('measures coverage: a missing month makes absent days explicit, and a daily year needs ≥ 90% valid days', () => {
    const july = new Map(Array.from({ length: 31 }, (_, index) => [`2024-07-${String(index + 1).padStart(2, '0')}`, 1]))
    const full = new Map(Array.from({ length: 366 }, (_, index) => [new Date(Date.UTC(2024, 0, 1 + index)).toISOString().slice(0, 10), 1]))
    const august = [...full.keys()].filter((key) => key.startsWith('2024-08'))
    august.forEach((key) => full.delete(key)) // a whole missing month
    const records = normalizePowerDaily({ PRECTOTCORR: full, T2M_MAX: july }, { PRECTOTCORR: 'mm/day', T2M_MAX: 'C' }, 19.04, -98.2, '19.000_-98.125', 2024, 2024)
    const summary = validateRecords(records, 366 * 2)
    expect(records.filter((item) => item.quality.missing && item.variable === 'PRECTOTCORR')).toHaveLength(31)
    expect(summary.completeness).toBeCloseTo((335 + 31) / 732, 6)
    expect(dailyYearCoverage(records, 'PRECTOTCORR')[0]).toMatchObject({ year: 2024, validDays: 335, missingDays: 31, complete: true }) // 91.5%
    expect(dailyYearCoverage(records, 'T2M_MAX')[0].complete).toBe(false)
  })
})
