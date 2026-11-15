import { describe, expect, it } from 'vitest'
import { curvatureCheck, lineDiagnostics, MIN_DIAGNOSTIC_YEARS, varianceCheck } from '../../lib/analysis/diagnostics'
import { projectCells } from '../../lib/analysis/projection'
import { olsFit } from '../../lib/analysis/robust-stats'
import type { AnnualPoint } from '../../lib/analysis/annual-rules'
import type { ProjectionRule } from '../../lib/variables/catalog'

const years = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
// Deterministic, roughly white noise (no random seed).
const noise = (year: number) => 0.08 * Math.sin(year * 12.9898) * Math.cos(year * 4.1414)
const x = years(2001, 2024)

describe('curvature check (quadratic term, AR(1)-widened)', () => {
  it('finds no curvature in a straight line with noise', () => {
    const check = curvatureCheck({ x, y: x.map((year) => 16 + 0.04 * (year - 2001) + noise(year)) })!
    expect(check.pValue).toBeGreaterThan(0.05)
  })

  it('recovers the quadratic coefficient and flags a series that bends upward', () => {
    const check = curvatureCheck({ x, y: x.map((year) => 16 + 0.01 * (year - 2012.5) + 0.004 * (year - 2012.5) ** 2 + noise(year)) })!
    expect(check.coefficient).toBeCloseTo(0.004, 3)
    expect(check.pValue).toBeLessThan(0.01)
  })

  it('flags a series that bends downward with a negative coefficient', () => {
    const check = curvatureCheck({ x, y: x.map((year) => 16 + 0.08 * (year - 2001) - 0.004 * (year - 2001) ** 2 + noise(year)) })!
    expect(check.coefficient).toBeLessThan(0)
    expect(check.pValue).toBeLessThan(0.01)
  })

  it('needs at least ten years', () => {
    const short = years(2001, 2001 + MIN_DIAGNOSTIC_YEARS - 2)
    expect(curvatureCheck({ x: short, y: short.map((year) => year ** 2) })).toBeNull()
  })
})

describe('changing-variance check (Koenker–Breusch–Pagan)', () => {
  it('equals n·R² of the squared residuals regressed on the year', () => {
    const y = x.map((year) => 16 + 0.04 * (year - 2001) + noise(year) * (1 + (year - 2001) / 6))
    const squared = olsFit({ x, y }).residuals.map((value) => value * value)
    const aux = olsFit({ x, y: squared })
    const m = squared.reduce((s, v) => s + v, 0) / squared.length
    const r2 = 1 - aux.residuals.reduce((s, v) => s + v * v, 0) / squared.reduce((s, v) => s + (v - m) ** 2, 0)
    expect(varianceCheck({ x, y })!.lm).toBeCloseTo(x.length * r2, 10)
  })

  it('flags scatter that grows over time and not constant scatter', () => {
    const growing = varianceCheck({ x, y: x.map((year, index) => 16 + 0.04 * index + (index % 2 ? 1 : -1) * 0.02 * (1 + index)) })!
    expect(growing.trend).toBeGreaterThan(0)
    expect(growing.pValue).toBeLessThan(0.05)
    const constant = varianceCheck({ x, y: x.map((year, index) => 16 + 0.04 * index + (index % 2 ? 1 : -1) * 0.1) })!
    expect(constant.pValue).toBeGreaterThan(0.05)
  })
})

describe('diagnostics in the projection summary', () => {
  const RULE: ProjectionRule = { method: 'ols', holdoutYears: 5, holdoutWindows: 2, horizonYears: 10, minFitYears: 10, minCoverage: 0.8, minSkill: 0.1, diagnosticAlpha: 0.05, floor: null, rationale: { es: '', en: '' } }
  const annual = (values: number[]): AnnualPoint[] => values.map((value, index) => ({ year: 2001 + index, value, validCount: 12, expectedCount: 12, complete: true }))
  const single = (series: AnnualPoint[]) => projectCells(['x'], new Map([['x', series]]), series, 2001, 2024, RULE).summary

  it('reports the checks and adds no warning for a clean straight line', () => {
    const summary = single(annual(x.map((year) => 16 + 0.05 * (year - 2001) + noise(year))))
    expect(summary.status).toBe('ok')
    expect(summary.diagnostics).toMatchObject({ years: 24 })
    expect(summary.warnings.map((w) => w.code)).not.toContain('curvature')
    expect(summary.warnings.map((w) => w.code)).not.toContain('growing-variance')
  })

  it('warns that an accelerating series will run above the extended line', () => {
    const summary = single(annual(x.map((year) => 16 + 0.02 * (year - 2001) + 0.003 * (year - 2001) ** 2 + noise(year))))
    expect(summary.status).toBe('ok')
    const curvature = summary.warnings.find((w) => w.code === 'curvature')
    expect(curvature?.en).toMatch(/bends upward/)
    expect(curvature?.en).toMatch(/run below the real values/)
  })

  it('keeps the diagnostics when the projection is blocked, without warnings', () => {
    const summary = single(annual(x.map((year) => 16 + noise(year))))
    expect(summary.status).toBe('blocked-by-quality')
    expect(summary.diagnostics?.curvature).not.toBeNull()
    expect(summary.warnings).toEqual([])
  })

  it('exposes the same numbers as lineDiagnostics on the regional series', () => {
    const values = x.map((year) => 16 + 0.05 * (year - 2001) + noise(year))
    expect(single(annual(values)).diagnostics).toEqual(lineDiagnostics({ x, y: values }))
  })
})
