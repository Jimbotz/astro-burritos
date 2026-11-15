'use client'

import { Layers, LoaderCircle } from 'lucide-react'
import type { CellResult, RegionResponse, VariableDescriptor, VariableId } from '@/lib/api/v2'
import { VARIABLES } from '@/lib/variables/catalog'
import { Term } from '@/components/term'
import { SeriesChart } from '@/components/series-chart'
import { VerdictBadge } from '@/components/verdict-badge'
import { changeFill, changeLegend, divergingFill, divergingLegend, projectionFill, projectionLegend, sequentialFill, sequentialLegend, type LegendBin } from '@/lib/ui/color-scale'
import { cellProjection, changeMaxAbs, type ProjectionMode } from '@/lib/ui/projection-view'
import { digitsForUnit, formatNumber, formatPValue, formatSigned, unitEn } from '@/lib/ui/format'

export type LayerKind = 'anomaly' | 'trend' | 'mean'

export const MAP_VARIABLES = VARIABLES.filter((variable) => variable.availability.region)
export const isMapVariable = (id: VariableId) => MAP_VARIABLES.some((variable) => variable.id === id)

const KINDS: Array<{ id: LayerKind; label: string; hint: string }> = [
  { id: 'anomaly', label: 'Recent anomaly', hint: 'Last 5 complete years vs 1991–2020' },
  { id: 'trend', label: 'Trend', hint: 'Change per decade in the selected period' },
  { id: 'mean', label: 'Average', hint: 'Mean of the selected period' },
]

/** Trend coloring is not allowed for variables without trend claims (precipitation): fall back to the anomaly layer. */
export function effectiveKind(kind: LayerKind, trendPolicy?: VariableDescriptor['trendPolicy']) {
  return kind === 'trend' && trendPolicy !== 'allowed' ? 'anomaly' : kind
}

function layerSpec(data: RegionResponse, kind: LayerKind) {
  const profile = data.variable.profile
  if (kind === 'trend') return { value: (cell: CellResult) => cell.slopeDisplay, domain: data.legend.slopeDisplay, unit: unitEn(profile.displayUnit), diverging: true }
  if (kind === 'anomaly') return { value: (cell: CellResult) => cell.anomalyRecent, domain: data.legend.anomalyRecent, unit: unitEn(profile.anomaly.unit), diverging: true }
  return { value: (cell: CellResult) => cell.mean, domain: data.legend.mean, unit: unitEn(data.variable.unit), diverging: false }
}

const roleOf = (data: RegionResponse) => VARIABLES.find((variable) => variable.id === data.variable.id)?.colorRole ?? 'temperature'
const decimalsOf = (data: RegionResponse) => VARIABLES.find((variable) => variable.id === data.variable.id)?.decimals ?? 2

/** True when the response carries a validated projection that may be drawn (status 'ok' and a color domain). */
export const canProject = (data?: RegionResponse) => data?.projection?.status === 'ok' && data.projection.domain !== null

// Cells inside the 2D map SVG (the caller clips them to the selected boundary). Native squares, no smoothing.
// With `projectionYear`, each cell shows its own OLS line evaluated at that year (light = lower, dark = higher), or in
// 'change' mode the line's change since the last data year (diverging, white at 0). `hatchId` is an SVG pattern drawn
// over cells whose trend is not significant across the field.
export function MapCells({ data, kind, project, projectionYear = null, projectionMode = 'value', hatchId }: { data: RegionResponse; kind: LayerKind; project: (lon: number, lat: number) => [number, number]; projectionYear?: number | null; projectionMode?: ProjectionMode; hatchId?: string }) {
  if (projectionYear !== null && canProject(data)) return <ProjectionCells data={data} year={projectionYear} mode={projectionMode} project={project} hatchId={hatchId} />
  const spec = layerSpec(data, kind)
  const role = roleOf(data)
  const digits = digitsForUnit(spec.unit)
  // Significant cells last, so their thicker edge is not half-covered by a neighbour drawn after them.
  const ordered = kind === 'trend' ? [...data.cells].sort((a, b) => Number(a.significantField) - Number(b.significantField)) : data.cells
  return <g className="map-cells">
    {ordered.map((cell) => {
      const value = spec.value(cell)
      const [x0, y0] = project(cell.bounds.west, cell.bounds.north)
      const [x1, y1] = project(cell.bounds.east, cell.bounds.south)
      const fill = value === null || !spec.domain ? 'none' : spec.diverging ? divergingFill(value, spec.domain.symmetricMaxAbs, role) : sequentialFill(value, spec.domain.min, spec.domain.max, role)
      const outlined = kind === 'trend' && cell.significantField
      const valueText = value === null ? 'no data' : `${kind === 'mean' ? formatNumber(value, digits) : formatSigned(value, digits)} ${spec.unit}`
      const details = [
        `${formatNumber(cell.lat, 1)}°, ${formatNumber(cell.lon, 3)}°`,
        valueText,
        cell.elevationM !== null ? `${Math.round(cell.elevationM)} m` : null,
        `${Math.round(cell.coverage * 100)}% inside`,
        kind === 'trend' ? `q ${formatPValue(cell.qValueField)}` : null,
      ].filter(Boolean).join(' • ')
      return <rect key={cell.id} x={Math.min(x0, x1)} y={Math.min(y0, y1)} width={Math.abs(x1 - x0)} height={Math.abs(y1 - y0)} className={`map-cell ${outlined ? 'is-significant' : ''} ${value === null ? 'is-empty' : ''}`} style={{ fill }}>
        <title>{details}</title>
      </rect>
    })}
  </g>
}

