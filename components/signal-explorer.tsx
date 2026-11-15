'use client'

import { useMemo, useState } from 'react'
import { LayoutGrid, LoaderCircle, MapPin } from 'lucide-react'
import type { PointResponse, VariableId, VariableResult } from '@/lib/api/v2'
import { PanelHeader } from '@/components/panel-header'
import { SignalCard } from '@/components/signal-card'
import { VariableDetail } from '@/components/variable-detail'
import { formatNumber } from '@/lib/ui/format'

type GroupFilter = 'all' | VariableResult['group']

const GROUPS: Array<{ id: GroupFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'temperature', label: 'Temperature' },
  { id: 'precipitation', label: 'Precipitation' },
  { id: 'humidity', label: 'Humidity' },
  { id: 'soil', label: 'Soil' },
]

// Every variable processed by API v2 for the analysis point (GET /api/point), as filterable cards plus the
// detail of the selected one. Requested by "Analyze region" (API v2 /api/point).
export function SignalExplorer({ point, isLoading, error, analysisRequested, focus, onFocus, onRetry, startYear, endYear }: {
  point?: PointResponse
  isLoading: boolean
  error?: Error
  analysisRequested: boolean
  focus: VariableId
  onFocus: (id: VariableId) => void
  onRetry: () => void
  startYear: number
  endYear: number
}) {
  const [group, setGroup] = useState<GroupFilter>('all')
  const [headlineOnly, setHeadlineOnly] = useState(false)
  const visible = useMemo(() => (point?.variables ?? []).filter((result) => (group === 'all' || result.group === group) && (!headlineOnly || result.fitness === 'core')), [point, group, headlineOnly])
  const selected = point?.variables.find((result) => result.id === focus) ?? point?.variables[0]
  const support = point?.support

  return <section className="explorer-panel panel" id="signals" aria-labelledby="signals-title">
    <PanelHeader badge="Result" title="All climate signals" icon={LayoutGrid} />
    <div className="chart-header">
      <h2 id="signals-title">Every processed variable <span className="range-label">{startYear} — {endYear}</span></h2>
      {support && <span className="support-chip" title="NASA POWER returns the nearest native MERRA-2 grid cell; values describe the cell, not a city or station."><MapPin size={16} /> Cell {formatNumber(support.centerLat, 2)}°, {formatNumber(support.centerLon, 3)}° • {support.elevationM !== null ? `${Math.round(support.elevationM).toLocaleString('en-US')} m` : 'elevation n/a'}</span>}
    </div>

    {isLoading ? <div className="chart-empty" role="status" aria-live="polite"><LoaderCircle className="loading-icon" size={24} /><strong>Processing 13 variables from NASA POWER…</strong><p>Monthly and daily records are cleaned, aggregated and tested on the server.</p></div>
      : error ? <div className="chart-empty" role="status"><div className="chart-empty-icon">!</div><strong>Signal processing failed</strong><p>{error.message}</p><button className="export-button retry-button" type="button" onClick={onRetry}>Retry request</button></div>
      : !point ? <div className="chart-empty" role="status"><div className="chart-empty-icon"><LayoutGrid size={16} /></div><strong>{analysisRequested ? 'No signals returned' : 'Every climate signal will appear here'}</strong><p>Analyze a place to compare temperature, extremes, rain, humidity and soil moisture with the same evidence rules.</p></div>
      : <div className="explorer-layout">
        {/* The selected variable's charts on the left; every variable's card on the right, scrolling within their height. */}
        <div className="explorer-main">{selected && <VariableDetail key={selected.id} result={selected} startYear={startYear} endYear={endYear} />}</div>
        <aside className="explorer-side" aria-label="Processed variables">
          <div className="explorer-filters">
            <div className="segmented" role="group" aria-label="Variable group">
              {GROUPS.map((option) => <button key={option.id} type="button" aria-pressed={group === option.id} onClick={() => setGroup(option.id)}>{option.label}</button>)}
            </div>
            <label className="toggle"><input type="checkbox" checked={headlineOnly} onChange={(event) => setHeadlineOnly(event.target.checked)} /> Headline variables only</label>
          </div>
          <div className="explorer-list">
            {visible.length ? <div className="signal-grid">
              {visible.map((result) => <SignalCard key={result.id} result={result} selected={result.id === selected?.id} onSelect={() => onFocus(result.id)} />)}
            </div> : <p className="evidence-muted">No variable matches these filters.</p>}
          </div>
          <p className="chart-disclaimer">Change per decade. Arrows only for robust or probable trends; rain never gets one.</p>
        </aside>
      </div>}
  </section>
}
