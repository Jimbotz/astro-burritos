/**
 * Exploratory linear extrapolation for the step 3 grid. Not a forecast.
 *
 * Follows docs/roadmap/data-strategy.md ("Linear regression and future values") and the projection boundary in
 * docs/science/validation-protocol.md:
 * - one OLS line per native cell over its complete annual values (annual values carry no seasonal cycle);
 * - validation runs on the area-weighted regional series, not on cell-years: neighbouring cells share their weather,
 *   so 21 cells x 5 years are not 105 independent checks. It uses rolling origins: each of the last `holdoutWindows`
 *   blocks of `holdoutYears` (e.g. 2015–2019 and 2020–2024) is predicted from a line fitted to the years before it and
 *   compared with the simplest baseline, the mean of those years. Errors are pooled over the windows (MAE, RMSE, skill,
 *   bias, 95% prediction-interval coverage) and each window's own skill is reported;
 * - if the line does not improve on the mean by at least `minSkill` (10%, pooled), or does worse than the mean in the
 *   most recent window (the one the extrapolation starts from), the variable is `blocked-by-quality` for this request
 *   and no projection is drawn; intervals that miss too many held-out years, or a window where the line
 *   did worse than the mean, carry a warning;
 * - every value comes with a 95% prediction interval for a new year (widened for AR(1) residuals), never a bare line;
 * - the straight line itself is checked on the regional series (lib/analysis/diagnostics.ts): significant curvature or
 *   a scatter that grows over time adds a warning, because both make the extrapolation less trustworthy than its
 *   interval suggests.
 */
import type { AnnualPoint } from './annual-rules'
import { lineDiagnostics, type LineDiagnostics } from './diagnostics'
import { autocorrelation, olsFit, type XY } from './robust-stats'
import { studentTQuantile } from './trend'
import type { ProjectionRule } from '../variables/catalog'

/** Everything needed to evaluate the line and its prediction interval for any year (the client does it per slider step). */
export type LineFit = {
  intercept: number
  slopePerYear: number
  /** Mean of the fitted years and their spread (Σ(x − x̄)²), for the interval width. */
  xMean: number
  sxx: number
  /** Residual standard deviation (n − 2 degrees of freedom). */
  residualSd: number
  n: number
  /** Student t quantile 0.975 with n − 2 degrees of freedom. */
  tCrit: number
  /**
   * Lag-1 autocorrelation of the residuals, clamped to [0, 0.95]. The interval is widened by √((1 + r1)/(1 − r1)),
   * the same AR(1) inflation the minimum detectable trend uses, because consecutive years are not independent.
   */
  ar1: number
}

export type ProjectedValue = { value: number; low: number; high: number }

export type HoldoutWindow = { years: [number, number]; points: number; skill: number; bias: number }

export type HoldoutValidation = {
  /** Scored on the area-weighted regional series (one value per year), so held-out years are independent checks. */
  scope: 'regional-series'
  /** From the first window's start to the end of the request window. */
  years: [number, number]
  /** Rolling-origin windows, oldest first, each predicted from a line fitted to the years before it. */
  windows: HoldoutWindow[]
  /** Held-out regional years scored, over all windows. */
  points: number
  /** Cells averaged into the regional series. */
  cells: number
  maeModel: number
  rmseModel: number
  maeBaseline: number
  rmseBaseline: number
  /** 1 − RMSE(line) / RMSE(mean): share of the average's error the line removes (> 0 means the line beats the mean). */
  skill: number
  /** Mean of observed − predicted on the held-out years: > 0 means recent years ran above the line. */
  bias: number
  /** Share of held-out values inside the line's 95% prediction interval (≈ 0.95 when the interval is honest). */
  coverage95: number
}

export type ProjectionStatus = 'ok' | 'blocked-by-quality' | 'insufficient-data'

/** Shown with the projection; they never hide it (only status does). */
export type ProjectionWarning = { code: 'interval-undercoverage' | 'unstable-skill' | 'curvature' | 'growing-variance'; es: string; en: string }

