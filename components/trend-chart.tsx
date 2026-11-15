'use client'

import { ChartNoAxesColumn, Download, LoaderCircle, TrendingUp } from 'lucide-react'
import { PanelHeader } from '@/components/panel-header'
import { SeriesChart } from '@/components/series-chart'
import type { VariableId, VariableResult } from '@/lib/api/v2'
import { AGGREGATION_LABEL, unitEn } from '@/lib/ui/format'
import { getVariable } from '@/lib/variables/catalog'

// Signed change with a real minus sign; precision shrinks as magnitude grows (°C in hundredths, mm in units).
function formatChange(delta: number) {
  const size = Math.abs(delta)
  const text = size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)
  return `${Number(text) === 0 ? '±' : delta > 0 ? '+' : '−'}${text}`
}
// Green up, red down, neutral when the rounded change is zero.
const tone = (delta: number) => Number(formatChange(delta).slice(1)) === 0 ? '' : delta > 0 ? 'is-up' : 'is-down'
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function downloadCsv(rows: string[], name: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }))
  link.download = name
  link.click()
  URL.revokeObjectURL(link.href)
}

// Year-over-year: each year against the previous returned year (a gap is labelled, never filled).
function YearChanges({ points, unit, digits, aggregate }: { points: Array<{ year: number; value: number; note?: string }>; unit: string; digits: number; aggregate: string }) {
  const changes = points.slice(1).map((point, index) => ({ ...point, delta: point.value - points[index].value, previousYear: points[index].year }))
  if (!changes.length) return null
  return <details className="yoy">
    <summary><span className="yoy-show">Show year-by-year change</span><span className="yoy-hide">Hide year-by-year change</span></summary>
    <ol className="yoy-grid" aria-label={`Change in ${aggregate} from the previous year`}>
      {changes.map((change) => <li key={change.year}>
        <span className="yoy-year">{change.year}{change.year - change.previousYear > 1 ? ` vs ${change.previousYear}` : ''}</span>
        <span className={`yoy-delta ${tone(change.delta)}`}>{formatChange(change.delta)} {unit}</span>
        <span className="yoy-value">{change.value.toFixed(digits)} {unit}{change.note ? ` • ${change.note}` : ''}</span>
      </li>)}
    </ol>
    <p className="chart-disclaimer">Each value is the change in {aggregate} from the previous year. Year-to-year swings are mostly natural variability; the long-term rate is the trend in the statistical summary.</p>
  </details>
}

// Historical observations of the step 1 variable: the API v2 annual series with the trend line of its primary method
// (Sen or OLS, per the processing profile), axis scaled to the data, placed by year. Incomplete years are gaps.
export function PointTrendChart({ variable, result, startYear, endYear, analysisRequested, isLoading, error, onRetry }: { variable: VariableId; result?: VariableResult; startYear: number; endYear: number; analysisRequested: boolean; isLoading: boolean; error?: Error; onRetry: () => void }) {
  const descriptor = getVariable(variable)
  const label = descriptor?.label.en ?? variable
  const unit = unitEn(result?.unit ?? descriptor?.unit ?? '')
  const aggregate = descriptor ? AGGREGATION_LABEL[descriptor.aggregation] : 'annual value'
  const digits = descriptor?.decimals ?? 2
  const parameter = descriptor?.source.parameters.join(' + ') ?? variable
  const complete = (result?.annual ?? []).flatMap((point) => point.complete && point.value !== null ? [{ year: point.year, value: point.value }] : [])
  const first = complete[0]
  const last = complete.at(-1)
  const delta = first && last && complete.length > 1 ? last.value - first.value : null
  const method = result?.trend.display.method ?? descriptor?.profile.primaryMethod
  const line = result ? (method === 'sen-mann-kendall' ? result.trend.lines.sen : result.trend.lines.ols) : null
  const showResults = !isLoading && !error && complete.length > 0

  function exportCsv() {
    if (!result) return
    downloadCsv(['year,value,unit,anomaly,anomaly_unit,complete', ...result.annual.map((point) => [point.year, point.value ?? '', result.unit, point.anomaly ?? '', result.baseline.anomalyUnit, point.complete].join(','))], `earthscope-${variable}-${startYear}-${endYear}.csv`)
  }

  return <section className="chart-panel panel" aria-labelledby="trend-title">
    <PanelHeader badge="Result" title="Historical observations" icon={TrendingUp} />
    <div className="chart-header">
      <h2 id="trend-title">{label} <span className="range-label">{startYear} — {endYear}</span></h2>
      <div className="chart-actions">
        {showResults && delta !== null && first && last && <span className={`change-chip ${tone(delta)}`} title={`${capitalize(aggregate)} in ${last.year} minus ${first.year}, the first and last complete years. Two single years can differ by chance; the long-term rate is the trend in the statistical summary.`}>
          <strong>{formatChange(delta)} {unit}</strong><small>{last.year} vs {first.year}</small>
        </span>}
        <button className="export-button" type="button" disabled={!result?.annual.length} onClick={exportCsv} aria-label={`Export ${label} annual series as CSV`}><Download size={16} /> Export CSV</button>
      </div>
    </div>
    <div className="chart-empty" role="status" aria-live="polite">
      {isLoading ? <><LoaderCircle className="loading-icon" size={24} /><strong>Requesting observations from NASA POWER…</strong><p>Records are cleaned, aggregated and tested on the server.</p></> : error ? <><div className="chart-empty-icon">!</div><strong>NASA POWER request failed</strong><p>{error.message}</p><button className="export-button retry-button" type="button" onClick={onRetry}>Retry request</button></> : showResults && result ? <div className="chart-results series-results">
        <div className="chart-result-meta"><span>NASA POWER • {parameter}</span><span>{capitalize(aggregate)} • {unit}</span></div>
        <SeriesChart points={result.annual.map((point) => ({ year: point.year, value: point.complete ? point.value : null }))} line={line} reference={result.profile.expectedValue} unit={unit} digits={digits} label={`${label}, ${aggregate} for ${complete.length} complete years from NASA POWER`} height={140} />
        <p className="chart-disclaimer">Dashed line: {method === 'sen-mann-kendall' ? 'Sen' : 'OLS'} trend over the complete years. Gaps are incomplete years; nothing is filled in. A trend does not establish causation.</p>
      </div> : <>
        <div className="chart-empty-icon"><ChartNoAxesColumn size={16} /></div><strong>{analysisRequested ? 'No complete years returned for this period' : 'Historical observations will appear here'}</strong><p>{analysisRequested ? 'NASA POWER returned no complete years for this variable and range; incomplete years are never filled in.' : 'Choose a location and variable, then analyze to request NASA POWER observations. No measurements or statistics are fabricated.'}</p><div className="chart-axis"><span>{startYear}</span><span>{Math.round((startYear + endYear) / 2)}</span><span>{endYear}</span></div>
      </>}
    </div>
    {showResults && <YearChanges points={complete} unit={unit} digits={digits} aggregate={aggregate} />}
  </section>
}
