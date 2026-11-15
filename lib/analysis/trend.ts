import type { AnnualObservation, NasaObservation, TrendResult } from '@/lib/nasa/types'
import { calculateLag1ResidualAutocorrelation, calculateMannKendall, calculateSenSlope } from './robust-trend'

const EPSILON = 1e-12

function logGamma(value: number): number {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7,
  ]

  if (value < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value)
  let x = 0.9999999999998099
  const shifted = value - 1
  for (let index = 0; index < coefficients.length; index += 1) x += coefficients[index] / (shifted + index + 1)
  const t = shifted + coefficients.length - 0.5
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(x)
}

function betaContinuedFraction(a: number, b: number, x: number) {
  const maxIterations = 200
  const tiny = 1e-30
  let c = 1
  let d = 1 - ((a + b) * x) / (a + 1)
  if (Math.abs(d) < tiny) d = tiny
  d = 1 / d
  let h = d

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const even = iteration * (b - iteration) * x / ((a - 1 + 2 * iteration) * (a + 2 * iteration))
    d = 1 + even * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + even / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    h *= d * c

    const odd = -(a + iteration) * (a + b + iteration) * x / ((a + 2 * iteration) * (a + 1 + 2 * iteration))
    d = 1 + odd * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + odd / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < 3e-7) break
  }

  return h
}

function regularizedBeta(x: number, a: number, b: number) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b
}

function studentTCdf(value: number, degreesOfFreedom: number) {
  if (value === 0) return 0.5
  const x = degreesOfFreedom / (degreesOfFreedom + value * value)
  const incompleteBeta = regularizedBeta(x, degreesOfFreedom / 2, 0.5)
  return value > 0 ? 1 - incompleteBeta / 2 : incompleteBeta / 2
}

export function studentTQuantile(probability: number, degreesOfFreedom: number) {
  let low = 0
  let high = 1
  while (studentTCdf(high, degreesOfFreedom) < probability && high < 1e6) high *= 2
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const middle = (low + high) / 2
    if (studentTCdf(middle, degreesOfFreedom) < probability) low = middle
    else high = middle
  }
  return (low + high) / 2
}

export function aggregateAnnual(observations: NasaObservation[], parameter: 'T2M' | 'PRECTOTCORR'): AnnualObservation[] {
  const groups = new Map<number, NasaObservation[]>()
  for (const observation of observations) {
    const year = Number(observation.date.slice(0, 4))
    const group = groups.get(year) ?? []
    group.push(observation)
    groups.set(year, group)
  }

  return [...groups.entries()].sort(([first], [second]) => first - second).map(([year, values]) => {
    const expectedObservationCount = 12
    const totalDays = values.reduce((sum, observation) => sum + observation.daysInMonth, 0)
    const value = parameter === 'PRECTOTCORR'
      ? values.reduce((sum, observation) => sum + observation.value * observation.daysInMonth, 0)
      : values.reduce((sum, observation) => sum + observation.value * observation.daysInMonth, 0) / totalDays
    return {
      year,
      value,
      unit: parameter === 'PRECTOTCORR' ? 'mm/year' : '°C',
      validObservationCount: values.length,
      expectedObservationCount,
      completeness: values.length / expectedObservationCount,
    }
  })
}

export function calculateTrend(annual: AnnualObservation[]): TrendResult {
  const completeYears = annual.filter((observation) => observation.completeness >= 0.9 && Number.isFinite(observation.value))
  const warnings: string[] = []
  const unavailableAutocorrelation = calculateLag1ResidualAutocorrelation([])
  if (completeYears.length !== annual.length) warnings.push('Years with less than 90% monthly coverage were excluded from the trend.')
  const completeness = completeYears.length ? Math.min(...completeYears.map((observation) => observation.completeness)) : null
  if (completeYears.length < 3) {
    warnings.push('At least three sufficiently complete years are required for a trend estimate.')
    return { nYears: completeYears.length, slopePerYear: null, senSlopePerYear: null, intercept: null, pValue: null, mannKendall: null, confidenceInterval95: null, rSquared: null, significantAt05: null, method: 'Ordinary least squares on annual aggregates', warnings, completeness, autocorrelation: unavailableAutocorrelation }
  }

  const x = completeYears.map((observation) => observation.year)
  const y = completeYears.map((observation) => observation.value)
  const xMean = x.reduce((sum, value) => sum + value, 0) / x.length
  const yMean = y.reduce((sum, value) => sum + value, 0) / y.length
  const sxx = x.reduce((sum, value) => sum + (value - xMean) ** 2, 0)
  const sxy = x.reduce((sum, value, index) => sum + (value - xMean) * (y[index] - yMean), 0)
  if (sxx <= EPSILON) {
    warnings.push('The selected years do not provide enough variation for a slope estimate.')
    return { nYears: completeYears.length, slopePerYear: null, senSlopePerYear: calculateSenSlope(completeYears), intercept: null, pValue: null, mannKendall: calculateMannKendall(completeYears), confidenceInterval95: null, rSquared: null, significantAt05: null, method: 'Ordinary least squares on annual aggregates', warnings, completeness, autocorrelation: unavailableAutocorrelation }
  }

  const slope = sxy / sxx
  const intercept = yMean - slope * xMean
  const predicted = x.map((value) => intercept + slope * value)
  const residualSumOfSquares = y.reduce((sum, value, index) => sum + (value - predicted[index]) ** 2, 0)
  const totalSumOfSquares = y.reduce((sum, value) => sum + (value - yMean) ** 2, 0)
  const rSquared = totalSumOfSquares <= EPSILON ? null : 1 - residualSumOfSquares / totalSumOfSquares
  const degreesOfFreedom = completeYears.length - 2

  if (residualSumOfSquares <= EPSILON) {
    warnings.push('The residual variance is zero; p-value and confidence interval are not defined.')
    return { nYears: completeYears.length, slopePerYear: slope, senSlopePerYear: calculateSenSlope(completeYears), intercept, pValue: null, mannKendall: calculateMannKendall(completeYears), confidenceInterval95: null, rSquared, significantAt05: null, method: 'Ordinary least squares on annual aggregates', warnings, completeness, autocorrelation: calculateLag1ResidualAutocorrelation(y.map((value, index) => value - predicted[index])) }
  }

  const residualVariance = residualSumOfSquares / degreesOfFreedom
  const slopeStandardError = Math.sqrt(residualVariance / sxx)
  const tStatistic = slope / slopeStandardError
  const pValue = Math.min(1, Math.max(0, 2 * (1 - studentTCdf(Math.abs(tStatistic), degreesOfFreedom))))
  const criticalValue = studentTQuantile(0.975, degreesOfFreedom)
  const confidenceInterval95: [number, number] = [slope - criticalValue * slopeStandardError, slope + criticalValue * slopeStandardError]
  const autocorrelation = calculateLag1ResidualAutocorrelation(y.map((value, index) => value - predicted[index]))
  warnings.push(...autocorrelation.warnings)
  return { nYears: completeYears.length, slopePerYear: slope, senSlopePerYear: calculateSenSlope(completeYears), intercept, pValue, mannKendall: calculateMannKendall(completeYears), confidenceInterval95, rSquared, significantAt05: pValue < 0.05, method: 'Ordinary least squares on annual aggregates; classical errors assume independent residuals', warnings, completeness, autocorrelation }
}