function ProjectionCells({ data, year, mode, project, hatchId }: { data: RegionResponse; year: number; mode: ProjectionMode; project: (lon: number, lat: number) => [number, number]; hatchId?: string }) {
  const summary = data.projection!
  const domain = summary.domain!
  const role = roleOf(data)
  const digits = decimalsOf(data)
  const unit = unitEn(data.variable.unit)
  const lastYear = summary.fitYears[1]
  const maxAbs = changeMaxAbs(data) ?? 1
  const phase = year > lastYear ? `${year}, extrapolated ${year - lastYear} yr past the data` : `${year}, fitted line`
  const boxes = data.cells.map((cell) => {
    const [x0, y0] = project(cell.bounds.west, cell.bounds.north)
    const [x1, y1] = project(cell.bounds.east, cell.bounds.south)
    return { cell, box: { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) }, line: cellProjection(cell, data, year, mode) }
  })
  return <g className="map-cells">
    {boxes.map(({ cell, box, line }) => {
      const details = [
        `${formatNumber(cell.lat, 1)}°, ${formatNumber(cell.lon, 3)}°`,
        line ? `${phase}: ${formatNumber(line.at.value, digits)} ${unit} (95% prediction interval ${formatNumber(line.at.low, digits)} to ${formatNumber(line.at.high, digits)})` : 'no line: too few complete years',
        line && year !== lastYear ? `${formatSigned(line.change, digits)} ${unit} vs the line in ${lastYear}` : null,
        line ? (cell.significantField ? `trend significant across the field (q ${formatPValue(cell.qValueField)})` : `hatched: trend not significant (q ${formatPValue(cell.qValueField)})`) : null,
        `${Math.round(cell.coverage * 100)}% inside`,
      ].filter(Boolean).join(' • ')
      const fill = !line ? 'none' : mode === 'change' ? changeFill(line.change, maxAbs, role) : projectionFill(line.at.value, domain.min, domain.max, role)
      return <rect key={cell.id} {...box} className={`map-cell ${line ? '' : 'is-empty'}`} style={{ fill }}>
        <title>{details}</title>
      </rect>
    })}
    {hatchId && boxes.filter(({ cell, line }) => line && !cell.significantField).map(({ cell, box }) => <rect key={`hatch-${cell.id}`} {...box} className="map-hatch" fill={`url(#${hatchId})`} aria-hidden="true" />)}
  </g>
}

type LegendSpec = { title: string; bins: LegendBin[]; unit: string; digits: number; diverging: boolean; continuous: boolean; note: string; hatch?: boolean }

function legendSpec(data: RegionResponse | undefined, kind: LayerKind, projectionYear: number | null, projectionMode: ProjectionMode): LegendSpec | null {
  if (!data) return null
  const role = roleOf(data)
  if (projectionYear !== null && canProject(data)) {
    const { domain, fitYears } = data.projection!
    const phase = projectionYear > fitYears[1] ? 'Extrapolated' : 'Fitted line'
    if (projectionMode === 'change') return { title: `Change since ${fitYears[1]} · ${projectionYear}`, bins: changeLegend(changeMaxAbs(data) ?? 1, role), unit: unitEn(data.variable.unit), digits: decimalsOf(data), diverging: true, continuous: true, note: phase, hatch: true }
    return { title: `Line value · ${projectionYear}`, bins: projectionLegend(domain!.min, domain!.max, role), unit: unitEn(data.variable.unit), digits: decimalsOf(data), diverging: false, continuous: true, note: phase, hatch: true }
  }
  const shown = effectiveKind(kind, data.variable.trendPolicy)
  const spec = layerSpec(data, shown)
  if (!spec.domain) return null
  const bins = spec.diverging ? divergingLegend(spec.domain.symmetricMaxAbs, role) : sequentialLegend(spec.domain.min, spec.domain.max, role)
  return { title: KINDS.find((option) => option.id === shown)?.label ?? '', bins, unit: spec.unit, digits: digitsForUnit(spec.unit), diverging: spec.diverging, continuous: false, note: spec.diverging ? 'Saturates at the 95th percentile' : 'Mean of the period' }
}

