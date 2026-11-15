/**
 * What the step 3 projection shows for each cell, kept out of the components so it can be tested.
 * Two modes: the line's value in the chosen year, or its change since the last data year (the line itself in that
 * year, not the observed value, so the map shows the trend and not one year's weather).
 */
import { predict, type ProjectedValue } from '../analysis/projection'
import type { CellResult, RegionResponse } from '../api/v2'

export type ProjectionMode = 'value' | 'change'

export type CellProjection = { at: ProjectedValue; change: number; shown: number }

/** The cell's line in `year`, its change since the last data year, and the number the map colors in `mode`. */
export function cellProjection(cell: CellResult, data: RegionResponse, year: number, mode: ProjectionMode): CellProjection | null {
  const summary = data.projection
  if (!summary || !cell.fit) return null
  const floor = summary.rule.floor
  const at = predict(cell.fit, year, floor)
  const change = at.value - predict(cell.fit, summary.fitYears[1], floor).value
  return { at, change, shown: mode === 'change' ? change : at.value }
}

/** Largest |change since the last data year| over every cell and the whole slider range (a line peaks at the ends). */
export function changeMaxAbs(data: RegionResponse) {
  const summary = data.projection
  if (!summary) return null
  const changes = data.cells.flatMap((cell) => summary.horizon.map((year) => cellProjection(cell, data, year, 'change')?.change ?? 0))
  const max = Math.max(0, ...changes.map(Math.abs))
  return max > 0 ? max : null
}

/** Plain mean of the cells in one year (a quick read of the slider, not the area-weighted regional series). */
export function cellMean(data: RegionResponse, year: number, mode: ProjectionMode = 'value') {
  const values = data.cells.map((cell) => cellProjection(cell, data, year, mode)?.shown).filter((value): value is number => value !== undefined)
  return values.length ? { value: values.reduce((sum, value) => sum + value, 0) / values.length, count: values.length } : null
}

/**
 * Lines that rise or fall, and how many of them belong to cells whose trend is significant across the field
 * (Benjamini–Hochberg q < 0.10). The others are hatched on the map: their direction is not told apart from noise.
 */
export function directionCounts(data: RegionResponse) {
  const fitted = data.cells.filter((cell) => cell.fit)
  const rising = fitted.filter((cell) => cell.fit!.slopePerYear > 0)
  const falling = fitted.filter((cell) => cell.fit!.slopePerYear < 0)
  return {
    rising: rising.length, risingSignificant: rising.filter((cell) => cell.significantField).length,
    falling: falling.length, fallingSignificant: falling.filter((cell) => cell.significantField).length,
    uncertain: fitted.filter((cell) => !cell.significantField).length,
  }
}

/** "−4 %" style skill label: share of the average's error the line removes in one validation window. */
export const skillLabel = (skill: number) => `${skill >= 0 ? '+' : '−'}${Math.round(Math.abs(skill) * 100)}%`
