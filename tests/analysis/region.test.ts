import { describe, expect, it } from 'vitest'
import { analyzeCells, cellsToGeoJSON, containsPoint, countCellsInside, coverageFraction, estimateCells, expandForCells, geometryBBox, isPolygonGeometry, regionalAnnual, type PolygonGeometry, type Position } from '../../lib/analysis/region'
import { tilesFor } from '../../lib/nasa/power'
import type { SeriesMap } from '../../lib/analysis/annual-rules'
import { getVariable } from '../../lib/variables/catalog'

const T2M = getVariable('T2M')!.profile
const RAIN = getVariable('PRECTOTCORR')!.profile

const ring = (w: number, s: number, e: number, n: number): Position[] => [[w, s], [e, s], [e, n], [w, n], [w, s]]
const square = (w: number, s: number, e: number, n: number): PolygonGeometry => ({ type: 'Polygon', coordinates: [ring(w, s, e, n)] })

function monthlyTrend(a: number, b: number, value: (year: number) => number): SeriesMap {
  const map: SeriesMap = new Map()
  for (let year = a; year <= b; year += 1) for (let month = 1; month <= 12; month += 1) map.set(`${year}-${String(month).padStart(2, '0')}`, value(year))
  return map
}

describe('polygon geometry', () => {
  it('measures the share of a 0.5° × 0.625° cell inside a polygon', () => {
    // Cell centred at (19.0, −98.125) spans −98.4375…−97.8125 and 18.75…19.25.
    expect(coverageFraction(square(-99, 18, -97, 20), 19, -98.125)).toBe(1)
    expect(coverageFraction(square(-98.4375, 18.75, -98.125, 19.25), 19, -98.125)).toBe(0.5)
    expect(coverageFraction(square(-90, 10, -89, 11), 19, -98.125)).toBe(0)
  })

  it('respects holes and multipolygons', () => {
    const withHole: PolygonGeometry = { type: 'Polygon', coordinates: [ring(-100, 17, -96, 21), ring(-98.5, 18.5, -97.7, 19.5)] }
    expect(containsPoint(withHole, -98.125, 19)).toBe(false)
    expect(containsPoint(withHole, -99.5, 20.5)).toBe(true)
    const multi: PolygonGeometry = { type: 'MultiPolygon', coordinates: [[ring(-100, 17, -99, 18)], [ring(-97, 19, -96, 20)]] }
    expect(containsPoint(multi, -96.5, 19.5)).toBe(true)
    expect(geometryBBox(multi)).toEqual({ minLat: 17, maxLat: 20, minLon: -100, maxLon: -96 })
  })

  it('validates GeoJSON shapes', () => {
    expect(isPolygonGeometry(square(0, 0, 1, 1))).toBe(true)
    expect(isPolygonGeometry({ type: 'Point', coordinates: [0, 0] })).toBe(false)
    expect(isPolygonGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] })).toBe(false)
  })
})

describe('grid and tiles', () => {
  it('uses aligned 5° tiles that satisfy the POWER 2°–10° rule', () => {
    const tiles = tilesFor({ minLat: 17.8, maxLat: 20.9, minLon: -98.8, maxLon: -96.7 })
    expect(tiles).toEqual([
      { minLat: 15, maxLat: 20, minLon: -100, maxLon: -95 },
      { minLat: 20, maxLat: 25, minLon: -100, maxLon: -95 },
    ])
  })

  it('estimates cells and expands a bbox by half a cell', () => {
    expect(estimateCells({ minLat: 17.75, maxLat: 20.75, minLon: -99.25, maxLon: -96.75 })).toBe(24)
    expect(expandForCells({ minLat: 19, maxLat: 20, minLon: -98, maxLon: -97 })).toEqual({ minLat: 18.75, maxLat: 20.25, minLon: -98.3125, maxLon: -96.6875 })
  })

  it('counts only the cell centres inside the polygon, not its whole box', () => {
    const box = { minLat: 0, maxLat: 5, minLon: 0, maxLon: 5 }
    // A square just around the box holds every centre of the box.
    expect(countCellsInside(square(-0.1, -0.1, 5.1, 5.1), box)).toBe(estimateCells(box))
    // A diagonal triangle over the same box holds about half of them (a long diagonal state's case).
    const triangle: PolygonGeometry = { type: 'Polygon', coordinates: [[[-0.1, -0.1], [5.1, -0.1], [-0.1, 5.1], [-0.1, -0.1]]] }
    const inside = countCellsInside(triangle, box)
    expect(inside).toBeGreaterThan(estimateCells(box) * 0.4)
    expect(inside).toBeLessThan(estimateCells(box) * 0.65)
  })
})