// Beside the 2D map: the scale of whatever the cells show right now, highest value on top.
export function MapLegend({ data, kind, projectionYear, projectionMode = 'value' }: { data?: RegionResponse; kind: LayerKind; projectionYear: number | null; projectionMode?: ProjectionMode }) {
  const spec = legendSpec(data, kind, projectionYear, projectionMode)
  if (!spec) return <aside className="map-legend is-empty" aria-label="Map color scale"><span className="map-legend-title">Scale</span><div className="map-legend-bar" /><span className="map-legend-note">Appears after Analyze</span></aside>
  const top = spec.bins[spec.bins.length - 1].to
  const bottom = spec.bins[0].from
  const label = (value: number) => (spec.diverging ? formatSigned(value, spec.digits) : formatNumber(value, spec.digits))
  return <aside className="map-legend" aria-label={`Map color scale: ${spec.title}, from ${label(bottom)} to ${label(top)} ${spec.unit}`}>
    <span className="map-legend-title">{spec.title}</span>
    <div className="map-legend-scale">
      {spec.continuous
        ? <div className="map-legend-bar" aria-hidden="true" style={{ background: `linear-gradient(to top, ${spec.diverging ? `${spec.bins[0].fill}, var(--color-white), ${spec.bins[spec.bins.length - 1].fill}` : `${spec.bins[0].fill}, ${spec.bins[spec.bins.length - 1].fill}`})` }} />
        : <div className="map-legend-bar" aria-hidden="true">{[...spec.bins].reverse().map((bin, index) => <span key={index} style={{ background: bin.fill }} />)}</div>}
      <div className="map-legend-ticks" aria-hidden="true"><span>{label(top)}</span>{spec.diverging ? <span>0</span> : spec.continuous && <span>{label((top + bottom) / 2)}</span>}<span>{label(bottom)}</span></div>
    </div>
    <span className="map-legend-unit">{spec.unit}</span>
    <span className="map-legend-note">{spec.diverging ? spec.note : <>Dark = higher<br />Light = lower</>}</span>
    {spec.hatch && <span className="map-legend-hatch"><span className="legend-swatch-hatch" aria-hidden="true" /> Trend not significant</span>}
  </aside>
}

// Step 1: how the 2D map colors the step 1 variable. The grid itself is requested by Analyze.
export function MapLayerControls({ variable, kind, onKind }: { variable: VariableId; kind: LayerKind; onKind: (kind: LayerKind) => void }) {
  const descriptor = MAP_VARIABLES.find((item) => item.id === variable)
  const trendAllowed = descriptor?.trendPolicy === 'allowed'
  const shownKind = effectiveKind(kind, descriptor?.trendPolicy)

  return <div className="field-group layer-field">
    <span className="field-label"><Layers size={16} /> DATA LAYER</span>
    <div className="layer-controls">
      <div className="segmented" role="group" aria-label="Map layer">
        {KINDS.map((option) => <button key={option.id} type="button" title={option.hint} aria-pressed={shownKind === option.id} disabled={option.id === 'trend' && !trendAllowed} onClick={() => onKind(option.id)}>{option.label}</button>)}
      </div>
    </div>
    <p className="field-hint">{descriptor ? <>Colors the map with <strong>{descriptor.label.en}</strong> for the selected country or state after Analyze.</> : 'This variable has no map layer.'}</p>
    {descriptor && !trendAllowed && <p className="field-hint">Precipitation has no trend layer: its trend sign depends on the start year, so the map shows anomalies or averages only.</p>}
  </div>
}

// Under the 2D map: request status, legend and regional summary for the layer chosen in step 1.
export type GridEstimate = { cells: number; tiles: number; seconds: number }

/** "≈ 32 cells in 2 NASA POWER blocks, about 5 s the first time" (blocks stay cached for 24 h). */
export const estimateText = (estimate: GridEstimate) => `≈ ${estimate.cells.toLocaleString('en-US')} cells in ${estimate.tiles} NASA POWER block${estimate.tiles === 1 ? '' : 's'}, about ${estimate.seconds} s the first time`

