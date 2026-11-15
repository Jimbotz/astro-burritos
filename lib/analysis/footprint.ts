/**
 * Puts a fine grid on the support of a coarse one: IMERG pixels (0.1°) averaged over one MERRA-2 cell
 * (0.5° × 0.625°), so the two rain records compared in GET /api/crosscheck describe the same area.
 *
 * - Each pixel weighs the area it shares with the cell (overlap in latitude × overlap in longitude × cos(latitude)).
 *   Edge pixels count only for their part inside the cell.
 * - A month counts only when every overlapping pixel has a value. Nothing is imputed.
 */
import type { SeriesMap } from './annual-rules'

export type CellBounds = { west: number; south: number; east: number; north: number }
export type GridPixel = { lat: number; lon: number; series: SeriesMap }

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
// Below this, an overlap is floating-point noise from a shared edge, not area.
const EPSILON = 1e-9

/** Area weight of each pixel inside the cell (0 when it does not overlap) and the share of the cell the pixels cover. */
export function overlapWeights(pixels: Array<{ lat: number; lon: number }>, cell: CellBounds, pixelDegrees: number) {
  const half = pixelDegrees / 2
  let covered = 0
  const weights = pixels.map((pixel) => {
    const dLat = overlap(pixel.lat - half, pixel.lat + half, cell.south, cell.north)
    const dLon = overlap(pixel.lon - half, pixel.lon + half, cell.west, cell.east)
    if (dLat < EPSILON || dLon < EPSILON) return 0
    covered += dLat * dLon
    return dLat * dLon * Math.cos((pixel.lat * Math.PI) / 180)
  })
  return { weights, coveredFraction: covered / ((cell.north - cell.south) * (cell.east - cell.west)) }
}

/** Area-weighted monthly mean of the pixels over the cell. */
export function cellMean(pixels: GridPixel[], cell: CellBounds, pixelDegrees: number) {
  const { weights, coveredFraction } = overlapWeights(pixels, cell, pixelDegrees)
  const inside = pixels.map((pixel, index) => ({ pixel, weight: weights[index] })).filter((item) => item.weight > 0)
  const months = new Set(inside.flatMap((item) => [...item.pixel.series.keys()]))
  const series: SeriesMap = new Map()
  for (const month of [...months].sort()) {
    let sum = 0
    let total = 0
    let complete = true
    for (const { pixel, weight } of inside) {
      const value = pixel.series.get(month)
      if (value === undefined) { complete = false; break }
      sum += value * weight
      total += weight
    }
    if (complete && total > 0) series.set(month, sum / total)
  }
  return { series, pixelCount: inside.length, coveredFraction }
}
