'use client'

import { ChevronDown, Eye, EyeOff, Layers, LoaderCircle } from 'lucide-react'
import type { CellResult, RegionResponse, VariableId } from '@/lib/api/v2'
import { VARIABLES } from '@/lib/variables/catalog'
import { SeriesChart } from '@/components/series-chart'
import { VerdictBadge } from '@/components/verdict-badge'
import { divergingFill, divergingLegend, sequentialFill, sequentialLegend, type LegendBin } from '@/lib/ui/color-scale'
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
export function effectiveKind(kind: LayerKind, data?: RegionResponse) {
  return kind === 'trend' && data?.variable.trendPolicy !== 'allowed' ? 'anomaly' : kind
}

function layerSpec(data: RegionResponse, kind: LayerKind) {
  const profile = data.variable.profile
  if (kind === 'trend') return { value: (cell: CellResult) => cell.slopeDisplay, domain: data.legend.slopeDisplay, unit: unitEn(profile.displayUnit), diverging: true }
  if (kind === 'anomaly') return { value: (cell: CellResult) => cell.anomalyRecent, domain: data.legend.anomalyRecent, unit: unitEn(profile.anomaly.unit), diverging: true }
  return { value: (cell: CellResult) => cell.mean, domain: data.legend.mean, unit: unitEn(data.variable.unit), diverging: false }
}

const roleOf = (data: RegionResponse) => VARIABLES.find((variable) => variable.id === data.variable.id)?.colorRole ?? 'temperature'

// Cells inside the 2D map SVG (the caller clips them to the selected boundary). Native squares, no smoothing.
export function MapCells({ data, kind, project }: { data: RegionResponse; kind: LayerKind; project: (lon: number, lat: number) => [number, number] }) {
  const spec = layerSpec(data, kind)
  const role = roleOf(data)
  const digits = digitsForUnit(spec.unit)
  return <g className="map-cells">
    {data.cells.map((cell) => {
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

function Legend({ bins, unit, digits, diverging }: { bins: LegendBin[]; unit: string; digits: number; diverging: boolean }) {
  const first = bins[0]
  const last = bins[bins.length - 1]
  return <div className="layer-legend">
    <div className="legend-scale" aria-hidden="true">{bins.map((bin, index) => <span key={index} style={{ background: bin.fill }} />)}</div>
    <div className="legend-labels"><span>{diverging ? formatSigned(first.from, digits) : formatNumber(first.from, digits)}</span>{diverging && <span>0</span>}<span>{diverging ? formatSigned(last.to, digits) : formatNumber(last.to, digits)}</span></div>
    <span className="legend-unit">{unit}{diverging ? ' • colors saturate at the 95th percentile' : ''}</span>
  </div>
}

// Controls, legend and regional summary under the 2D map.
export function MapLayerPanel({ variable, onVariable, kind, onKind, active, onToggle, data, isLoading, error, areaName, canRequest }: {
  variable: VariableId
  onVariable: (id: VariableId) => void
  kind: LayerKind
  onKind: (kind: LayerKind) => void
  active: boolean
  onToggle: () => void
  data?: RegionResponse
  isLoading: boolean
  error?: Error
  areaName?: string
  canRequest: boolean
}) {
  const descriptor = MAP_VARIABLES.find((item) => item.id === variable)
  const trendAllowed = descriptor?.trendPolicy === 'allowed'
  const shownKind = data ? effectiveKind(kind, data) : kind
  const spec = data ? layerSpec(data, shownKind) : null
  const digits = spec ? digitsForUnit(spec.unit) : 2
  const role = data ? roleOf(data) : 'temperature'
  const regional = data?.regional
  const regionalLine = regional ? (regional.trend.display.method === 'sen-mann-kendall' ? regional.trend.lines.sen : regional.trend.lines.ols) : null
  const regionalDigits = regional ? digitsForUnit(regional.trend.display.unit) : 2

  return <div className="layer-panel">
    <div className="field-label"><Layers size={16} /> DATA LAYER</div>
    <div className="layer-controls">
      <div className="select-wrap">
        <select aria-label="Map variable" value={variable} onChange={(event) => onVariable(event.target.value as VariableId)}>
          {MAP_VARIABLES.map((item) => <option key={item.id} value={item.id}>{item.label.en}</option>)}
        </select>
        <ChevronDown size={16} aria-hidden="true" />
      </div>
      <div className="segmented" role="group" aria-label="Map layer">
        {KINDS.map((option) => <button key={option.id} type="button" title={option.hint} aria-pressed={kind === option.id} disabled={option.id === 'trend' && !trendAllowed} onClick={() => onKind(option.id)}>{option.label}</button>)}
      </div>
      <button className="export-button" type="button" disabled={!canRequest} onClick={onToggle}>{active ? <><EyeOff size={16} /> Hide layer</> : <><Eye size={16} /> Show layer</>}</button>
    </div>
    {!trendAllowed && <p className="field-hint">Precipitation has no trend layer: its trend sign depends on the start year, so the map shows anomalies or averages only.</p>}
    {!canRequest && <p className="field-hint">Select a country or state to load its grid.</p>}

    {active && (isLoading ? <p className="layer-status" role="status"><LoaderCircle className="loading-icon" size={16} /> Loading the NASA POWER grid for {areaName ?? 'this area'}… A state takes a few seconds; a large country can take over a minute the first time.</p>
      : error ? <p className="layer-status is-error" role="alert">{error.message}</p>
      : data && spec && spec.domain ? <>
        <Legend bins={spec.diverging ? divergingLegend(spec.domain.symmetricMaxAbs, role) : sequentialLegend(spec.domain.min, spec.domain.max, role)} unit={spec.unit} digits={digits} diverging={spec.diverging} />
        <p className="layer-summary">
          {data.grid.cellCount} native cells of 0.5° × 0.625° clipped to the boundary
          {shownKind === 'trend' && <> • <span className="legend-swatch-outline" aria-hidden="true" /> {data.summary.significantField} with a significant trend (field FDR q &lt; 0.10)</>}
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
