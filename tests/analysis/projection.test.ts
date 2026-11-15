import { describe, expect, it } from 'vitest'
import { fitLine, predict, projectCells } from '../../lib/analysis/projection'
import { olsFit } from '../../lib/analysis/robust-stats'
import type { AnnualPoint } from '../../lib/analysis/annual-rules'
import { getVariable, PROJECTION_VARIABLE_IDS, type ProjectionRule } from '../../lib/variables/catalog'

const RULE: ProjectionRule = { method: 'ols', holdoutYears: 5, holdoutWindows: 2, horizonYears: 10, minFitYears: 10, minCoverage: 0.8, minSkill: 0.1, diagnosticAlpha: 0.05, floor: null, rationale: { es: '', en: '' } }
const years = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
const annual = (values: Array<[number, number]>): AnnualPoint[] => values.map(([year, value]) => ({ year, value, validCount: 12, expectedCount: 12, complete: true }))
// Deterministic small noise so tests never depend on a random seed.
const wiggle = (year: number, phase: number) => 0.06 * Math.sin(year * 1.7 + phase)

describe('line fit and prediction interval', () => {
  it('matches OLS and passes through the mean of the data', () => {
    const x = years(2001, 2024)
    const y = x.map((year) => 16 + 0.045 * (year - 2001) + wiggle(year, 0))
    const fit = fitLine({ x, y })!
    const ols = olsFit({ x, y })
    expect(fit.slopePerYear).toBeCloseTo(ols.slope, 12)
    expect(fit.intercept).toBeCloseTo(ols.intercept, 8)
    expect(predict(fit, fit.xMean).value).toBeCloseTo(y.reduce((s, v) => s + v, 0) / y.length, 10)
  })

  it('gives the textbook 95% prediction interval and widens away from the data', () => {
    // x̄ = 3, Sxx = 10, slope 0.8, intercept 0.6, s = √1.2, t(0.975, 3) = 3.1824
    const fit = fitLine({ x: [1, 2, 3, 4, 5], y: [1, 3, 2, 5, 4] })!
    const at6 = predict(fit, 6)
    expect(at6.value).toBeCloseTo(5.4, 10)
    expect((at6.high - at6.low) / 2).toBeCloseTo(3.182446 * Math.sqrt(1.2) * Math.sqrt(1 + 1 / 5 + 9 / 10), 4)
    expect(predict(fit, 10).high - predict(fit, 10).low).toBeGreaterThan(at6.high - at6.low)
  })

  it('widens the interval when consecutive residuals are correlated (AR(1), as the minimum detectable trend does)', () => {
    const x = years(2001, 2024)
    const fit = fitLine({ x, y: x.map((year) => 16 + 0.04 * (year - 2001) + 0.3 * Math.sin((year - 2001) * 0.35)) })!
    expect(fit.ar1).toBeGreaterThan(0.3)
    const iidHalf = fit.tCrit * fit.residualSd * Math.sqrt(1 + 1 / fit.n + (2030 - fit.xMean) ** 2 / fit.sxx)
    const at = predict(fit, 2030)
    expect((at.high - at.low) / 2).toBeCloseTo(iidHalf * Math.sqrt((1 + fit.ar1) / (1 - fit.ar1)), 8)
  })

  it('never goes below the physical floor', () => {
    const fit = fitLine({ x: years(2001, 2024), y: years(2001, 2024).map((year) => 100 - 4 * (year - 2001)) })!
    expect(predict(fit, 2034, 0)).toEqual({ value: 0, low: 0, high: 0 })
  })

  it('refuses series that cannot define a line', () => {
    expect(fitLine({ x: [2001, 2002], y: [1, 2] })).toBeNull()
  })
})

