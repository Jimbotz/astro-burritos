/**
 * Region (map) analysis for API v2: MERRA-2 cells clipped to a polygon or bbox, per-cell trends with
 * field-level false-discovery control, and an area-weighted regional series with the full assessment.
 */
import { adjustBenjaminiHochberg } from './multiple-testing'
import { annualFromMonthly, baselineMean, type AnnualPoint } from './annual-rules'
import { hamedRao, olsFit, senWithInterval } from './robust-stats'
import { CELL, type BBox, type RegionalCellRaw } from '../nasa/power'
import type { AggregationRule, ProcessingProfile } from '../variables/catalog'
import type { LineFit } from './projection'

export type Position = [number, number]
export type PolygonGeometry = { type: 'Polygon'; coordinates: Position[][] } | { type: 'MultiPolygon'; coordinates: Position[][][] }

export const FIELD_ALPHA = 0.1
export const MAX_REGION_CELLS = 2500
const SAMPLES_PER_AXIS = 6

export function isPolygonGeometry(value: unknown): value is PolygonGeometry {
  if (!value || typeof value !== 'object') return false
  const geometry = value as { type?: unknown; coordinates?: unknown }
  const ring = (r: unknown) => Array.isArray(r) && r.length >= 4 && r.every((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
  if (geometry.type === 'Polygon') return Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0 && geometry.coordinates.every(ring)
  if (geometry.type === 'MultiPolygon') return Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0 && geometry.coordinates.every((poly) => Array.isArray(poly) && poly.length > 0 && poly.every(ring))
  return false
}

const polygonsOf = (geometry: PolygonGeometry): Position[][][] => geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates

export function geometryBBox(geometry: PolygonGeometry): BBox {
  const points = polygonsOf(geometry).flat(2)
  const lons = points.map((p) => p[0])
  const lats = points.map((p) => p[1])
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) }
}

