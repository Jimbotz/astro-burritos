/** Orchestrates GET|POST /api/region: tiles from POWER, clip to polygon/bbox, per-cell trends and regional series. */
import { applyBounds, baselineMean, withAnomalies } from '../analysis/annual-rules'
import { assessSeries, finalizeFamily, optionsFromProfile, warning } from '../analysis/robust-assessment'
import { analyzeCells, containsPoint, coverageFraction, estimateCells, expandForCells, FIELD_ALPHA, geometryBBox, legendDomain, MAX_REGION_CELLS, regionalAnnual, type PolygonGeometry } from '../analysis/region'
import { projectCells } from '../analysis/projection'
import { fetchMonthlyRegional, type BBox } from '../nasa/power'
import type { VariableDescriptor } from '../variables/catalog'
import type { Area } from './areas'
import { SCHEMA_VERSION, type RegionResponse } from './v2'

export class RegionError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function validateBBox(bbox: BBox) {
  const values = [bbox.minLat, bbox.maxLat, bbox.minLon, bbox.maxLon]
  if (!values.every(Number.isFinite) || bbox.minLat < -90 || bbox.maxLat > 90 || bbox.minLon < -180 || bbox.maxLon > 180 || bbox.minLat >= bbox.maxLat || bbox.minLon >= bbox.maxLon) {
    throw new RegionError('The bounding box is invalid. Use minLat < maxLat within ±90 and minLon < maxLon within ±180.', 400)
  }
  if (bbox.maxLon - bbox.minLon > 180) throw new RegionError('Regions crossing the antimeridian are not supported.', 422)
}

/** What to analyze: a map area by id (GET), a posted polygon (POST) or a bounding box (GET). */
export type RegionSelection = { area: Area } | { geometry: PolygonGeometry } | { bbox: BBox }

export async function analyzeRegion(variable: VariableDescriptor, startYear: number, endYear: number, choice: RegionSelection, signal?: AbortSignal): Promise<RegionResponse> {
  const selection: { geometry?: PolygonGeometry; bbox?: BBox } = 'area' in choice ? { geometry: choice.area.geometry } : choice
  const bbox = selection.geometry ? geometryBBox(selection.geometry) : (selection.bbox as BBox)
  validateBBox(bbox)
  const fetchBox = selection.geometry ? expandForCells(bbox) : bbox
  const estimated = estimateCells(fetchBox)
  if (estimated > MAX_REGION_CELLS) throw new RegionError(`The region covers about ${estimated} cells; the limit is ${MAX_REGION_CELLS}. Choose a state or a smaller area.`, 413)
  const profile = variable.profile
  const parameter = variable.source.parameters[0]
  const fetchEnd = Math.max(endYear, 2020)
  const fetched = await fetchMonthlyRegional(parameter, fetchBox, 1981, fetchEnd, 4, signal)
  let removed = 0
  const selected = fetched.cells
    .map((cell) => {
      const bounded = applyBounds(cell.series, profile.nativeBounds)
      removed += bounded.removed
      return { ...cell, series: bounded.series, coverage: selection.geometry ? coverageFraction(selection.geometry, cell.lat, cell.lon) : 1 }
    })
    .filter((cell) => selection.geometry
      ? cell.coverage > 0 || containsPoint(selection.geometry, cell.lon, cell.lat)
      : cell.lat >= bbox.minLat && cell.lat <= bbox.maxLat && cell.lon >= bbox.minLon && cell.lon <= bbox.maxLon)
    .map((cell) => ({ ...cell, coverage: selection.geometry && cell.coverage === 0 ? 1 / 36 : cell.coverage }))
    .sort((a, b) => b.lat - a.lat || a.lon - b.lon)
  if (!selected.length) throw new RegionError('No MERRA-2 cell intersects the selected region.', 422)
  const { cells, annualByCell } = analyzeCells(selected, variable.aggregation, startYear, endYear, profile)
  const annualFull = regionalAnnual(cells, annualByCell, 1981, Math.max(endYear, 2020))
  const baseline = baselineMean(annualFull)
  const trend = assessSeries(annualFull, startYear, endYear, optionsFromProfile(profile, variable.trendPolicy, variable.unit, baseline))
  if (removed) trend.warnings.push(warning('out-of-bounds-removed'))
  finalizeFamily([{ id: 'regional', trend }])
  // Exploratory projection: one line per cell, validated on the held-out tail of the area-weighted regional series.
  let projection: RegionResponse['projection'] = null
  if (profile.projection) {
    const projected = projectCells(cells.map((cell) => cell.id), annualByCell, annualFull, startYear, endYear, profile.projection)
    for (const cell of cells) cell.fit = projected.fits.get(cell.id) ?? null
    projection = projected.summary
  }
  const withTrend = cells.filter((cell) => cell.slopePerDecade !== null)
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    request: {
      variable: variable.id, startYear, endYear, selection: 'area' in choice ? 'area' : selection.geometry ? 'polygon' : 'bbox', bbox,
      ...('area' in choice ? { area: { country: choice.area.country, state: choice.area.state, name: choice.area.name } } : {}),
    },
    variable: { id: variable.id, label: variable.label, unit: variable.unit, trendUnit: variable.trendUnit, trendPolicy: variable.trendPolicy, fitness: variable.fitness, profile },
    grid: { dLat: 0.5, dLon: 0.625, cellCount: cells.length, tileCount: fetched.tileCount },
    cells,
    summary: { cellsWithTrend: withTrend.length, positive: withTrend.filter((c) => (c.slopePerDecade as number) > 0).length, negative: withTrend.filter((c) => (c.slopePerDecade as number) < 0).length, significantField: cells.filter((c) => c.significantField).length, fieldAlpha: FIELD_ALPHA },
    legend: {
      mean: legendDomain(cells.map((c) => c.mean)),
      slopePerDecade: legendDomain(cells.map((c) => c.slopePerDecade)),
      slopeDisplay: legendDomain(cells.map((c) => c.slopeDisplay)),
      anomalyRecent: legendDomain(cells.map((c) => c.anomalyRecent)),
    },
    regional: {
      baseline,
      annual: withAnomalies(annualFull, profile.anomaly.kind, baseline).filter((point) => point.year >= startYear && point.year <= endYear),
      trend,
      warnings: trend.warnings,
    },
    qa: { outOfBoundsRecords: removed },
    projection,
    sources: fetched.sources,
    notes: [
      'Cells are native MERRA-2 cells (0.5° × 0.625°); draw them as squares, without smoothing or interpolation.',
      'coverage is the share of each cell inside the polygon; the regional series weights cells by coverage × cos(lat).',
      'significantField uses Benjamini–Hochberg across the cells of this response at q < 0.10.',
      'slopeDisplay is in variable.profile.displayUnit with the profile’s primary method; anomalyRecent compares the last 5 complete years with 1991–2020.',
      variable.trendPolicy === 'allowed' ? 'Trend statements are allowed for this variable when the verdict supports them.' : 'Do not color or label this variable as a trend: show means or anomalies, not increase/decrease.',
      ...(projection ? ['projection is an exploratory linear extrapolation, not a forecast: draw cells[].fit only when projection.status is "ok", always with the 95% prediction interval.'] : []),
    ],
  }
}