export type ProjectionSummary = {
  interpretation: 'exploratory-extrapolation'
  method: 'ols'
  status: ProjectionStatus
  /** Years the published lines are fitted to (the request window). */
  fitYears: [number, number]
  /** Slider range: inside fitYears the map shows the fitted line, after it the extrapolation. */
  horizon: [number, number]
  holdout: HoldoutValidation | null
  /** Curvature and changing-variance checks of the straight line on the regional series over fitYears. */
  diagnostics: LineDiagnostics | null
  /** Fixed color domain over every cell and every slider year, so a color change always means a value change. */
  domain: { min: number; max: number } | null
  /** Cells whose line rises / falls (sign of the slope). */
  rising: number
  falling: number
  rule: ProjectionRule
  /** Why the projection is not drawn (status ≠ 'ok'). */
  reason: { es: string; en: string } | null
  warnings: ProjectionWarning[]
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

/** OLS line with what the prediction interval needs; null when the data cannot define a line. */
export function fitLine(data: XY): LineFit | null {
  if (data.x.length < 3 || new Set(data.x).size < 3) return null
  const fit = olsFit(data)
  if (![fit.slope, fit.intercept, fit.sigma].every(Number.isFinite)) return null
  const r1 = autocorrelation(fit.residuals, 1)
  const ar1 = Number.isFinite(r1) ? Math.min(0.95, Math.max(0, r1)) : 0
  return { intercept: fit.intercept, slopePerYear: fit.slope, xMean: mean(data.x), sxx: fit.sxx, residualSd: fit.sigma, n: data.x.length, tCrit: studentTQuantile(0.975, data.x.length - 2), ar1 }
}

/** Line value and 95% prediction interval for a new observation in `year`, clamped to the variable's physical floor. */
export function predict(fit: LineFit, year: number, floor: number | null = null): ProjectedValue {
  const center = fit.intercept + fit.slopePerYear * year
  const inflation = Math.sqrt((1 + fit.ar1) / (1 - fit.ar1))
  const half = fit.tCrit * fit.residualSd * inflation * Math.sqrt(1 + 1 / fit.n + (year - fit.xMean) ** 2 / fit.sxx)
  const clamp = (value: number) => (floor === null ? value : Math.max(floor, value))
  return { value: clamp(center), low: clamp(center - half), high: clamp(center + half) }
}

const usableYears = (annual: AnnualPoint[] | undefined, from: number, to: number) =>
  (annual ?? []).filter((point) => point.complete && point.value !== null && point.year >= from && point.year <= to)

const toXY = (points: AnnualPoint[]): XY => ({ x: points.map((point) => point.year), y: points.map((point) => point.value as number) })

/**
 * Fits one line per cell over [startYear, endYear] (what the map draws) and validates the approach on the held-out
 * tail of the area-weighted regional series. Fits are returned even when blocked, but the interface must not draw them
 * unless `summary.status === 'ok'`.
 */
export function projectCells(cellIds: string[], annualByCell: Map<string, AnnualPoint[]>, regional: AnnualPoint[], startYear: number, endYear: number, rule: ProjectionRule) {
  const fits = new Map<string, LineFit>()
  for (const id of cellIds) {
    const all = usableYears(annualByCell.get(id), startYear, endYear)
    if (all.length >= rule.minFitYears + rule.holdoutYears) {
      const fit = fitLine(toXY(all))
      if (fit) fits.set(id, fit)
    }
  }

  // Rolling origins: the last `holdoutWindows` blocks of `holdoutYears`, each fitted on the years before it; errors pooled.
  let holdout: HoldoutValidation | null = null
  const windows: HoldoutWindow[] = []
  let n = 0
  let absModel = 0
  let sqModel = 0
  let sumModel = 0
  let absBase = 0
  let sqBase = 0
  let inside = 0
  for (let index = rule.holdoutWindows - 1; index >= 0; index -= 1) {
    const windowEnd = endYear - index * rule.holdoutYears
    const windowStart = windowEnd - rule.holdoutYears + 1
    const train = usableYears(regional, startYear, windowStart - 1)
    const test = usableYears(regional, windowStart, windowEnd)
    const trainFit = train.length >= rule.minFitYears && test.length ? fitLine(toXY(train)) : null
    if (!trainFit) continue
    const baseline = mean(train.map((point) => point.value as number))
    let windowSqModel = 0
    let windowSqBase = 0
    let windowSum = 0
    for (const point of test) {
      const observed = point.value as number
      const predicted = predict(trainFit, point.year, rule.floor)
      absModel += Math.abs(observed - predicted.value)
      sqModel += (observed - predicted.value) ** 2
      windowSqModel += (observed - predicted.value) ** 2
      sumModel += observed - predicted.value
      windowSum += observed - predicted.value
      absBase += Math.abs(observed - baseline)
      sqBase += (observed - baseline) ** 2
      windowSqBase += (observed - baseline) ** 2
      if (observed >= predicted.low && observed <= predicted.high) inside += 1
    }
    n += test.length
    windows.push({ years: [windowStart, windowEnd], points: test.length, skill: windowSqBase > 0 ? 1 - Math.sqrt(windowSqModel / windowSqBase) : 0, bias: windowSum / test.length })
  }
  if (n) {
    const rmseModel = Math.sqrt(sqModel / n)
    const rmseBaseline = Math.sqrt(sqBase / n)
    holdout = {
      scope: 'regional-series', years: [windows[0].years[0], endYear], windows, points: n, cells: cellIds.length,
      maeModel: absModel / n, rmseModel, maeBaseline: absBase / n, rmseBaseline,
      skill: rmseBaseline > 0 ? 1 - rmseModel / rmseBaseline : 0, bias: sumModel / n, coverage95: inside / n,
    }
  }

  let status: ProjectionStatus = 'ok'
  let reason: ProjectionSummary['reason'] = null
  const warnings: ProjectionWarning[] = []
  if (!holdout || !fits.size) {
    status = 'insufficient-data'
    reason = {
      es: `Se necesitan al menos ${rule.minFitYears + rule.holdoutYears} años completos en el periodo: ${rule.minFitYears} para ajustar la recta y ${rule.holdoutYears} para validarla.`,
      en: `At least ${rule.minFitYears + rule.holdoutYears} complete years are needed in the period: ${rule.minFitYears} to fit the line and ${rule.holdoutYears} to validate it.`,
    }
  } else if (holdout.windows[holdout.windows.length - 1].skill <= 0) {
    status = 'blocked-by-quality'
    const latest = holdout.windows[holdout.windows.length - 1]
    reason = {
      es: `En los años más recientes (${latest.years[0]}–${latest.years[1]}) la recta predijo peor que el promedio; extenderla desde ahí no aporta información.`,
      en: `In the most recent years (${latest.years[0]}–${latest.years[1]}) the line predicted worse than the average; extending it from there adds no information.`,
    }
  } else if (holdout.skill < rule.minSkill) {
    status = 'blocked-by-quality'
    const years = `${holdout.years[0]}–${holdout.years[1]}`
    reason = holdout.skill <= 0
      ? { es: `En los años reservados (${years}) la recta de la serie regional no predice mejor que el promedio, así que extenderla no aporta información.`, en: `On the held-out years (${years}) the regional line does not predict better than the average, so extending it adds no information.` }
      : { es: `En los años reservados (${years}) la recta mejora al promedio en solo ${Math.round(holdout.skill * 100)} % (mínimo ${Math.round(rule.minSkill * 100)} %): demasiado poco para extenderla.`, en: `On the held-out years (${years}) the line improves on the average by only ${Math.round(holdout.skill * 100)}% (minimum ${Math.round(rule.minSkill * 100)}%): too little to extend it.` }
  } else {
    const worse = holdout.windows.filter((window) => window.skill <= 0)
    if (worse.length) {
      const years = worse.map((window) => `${window.years[0]}–${window.years[1]}`).join(', ')
      warnings.push({
        code: 'unstable-skill',
        es: `La recta no siempre funciona: en ${years} predijo peor que el promedio. Su mejora depende del periodo que se mire.`,
        en: `The line does not always work: in ${years} it predicted worse than the average. Its advantage depends on the period you look at.`,
      })
    }
  }
  if (status === 'ok' && holdout && holdout.coverage95 < rule.minCoverage) {
    const above = holdout.bias > 0
    warnings.push({
      code: 'interval-undercoverage',
      es: `Solo ${Math.round(holdout.coverage95 * 100)} % de los años reservados cayó dentro del intervalo de 95 % (se esperaba al menos ${Math.round(rule.minCoverage * 100)} %): la incertidumbre real es mayor que la mostrada. Los años recientes quedaron ${above ? 'por encima' : 'por debajo'} de la recta, así que la recta ${above ? 'subestima' : 'sobrestima'} los valores recientes.`,
      en: `Only ${Math.round(holdout.coverage95 * 100)}% of the held-out years fell inside the 95% interval (at least ${Math.round(rule.minCoverage * 100)}% expected): the real uncertainty is larger than shown. Recent years ran ${above ? 'above' : 'below'} the line, so the line ${above ? 'underestimates' : 'overestimates'} recent values.`,
    })
  }

  // Is a straight line the right shape? Checked on the regional series over the whole request window.
  const fitted = usableYears(regional, startYear, endYear)
  const diagnostics = fitted.length >= 3 ? lineDiagnostics(toXY(fitted)) : null
  if (status === 'ok' && diagnostics?.curvature && diagnostics.curvature.pValue < rule.diagnosticAlpha) {
    const up = diagnostics.curvature.coefficient > 0
    const p = diagnostics.curvature.pValue < 0.001 ? '< 0.001' : `= ${diagnostics.curvature.pValue.toFixed(3)}`
    warnings.push({
      code: 'curvature',
      es: `La serie regional se curva hacia ${up ? 'arriba' : 'abajo'} (término cuadrático, p ${p}): una recta la sigue mal, y al extenderla tiende a quedar ${up ? 'por debajo' : 'por encima'} de los valores reales.`,
      en: `The regional series bends ${up ? 'upward' : 'downward'} (quadratic term, p ${p}): a straight line follows it poorly and, extended, tends to run ${up ? 'below' : 'above'} the real values.`,
    })
  }
  if (status === 'ok' && diagnostics?.variance && diagnostics.variance.pValue < rule.diagnosticAlpha && diagnostics.variance.trend > 0) {
    const p = diagnostics.variance.pValue < 0.001 ? '< 0.001' : `= ${diagnostics.variance.pValue.toFixed(3)}`
    warnings.push({
      code: 'growing-variance',
      es: `La dispersión de un año a otro crece con el tiempo (Breusch–Pagan, p ${p}): el intervalo de 95 % supone una dispersión constante y queda demasiado angosto en los años proyectados.`,
      en: `Year-to-year scatter grows over time (Breusch–Pagan, p ${p}): the 95% interval assumes constant scatter and is too narrow in the projected years.`,
    })
  }

  const horizon: [number, number] = [startYear, endYear + rule.horizonYears]
  // A straight line reaches its extremes at the ends of the slider range.
  const ends = [...fits.values()].flatMap((fit) => [predict(fit, horizon[0], rule.floor).value, predict(fit, horizon[1], rule.floor).value])
  const domain = ends.length ? { min: Math.min(...ends), max: Math.max(...ends) } : null
  const slopes = [...fits.values()].map((fit) => fit.slopePerYear)

  const summary: ProjectionSummary = {
    interpretation: 'exploratory-extrapolation', method: 'ols', status, fitYears: [startYear, endYear], horizon, holdout, diagnostics, domain,
    rising: slopes.filter((slope) => slope > 0).length, falling: slopes.filter((slope) => slope < 0).length, rule, reason, warnings,
  }
  return { summary, fits }
}
