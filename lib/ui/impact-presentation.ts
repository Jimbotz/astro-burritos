/**
 * Presentation of impact-lens fields: number formatting by unit, period text and the colour family of each card.
 * Pure formatting of what the backend returns; no statistics are recomputed here.
 */
import type { ImpactIndicator, ImpactLens, ImpactResponse } from '@/lib/api/impact-types'
import { formatNumber, unitEn } from './format'

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

export const periodText = (period: { startYear: number; endYear: number }) => (period.startYear === period.endYear ? String(period.startYear) : `${period.startYear}–${period.endYear}`)

/** "NASA POWER + CONAGUA/SMN" style line from the sources the response used. */
export function sourceLine(response: ImpactResponse) {
  return LENS_NAME[response.lens].sources
}

/**
 * Colour family of an indicator card: warm (orange) for warm days and nights, mean maximum and mean temperature, blue
 * when such an index is falling or the indicator is a low temperature (mean minimum), red for the hottest day, blue for
 * the coldest night, green for the exposed population; the water-lens cards stay neutral.
 */
export type CardPalette = 'warm' | 'cool' | 'hot' | 'cold' | 'green' | 'neutral'

export function cardPalette(indicator: Pick<ImpactIndicator, 'id' | 'trend'>): CardPalette {
  switch (indicator.id) {
    case 'TX90p':
    case 'TN90p':
      return indicator.trend?.direction === 'decreasing' ? 'cool' : 'warm'
    case 'TX':
    case 'T2M':
      return 'warm'
    case 'TN':
      return 'cool'
    case 'TXx':
      return 'hot'
    case 'TNn':
      return 'cold'
    case 'population-exposure':
      return 'green'
    default:
      return 'neutral'
  }
}