describe('cell analysis', () => {
  const cells = [
    { id: 'a', lat: 19, lon: -98.125, elevationM: 2147, coverage: 1, series: monthlyTrend(1981, 2024, (y) => 15 + 0.05 * (y - 1981) + ((y * 37) % 7) * 0.01) },
    { id: 'b', lat: 19.5, lon: -98.125, elevationM: 2517, coverage: 0.5, series: monthlyTrend(1981, 2024, (y) => 12 + ((y * 53) % 11) * 0.3) },
  ]

  it('flags only the trending cell after field-level FDR', () => {
    const { cells: result } = analyzeCells(cells, 'day-weighted-mean', 2001, 2024, T2M)
    expect(result[0].significantField).toBe(true)
    expect(result[0].slopePerDecade).toBeCloseTo(0.5, 1)
    expect(result[1].significantField).toBe(false)
    expect(result[0].bounds).toEqual({ west: -98.4375, east: -97.8125, south: 18.75, north: 19.25 })
  })

  it('weights the regional series by coverage × cos(lat) and needs every cell complete', () => {
    const flat = [
      { id: 'a', lat: 19, lon: -98.125, elevationM: null, coverage: 1, series: monthlyTrend(2001, 2003, () => 10) },
      { id: 'b', lat: 19, lon: -97.5, elevationM: null, coverage: 0.5, series: monthlyTrend(2001, 2002, () => 20) },
    ]
    const analysis = analyzeCells(flat, 'day-weighted-mean', 2001, 2003, T2M, 2001)
    const annual = regionalAnnual(analysis.cells, analysis.annualByCell, 2001, 2003)
    expect(annual[0].value).toBeCloseTo((10 * 1 + 20 * 0.5) / 1.5, 10)
    expect(annual[2]).toMatchObject({ year: 2003, value: null, complete: false })
  })

  it('reports profile-scaled slopes and recent anomalies against the 1991–2020 mean of each cell', () => {
    const wet = [{ id: 'w', lat: 19, lon: -98.125, elevationM: null, coverage: 1, series: monthlyTrend(1981, 2024, (y) => (y <= 2020 ? 3 : 3.3)) }]
    const { cells: [cell] } = analyzeCells(wet, 'sum', 2001, 2024, RAIN)
    expect(cell.baseline).toBeCloseTo(3 * 365.25, 0)
    expect(cell.recentYears).toEqual([2020, 2024])
    // 2020 stays at the baseline and 2021–2024 are 10% wetter: the recent mean is 8% above 1991–2020.
    expect(cell.anomalyRecent).toBeCloseTo(8, 0)
    const { cells: [warm] } = analyzeCells(cells.slice(0, 1), 'day-weighted-mean', 2001, 2024, T2M)
    expect(warm.slopeDisplay).toBeCloseTo(warm.slopePerDecade as number, 12)
  })

  it('exports cells as GeoJSON squares', () => {
    const { cells: result } = analyzeCells(cells, 'day-weighted-mean', 2001, 2024, T2M)
    const geo = cellsToGeoJSON(result)
    expect(geo.features[0].geometry.coordinates[0]).toHaveLength(5)
    expect(geo.features[0].properties.coverage).toBe(1)
  })
})