export function MapLayerResult({ variable, kind, active, data, isLoading, error, areaName, canRequest, estimate, tooLarge, maxCells, elapsed, cancelled, onCancel }: {
  variable: VariableId
  kind: LayerKind
  active: boolean
  data?: RegionResponse
  isLoading: boolean
  error?: Error
  areaName?: string
  canRequest: boolean
  estimate: GridEstimate | null
  tooLarge: boolean
  maxCells: number
  elapsed: number
  cancelled: boolean
  onCancel: () => void
}) {
  const descriptor = MAP_VARIABLES.find((item) => item.id === variable)
  const shownKind = effectiveKind(kind, data?.variable.trendPolicy)
  const spec = data ? layerSpec(data, shownKind) : null
  const regional = data?.regional
  const regionalLine = regional ? (regional.trend.display.method === 'sen-mann-kendall' ? regional.trend.lines.sen : regional.trend.lines.ols) : null
  const regionalDigits = regional ? digitsForUnit(regional.trend.display.unit) : 2
  const kindLabel = KINDS.find((option) => option.id === shownKind)?.label.toLowerCase()

  return <div className="layer-panel">
    <div className="field-label"><Layers size={16} /> DATA LAYER{descriptor && <span className="layer-current">{descriptor.label.en} • {kindLabel}</span>}</div>
    {!descriptor ? <p className="field-hint">This variable has no map layer.</p>
      : !canRequest ? <p className="field-hint">Select a country or state to load its grid.</p>
      : tooLarge && estimate ? <p className="layer-status is-limit" role="status">{areaName ?? 'This area'} covers {estimateText(estimate)}; the map draws up to {maxCells.toLocaleString('en-US')} cells. Choose a state on the globe or in step 1 to see its grid. The point analysis still runs.</p>
      : cancelled ? <p className="field-hint">Grid request cancelled. Press <strong>Analyze region</strong> again to retry; blocks that finished downloading stay cached.</p>
      : !active ? <p className="field-hint">Press <strong>Analyze region</strong> in step 1 to color {areaName ?? 'the area'} with {descriptor.label.en}{estimate ? ` (${estimateText(estimate)})` : ''}.</p>
      : null}

    {active && canRequest && !tooLarge && !cancelled && (isLoading ? <div className="layer-status layer-progress" role="status">
        <LoaderCircle className="loading-icon" size={16} />
        <span>Loading the NASA POWER grid for {areaName ?? 'this area'}… <strong>{elapsed} s</strong>{estimate ? <> of about {estimate.seconds} s ({estimate.cells.toLocaleString('en-US')} cells, {estimate.tiles} block{estimate.tiles === 1 ? '' : 's'})</> : null}</span>
        <button className="retry-button export-button" type="button" onClick={onCancel}>Cancel</button>
      </div>
      : error ? <p className="layer-status is-error" role="alert">{error.message}</p>
      : data && spec && spec.domain ? <>
        {/* The color scale sits beside the map (MapLegend). */}
        <p className="layer-summary">
          {data.grid.cellCount} native cells of 0.5° × 0.625° clipped to the boundary
          {shownKind === 'trend' && <> • <span className="legend-swatch-outline" aria-hidden="true" /> {data.summary.significantField} with a significant trend (<Term name="fieldFdr">field FDR</Term> q &lt; 0.10)</>}
          {shownKind === 'anomaly' && data.cells[0]?.recentYears && <> • {data.cells[0].recentYears[0]}–{data.cells[0].recentYears[1]} vs 1991–2020</>}
        </p>
        {regional && <div className="layer-regional">
          <div className="layer-regional-head">
            <span>{data.variable.profile.regionalLabel.en}</span>
            <strong>{formatSigned(regional.trend.display.slope, regionalDigits)} {unitEn(regional.trend.display.unit)}</strong>
            <VerdictBadge verdict={regional.trend.verdict} />
            {!regional.trend.claimAllowed && <span className="signal-tag">No trend claim</span>}
          </div>
          <SeriesChart points={regional.annual.map((point) => ({ year: point.year, value: point.complete ? point.value : null }))} line={regionalLine} unit={unitEn(data.variable.unit)} digits={descriptor?.decimals ?? 2} label={`${data.variable.label.en}, area-weighted series for ${areaName ?? 'the area'}`} height={110} />
        </div>}
      </> : data ? <p className="layer-status">No values to map for this variable in this area.</p> : null)}
  </div>
}
