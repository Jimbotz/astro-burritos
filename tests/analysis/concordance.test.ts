import { describe, expect, it } from 'vitest'
import type { AnnualPoint } from '../../lib/analysis/annual-rules'
import { compareLevels, compareTrends, CONCORDANCE_RULES, pearson, type TrendEvidence } from '../../lib/analysis/concordance'
import { cellMean, overlapWeights } from '../../lib/analysis/footprint'
import { cellBounds } from '../../lib/analysis/region'
import { cellCenter, imergBox } from '../../lib/nasa/power'

const evidence = (slope: number, ci: [number, number], p: number, nYears = 24): TrendEvidence => ({ slopePerDecade: slope, ci95PerDecade: ci, pValue: p, nYears })

describe('trend concordance rules (fixed in advance)', () => {
  it('agrees only when both records detect a trend of the same sign with overlapping intervals', () => {
    expect(compareTrends(evidence(60, [20, 100], 0.01), evidence(40, [5, 90], 0.03))).toMatchObject({ agreement: 'agree', reason: 'same-direction', detected: [true, true], intervalsOverlap: true })
  })

  it('disagrees on opposite detected signs or on intervals that do not overlap', () => {
    expect(compareTrends(evidence(60, [-10, 100], 0.01), evidence(-50, [-90, 5], 0.02))).toMatchObject({ agreement: 'disagree', reason: 'opposite-directions' })
    // The real Tlaxcala 2001–2024 case: MERRA-2 detects +185, IMERG −27 is not significant, and the intervals are apart.
    expect(compareTrends(evidence(185, [110, 293], 0.0002), evidence(-27, [-87, 35], 0.36))).toMatchObject({ agreement: 'disagree', reason: 'incompatible-rates', detected: [true, false], intervalsOverlap: false })
  })

  it('is inconclusive when one or neither record detects a trend and the rates are compatible', () => {
    expect(compareTrends(evidence(12, [-85, 130], 0.68), evidence(185, [79, 264], 0.006))).toMatchObject({ agreement: 'inconclusive', reason: 'one-detects', detected: [false, true] })
    expect(compareTrends(evidence(66, [-2, 140], 0.0501), evidence(22, [-55, 114], 0.5))).toMatchObject({ agreement: 'inconclusive', reason: 'neither-detects' })
  })

  it('treats p exactly at alpha as not detected, and refuses short or missing records', () => {
    expect(compareTrends(evidence(60, [20, 100], CONCORDANCE_RULES.alpha), evidence(40, [5, 90], 0.01)).reason).toBe('one-detects')
    expect(compareTrends(evidence(60, [20, 100], 0.01, 9), evidence(40, [5, 90], 0.01)).agreement).toBe('insufficient-data')
    expect(compareTrends({ slopePerDecade: null, ci95PerDecade: null, pValue: null, nYears: 0 }, evidence(40, [5, 90], 0.01)).agreement).toBe('insufficient-data')
  })
})

const series = (values: Array<number | null>, from = 2001): AnnualPoint[] => values.map((value, index) => ({ year: from + index, value, validCount: value === null ? 0 : 12, expectedCount: 12, complete: value !== null }))

describe('level and year-to-year agreement', () => {
  it('compares only the years both records have complete', () => {
    const a = series([800, 900, null, 850, 950, 700, 1000, 820, 880, 910, 760, 930])
    const b = series([840, 950, 990, 890, null, 720, 1060, 860, 900, 960, 800, 980])
    const level = compareLevels(a, b)
    expect(level.years).toEqual([2001, 2002, 2004, 2006, 2007, 2008, 2009, 2010, 2011, 2012])
    expect(level.differencePercent).toBeCloseTo(((level.meanB! - level.meanA!) / level.meanA!) * 100, 10)
    expect(level.sameLevel).toBe(true)
  })

  it('removes each record’s trend before correlating, so a shared trend alone is not agreement', () => {
    const years = Array.from({ length: 20 }, (_, index) => index)
    const wiggle = years.map((index) => (index % 2 ? 50 : -50))
    // Same trend, opposite year-to-year wiggles: raw r would be high, detrended r is −1.
    const a = series(years.map((index) => 800 + 10 * index + wiggle[index]))
    const b = series(years.map((index) => 800 + 10 * index - wiggle[index]))
    const level = compareLevels(a, b)
    expect(level.correlation).toBeCloseTo(-1, 6)
    expect(level.yearToYear).toBe('weak')
  })

  it('computes Pearson r and needs at least three pairs', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12)
    expect(pearson([1, 2], [1, 2])).toBeNull()
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull()
  })
})

describe('IMERG pixels averaged over a MERRA-2 cell', () => {
  const center = cellCenter(19.04, -98.2)
  const bounds = cellBounds(center.lat, center.lon)

  it('reads the 2° × 2° box centred on the cell (POWER’s smallest region), inside ±180°', () => {
    expect(center).toEqual({ lat: 19, lon: -98.125 })
    expect(imergBox(center)).toEqual({ minLat: 18, maxLat: 20, minLon: -99.125, maxLon: -97.125 })
    expect(imergBox({ lat: 0, lon: -179.375 })).toEqual({ minLat: -1, maxLat: 1, minLon: -180, maxLon: -178 })
  })

  it('weighs edge pixels by the part of them inside the cell, and covers the whole cell', () => {
    const pixels = []
    for (let lat = 18.05; lat < 20; lat += 0.1) for (let lon = -99.05; lon < -97.1; lon += 0.1) pixels.push({ lat: Number(lat.toFixed(2)), lon: Number(lon.toFixed(2)) })
    const { weights, coveredFraction } = overlapWeights(pixels, bounds, 0.1)
    expect(coveredFraction).toBeCloseTo(1, 9)
    // 0.5° × 0.625° cell (18.75–19.25°, −98.4375 to −97.8125°) on the 0.1° grid: 6 rows (the outer two are half inside)
    // and 7 columns (the outer two partly inside), the 42 pixels the live service reports for Puebla.
    expect(weights.filter((weight) => weight > 0)).toHaveLength(6 * 7)
    const inner = pixels.findIndex((pixel) => pixel.lat === 19.05 && pixel.lon === -98.15)
    const edge = pixels.findIndex((pixel) => pixel.lat === 18.75 && pixel.lon === -98.15)
    expect(weights[edge] / weights[inner]).toBeCloseTo(0.5 * Math.cos((18.75 * Math.PI) / 180) / Math.cos((19.05 * Math.PI) / 180), 9)
  })

  it('returns the field itself for a uniform field and drops a month with any pixel missing', () => {
    const pixels = [18.85, 18.95, 19.05, 19.15].flatMap((lat) => [-98.35, -98.25, -98.15, -98.05, -97.95, -97.85].map((lon) => ({ lat, lon, series: new Map([['2020-01', 3], ['2020-02', 3]]) })))
    pixels[0].series.delete('2020-02')
    const cell = { south: 18.8, north: 19.2, west: -98.4, east: -97.8 }
    const mean = cellMean(pixels, cell, 0.1)
    expect(mean.series.get('2020-01')).toBeCloseTo(3, 12)
    expect(mean.series.has('2020-02')).toBe(false)
    expect(mean.coveredFraction).toBeCloseTo(1, 9)
  })
})
