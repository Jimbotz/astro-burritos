/**
 * Specification checks for the straight line of the step 3 projection, run on the area-weighted regional series.
 *
 * - Curvature: a quadratic term t² added to the line (t = year − mean year). Its t statistic uses the residual
 *   standard error widened for AR(1) residuals, √((1 + r1)/(1 − r1)), like the prediction interval, because
 *   consecutive years are not independent and the plain test would find curvature too often.
 * - Changing variance: Koenker's studentized Breusch–Pagan test, n·R² of the squared residuals regressed on the year,
 *   compared with χ²(1). When the scatter grows with time, a constant-width interval is too narrow at the far end.
 *
 * Both only produce warnings: the rolling-origin validation already decides whether the line is drawn.
 */
import { autocorrelation, normalTwoSided, olsFit, type XY } from './robust-stats'
import { studentTCdf } from './trend'

export type CurvatureCheck = {
  /** Quadratic coefficient (units per year²): > 0 the series bends upward, < 0 it bends downward. */
  coefficient: number
  tStatistic: number
  pValue: number
  /** Lag-1 autocorrelation of the quadratic fit's residuals used for the widening, clamped to [0, 0.95]. */
  ar1: number
}

export type VarianceCheck = {
  /** Koenker–Breusch–Pagan statistic n·R², compared with χ²(1). */
  lm: number
  pValue: number
  /** Slope of the squared residuals against the year: > 0 the scatter grows over time. */
  trend: number
}

export type LineDiagnostics = { years: number; curvature: CurvatureCheck | null; variance: VarianceCheck | null }

/** Fewer points leave the quadratic test with too few degrees of freedom to mean anything. */
export const MIN_DIAGNOSTIC_YEARS = 10

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

/** Solves a small symmetric system by Gauss–Jordan elimination with partial pivoting; null if singular. */
function solve(matrix: number[][], vector: number[]): { solution: number[]; inverse: number[][] } | null {
  const size = vector.length
  const rows = matrix.map((row, index) => [...row, vector[index], ...Array.from({ length: size }, (_, column) => (column === index ? 1 : 0))])
  for (let column = 0; column < size; column += 1) {
    let pivot = column
    for (let row = column + 1; row < size; row += 1) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row
    if (Math.abs(rows[pivot][column]) < 1e-12) return null
    ;[rows[column], rows[pivot]] = [rows[pivot], rows[column]]
    const divisor = rows[column][column]
    rows[column] = rows[column].map((value) => value / divisor)
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue
      const factor = rows[row][column]
      if (factor !== 0) rows[row] = rows[row].map((value, index) => value - factor * rows[column][index])
    }
  }
  return { solution: rows.map((row) => row[size]), inverse: rows.map((row) => row.slice(size + 1)) }
}

/** t-test of the quadratic term in y = b0 + b1·t + b2·t² (t centred on the mean year), AR(1)-widened. */
export function curvatureCheck({ x, y }: XY): CurvatureCheck | null {
  const n = x.length
  if (n < MIN_DIAGNOSTIC_YEARS) return null
  const center = mean(x)
  const design = x.map((year) => [1, year - center, (year - center) ** 2])
  const xtx = [0, 1, 2].map((i) => [0, 1, 2].map((j) => design.reduce((sum, row) => sum + row[i] * row[j], 0)))
  const xty = [0, 1, 2].map((i) => design.reduce((sum, row, index) => sum + row[i] * y[index], 0))
  const solved = solve(xtx, xty)
  if (!solved) return null
  const [b0, b1, b2] = solved.solution
  const residuals = design.map((row, index) => y[index] - (b0 + b1 * row[1] + b2 * row[2]))
  const sigma2 = residuals.reduce((sum, value) => sum + value * value, 0) / (n - 3)
  const r1 = autocorrelation(residuals, 1)
  const ar1 = Number.isFinite(r1) ? Math.min(0.95, Math.max(0, r1)) : 0
  const se = Math.sqrt(sigma2 * solved.inverse[2][2] * ((1 + ar1) / (1 - ar1)))
  if (!(se > 0) || !Number.isFinite(se)) return null
  const tStatistic = b2 / se
  const pValue = Math.min(1, 2 * (1 - studentTCdf(Math.abs(tStatistic), n - 3)))
  return { coefficient: b2, tStatistic, pValue, ar1 }
}

/** Koenker–Breusch–Pagan test of the straight line's squared residuals against the year. */
export function varianceCheck(data: XY): VarianceCheck | null {
  const n = data.x.length
  if (n < MIN_DIAGNOSTIC_YEARS) return null
  const squared = olsFit(data).residuals.map((value) => value * value)
  const auxiliary = olsFit({ x: data.x, y: squared })
  const mSquared = mean(squared)
  const total = squared.reduce((sum, value) => sum + (value - mSquared) ** 2, 0)
  if (!(total > 0)) return null
  const unexplained = auxiliary.residuals.reduce((sum, value) => sum + value * value, 0)
  const rSquared = Math.max(0, 1 - unexplained / total)
  const lm = n * rSquared
  return { lm, pValue: normalTwoSided(Math.sqrt(lm)), trend: auxiliary.slope }
}

export function lineDiagnostics(data: XY): LineDiagnostics {
  return { years: data.x.length, curvature: curvatureCheck(data), variance: varianceCheck(data) }
}
