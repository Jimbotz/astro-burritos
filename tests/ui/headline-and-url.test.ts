import { describe, expect, it } from 'vitest'
import { headlineFor } from '../../lib/ui/headline'
import { decodeQuery, encodeQuery, type SharedQuery } from '../../lib/ui/query-url'
import type { RobustTrend, VariableResult } from '../../lib/api/v2'

const trend = (overrides: Partial<RobustTrend>, display: Partial<RobustTrend['display']> = {}) => ({
  verdict: 'robust', claimAllowed: true, criteriaMet: 5, minimumDetectablePerDecade: 0.4, window: { startYear: 2001, endYear: 2024 },
  ...overrides,
  display: { method: 'ols-hamed-rao', scale: 'absolute', unit: '°C/década', slope: 0.45, ci95: [0.23, 0.7], pValue: 0.009, referenceMean: null, relevanceThreshold: 0.1, exceedsRelevance: true, ...display },
}) as unknown as RobustTrend

const result = (label: string, t: RobustTrend) => ({ id: 'T2M', label: { es: label, en: label }, trendUnit: '°C/década', trend: t }) as unknown as VariableResult

describe('results headline (presentation rules in one sentence)', () => {
  it('states a rise only for a claimable robust or probable trend', () => {
    const h = headlineFor('Puebla, Mexico', result('Mean air temperature (2 m)', trend({})))
    expect(h.tone).toBe('up')
    expect(h.text).toBe('In Puebla, Mexico, mean air temperature (2 m) rose by +0.45 °C/decade from 2001–2024: a robust trend that passes all five checks.')
  })

  it('flags significant-but-small changes and never says "rose" for a weak signal', () => {
    const small = headlineFor('X', result('T', trend({ verdict: 'probable', criteriaMet: 3 }, { slope: 0.05, exceedsRelevance: false })))
    expect(small.text).toContain('probable trend (3 of 5 checks)')
    expect(small.text).toContain('significant but small')
    const weak = headlineFor('X', result('T', trend({ verdict: 'weak' })))
    expect(weak.tone).toBe('neutral')
    expect(weak.text).not.toMatch(/rose|fell/)
  })

  it('says "not detectable" is not "no change", and never claims a trend for rain', () => {
    const none = headlineFor('X', result('T', trend({ verdict: 'not-detectable' })))
    expect(none.text).toContain('That is not the same as no change.')
    expect(none.text).toContain('0.40 °C/decade')
    const rain = headlineFor('X', result('Annual precipitation', trend({ claimAllowed: false, verdict: 'weak' })))
    expect(rain.tone).toBe('neutral')
    expect(rain.text).toContain('without a trend claim')
  })
})

describe('shareable link', () => {
  const query: SharedQuery = { region: { name: 'Oaxaca, Mexico', lat: 16.94, lon: -96.21, country: 'MEX', state: 'Oaxaca' }, variable: 'PRECTOTCORR', startYear: 2001, endYear: 2024, layer: 'anomaly' }

  it('round-trips a query through the URL', () => {
    expect(decodeQuery(encodeQuery(query))).toEqual(query)
  })

  it('ignores links that are incomplete, out of range or not offered in step 1', () => {
    expect(decodeQuery('')).toBeNull()
    expect(decodeQuery(encodeQuery({ ...query, startYear: 1990 }))).toBeNull()
    expect(decodeQuery(encodeQuery({ ...query, region: { ...query.region, lat: 95 } }))).toBeNull()
    expect(decodeQuery(encodeQuery(query).replace('var=PRECTOTCORR', 'var=TX'))).toBeNull() // point-only variable
    expect(decodeQuery(encodeQuery(query).replace('layer=anomaly', 'layer=hack'))).toBeNull()
    expect(decodeQuery(encodeQuery(query).replace('country=MEX', 'country=%3Cscript%3E'))).toBeNull()
  })
})
