/**
 * Presentation of impact-lens fields: number formatting by unit, trend and interval text, period and quality lines.
 * Pure formatting of what the backend returns; no statistics are recomputed here.
 */
import type { ImpactIndicator, ImpactLens, ImpactResponse } from '@/lib/api/impact-types'
import { formatNumber, formatPValue, formatSigned, unitEn } from './format'

export const LENS_NAME: Record<ImpactLens, { title: string; subtitle: string; sources: string }> = {
  water: { title: 'Water Signal', subtitle: 'Municipal water management', sources: 'NASA POWER + CONAGUA/SMN' },
  heat: { title: 'Heat Signal', subtitle: 'Heat exposure', sources: 'NASA POWER + INEGI' },
}

/** Decimals that keep each impact unit readable. */
export function impactDigits(unit: string) {
  const text = unitEn(unit)
  if (text === 'people' || text === 'years' || text.startsWith('mm')) return 0
  if (text.startsWith('fraction')) return 2
  if (text.startsWith('%')) return 1
  return 2
}

export function formatImpactValue(indicator: Pick<ImpactIndicator, 'value' | 'unit'>) {
  if (indicator.value === null) return '—'
  if (indicator.unit === 'people') return Math.round(indicator.value).toLocaleString('en-US')
  return formatNumber(indicator.value, impactDigits(indicator.unit))
}

export function trendText(indicator: ImpactIndicator) {
  const trend = indicator.trend
  if (!trend) return null
  const unit = unitEn(trend.unit)
  const digits = impactDigits(unit)
  return {
    rate: `${formatSigned(trend.slopePerDecade, digits)} ${unit}`,
    interval: trend.confidenceInterval95 ? `95% CI ${formatSigned(trend.confidenceInterval95[0], digits)} to ${formatSigned(trend.confidenceInterval95[1], digits)}` : '95% CI not estimable',
    test: `Mann–Kendall (Hamed–Rao) p = ${formatPValue(trend.pValue)}${trend.adjustedPValue !== null ? ` · q = ${formatPValue(trend.adjustedPValue)}` : ''} · ${trend.mannKendallSignificant ? 'significant' : 'not significant'}`,
    verdict: trend.status === 'blocked' ? 'Blocked by data quality' : trend.status === 'robust' ? 'Robust trend' : trend.status === 'probable' ? 'Probable trend' : trend.status === 'weak' ? 'Weak signal' : 'No detectable trend',
    claim: trend.claimAllowed ? null : 'Shown without an increase/decrease claim',
  }
}

export const periodText = (period: { startYear: number; endYear: number }) => (period.startYear === period.endYear ? String(period.startYear) : `${period.startYear}–${period.endYear}`)

export function qualityText(indicator: ImpactIndicator) {
  const q = indicator.quality
  const base = `${q.validRecords} of ${q.expectedRecords} complete ${indicator.trend ? 'years' : 'records'} (${Math.round(q.completeness * 100)}%)`
  return q.outOfBoundsCount ? `${base} · ${q.outOfBoundsCount.toLocaleString('en-US')} flagged values left out` : base
}

/** "NASA POWER + CONAGUA/SMN" style line from the sources the response used. */
export function sourceLine(response: ImpactResponse) {
  return LENS_NAME[response.lens].sources
}

export const yesNo = (value: boolean | null) => (value === null ? 'not evaluable' : value ? 'active' : 'inactive')
