import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { analyzePoint } from '../../lib/api/point-service'
import { analyzeRegion, RegionError, validateBBox } from '../../lib/api/region-service'
import { getVariable, POINT_VARIABLE_IDS } from '../../lib/variables/catalog'

// Real NASA POWER responses saved in tests/fixtures/power (see its manifest.json for the exact requests).
const fixture = (name: string) => readFileSync(new URL(`../fixtures/power/${name}`, import.meta.url))
const monthly = JSON.parse(fixture('monthly-point-puebla.json').toString('utf8'))
const daily = JSON.parse(gunzipSync(fixture('daily-point-puebla.json.gz')).toString('utf8'))
const regional = JSON.parse(fixture('monthly-regional-T2M-tlaxcala.json').toString('utf8'))
const tlaxcala = JSON.parse(readFileSync(new URL('../../public/geo/admin1/MEX.json', import.meta.url), 'utf8')).features.find((feature: { properties: { name: string } }) => feature.properties.name === 'Tlaxcala').geometry

/** Answers POWER requests from the fixtures; anything else gets the 422 POWER returns for a bad request. */
function fakePower(input: string | URL | Request) {
  const url = new URL(String(input instanceof Request ? input.url : input))
  const body = url.pathname.endsWith('/monthly/point') ? monthly
    : url.pathname.endsWith('/daily/point') ? daily
    : url.pathname.endsWith('/monthly/regional') && url.searchParams.get('parameters') === 'T2M' ? regional
    : null
  return Promise.resolve(body ? new Response(JSON.stringify(body), { status: 200 }) : new Response(JSON.stringify({ messages: ['not in the fixtures'] }), { status: 422 }))
}

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(fakePower)) })
afterEach(() => { vi.unstubAllGlobals() })

const T2M = getVariable('T2M')!

describe('point service with real POWER responses (Puebla, 2001–2024)', () => {
  it('assesses all 13 variables in the native cell with one monthly and one daily request', async () => {
    const body = await analyzePoint(19.04, -98.2, 2001, 2024, POINT_VARIABLE_IDS)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(body.variables).toHaveLength(13)
    expect(body.support).toMatchObject({ type: 'grid-cell', centerLat: 19, centerLon: -98.125, dLat: 0.5, dLon: 0.625 })
    expect(body.variables.every((variable) => variable.trend.qValue !== null)).toBe(true)
    expect(body.sources.map((source) => source.endpoint)).toEqual(['monthly-point', 'daily-point'])
  })

  it('reproduces the published results: robust day and night warming, rain without a claim', async () => {
    const body = await analyzePoint(19.04, -98.2, 2001, 2024, POINT_VARIABLE_IDS)
    const result = (id: string) => body.variables.find((variable) => variable.id === id)!
    expect(result('T2M').trend.verdict).toBe('robust')
    expect(result('T2M').trend.display.slope).toBeCloseTo(0.454, 2)
    expect(result('TN').trend.verdict).toBe('robust')
    expect(result('TN').trend.display.slope).toBeCloseTo(0.515, 2)
    expect(result('PRECTOTCORR').trend.claimAllowed).toBe(false)
    expect(result('PRECTOTCORR').warnings.map((warning) => warning.code)).toContain('not-claimable')
  })

  it('derives the seasons from the cell’s own rain (May–Oct wet, Nov–Apr dry in Puebla)', async () => {
    const body = await analyzePoint(19.04, -98.2, 2001, 2024, POINT_VARIABLE_IDS)
    expect(body.seasonDefinition?.wet.months).toEqual([5, 6, 7, 8, 9, 10])
    expect(body.seasonDefinition?.dry.months).toEqual([11, 12, 1, 2, 3, 4])
    const t2m = body.variables.find((variable) => variable.id === 'T2M')!
    expect(t2m.seasons.map((season) => season.label.en)).toEqual(['Dry season (Nov–Apr)', 'Wet season (May–Oct)'])
    expect(body.variables.find((variable) => variable.id === 'PREC_MJJASO')!.annual.every((point) => point.complete)).toBe(true)
  })

  it('reports a POWER outage as HTTP 502 instead of inventing values', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 503 }))))
    await expect(analyzePoint(19.04, -98.2, 2001, 2024, POINT_VARIABLE_IDS)).rejects.toMatchObject({ status: 502, kind: 'unavailable' })
  })
})

describe('region service with real POWER responses (Tlaxcala, T2M, 2001–2024)', () => {
  it('clips the native cells to the state and validates the projection on the regional series', async () => {
    const body = await analyzeRegion(T2M, 2001, 2024, { geometry: tlaxcala })
    expect(body.grid).toMatchObject({ cellCount: 4, tileCount: 1 })
    expect(body.cells.every((cell) => cell.coverage > 0 && cell.fit)).toBe(true)
    expect(body.regional.trend.verdict).toBeDefined()
    expect(body.sources[0].url).toContain('/monthly/regional')
    expect(body.projection).toMatchObject({ interpretation: 'exploratory-extrapolation', horizon: [2001, 2034], holdout: { scope: 'regional-series', years: [2015, 2024], points: 10, cells: 4 } })
    expect(body.projection!.holdout!.windows.map((window) => window.years)).toEqual([[2015, 2019], [2020, 2024]])
    // Measured on these responses: worse than the average in 2015–2019, ≈ 8% better in 2020–2024; pooled, under the
    // 10% minimum, so the projection is not drawn.
    expect(body.projection!.holdout!.windows[0].skill).toBeLessThan(0)
    expect(body.projection!.holdout!.skill).toBeLessThan(0.1)
    expect(body.projection!.status).toBe('blocked-by-quality')
  })

  it('rejects impossible, oversized and antimeridian regions before calling POWER', async () => {
    expect(() => validateBBox({ minLat: 20, maxLat: 10, minLon: -99, maxLon: -97 })).toThrow(RegionError)
    await expect(analyzeRegion(T2M, 2001, 2024, { bbox: { minLat: -20, maxLat: 40, minLon: -120, maxLon: -60 } })).rejects.toMatchObject({ status: 413 })
    await expect(analyzeRegion(T2M, 2001, 2024, { bbox: { minLat: 60, maxLat: 70, minLon: -179, maxLon: 179 } })).rejects.toMatchObject({ status: 422 })
    expect(fetch).not.toHaveBeenCalled()
  })
})
