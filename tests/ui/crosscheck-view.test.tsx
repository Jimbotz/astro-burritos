import { beforeAll, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { crosscheckRain } from '../../lib/api/crosscheck-service'
import type { CrosscheckComparison, CrosscheckResponse } from '../../lib/api/v2'
import { COMPARE_PLACES, levelSentence, placeSentence, pText, reasonText, sameCell, sourceChecks, sourceTrendSentence, yearToYearSentence } from '../../lib/ui/crosscheck-view'
import { decodeQuery, encodeQuery, type SharedQuery } from '../../lib/ui/query-url'
import { PlaceComparison, RainCrosscheck } from '../../components/cross-check'
import { DualSeriesChart } from '../../components/dual-series-chart'
import { fakePower } from '../helpers/power-fixtures'

// The real Puebla 2001–2024 cross-check (saved POWER responses), plus a copy turned into the real Tlaxcala disagreement.
let puebla: CrosscheckResponse
let disagreement: CrosscheckComparison
const DIRECTION = /increas|decreas|rising|falling|getting (wetter|drier)|rains more|rains less/i

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(fakePower))
  puebla = await crosscheckRain(19.04, -98.2, 2001, 2024)
  vi.unstubAllGlobals()
  disagreement = structuredClone(puebla.comparisons[0])
  disagreement.merra2.trend = { ...disagreement.merra2.trend, senPerDecade: 185, ci95SenPerDecade: [110, 293], pValueHamedRao: 0.0002 }
  disagreement.imerg.trend = { ...disagreement.imerg.trend, senPerDecade: -27, ci95SenPerDecade: [-87, 35], pValueHamedRao: 0.36 }
  disagreement.trend = { agreement: 'disagree', reason: 'incompatible-rates', detected: [true, false], intervalsOverlap: false }
})

