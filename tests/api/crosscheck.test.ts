import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as crosscheckGet } from '../../app/api/crosscheck/route'
import type { CrosscheckResponse } from '../../lib/api/v2'
import { fakePower } from '../helpers/power-fixtures'

// GET /api/crosscheck with saved real POWER responses: MERRA-2 monthly point (Puebla, LST) and the IMERG pixels of
// the Puebla cell (UTC). The numbers below are the published Puebla 2001–2024 result.
let client = 0
const request = (path: string, init: { signal?: AbortSignal; ip?: string } = {}) => new NextRequest(`http://localhost${path}`, { headers: { 'x-forwarded-for': init.ip ?? `10.1.0.${++client}` }, signal: init.signal })
const PUEBLA = '/api/crosscheck?latitude=19.04&longitude=-98.2&startYear=2001&endYear=2024'

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(fakePower)) })
afterEach(() => { vi.unstubAllGlobals() })

describe('GET /api/crosscheck (MERRA-2 vs GPM IMERG rain, both via NASA POWER)', () => {
  it('averages the 42 IMERG pixels of the cell, asks POWER for IMERG in UTC and shares the point request', async () => {
    const response = await crosscheckGet(request(PUEBLA))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('public, s-maxage=86400')
    const body = await response.json() as CrosscheckResponse
    expect(body.footprint).toMatchObject({ pixelCount: 42, pixelDegrees: 0.1, box: { minLat: 18, maxLat: 20, minLon: -99.125, maxLon: -97.125 } })
    expect(body.footprint.coveredFraction).toBeCloseTo(1, 9)
    expect(body.support).toMatchObject({ centerLat: 19, centerLon: -98.125 })
    expect(body.window).toEqual({ startYear: 2001, endYear: 2024, clippedToImerg: false })
    const urls = vi.mocked(fetch).mock.calls.map(([input]) => new URL(String(input)))
    const imerg = urls.find((url) => url.searchParams.get('parameters') === 'IMERG_PRECTOT')!
    expect(imerg.searchParams.get('time-standard')).toBe('UTC')
    // Identical to the monthly request of GET /api/point, so the data cache serves both.
    const monthly = urls.find((url) => url.pathname.endsWith('/monthly/point'))!
    expect(monthly.searchParams.get('parameters')).toBe('T2M,T2M_RANGE,T2M_MAX,T2M_MIN,PRECTOTCORR,QV2M,RH2M,GWETROOT')
    expect(monthly.searchParams.get('start')).toBe('1981')
  })

  it('reproduces Puebla 2001–2024: same amount and wet/dry years, no trend detected by either record', async () => {
    const body = await (await crosscheckGet(request(PUEBLA))).json() as CrosscheckResponse
    expect(body.comparisons.map((comparison) => comparison.id)).toEqual(['annual', 'wet'])
    const annual = body.comparisons[0]
    expect(annual.trend).toMatchObject({ agreement: 'inconclusive', reason: 'neither-detects', intervalsOverlap: true })
    expect(Math.round(annual.merra2.trend.senPerDecade!)).toBe(66)
    expect(Math.round(annual.imerg.trend.senPerDecade!)).toBe(22)
    expect(annual.merra2.trend.nYears).toBe(24)
    expect(annual.imerg.trend.nYears).toBe(24)
    expect(Math.round(annual.level.meanA!)).toBe(884)
    expect(Math.round(annual.level.meanB!)).toBe(913)
    expect(annual.level.sameLevel).toBe(true)
    expect(annual.level.yearToYear).toBe('moderate')
    expect(annual.reasons).toEqual(['different-methods', 'satellite-transition', 'station-skill', 'below-detectable'])
    // Wet season = the MERRA-2 cell's own May–Oct, applied to both records.
    expect(body.comparisons[1].months).toEqual([5, 6, 7, 8, 9, 10])
    expect(body.comparisons[1].level.yearToYear).toBe('strong')
  })

  it('states that it compares agreement and needs no login (the sentences are tested in tests/ui/crosscheck-view)', async () => {
    const body = await (await crosscheckGet(request(PUEBLA))).json() as CrosscheckResponse
    expect(body.notes.join(' ')).toMatch(/no login or token/)
    expect(body.notes.join(' ')).toMatch(/says whether two NASA records agree, not whether it rains more/)
    expect(body.sources.map((source) => source.timeStandard)).toEqual(['LST', 'UTC'])
  })

  it('validates the request before calling POWER', async () => {
    const cases: Array<[string, number]> = [
      ['/api/crosscheck?latitude=95&longitude=0', 400],
      ['/api/crosscheck?latitude=19&longitude=-98&startYear=1970', 400],
      ['/api/crosscheck?latitude=19&longitude=-98&startYear=2016&endYear=2024', 400],
      ['/api/crosscheck?latitude=70&longitude=20', 422],
    ]
    for (const [path, status] of cases) {
      const response = await crosscheckGet(request(path))
      expect(response.status, path).toBe(status)
      expect(typeof (await response.json() as { error: string }).error).toBe('string')
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('starts the window at 1998 when asked for earlier years', async () => {
    const body = await (await crosscheckGet(request('/api/crosscheck?latitude=19.04&longitude=-98.2&startYear=1990&endYear=2024'))).json() as CrosscheckResponse
    expect(body.window).toEqual({ startYear: 1998, endYear: 2024, clippedToImerg: true })
    const imerg = vi.mocked(fetch).mock.calls.map(([input]) => new URL(String(input))).find((url) => url.searchParams.get('parameters') === 'IMERG_PRECTOT')!
    expect(imerg.searchParams.get('start')).toBe('1998')
  })

  it('stops before calling POWER when the client has already gone away', async () => {
    const controller = new AbortController()
    controller.abort()
    const response = await crosscheckGet(request(PUEBLA, { signal: controller.signal }))
    expect(response.status).toBe(499)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('limits one client to 20 uncached cross-checks a minute', async () => {
    // Out of the fixtures' area, so each call fails fast at POWER (502) but still counts.
    const path = '/api/crosscheck?latitude=-10&longitude=20'
    for (let index = 0; index < 20; index += 1) expect((await crosscheckGet(request(path, { ip: '192.0.2.40' }))).status).toBe(502)
    const limited = await crosscheckGet(request(path, { ip: '192.0.2.40' }))
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
  })
})
