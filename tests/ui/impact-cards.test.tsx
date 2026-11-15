import { beforeAll, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { analyzeImpact, type ImpactRequest } from '../../lib/api/impact-service'
import type { HeatImpactResponse, WaterImpactResponse } from '../../lib/api/impact-types'
import { ImpactOverview } from '../../components/impact-overview'
import { ImpactIndicatorCard } from '../../components/impact-indicator-card'
import { cardPalette, formatImpactValue } from '../../lib/ui/impact-presentation'
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
    for (const text of ['Watch', water.decisionSupport.summary.en, 'Precipitation stress', 'Observed drought (CONAGUA)', 'Drought in 4 of 5 years', 'Why this status?', 'Suggested action', 'a planning signal, not a command', 'NASA POWER + CONAGUA/SMN', 'Estimated climate balance. It does not represent water physically available in dams or aquifers.', 'Validation with CONAGUA/SMN', 'Sources &amp; methods', 'What this lens cannot conclude']) expect(html, text).toContain(text)
    expect(html).toContain('class="impact-map-svg"')
    expect(html).not.toMatch(/NaN|undefined/)
  })

  it('heat: hazard, exposure and priority as separate blocks, never medical advice', () => {
    const html = renderToStaticMarkup(<ImpactOverview data={heat} />)
    for (const text of ['Corroborated heat-exposure signal', 'Climate hazard', 'Exposure', 'Combined priority', 'High-exposure signal', 'a planning signal, not a command or medical advice', 'Rising (robust)', 'Confirms the signal', 'NASA POWER + INEGI', 'It is not a medical diagnosis, and the climate cell does not represent a specific neighbourhood.']) expect(html, text).toContain(text)
    expect(html).toContain('impact-summary is-alert')
    expect(html).not.toMatch(/NaN|undefined/)
  })

  it('an indicator card keeps only the main value, what it means and a Why? button', () => {
    const nights = heat.indicators.find((item) => item.id === 'TN90p')!
    const html = renderToStaticMarkup(<ImpactIndicatorCard indicator={nights} />)
    for (const text of ['Warm nights (TN90p)', formatImpactValue(nights), '% of days', 'Mean of 2020–2024', nights.interpretation.en, 'Why?']) expect(html, text).toContain(text)
    for (const text of ['Interval', 'Mann–Kendall', 'Data source', 'Limitations', 'complete years']) expect(html, text).not.toContain(text)
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(1)
  })

  it('colours every card by theme: water, heat, moisture, population', () => {
    expect(Object.fromEntries([...water.indicators, ...heat.indicators].map((item) => [item.id, cardPalette(item)]))).toMatchObject({
      precipitation: 'water', balance: 'water', 'observed-drought': 'water', et0: 'moisture', 'root-zone-wetness': 'moisture',
      TN90p: 'heat', TX90p: 'heat', TXx: 'heat', TNn: 'heat', TN: 'heat', 'population-exposure': 'population',
    })
    // Every indicator the backend returns today has a theme; only an unknown id stays neutral.
    expect([...water.indicators, ...heat.indicators].filter((item) => cardPalette(item) === 'neutral')).toEqual([])
    expect(cardPalette({ id: 'not-in-the-catalog' })).toBe('neutral')
    expect(renderToStaticMarkup(<ImpactIndicatorCard indicator={heat.indicators.find((item) => item.id === 'TXx')!} />)).toContain('impact-card is-heat')
  })

  it('precipitation states its no-claim meaning instead of a rate', () => {
    const rain = water.indicators.find((item) => item.id === 'precipitation')!
    expect(renderToStaticMarkup(<ImpactIndicatorCard indicator={rain} />)).toContain('is shown without stating an increase or decrease')
  })

  it('keeps the map simple and drops the municipalities list', () => {
    const html = renderToStaticMarkup(<ImpactOverview data={heat} />)
    expect(html).not.toContain('Municipalities (')
    expect(html).not.toContain('impact-map-group')
    // The legend lists only the classes present on the map, plus the analysis point.
    const legend = html.slice(html.indexOf('class="impact-legend"'))
    expect(legend).toContain('High-exposure signal')
    expect(legend).not.toContain('Exposure unknown')
    expect(legend).toContain('is-point')
  })

  it('summarizes each component as a chip with a few words, and folds the technical reason under “Why this status?”', () => {
    const html = renderToStaticMarkup(<ImpactOverview data={heat} />)
    expect(html.match(/class="impact-chip /g)).toHaveLength(heat.decisionSupport.componentDetails.length)
    const why = html.slice(html.indexOf('Why this status?'))
    expect(why).toContain('Mann–Kendall (Hamed–Rao) p &lt; 0.05')
    // The long criteria line is not in the chips any more, and the repeated eyebrow and notes are gone.
    expect(html.slice(0, html.indexOf('Why this status?'))).not.toContain('Mann–Kendall')
    expect(html).not.toContain('impact-eyebrow')
    expect(html).not.toContain('Limitation:</strong>')
  })

  it('reads the map for the selected layer: what you see, how many people it reaches, the analysis point and its cell', () => {
    const html = renderToStaticMarkup(<ImpactOverview data={heat} />)
    const priority = heat.map.layers.find((item) => item.id === heat.map.defaultLayer)!
    expect(html).toContain('Reading the map')
    expect(html).toContain(priority.reading!.headline.en)
    expect(html).toContain(priority.reading!.affects!.en)
    expect(html).toContain(priority.reading!.point!.en)
    expect(html).toContain(priority.about.shows.en)
    // The cell panel describes the analysis point cell across every layer, with the backend units.
    const panel = html.slice(html.indexOf('impact-cell-panel'))
    expect(panel).toContain('Analysis point cell')
    expect(panel).toContain('pp/decade')
    expect(panel).toMatch(/3,\d{3},\d{3} people/)
    for (const layer of [...heat.map.layers, ...water.map.layers]) {
      expect(layer.about.shows.en.length, layer.id).toBeGreaterThan(10)
      expect(layer.about.useFor.es.length, layer.id).toBeGreaterThan(10)
    }
    // Each heat filter button also carries its explanation as a tooltip.
    expect(html.match(/<button type="button" aria-pressed="(true|false)" title="/g)).toHaveLength(heat.map.layers.length)
  })

  it('still renders the map from a response cached before the layer explanations existed', () => {
    const stale = structuredClone(heat)
    for (const layer of stale.map.layers) delete (layer as Partial<typeof layer>).about
    const html = renderToStaticMarkup(<ImpactOverview data={stale} />)
    expect(html).toContain('class="impact-map-svg"')
    expect(html).not.toContain('What it shows:')
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