function inRing(lon: number, lat: number, ring: Position[]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Point-in-polygon with holes (GeoJSON: first ring outer, the rest holes). */
export function containsPoint(geometry: PolygonGeometry, lon: number, lat: number) {
  return polygonsOf(geometry).some((rings) => inRing(lon, lat, rings[0]) && !rings.slice(1).some((hole) => inRing(lon, lat, hole)))
}

export function cellBounds(lat: number, lon: number) {
  return { west: lon - CELL.dLon / 2, east: lon + CELL.dLon / 2, south: lat - CELL.dLat / 2, north: lat + CELL.dLat / 2 }
}

/** Fraction of the cell inside the polygon, estimated on a 6 × 6 sample grid. */
export function coverageFraction(geometry: PolygonGeometry, lat: number, lon: number) {
  const b = cellBounds(lat, lon)
  let inside = 0
  for (let i = 0; i < SAMPLES_PER_AXIS; i += 1) for (let j = 0; j < SAMPLES_PER_AXIS; j += 1) {
    const sLon = b.west + ((i + 0.5) / SAMPLES_PER_AXIS) * CELL.dLon
    const sLat = b.south + ((j + 0.5) / SAMPLES_PER_AXIS) * CELL.dLat
    if (containsPoint(geometry, sLon, sLat)) inside += 1
  }
  return inside / (SAMPLES_PER_AXIS * SAMPLES_PER_AXIS)
}

/** BBox expanded by half a cell so every intersecting cell centre is fetched. */
export function expandForCells(bbox: BBox): BBox {
  return { minLat: Math.max(-90, bbox.minLat - CELL.dLat / 2), maxLat: Math.min(90, bbox.maxLat + CELL.dLat / 2), minLon: Math.max(-180, bbox.minLon - CELL.dLon / 2), maxLon: Math.min(180, bbox.maxLon + CELL.dLon / 2) }
}

/** Number of MERRA-2 cell centres inside a bbox (used to refuse oversized regions before fetching). */
export function estimateCells(bbox: BBox) {
  const rows = Math.floor(bbox.maxLat / CELL.dLat) - Math.ceil(bbox.minLat / CELL.dLat) + 1
  const cols = Math.floor(bbox.maxLon / CELL.dLon) - Math.ceil(bbox.minLon / CELL.dLon) + 1
  return Math.max(0, rows) * Math.max(0, cols)
}

export type CellResult = {
  id: string
  lat: number
  lon: number
  bounds: { west: number; south: number; east: number; north: number }
  elevationM: number | null
  /** Share of the cell inside the requested polygon (1 for bbox requests). */
  coverage: number
  nYears: number
  mean: number | null
  /** 1991–2020 mean of the cell (used for relative scales and anomalies). */
  baseline: number | null
  slopePerDecade: number | null
  senPerDecade: number | null
  /** Primary-method slope in the profile scale and unit (what the trend layer should color). */
  slopeDisplay: number | null
  /** Mean of the last 5 complete years of the window minus the 1991–2020 mean (absolute or %, per profile). */
  anomalyRecent: number | null
  recentYears: [number, number] | null
  pValueHamedRao: number | null
  /** Benjamini–Hochberg q across the cells of this response. */
  qValueField: number | null
  /** True when qValueField < 0.10 (field-level false discovery rate). */
  significantField: boolean
  /** OLS line of the exploratory projection (only for variables with a projection rule; draw it only when the region projection status is 'ok'). */
  fit?: LineFit | null
}

export type RegionCellsAnalysis = {
  cells: CellResult[]
  annualByCell: Map<string, AnnualPoint[]>
}

export const RECENT_YEARS = 5

/** Per-cell statistics on the requested window; annual series are built from fullStartYear so baselines and sensitivity exist. */
export function analyzeCells(raw: Array<RegionalCellRaw & { coverage: number }>, rule: AggregationRule, startYear: number, endYear: number, profile: ProcessingProfile, fullStartYear = 1981): RegionCellsAnalysis {
  const annualByCell = new Map<string, AnnualPoint[]>()
  const relative = profile.trendScale === 'relative-percent'
  const cells: CellResult[] = raw.map((cell) => {
    const annual = annualFromMonthly(rule, cell.series, Math.min(fullStartYear, startYear), endYear)
    annualByCell.set(cell.id, annual)
    const baseline = baselineMean(annual)
    const usable = annual.filter((point) => point.complete && point.value !== null && point.year >= startYear && point.year <= endYear)
    const data = { x: usable.map((point) => point.year), y: usable.map((point) => point.value as number) }
    const enough = data.x.length >= 10 && new Set(data.y).size >= 3
    const ols = enough ? olsFit(data).slope * 10 : null
    const sen = enough ? senWithInterval(data).slope * 10 : null
    const primary = profile.primaryMethod === 'sen-mann-kendall' ? sen : ols
    const slopeDisplay = primary === null ? null : relative ? (baseline !== null && baseline > 0 ? (primary * 100) / baseline : null) : primary
    const recent = usable.slice(-RECENT_YEARS)
    const recentMean = recent.length === RECENT_YEARS ? recent.reduce((sum, point) => sum + (point.value as number), 0) / RECENT_YEARS : null
    const anomalyRecent = recentMean === null || baseline === null ? null : profile.anomaly.kind === 'percent' ? (baseline > 0 ? ((recentMean - baseline) / baseline) * 100 : null) : recentMean - baseline
    return {
      id: cell.id, lat: cell.lat, lon: cell.lon, bounds: cellBounds(cell.lat, cell.lon), elevationM: cell.elevationM, coverage: cell.coverage,
      nYears: data.x.length, mean: data.y.length ? data.y.reduce((sum, value) => sum + value, 0) / data.y.length : null, baseline,
      slopePerDecade: ols, senPerDecade: sen, slopeDisplay, anomalyRecent,
      recentYears: recent.length === RECENT_YEARS ? [recent[0].year, recent[RECENT_YEARS - 1].year] : null,
      pValueHamedRao: enough ? hamedRao(data).pValue : null, qValueField: null, significantField: false,
    }
  })
  const adjusted = new Map(adjustBenjaminiHochberg(cells.map((cell) => ({ id: cell.id, pValue: cell.pValueHamedRao })), FIELD_ALPHA).map((item) => [item.id, item.qValue]))
  for (const cell of cells) {
    cell.qValueField = adjusted.get(cell.id) ?? null
    cell.significantField = cell.qValueField !== null && cell.qValueField < FIELD_ALPHA
  }
  return { cells, annualByCell }
}

/** Area-weighted regional series (weight = coverage × cos(lat)); a year counts only if every weighted cell is complete. */
export function regionalAnnual(cells: CellResult[], annualByCell: Map<string, AnnualPoint[]>, startYear: number, endYear: number): AnnualPoint[] {
  const weighted = cells.filter((cell) => cell.coverage > 0 && annualByCell.has(cell.id))
  const out: AnnualPoint[] = []
  for (let year = startYear; year <= endYear; year += 1) {
    let sum = 0
    let weights = 0
    let complete = weighted.length > 0
    for (const cell of weighted) {
      const point = annualByCell.get(cell.id)?.find((item) => item.year === year)
      if (!point || !point.complete || point.value === null) { complete = false; break }
      const w = cell.coverage * Math.cos((cell.lat * Math.PI) / 180)
      sum += w * point.value
      weights += w
    }
    out.push({ year, value: complete && weights > 0 ? sum / weights : null, validCount: complete ? weighted.length : 0, expectedCount: weighted.length, complete: complete && weights > 0 })
  }
  return out
}

export function legendDomain(values: Array<number | null>) {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b)
  if (!finite.length) return null
  const absolute = finite.map(Math.abs).sort((a, b) => a - b)
  const p95 = absolute[Math.min(absolute.length - 1, Math.floor(0.95 * (absolute.length - 1)))]
  return { min: finite[0], max: finite[finite.length - 1], symmetricMaxAbs: p95 }
}

export function cellsToGeoJSON(cells: CellResult[], properties: Record<string, unknown> = {}) {
  return {
    type: 'FeatureCollection' as const,
    properties,
    features: cells.map((cell) => ({
      type: 'Feature' as const,
      id: cell.id,
      geometry: { type: 'Polygon' as const, coordinates: [[[cell.bounds.west, cell.bounds.south], [cell.bounds.east, cell.bounds.south], [cell.bounds.east, cell.bounds.north], [cell.bounds.west, cell.bounds.north], [cell.bounds.west, cell.bounds.south]]] },
      properties: { ...cell, bounds: undefined },
    })),
  }
}
