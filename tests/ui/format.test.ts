import { describe, expect, it } from 'vitest'
import { digitsForUnit, formatNumber, formatPValue, formatSigned, rankSignals, trendDirection, unitEn } from '../../lib/ui/format'
import type { RobustTrend, VariableResult } from '../../lib/api/v2'

const trend = (overrides: Partial<RobustTrend> & { slope?: number | null }): RobustTrend => ({
  claimAllowed: true,
  verdict: 'robust',
  ...overrides,
  display: { method: 'ols-hamed-rao', scale: 'absolute', unit: '°C/década', slope: overrides.slope ?? 0.5, ci95: [0.2, 0.8], pValue: 0.001, referenceMean: null, relevanceThreshold: 0.1, exceedsRelevance: true },
} as RobustTrend)

const result = (id: string, fitness: VariableResult['fitness'], t: RobustTrend, threshold = 0.1) => ({ id, fitness, trend: t, profile: { relevanceThreshold: threshold } } as unknown as VariableResult)

describe('number formatting', () => {
  it('uses a real minus sign and ± for a rounded zero', () => {
    expect(formatSigned(-0.456, 2)).toBe('−0.46')
    expect(formatSigned(0.456, 1)).toBe('+0.5')
    expect(formatSigned(0.001, 2)).toBe('±0.00')
    expect(formatNumber(-3.2, 1)).toBe('−3.2')
    expect(formatNumber(null)).toBe('—')
  })

  it('formats p-values and keeps tiny ones readable', () => {
    expect(formatPValue(0.00001)).toBe('<0.0001')
    expect(formatPValue(0.04567)).toBe('0.0457')
  })

  it('translates the API unit labels and picks decimals per unit', () => {
    expect(unitEn('°C/década')).toBe('°C/decade')
    expect(unitEn('fracción/década')).toBe('fraction/decade')
    expect(unitEn('% de días')).toBe('% of days')
    expect(digitsForUnit('%/década')).toBe(1)
    expect(digitsForUnit('pp/década')).toBe(1)
    expect(digitsForUnit('fracción/década')).toBe(3)
    expect(digitsForUnit('mm')).toBe(0)
    expect(digitsForUnit('°C/década')).toBe(2)
  })
})

describe('trend claims', () => {
  it('states a direction only for robust or probable trends that allow claims', () => {
    expect(trendDirection(trend({ slope: 0.5 }))).toBe('up')
    expect(trendDirection(trend({ slope: -0.5, verdict: 'probable' }))).toBe('down')
    expect(trendDirection(trend({ slope: 0.5, verdict: 'weak' }))).toBeNull()
    expect(trendDirection(trend({ slope: 0.5, claimAllowed: false }))).toBeNull()
  })

  it('ranks robust before probable, headline variables first, larger relative change first, and drops unclaimable ones', () => {
    const ranked = rankSignals([
      result('QV2M', 'support', trend({ slope: 0.3 })),
      result('TN90p', 'thermal-extreme', trend({ slope: 6 }), 1),
      result('TN', 'core', trend({ slope: 0.5 })),
      result('T2M', 'core', trend({ slope: 0.6, verdict: 'probable' })),
      result('PRECTOTCORR', 'core', trend({ slope: 7, claimAllowed: false }), 5),
    ])
    expect(ranked.map((item) => item.id)).toEqual(['TN', 'TN90p', 'QV2M', 'T2M'])
  })
})
