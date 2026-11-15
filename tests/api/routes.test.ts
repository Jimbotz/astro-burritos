import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as regionGet, POST as regionPost } from '../../app/api/region/route'
import { GET as pointGet } from '../../app/api/point/route'
import { GET as variablesGet } from '../../app/api/variables/route'
import { GET as seriesGet } from '../../app/api/series/route'
import { GET as climateGet } from '../../app/api/climate/route'
import type { PointResponse, RegionResponse, VariablesResponse } from '../../lib/api/v2'
import { fakePower, monthly, stateGeometry } from '../helpers/power-fixtures'

// Route handlers called as Next.js calls them, with NASA POWER answered from saved real responses. Each test uses its
// own client address so the per-IP rate limit of one test never leaks into another.
let client = 0
const request = (path: string, init: { method?: string; body?: unknown; signal?: AbortSignal; ip?: string } = {}) => new NextRequest(`http://localhost${path}`, {
  method: init.method ?? 'GET',
  headers: { 'x-forwarded-for': init.ip ?? `10.0.0.${++client}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
  body: init.body ? JSON.stringify(init.body) : undefined,
  signal: init.signal,
})

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(fakePower)) })
afterEach(() => { vi.unstubAllGlobals() })

const TLAXCALA = '/api/region?variable=T2M&country=MEX&state=Tlaxcala&startYear=2001&endYear=2024'

describe('GET /api/region by area id', () => {
  it('clips to the state outline the map draws and is cacheable by the CDN', async () => {
    const response = await regionGet(request(TLAXCALA))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('public, s-maxage=86400')
    const body = await response.json() as RegionResponse
    expect(body.request).toMatchObject({ selection: 'area', area: { country: 'MEX', state: 'Tlaxcala', name: 'Tlaxcala' } })
    expect(body.grid.cellCount).toBe(4)
  })

  it('gives the same cells as POSTing the same polygon', async () => {
    const byId = await (await regionGet(request(TLAXCALA))).json() as RegionResponse
    const posted = await regionPost(request('/api/region', { method: 'POST', body: { variable: 'T2M', startYear: 2001, endYear: 2024, geometry: stateGeometry('MEX', 'Tlaxcala') } }))
    expect(posted.headers.get('cache-control')).toContain('private')
    const body = await posted.json() as RegionResponse
    expect(body.request.selection).toBe('polygon')
    expect(body.cells.map((cell) => [cell.id, cell.coverage])).toEqual(byId.cells.map((cell) => [cell.id, cell.coverage]))
  })

  it('answers unknown or malformed areas with { error } before calling POWER', async () => {
    const cases: Array<[string, number]> = [
      ['/api/region?variable=T2M&country=MEX&state=Atlantis', 404],
      ['/api/region?variable=T2M&country=XYZ&state=Puebla', 404],
      ['/api/region?variable=T2M&country=mex', 400],
      ['/api/region?variable=T2M&country=..%2F..', 400],
      ['/api/region?variable=T2M', 400],
      ['/api/region?variable=TX&country=MEX&state=Puebla', 400],
    ]
    for (const [path, status] of cases) {
      const response = await regionGet(request(path))
      expect(response.status, path).toBe(status)
      expect(typeof (await response.json() as { error: string }).error).toBe('string')
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('stops before calling POWER when the client has already gone away', async () => {
    const controller = new AbortController()
    controller.abort()
    const response = await regionGet(request(TLAXCALA, { signal: controller.signal }))
    expect(response.status).toBe(499)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('limits one client to 12 uncached analyses a minute, with Retry-After', async () => {
    // TNn is not in the fixtures, so each call fails fast at POWER (502) but still counts.
    const path = '/api/region?variable=TNn&country=MEX&state=Tlaxcala'
    for (let index = 0; index < 12; index += 1) expect((await regionGet(request(path, { ip: '192.0.2.7' }))).status).toBe(502)
    const limited = await regionGet(request(path, { ip: '192.0.2.7' }))
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await limited.json() as { error: string }).error).toMatch(/Too many analyses/)
    expect((await regionGet(request(path, { ip: '192.0.2.8' }))).status).toBe(502)
  })

  it('still rejects a POST without a polygon', async () => {
    const response = await regionPost(request('/api/region', { method: 'POST', body: { variable: 'T2M', geometry: { type: 'Point', coordinates: [0, 0] } } }))
    expect(response.status).toBe(400)
  })
})

describe('GET /api/point', () => {
  it('returns all 13 variables for the cell with a cache header', async () => {
    const response = await pointGet(request('/api/point?latitude=19.04&longitude=-98.2&startYear=2001&endYear=2024'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('s-maxage=86400')
    expect((await response.json() as PointResponse).variables).toHaveLength(13)
  })

  it('validates coordinates, years and variable names with HTTP 400', async () => {
    for (const path of ['/api/point?latitude=95&longitude=0', '/api/point?latitude=19&longitude=-98&startYear=1970', '/api/point?latitude=19&longitude=-98&variables=T2M,toString']) {
      expect((await pointGet(request(path))).status, path).toBe(400)
    }
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('GET /api/variables', () => {
  it('describes the catalog, the projection rules and their diagnostics', async () => {
    const body = await variablesGet().json() as VariablesResponse
    expect(body.variables).toHaveLength(13)
    expect(body.variables.filter((variable) => variable.profile.projection).map((variable) => variable.id)).toEqual(['T2M', 'TXx', 'TNn', 'PRECTOTCORR'])
    expect(body.variables.find((variable) => variable.id === 'T2M')!.profile.projection).toMatchObject({ holdoutWindows: 2, minSkill: 0.1, diagnosticAlpha: 0.05 })
    expect(body.rules.projection).toMatch(/curvature/)
  })
})

describe('legacy GET /api/series (deprecated, kept for external clients)', () => {
  const SERIES = '/api/series?latitude=19.04&longitude=-98.2&startYear=2001&endYear=2024&variable=temperature'

  it('still answers, marked as deprecated with /api/point as its successor', async () => {
    const response = await seriesGet(request(SERIES))
    expect(response.status).toBe(200)
    expect(response.headers.get('deprecation')).toMatch(/^@\d+$/)
    expect(response.headers.get('link')).toContain('</api/point>; rel="successor-version"')
    expect((await response.json() as { trend: { nYears: number } }).trend.nYears).toBe(24)
    expect((await climateGet(request(SERIES))).status).toBe(200)
  })

  it('drops a year with 11 of 12 months from the trend (audit finding A1)', async () => {
    const t2m = { ...monthly.properties.parameter.T2M }
    delete t2m['200508']
    const gap = { ...monthly, properties: { parameter: { ...monthly.properties.parameter, T2M: t2m } } }
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(gap), { status: 200 }))))
    const body = await (await seriesGet(request(SERIES))).json() as { trend: { nYears: number; warnings: string[] } }
    expect(body.trend.nYears).toBe(23)
    expect(body.trend.warnings[0]).toMatch(/all 12 monthly values/)
  })

  it('rejects inherited keys such as toString with 400 and never calls POWER (audit finding A5)', async () => {
    for (const variable of ['toString', 'constructor', '__proto__']) {
      expect((await seriesGet(request(SERIES.replace('temperature', variable)))).status).toBe(400)
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps POWER’s rejection message instead of reporting a connection failure (audit finding A6)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 422 }))))
    const response = await seriesGet(request(SERIES))
    expect(response.status).toBe(502)
    expect((await response.json() as { error: string }).error).toMatch(/rejected with HTTP 422/)
  })
})
