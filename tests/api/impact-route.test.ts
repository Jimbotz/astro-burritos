import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as impactGet, POST as impactPost } from '../../app/api/impact/route'
import type { HeatImpactResponse, WaterImpactResponse } from '../../lib/api/impact-types'
import { fakeImpactPower } from '../helpers/impact-fixtures'

// GET|POST /api/impact with the saved POWER daily responses of the Puebla point and the bundled CONAGUA/SMN, INEGI
// and per-cell snapshot data. No external API is called.
let client = 0
const request = (path: string, init: { method?: string; body?: unknown; ip?: string } = {}) => new NextRequest(`http://localhost${path}`, {
  method: init.method ?? 'GET', body: init.body ? JSON.stringify(init.body) : undefined,
  headers: { 'x-forwarded-for': init.ip ?? `10.2.0.${++client}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
})
const PUEBLA = 'country=MEX&state=Puebla&latitude=19.04&longitude=-98.2&startYear=2001&endYear=2024'
// Imperatives and claims the lenses must never make (IMPLEMENTACION_LENTES_IMPACTO §1, §10.3–10.4).
const FORBIDDEN = /riegue|siembre|no siembre|evac[uú]e|debe racionarse|se quedar[aá] sin agua|habr[aá] muertes|predice enfermedades|riesgo sanitario|irrigate now|evacuate|will run out of water|must ration|deaths will/i

// Each analysis processes 34 years of daily data: allow more than the 5 s default when the suite runs in parallel.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(fakeImpactPower)) })
afterEach(() => { vi.unstubAllGlobals() })

describe('GET /api/impact?lens=water', () => {
  it('returns the full contract with a reproducible status for Puebla', async () => {
    const response = await impactGet(request(`/api/impact?lens=water&${PUEBLA}`))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('public, s-maxage=86400')
    const body = await response.json() as WaterImpactResponse
    for (const key of ['schemaVersion', 'lens', 'question', 'request', 'period', 'decisionSupport', 'indicators', 'municipalities', 'cells', 'sources', 'quality', 'warnings', 'limitations']) expect(body, key).toHaveProperty(key)
    expect(body.period).toMatchObject({ requested: { startYear: 2001, endYear: 2024 }, effective: { startYear: 2001, endYear: 2024 }, mode: 'common-complete-window' })
    expect(body.decisionSupport).toMatchObject({ status: 'watch', notACommand: true, components: { supplyStress: false, demandStress: false, storageStress: false, observedDrought: true } })
    expect(body.decisionSupport.label.es).toBe('Vigilar')
    expect(body.indicators.map((item) => item.id)).toEqual(['precipitation', 'precipitation-wet', 'et0', 'balance', 'balance-wet', 'root-zone-wetness', 'observed-drought'])
    // Precipitation and the balance never get a direction.
    for (const id of ['precipitation', 'balance']) expect(body.indicators.find((item) => item.id === id)!.trend).toMatchObject({ claimAllowed: false, direction: 'unknown' })
    expect(body.municipalities).toHaveLength(217)
    expect(body.cells).toHaveLength(21)
    expect(body.validation.station).toMatchObject({ name: 'AFRICAM ZAFARI', sameCell: true })
    expect(body.quality.reference).toMatchObject({ total: 149028, valid: 149028, missing: 0 })
    expect(body.limitations[0].es).toBe('Balance climático estimado. No representa agua disponible físicamente en presas o acuíferos.')
  })

  it('works by municipality code and keeps every source public, without login', async () => {
    const body = await (await impactGet(request('/api/impact?lens=water&municipalityCode=21156&startYear=2001&endYear=2024'))).json() as WaterImpactResponse
    expect(body.scope).toMatchObject({ kind: 'municipality', municipalityCode: '21156', name: 'Tehuacán, Puebla' })
    expect(body.municipalities.map((item) => item.code)).toEqual(['21156'])
    expect(body.sources.every((source) => source.authRequired === false)).toBe(true)
    expect(body.sources.map((source) => source.sourceId)).toEqual(['nasa-power', 'conagua-smn-stations', 'smn-drought-monitor', 'inegi-mg-2020', 'fao-56', 'open-meteo'])
  })

  it('blocks a fixed window it cannot cover instead of truncating it', async () => {
    const body = await (await impactGet(request(`/api/impact?lens=water&${PUEBLA.replace('startYear=2001', 'startYear=1981')}&mode=fixed-window`))).json() as WaterImpactResponse
    expect(body.period).toMatchObject({ blocked: true, effective: null })
    expect(body.decisionSupport.status).toBe('insufficient-data')
    expect(body.indicators.every((item) => item.trend === null || item.trend.status === 'blocked')).toBe(true)
  })
})

describe('GET /api/impact?lens=heat', () => {
  it('separates hazard, exposure and priority: corroborated nighttime warming over a dense urban cell', async () => {
    const body = await (await impactGet(request(`/api/impact?lens=heat&${PUEBLA}`))).json() as HeatImpactResponse
    expect(body.decisionSupport).toMatchObject({ status: 'corroborated', severity: 'alert', notMedicalAdvice: true, components: { warmNights: true, coldExtreme: true, warmDays: false, hotExtreme: false } })
    expect(body.hazard.status).toBe('corroborated')
    expect(body.exposure).toMatchObject({ populationYear: 2020, scale: 'cell', source: 'INEGI_CPV_2020_ITER' })
    expect(body.exposure.population).toBeGreaterThan(3_000_000)
    expect(body.priority.status).toBe('high-exposure-signal')
    const nights = body.indicators.find((item) => item.id === 'TN90p')!
    expect(nights.trend).toMatchObject({ direction: 'increasing', status: 'robust', mannKendallSignificant: true })
    expect(nights.interpretation.en).toMatch(/^The share of nights above the historical heat threshold is increasing/)
  })
})

describe('language and validation', () => {
  it('never issues operational, agronomic or medical instructions', async () => {
    for (const lens of ['water', 'heat']) {
      const body = await (await impactGet(request(`/api/impact?lens=${lens}&${PUEBLA}`))).json()
      const text = JSON.stringify({ d: body.decisionSupport, i: body.indicators.map((item: { interpretation: unknown; limitations: unknown }) => [item.interpretation, item.limitations]), w: body.warnings, l: body.limitations, f: body.finalStatement })
      expect(text, lens).not.toMatch(FORBIDDEN)
    }
  })

  it('answers bad requests with { error } before calling POWER', async () => {
    const cases: Array<[string, number]> = [
      ['/api/impact?lens=fire&country=MEX&state=Puebla', 400],
      ['/api/impact?lens=water', 400],
      ['/api/impact?lens=water&municipalityCode=211', 400],
      ['/api/impact?lens=water&municipalityCode=21114&mode=rolling', 400],
      ['/api/impact?lens=heat&latitude=95&longitude=0', 400],
      ['/api/impact?lens=heat&municipalityCode=99999', 404],
    ]
    for (const [path, status] of cases) {
      const response = await impactGet(request(path))
      expect(response.status, path).toBe(status)
      expect(typeof (await response.json() as { error: string }).error).toBe('string')
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('accepts POST with a JSON body (private cache)', async () => {
    const response = await impactPost(request('/api/impact', { method: 'POST', body: { lens: 'heat', country: 'MEX', state: 'Puebla', latitude: 19.04, longitude: -98.2, startYear: 2001, endYear: 2024, mode: 'common-complete-window' } }))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('private')
    expect((await response.json() as HeatImpactResponse).lens).toBe('heat')
  })
})
