import type { RobustTrend, VariableResult, Verdict } from '@/lib/api/v2'
import type { AggregationRule } from '@/lib/variables/catalog'

// Display helpers for the API v2 panels. The interface is in English with a real minus sign (U+2212);
// the API keeps some unit labels in Spanish, so they are translated here in one place.

const MINUS = '−'

export function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const text = Math.abs(value).toFixed(digits)
  return value < 0 && Number(text) !== 0 ? `${MINUS}${text}` : text
}

export function formatSigned(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const text = Math.abs(value).toFixed(digits)
  if (Number(text) === 0) return `±${text}`
  return `${value > 0 ? '+' : MINUS}${text}`
}

export function formatPValue(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value < 0.0001 ? '<0.0001' : value.toFixed(4)
}

const UNIT_EN: Array<[RegExp, string]> = [
  [/década/g, 'decade'],
  [/fracción 0–1/g, 'fraction 0–1'],
  [/fracción/g, 'fraction'],
  [/% de días/g, '% of days'],
  [/puntos %/g, 'pp'],
]

export function unitEn(unit: string) {
  return UNIT_EN.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), unit)
}

/** Decimals that keep each unit readable: percentages and pp in tenths, mm in units, soil fraction in thousandths. */
export function digitsForUnit(unit: string) {
  const text = unitEn(unit)
  if (/^(%|pp)/.test(text)) return 1
  if (text.startsWith('fraction')) return 3
  if (text.startsWith('mm')) return 0
  return 2
}

/** NASA POWER reports coverage as YYYYMMDD; show it as YYYY-MM-DD. Anything else passes through. */
export function formatPowerDate(value: string | null | undefined) {
  if (!value) return '—'
  return /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}` : value
}

/** How the annual value is built from the native records, as a short label (e.g. "°C annual maximum"). */
export const AGGREGATION_LABEL: Record<AggregationRule, string> = {
  'day-weighted-mean': 'annual mean',
  sum: 'annual total',
  'wet-season-sum': 'wet-season total',
  'annual-max': 'annual maximum',
  'annual-min': 'annual minimum',
  'daily-mean': 'annual mean of daily values',
  'percent-days-above-p90': 'share of days above the 90th percentile',
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  robust: 'Robust trend',
  probable: 'Probable trend',
  weak: 'Weak signal',
  'not-detectable': 'No detectable trend',
  'insufficient-data': 'Insufficient data',
}

/** Direction worth stating: only when the variable allows claims and the verdict is robust or probable. */
export function trendDirection(trend: RobustTrend): 'up' | 'down' | null {
  if (!trend.claimAllowed || (trend.verdict !== 'robust' && trend.verdict !== 'probable')) return null
  const slope = trend.display.slope
  if (slope === null || slope === 0) return null
  return slope > 0 ? 'up' : 'down'
}

const FITNESS_ORDER = { core: 0, 'thermal-extreme': 1, support: 2 } as const

/** Statable signals first (robust, then probable), headline variables before extremes and support, larger relative change first. */
export function rankSignals(results: VariableResult[]) {
  const verdictOrder = (verdict: Verdict) => (verdict === 'robust' ? 0 : verdict === 'probable' ? 1 : 2)
  const relativeSize = (result: VariableResult) => Math.abs(result.trend.display.slope ?? 0) / (result.profile.relevanceThreshold || 1)
  return results
    .filter((result) => trendDirection(result.trend) !== null)
    .sort((a, b) => verdictOrder(a.trend.verdict) - verdictOrder(b.trend.verdict) || FITNESS_ORDER[a.fitness] - FITNESS_ORDER[b.fitness] || relativeSize(b) - relativeSize(a))
}

export const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
