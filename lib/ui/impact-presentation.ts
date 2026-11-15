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
 * Colour family of an indicator card, one per theme: water (rain, water balance, observed drought), heat (temperature
 * indices), moisture (root-zone wetness and ET0, the air's demand for moisture) and population (exposure). The colour
 * names the theme only and never a trend direction; an id the catalog does not know stays neutral.
 */
export type CardPalette = 'water' | 'heat' | 'moisture' | 'population' | 'neutral'

const PALETTE: Record<string, CardPalette> = {
  precipitation: 'water', 'precipitation-wet': 'water', balance: 'water', 'balance-wet': 'water', 'observed-drought': 'water',
  et0: 'moisture', 'et0-wet': 'moisture', 'root-zone-wetness': 'moisture',
  TX90p: 'heat', TN90p: 'heat', TXx: 'heat', TNn: 'heat', TX: 'heat', TN: 'heat', T2M: 'heat',
  'population-exposure': 'population',
}

export const cardPalette = (indicator: Pick<ImpactIndicator, 'id'>): CardPalette => PALETTE[indicator.id] ?? 'neutral'
