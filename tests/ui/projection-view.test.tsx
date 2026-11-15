import { beforeAll, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { analyzeRegion } from '../../lib/api/region-service'
import type { RegionResponse } from '../../lib/api/v2'
import { getVariable } from '../../lib/variables/catalog'
import { changeFill, changeLegend, tint } from '../../lib/ui/color-scale'
import { cellMean, cellProjection, changeMaxAbs, directionCounts, skillLabel } from '../../lib/ui/projection-view'
import { MapCells, MapLegend } from '../../components/map-layer'
import { ProjectionPanel } from '../../components/map-projection'
import { fakePower, stateGeometry } from '../helpers/power-fixtures'

// A real Tlaxcala T2M response (saved POWER data). Its projection is blocked; `passing` is the same response with the
// status flipped to 'ok', to render what the panel shows when a projection is drawn.
let blocked: RegionResponse
let passing: RegionResponse

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(fakePower))
  blocked = await analyzeRegion(getVariable('T2M')!, 2001, 2024, { geometry: stateGeometry('MEX', 'Tlaxcala') as never })
  vi.unstubAllGlobals()
  passing = structuredClone(blocked)
  passing.projection = { ...passing.projection!, status: 'ok', reason: null, warnings: [{ code: 'unstable-skill', es: '', en: 'The line does not always work.' }] }
  // Exactly one significant cell, whatever the real data say, so the counts below are fixed.
  passing.cells.forEach((cell, index) => { cell.significantField = index === 0 })
})

describe('projection view helpers', () => {
  it('measures change against the line in the last data year, so it is 0 there', () => {
    const cell = blocked.cells[0]
    expect(cellProjection(cell, blocked, 2024, 'change')!.shown).toBeCloseTo(0, 12)
    const in2034 = cellProjection(cell, blocked, 2034, 'change')!
    expect(in2034.change).toBeCloseTo(cell.fit!.slopePerYear * 10, 10)
    expect(cellProjection(cell, blocked, 2034, 'value')!.shown).toBeCloseTo(in2034.at.value, 12)
  })

  it('fixes the change scale over the whole slider range (a line peaks at the ends)', () => {
    const expected = Math.max(...blocked.cells.map((cell) => Math.abs(cell.fit!.slopePerYear) * Math.max(2024 - 2001, 2034 - 2024)))
    expect(changeMaxAbs(blocked)).toBeCloseTo(expected, 10)
  })

  it('averages the cells and splits rising and falling lines by field significance', () => {
    expect(cellMean(blocked, 2024, 'change')!.value).toBeCloseTo(0, 10)
    expect(cellMean(blocked, 2030)!.count).toBe(4)
    const counts = directionCounts(passing)
    expect(counts.rising + counts.falling).toBe(4)
    expect(counts.risingSignificant + counts.fallingSignificant).toBe(1)
    expect(counts.uncertain).toBe(3)
  })

  it('labels window skill with a sign', () => {
    expect(skillLabel(0.26)).toBe('+26%')
    expect(skillLabel(-0.04)).toBe('−4%')
  })

  it('colors change white at 0 and darker with distance, warm up for temperature', () => {
    expect(changeFill(0, 1, 'temperature')).toBe('var(--color-white)')
    expect(changeFill(1, 1, 'temperature')).toBe(tint('var(--color-rocket-red)', 80))
    expect(changeFill(-2, 1, 'temperature')).toBe(tint('var(--color-neon-blue)', 80))
    expect(changeFill(1, 1, 'precipitation')).toBe(tint('var(--color-neon-blue)', 80))
    const legend = changeLegend(1, 'temperature')
    expect(legend[0].from).toBeCloseTo(-1)
    expect(legend[legend.length - 1].to).toBeCloseTo(1)
  })
})

describe('projection panel and map (rendered markup)', () => {
  const panel = (data: RegionResponse) => renderToStaticMarkup(<ProjectionPanel variable="T2M" data={data} active isLoading={false} on onToggle={() => {}} playing={false} onPlayToggle={() => {}} year={2030} onScrub={() => {}} mode="change" onMode={() => {}} startYear={2001} endYear={2024} />)

  it('explains a blocked projection, shows each window and draws no counts', () => {
    const html = panel(blocked)
    expect(html).toContain('Blocked by quality.')
    expect(html).toContain('2015–2019')
    expect(html).toContain('2020–2024')
    expect(html).toContain('is-worse')
    expect(html).toContain('The heat map still shows the measured data.')
    expect(html).not.toContain('cells rise')
  })

  it('shows the change readout, significance counts, warnings and shape checks when the projection passes', () => {
    const html = panel(passing)
    expect(html).toContain('Change since 2024')
    expect(html).toContain('vs the line in 2024')
    // Visible: plain counts, short warning labels and the tested-on summary; the numbers sit in "How it was tested".
    expect(html).toMatch(/<strong>\d+<\/strong> cells rise • <strong>\d+<\/strong> fall/)
    expect(html).toContain('3 hatched: too weak to tell from noise')
    expect(html).toContain('Works in some periods, not all')
    expect(html).toMatch(/Back-test 2015–2024: <strong>\d+% (better|worse)<\/strong> than predicting the average/)
    expect(html).toContain('asked to predict it')
    expect(html).toContain('How it was tested')
    expect(html).toMatch(/\d+ of the rising and \d+ of the falling cells have a significant trend/)
    expect(html).toContain('The line does not always work.')
    expect(html).toMatch(/Shape checks on the regional series \(24 years\): curvature p = /)
  })

  it('hatches exactly the fitted cells whose trend is not significant', () => {
    const html = renderToStaticMarkup(<svg><MapCells data={passing} kind="anomaly" project={(lon, lat) => [lon * 10, -lat * 10]} projectionYear={2030} projectionMode="change" hatchId="h" /></svg>)
    expect(html.match(/class="map-hatch"/g)).toHaveLength(3)
    expect(html).toContain('hatched: trend not significant')
  })

  it('labels the legend with the change since the last data year', () => {
    const html = renderToStaticMarkup(<MapLegend data={passing} kind="anomaly" projectionYear={2030} projectionMode="change" />)
    expect(html).toContain('Change since 2024 · 2030')
    expect(html).toContain('Trend not significant')
  })
})
