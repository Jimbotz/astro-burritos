import { describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 30_000 })
import { readFileSync } from 'node:fs'
import { baselineMean, type AnnualPoint } from '../../lib/analysis/annual-rules'
import { classifyHeat, heatPriority, heatSignal, recentLoad } from '../../lib/analysis/heat-risk'
import { unpackSeries } from '../../lib/analysis/impact-series'
import { assessSeries, optionsFromProfile } from '../../lib/analysis/robust-assessment'
import { getVariable } from '../../lib/variables/catalog'
import { buildImpactMap } from '../../lib/api/impact-map'

const snapshot = JSON.parse(readFileSync(new URL('../../data/impact/derived/power-cells-21.json', import.meta.url), 'utf8'))
const puebla = snapshot.cells.find((cell: { cellId: string }) => cell.cellId === '19.000_-98.125')
const real = (key: string) => unpackSeries(puebla.series[key], snapshot.years)
const trendOf = (id: string, points: AnnualPoint[], start = 2001, end = 2024) => assessSeries(points, start, end, optionsFromProfile(getVariable(id)!.profile, 'allowed', '', baselineMean(points)))

/** 1991–2024 synthetic index: flat noise, or a clear rise. */
const synthetic = (slopePerYear: number, recentBump = 0) => Array.from({ length: 34 }, (_, index) => {
  const year = 1991 + index
  const value = 10 + slopePerYear * (year - 1991) + 1.5 * Math.sin(year * 2.3) + (year >= 2020 ? recentBump : 0)
  return { year, value, validCount: 365, expectedCount: 365, complete: true } as AnnualPoint
})

describe('heat hazard classification (real Puebla cell, saved snapshot)', () => {
  it('corroborated: warm nights rise robustly and the coldest night confirms it', () => {
    const result = classifyHeat({ tx90p: { trend: trendOf('TX90p', real('tx90p')), annual: real('tx90p') }, tn90p: { trend: trendOf('TN90p', real('tn90p')), annual: real('tn90p') }, txx: trendOf('TXx', real('txx')), tnn: trendOf('TNn', real('tnn')) }, 2024)
    expect(result.status).toBe('corroborated')
    expect(result.components).toEqual({ warmDays: false, warmNights: true, hotExtreme: false, coldExtreme: true })
    expect(result.criteria.warmNights).toEqual({ mannKendall: true, intervalExcludesZero: true, exceedsRelevance: true, enoughYears: true, upward: true })
  })

  it('a robust trend (2001–2024) and a non-significant one (1995–2014): the signal depends on the period', () => {
    expect(heatSignal(trendOf('TN90p', real('tn90p'), 2001, 2024)).meets).toBe(true)
    expect(heatSignal(trendOf('TN90p', real('tn90p'), 1995, 2014))).toMatchObject({ meets: false, criteria: { mannKendall: false } })
    // Warm days pass in 1991–2010 but not in 2001–2024.
    expect(heatSignal(trendOf('TX90p', real('tx90p'), 1991, 2010)).meets).toBe(true)
    expect(heatSignal(trendOf('TX90p', real('tx90p'), 2001, 2024)).meets).toBe(false)
  })
})

describe('heat states on synthetic indices', () => {
  const flat = synthetic(0)
  const rising = synthetic(0.6)
  const flatTrend = trendOf('TX90p', flat)
  it('planning-signal without confirmation, watch from a high recent load, no-detectable and insufficient-data', () => {
    expect(classifyHeat({ tx90p: { trend: trendOf('TX90p', rising), annual: rising }, tn90p: { trend: flatTrend, annual: flat }, txx: null, tnn: null }, 2024).status).toBe('planning-signal')
    const bumped = synthetic(0, 8)
    expect(recentLoad(bumped, 2024).high).toBe(true)
    expect(classifyHeat({ tx90p: { trend: flatTrend, annual: bumped }, tn90p: { trend: flatTrend, annual: flat }, txx: null, tnn: null }, 2024).status).toBe('watch')
    expect(classifyHeat({ tx90p: { trend: flatTrend, annual: flat }, tn90p: { trend: flatTrend, annual: flat }, txx: null, tnn: null }, 2024).status).toBe('no-detectable')
    const short = trendOf('TX90p', flat, 2018, 2024) // 7 years
    expect(classifyHeat({ tx90p: { trend: short, annual: flat }, tn90p: { trend: short, annual: flat }, txx: null, tnn: null }, 2024).status).toBe('insufficient-data')
  })
})

describe('hazard and exposure stay separate; priority combines them explicitly', () => {
  it('heat signal without population, population without signal, and both coinciding', () => {
    expect(heatPriority('corroborated', { population: 0, urbanFraction: null })).toBe('signal-lower-exposure')
    expect(heatPriority('no-detectable', { population: 1_500_000, urbanFraction: 0.9 })).toBe('exposure-without-signal')
    expect(heatPriority('planning-signal', { population: 250_000, urbanFraction: 0.3 })).toBe('high-exposure-signal')
    expect(heatPriority('watch', { population: 2_000, urbanFraction: 0 })).toBe('no-priority')
    expect(heatPriority('corroborated', { population: null, urbanFraction: null })).toBe('exposure-unknown')
  })

  it('keeps each daily-snapshot cell on its own native grid and labels its resolution (no mixing with other grids)', async () => {
    const map = await buildImpactMap('heat', '21', 2001, 2024)
    const cell = map.cells.find((item) => item.cellId === '19.000_-98.125')!
    expect(cell.bounds).toEqual(puebla.bounds)
    expect(cell.resolution).toBe('MERRA-2 cell 0.5° × 0.625°')
    expect(Object.keys(cell.layers)).toEqual(['warm-days', 'warm-nights', 'hot-extremes', 'population-exposure', 'urban-exposure', 'priority-zones'])
    expect(cell.layers['priority-zones'].class).toBe('high-exposure-signal')
  })
})