describe('validated projection of a grid', () => {
  /** Equal-weight mean of the cells per year (the service uses coverage × cos(lat) weights). */
  const regionalOf = (data: Map<string, AnnualPoint[]>) => {
    const series = [...data.values()]
    return series[0].map((point, index) => ({ ...point, value: series.reduce((sum, cell) => sum + (cell[index].value as number), 0) / series.length }))
  }
  const single = (series: AnnualPoint[], rule: ProjectionRule = RULE) => projectCells(['x'], new Map([['x', series]]), series, 2001, 2024, rule)
  /** One held-out window (2020–2024): isolates the skill rule from the pooling over windows. */
  const ONE_WINDOW: ProjectionRule = { ...RULE, holdoutWindows: 1 }

  it('accepts a steady trend, validates it on the last 5 regional years and fixes the color domain over the slider range', () => {
    const ids = ['a', 'b', 'c', 'd']
    const data = new Map(ids.map((id, i) => [id, annual(years(1995, 2024).map((year) => [year, 10 + i + 0.05 * (year - 2001) + wiggle(year, i)]))]))
    const { summary, fits } = projectCells(ids, data, regionalOf(data), 2001, 2024, RULE)
    expect(summary.status).toBe('ok')
    expect(summary.interpretation).toBe('exploratory-extrapolation')
    expect(summary.holdout).toMatchObject({ scope: 'regional-series', years: [2015, 2024], points: 10, cells: 4 })
    expect(summary.holdout!.windows.map((window) => window.years)).toEqual([[2015, 2019], [2020, 2024]])
    expect(summary.holdout!.windows.every((window) => window.points === 5 && window.skill > RULE.minSkill)).toBe(true)
    expect(summary.holdout!.skill).toBeGreaterThan(RULE.minSkill)
    expect(summary.holdout!.coverage95).toBeGreaterThanOrEqual(0.8)
    expect(summary.horizon).toEqual([2001, 2034])
    expect(summary.rising).toBe(4)
    expect(fits.size).toBe(4)
    // The darkest color is the highest line value at the end of the horizon, the lightest the lowest at the start.
    expect(summary.domain!.min).toBeCloseTo(predict(fits.get('a')!, 2001).value, 10)
    expect(summary.domain!.max).toBeCloseTo(predict(fits.get('d')!, 2034).value, 10)
  })

  it('blocks a line that does not beat the average on the held-out years', () => {
    // 2001–2019 drift upward, 2020–2024 fall back to the average: extending the line would invent a trend.
    const { summary } = single(annual(years(2001, 2024).map((year) => [year, year < 2020 ? 0.1 * (year - 2001) + wiggle(year, 0) : 0.9 + wiggle(year, 0)])), ONE_WINDOW)
    expect(summary.status).toBe('blocked-by-quality')
    expect(summary.holdout!.rmseModel).toBeGreaterThan(summary.holdout!.rmseBaseline)
    expect(summary.reason?.en).toMatch(/predicted worse than the average/)
  })

  it('blocks a line that beats the average by less than the 10% minimum', () => {
    // Held-out years land just past the midpoint between the line and the training mean: the line wins by ≈ 8%.
    const line = (year: number) => 0.1 * (year - 2001)
    const { summary } = single(annual(years(2001, 2024).map((year) => [year, year < 2020 ? line(year) + wiggle(year, 3) * 0.01 : 0.9 + 0.52 * (line(year) - 0.9)])), ONE_WINDOW)
    expect(summary.holdout!.skill).toBeGreaterThan(0)
    expect(summary.holdout!.skill).toBeLessThan(0.1)
    expect(summary.status).toBe('blocked-by-quality')
    expect(summary.reason?.en).toMatch(/improves on the average by only \d+% \(minimum 10%\)/)
  })

  it('keeps a line that clears the minimum but warns when recent years escape its interval', () => {
    // A steady trend that jumps up in the held-out years: much better than the average, but the interval is too narrow.
    const { summary } = single(annual(years(2001, 2024).map((year) => [year, 0.05 * (year - 2001) + wiggle(year, 1) + (year >= 2020 ? 0.6 : 0)])))
    expect(summary.status).toBe('ok')
    expect(summary.holdout!.skill).toBeGreaterThan(0.1)
    expect(summary.holdout!.bias).toBeGreaterThan(0)
    expect(summary.holdout!.coverage95).toBeLessThan(0.8)
    // The jump also bends the regional series upward, so the curvature check flags it too.
    expect(summary.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['interval-undercoverage', 'curvature']))
    expect(summary.warnings.find((w) => w.code === 'interval-undercoverage')!.en).toMatch(/ran above the line/)
  })

  it('blocks when the line did worse than the average in the most recent window, even if the pooled skill is high', () => {
    // The trend holds through 2019 (great 2015–2019 window) and then stalls: extending it from 2024 would invent a trend.
    const { summary } = single(annual(years(2001, 2024).map((year) => [year, year < 2020 ? 0.1 * (year - 2001) + wiggle(year, 5) : 1.4 + wiggle(year, 5)])))
    expect(summary.holdout!.windows[0].skill).toBeGreaterThan(0.5)
    expect(summary.holdout!.windows[1].skill).toBeLessThanOrEqual(0)
    expect(summary.status).toBe('blocked-by-quality')
    expect(summary.reason?.en).toMatch(/most recent years \(2020–2024\)/)
  })

  it('pools both windows but warns when the line did worse than the average in one of them', () => {
    // A steady trend with a flat 2015–2019 stretch: the line misses that window but wins clearly in 2020–2024.
    const series = annual(years(2001, 2024).map((year) => [year, year >= 2015 && year <= 2019 ? 0.35 + wiggle(year, 4) : 0.05 * (year - 2001) + (year >= 2020 ? 0.35 : 0) + wiggle(year, 4)]))
    const { summary } = single(series)
    const [first, second] = summary.holdout!.windows
    expect(first.skill).toBeLessThanOrEqual(0)
    expect(second.skill).toBeGreaterThan(0)
    if (summary.status === 'ok') expect(summary.warnings.map((w) => w.code)).toContain('unstable-skill')
    else expect(summary.reason?.en).toMatch(/average/)
  })

  it('reports insufficient data when the window cannot hold a fit and a holdout', () => {
    const series = annual(years(2015, 2024).map((year) => [year, 10 + 0.05 * year]))
    const { summary, fits } = projectCells(['x'], new Map([['x', series]]), series, 2015, 2024, RULE)
    expect(summary.status).toBe('insufficient-data')
    expect(fits.size).toBe(0)
  })

  it('skips incomplete years instead of treating them as values', () => {
    const points = annual(years(2001, 2024).map((year) => [year, 10 + 0.05 * (year - 2001) + wiggle(year, 2)]))
    const gap = points.map((point) => (point.year === 2010 ? { ...point, value: null, complete: false } : point))
    const { fits } = projectCells(['x'], new Map([['x', gap]]), gap, 2001, 2024, RULE)
    expect(fits.get('x')!.n).toBe(23)
  })
})

describe('per-variable projection rules', () => {
  it('projects only the four step 1 variables, with rain floored at 0 mm', () => {
    expect([...PROJECTION_VARIABLE_IDS].sort()).toEqual(['PRECTOTCORR', 'T2M', 'TNn', 'TXx'])
    expect(getVariable('PRECTOTCORR')!.profile.projection).toMatchObject({ floor: 0, holdoutYears: 5, holdoutWindows: 2, horizonYears: 10, minSkill: 0.1 })
    expect(getVariable('T2M')!.profile.projection!.floor).toBeNull()
    expect(getVariable('QV2M')!.profile.projection).toBeNull()
  })
})