describe('rain cross-check in plain language', () => {
  it('answers the three questions for Puebla: same amount, same wet years, trend not settled', () => {
    const annual = puebla.comparisons[0]
    expect(sourceChecks(annual)).toEqual({ level: 'yes', yearToYear: 'yes', trend: 'unknown' })
    expect(levelSentence(annual.level)).toMatch(/^Same amount within ±10%: MERRA-2 884 mm, IMERG 913 mm/)
    expect(yearToYearSentence(annual.level)).toMatch(/^They partly agree on which years were wetter or drier \(r = 0\.\d\d after removing/)
    // MERRA-2's p is 0.05005: shown with five decimals and called out, never as a rounded 0.0500.
    expect(sourceTrendSentence(annual)).toBe('Neither record detects a trend in this period (Hamed–Rao p = 0.05005 for MERRA-2 and 0.5030 for IMERG). MERRA-2 sits just above the 0.05 limit, so it does not count as detected.')
    expect(pText(0.0499)).toBe('0.0499')
    expect(pText(0.05005)).toBe('0.05005')
  })

  it('names the intervals when the records disagree', () => {
    expect(sourceChecks(disagreement).trend).toBe('no')
    expect(sourceTrendSentence(disagreement)).toBe('The records give incompatible rates: their 95% intervals do not overlap (MERRA-2 +110 to +293, IMERG −87 to +35 mm/decade).')
  })

  it('explains every reason, with the minimum detectable trend when nothing is detected', () => {
    const annual = puebla.comparisons[0]
    for (const reason of ['different-methods', 'satellite-transition', 'station-skill', 'below-detectable', 'level-gap', 'weak-year-to-year'] as const) {
      const text = reasonText(reason, annual)
      expect(text.length, reason).toBeGreaterThan(40)
      expect(text, reason).not.toMatch(DIRECTION)
    }
    expect(reasonText('below-detectable', annual)).toMatch(/to be detectable here: “no trend detected” is not “no change”/)
  })

  it('never states that rain goes up or down', () => {
    const sentences = [puebla.comparisons[0], puebla.comparisons[1], disagreement].flatMap((comparison) => [levelSentence(comparison.level), yearToYearSentence(comparison.level), sourceTrendSentence(comparison)])
    for (const sentence of sentences) expect(sentence).not.toMatch(DIRECTION)
  })
})

describe('place comparison', () => {
  it('keeps the rain rule: no claim from a single record', () => {
    const comparison = { agreement: 'agree' as const, reason: 'same-direction' as const, detected: [true, true] as [boolean, boolean], intervalsOverlap: true }
    expect(placeSentence(comparison, ['Puebla', 'Tehuacán'], false)).toMatch(/^EarthScope does not state rain trends from a single record/)
    expect(placeSentence(comparison, ['Puebla', 'Tehuacán'], true)).toBe('Puebla and Tehuacán show the same signal: both detect a trend of the same sign and compatible size.')
    expect(placeSentence({ ...comparison, agreement: 'inconclusive', reason: 'one-detects', detected: [false, true] }, ['Puebla', 'Tehuacán'], true)).toBe('Only Tehuacán has a detectable trend. The record of Puebla can neither confirm nor rule out the same change.')
  })

  it('offers places in different MERRA-2 cells and spots a comparison of a cell with itself', () => {
    const cells = new Set(COMPARE_PLACES.map((place) => `${Math.round(place.lat / 0.5)}:${Math.round(place.lon / 0.625)}`))
    expect(cells.size).toBe(COMPARE_PLACES.length)
    expect(sameCell({ lat: 19.04, lon: -98.2 }, COMPARE_PLACES.find((place) => place.id === 'tehuacan')!)).toBe(false)
    // The Tlaxcala example (state label point) and Tlaxcala city share one cell.
    expect(sameCell({ lat: 19.4, lon: -98.16 }, COMPARE_PLACES.find((place) => place.id === 'tlaxcala')!)).toBe(true)
  })

  it('carries the comparison place in shared links and drops an unknown one', () => {
    const query: SharedQuery = { region: { name: 'Puebla, Mexico', lat: 19.04, lon: -98.2, country: 'MEX', state: 'Puebla' }, variable: 'T2M', startYear: 2001, endYear: 2024, layer: 'trend', vs: 'tehuacan' }
    expect(encodeQuery(query)).toContain('vs=tehuacan')
    expect(decodeQuery(encodeQuery(query))).toEqual(query)
    const unknown = decodeQuery(encodeQuery(query).replace('vs=tehuacan', 'vs=atlantis'))
    expect(unknown).not.toBeNull()
    expect(unknown).not.toHaveProperty('vs')
  })
})

describe('cross-check cards', () => {
  it('renders the rain card with its verdict, the three checks, the numbers and the reasons', () => {
    const html = renderToStaticMarkup(<RainCrosscheck place="Puebla, Mexico" data={puebla} isLoading={false} analysisRequested onRetry={() => {}} />)
    expect(html).toContain('Trend: Inconclusive')
    expect(html).toContain('Wet season (May–Oct)')
    for (const text of ['Same amount of rain?', 'Same wet and dry years?', 'Same trend?', 'Why trust this result, or not', 'GPM IMERG', 'Hamed–Rao p']) expect(html).toContain(text)
    expect(html).toContain('42 pixels of 0.1°')
    expect(html).not.toMatch(/NaN|undefined/)
  })

  it('waits for Analyze in both cards instead of showing numbers', () => {
    const rain = renderToStaticMarkup(<RainCrosscheck place="Puebla, Mexico" isLoading={false} analysisRequested={false} onRetry={() => {}} />)
    expect(rain).toContain('Press Analyze region to compare the two rain records.')
    const places = renderToStaticMarkup(<PlaceComparison region={{ name: 'Puebla, Mexico', lat: 19.04, lon: -98.2 }} variable="T2M" compareWith="tehuacan" onCompareWith={() => {}} startYear={2001} endYear={2024} analysisRequested={false} />)
    expect(places).toContain('Press Analyze region, then choose a place to compare.')
    // The place in the same cell as the analysis point cannot be chosen.
    expect(places).toMatch(/<option value="puebla" disabled="">/)
  })

  it('draws two records with gaps for incomplete years and a legend for each', () => {
    const html = renderToStaticMarkup(<DualSeriesChart a={{ name: 'A', points: [{ year: 2001, value: 1 }, { year: 2002, value: null }, { year: 2003, value: 2 }, { year: 2004, value: 3 }] }} b={{ name: 'B', points: [{ year: 2001, value: 2 }, { year: 2002, value: 2 }, { year: 2003, value: 1 }, { year: 2004, value: 1 }] }} unit="mm" label="test" />)
    expect(html.match(/class="dual-series is-a"/g)).toHaveLength(1)
    expect(html.match(/<polyline/g)).toHaveLength(2) // A: only 2003–2004 forms a line (2001 stands alone); B: one line
    expect(html).toContain('dual-key is-a')
    expect(html).toContain('dual-key is-b')
  })
})
