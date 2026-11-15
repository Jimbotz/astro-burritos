import { beforeAll, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { analyzeImpact, type ImpactRequest } from '../../lib/api/impact-service'
import type { HeatImpactResponse, WaterImpactResponse } from '../../lib/api/impact-types'
import { ImpactOverview } from '../../components/impact-overview'
import { ImpactIndicatorCard } from '../../components/impact-indicator-card'
import { formatImpactValue, trendText } from '../../lib/ui/impact-presentation'
import { fakeImpactPower } from '../helpers/impact-fixtures'

let water: WaterImpactResponse
let heat: HeatImpactResponse
const base: ImpactRequest = { lens: 'water', country: 'MEX', state: 'Puebla', municipalityCode: null, latitude: 19.04, longitude: -98.2, startYear: 2001, endYear: 2024, mode: 'common-complete-window' }

// Each analysis processes 34 years of daily data: allow more than the 5 s default when the suite runs in parallel.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(fakeImpactPower))
  water = await analyzeImpact(base) as WaterImpactResponse
  heat = await analyzeImpact({ ...base, lens: 'heat' }) as HeatImpactResponse
  vi.unstubAllGlobals()
})

describe('lens cards render only what the backend returned', () => {
  it('water: status, summary, components, suggested action, source and the climate-balance limitation', () => {
    const html = renderToStaticMarkup(<ImpactOverview data={water} />)
    for (const text of ['WATER SIGNAL', 'Watch', water.decisionSupport.summary.en, 'Precipitation stress', 'Observed drought (CONAGUA)', 'Suggested action', 'A planning signal, not a command.', 'NASA POWER + CONAGUA/SMN', 'Estimated climate balance. It does not represent water physically available in dams or aquifers.', 'Validation with CONAGUA/SMN', 'Sources &amp; methods', 'What this lens cannot conclude']) expect(html, text).toContain(text)
    expect(html).toContain('class="impact-map-svg"')
    expect(html).not.toMatch(/NaN|undefined/)
  })

  it('heat: hazard, exposure and priority as separate blocks, never medical advice', () => {
    const html = renderToStaticMarkup(<ImpactOverview data={heat} />)
    for (const text of ['HEAT SIGNAL', 'Corroborated heat-exposure signal', 'Climate hazard', 'Exposure', 'Combined priority', 'High-exposure signal', 'A planning signal, not a command or medical advice.', 'NASA POWER + INEGI', 'It is not a medical diagnosis, and the climate cell does not represent a specific neighbourhood.']) expect(html, text).toContain(text)
    expect(html).toContain('impact-summary is-alert')
    expect(html).not.toMatch(/NaN|undefined/)
  })

  it('an indicator card shows value, unit, trend, interval, test, period, source, quality and the three detail buttons', () => {
    const nights = heat.indicators.find((item) => item.id === 'TN90p')!
    const html = renderToStaticMarkup(<ImpactIndicatorCard indicator={nights} />)
    const trend = trendText(nights)!
    for (const text of ['Warm nights (TN90p)', formatImpactValue(nights), trend.rate, trend.interval, 'Mann–Kendall (Hamed–Rao)', '2001–2024', 'NASA', 'complete years', 'Why?', 'Data source', 'Limitations']) expect(html, text).toContain(text)
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(3)
  })

  it('precipitation keeps its no-claim label instead of a rate', () => {
    const rain = water.indicators.find((item) => item.id === 'precipitation')!
    expect(renderToStaticMarkup(<ImpactIndicatorCard indicator={rain} />)).toContain('Shown without an increase/decrease claim')
  })

  it('explains an insufficient-data result: missing source, period, coverage and what is needed', () => {
    const insufficient: WaterImpactResponse = structuredClone(water)
    insufficient.decisionSupport = { ...insufficient.decisionSupport, status: 'insufficient-data', severity: 'neutral', label: { es: 'Sin datos suficientes', en: 'Insufficient data' } }
    insufficient.period = { ...insufficient.period, effective: null }
    const html = renderToStaticMarkup(<ImpactOverview data={insufficient} />)
    expect(html).toContain('There is not enough evidence to issue a signal.')
    expect(html).toContain('nasa-power:precipitation: 24 complete years')
    expect(html).toContain('Needed: complete years of every input in the window')
  })
})
