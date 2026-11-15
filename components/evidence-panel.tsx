import { AlertTriangle, BadgeCheck, ChartNoAxesColumn, CircleDot, Database, FileText, FlaskConical, Grid3x3, Info, ListX } from 'lucide-react'
import type { Region } from '@/components/location-selector'
import { PanelHeader } from '@/components/panel-header'
import type { Variable } from '@/components/variable-selector'
import type { PointResponse } from '@/lib/api/v2'
import type { ClimateAnalysis } from '@/lib/nasa/types'
import { EXCLUDED_VARIABLES, VARIABLES } from '@/lib/variables/catalog'
import { formatNumber, unitEn } from '@/lib/ui/format'

type AnalysisProps = { region: Region; variable: Variable; startYear: number; endYear: number; analysisRequested: boolean; analysis?: ClimateAnalysis; error?: Error; isLoading: boolean }

function formatMetric(value: number | null, digits = 3) {
  return value === null || !Number.isFinite(value) ? 'not estimable' : value.toFixed(digits)
}

// Right column: what the analysis found (status, scope, statistics, caveats).
export function ResultsPanel({ region, variable, startYear, endYear, analysisRequested, analysis, error, isLoading }: AnalysisProps) {
  const trend = analysis?.trend
  const unit = analysis?.annual[0]?.unit ?? (variable === 'temperature' ? '°C' : 'mm/year')
  const status = isLoading ? 'REQUESTING NASA POWER DATA' : error ? 'NASA POWER REQUEST FAILED' : analysis && !analysis.observations.length ? 'NO OBSERVATIONS RETURNED' : analysis ? 'VERIFIED OBSERVATIONS LOADED' : 'READY FOR ANALYSIS'

  return <aside className="results-panel panel" aria-labelledby="results-title">
    <PanelHeader badge="Summary" title="Signal summary" icon={ChartNoAxesColumn} titleId="results-title" />
    <div className="evidence-status"><span className="status-indicator" /> {status}</div>
    <div className="results-grid">
      <div className="evidence-section"><h3><CircleDot size={16} /> SPATIAL &amp; TEMPORAL SCOPE</h3><div className="scope-location">{region.country ? `Point in ${region.name}` : region.name}</div><div className="scope-coords">{region.lat.toFixed(2)}°, {region.lon.toFixed(2)}°</div><div className="scope-period"><span>{analysis?.period.startYear ?? startYear}—{analysis?.period.endYear ?? endYear}</span><span>{variable === 'temperature' ? 'Temperature • °C annual mean' : 'Precipitation • mm/year total'}</span></div>{analysis && <p className="evidence-muted">Returned coverage: {analysis.coverage.start ?? '—'} to {analysis.coverage.end ?? '—'} • {analysis.missingCount} expected monthly values unavailable</p>}</div>
      <div className="evidence-section metrics-section"><h3><ChartNoAxesColumn size={16} /> STATISTICAL SUMMARY</h3><div className="metric-row"><span>OLS trend slope</span><strong>{formatMetric(trend?.slopePerYear ?? null)} {unit}/yr</strong></div><div className="metric-row"><span>Sen slope</span><strong>{formatMetric(trend?.senSlopePerYear ?? null)} {unit}/yr</strong></div><div className="metric-row"><span>95% confidence interval</span><strong>{trend?.confidenceInterval95 ? `${formatMetric(trend.confidenceInterval95[0])} to ${formatMetric(trend.confidenceInterval95[1])}` : 'not estimable'}</strong></div><div className="metric-row"><span>OLS p-value</span><strong>{formatMetric(trend?.pValue ?? null)}</strong></div><div className="metric-row"><span>Mann–Kendall p-value</span><strong>{formatMetric(trend?.mannKendall?.pValue ?? null)}</strong></div><div className="metric-row"><span>Years in trend</span><strong>{trend?.nYears ?? '—'}</strong></div><div className="metric-row"><span>Minimum month coverage</span><strong>{trend?.completeness === null || trend?.completeness === undefined ? '—' : `${(trend.completeness * 100).toFixed(1)}%`}</strong></div><div className="metrics-note"><Info size={16} /><span>{trend ? `${trend.method}. ${trend.significantAt05 === null ? 'OLS significance was not estimable.' : trend.significantAt05 ? 'OLS p < 0.05 under this model.' : 'OLS p ≥ 0.05 under this model; this does not prove no change.'} ${trend.mannKendall?.significantAt05 === null ? 'Mann–Kendall significance was not estimable.' : trend.mannKendall?.significantAt05 ? 'Mann–Kendall also indicates a monotonic signal.' : 'Mann–Kendall does not indicate a monotonic signal at 0.05.'}` : 'No values reported before source data and method validation.'}</span></div></div>
      <div className="evidence-notes">
        {trend?.warnings.length ? <div className="caveat-card"><AlertTriangle size={16} /><div><strong>Analysis warnings</strong><p>{trend.warnings.join(' ')}</p></div></div> : <div className="caveat-card"><AlertTriangle size={16} /><div><strong>Interpret with care</strong><p>Local climate patterns are complex. A trend is not attribution, and incomplete data must not be treated as evidence.</p></div></div>}
        <div className="nature-note"><BadgeCheck size={16} /><span>Observation &amp; trend status: <strong>{analysisRequested && !analysis && !error ? 'loading' : analysis ? 'descriptive, source-linked' : 'not yet requested'}</strong></span></div>
      </div>
    </div>
  </aside>
}

const METHOD_SHORT = { 'ols-hamed-rao': 'OLS', 'sen-mann-kendall': 'Sen' } as const
const ENDPOINT_LABEL = { 'monthly-point': 'Monthly point', 'daily-point': 'Daily point', 'monthly-regional': 'Monthly regional' } as const

// End of the page: the research record of where the numbers come from.
export function EvidencePanel({ variable, analysis, point }: Pick<AnalysisProps, 'variable' | 'analysis'> & { point?: PointResponse }) {
  const parameter = analysis?.parameter ?? (variable === 'temperature' ? 'T2M' : 'PRECTOTCORR')

  return <section className="evidence-panel panel" aria-labelledby="evidence-title">
    <PanelHeader badge="Source" title="Evidence file" icon={FileText} titleId="evidence-title" />
    <p className="evidence-intro">A transparent record of the source, methods, and limits behind every climate signal. <span className="record-id">ES—0001</span></p>
    <div className="evidence-section evidence-source">
      <h3><Database size={16} /> DATA SOURCE</h3>
      <div><div className="evidence-value">NASA POWER • {parameter}</div><p className="evidence-muted">Monthly {parameter === 'T2M' ? 'air temperature' : 'corrected precipitation'} values • annual aggregation</p><a className="source-link" href={analysis?.sourceUrl ?? 'https://power.larc.nasa.gov/'} target="_blank" rel="noreferrer">NASA POWER source request <span>↗</span></a></div>
      <div>{analysis ? <><p className="evidence-muted">Retrieved {new Date(analysis.retrievedAt).toLocaleString()}</p><p className="evidence-muted">{analysis.sourceModel ?? 'Source model not reported'}{analysis.productVersion ? ` • API ${analysis.productVersion}` : ''} • {analysis.timeStandard ?? 'time standard not reported'}</p></> : <p className="evidence-muted">Retrieval time, source model and API version appear after an analysis.</p>}</div>
    </div>

    <div className="evidence-section evidence-v2">
      <h3><Database size={16} /> ALL PROCESSED VARIABLES • API V2</h3>
      {point ? <ul className="evidence-list">
        {point.sources.map((source) => <li key={source.url}>
          <span className="evidence-value">NASA POWER • {ENDPOINT_LABEL[source.endpoint]}</span>
          <span className="evidence-muted">Retrieved {new Date(source.retrievedAt).toLocaleString()} • {source.sources.join(', ') || 'source not reported'}{source.apiVersion ? ` • API ${source.apiVersion}` : ''} • {source.timeStandard ?? 'time standard not reported'} • coverage {source.coverage.start ?? '—'} to {source.coverage.end ?? '—'}</span>
          <a className="source-link" href={source.url} target="_blank" rel="noreferrer">Exact request <span>↗</span></a>
        </li>)}
      </ul> : <p className="evidence-muted">The monthly and daily requests behind every processed variable appear after an analysis.</p>}
    </div>

    {point && <div className="evidence-section">
      <h3><Grid3x3 size={16} /> SPATIAL SUPPORT</h3>
      <p className="evidence-value">MERRA-2 cell centred at {formatNumber(point.support.centerLat, 2)}°, {formatNumber(point.support.centerLon, 3)}° • {point.support.dLat}° × {point.support.dLon}°</p>
      <p className="evidence-muted">Bounds {formatNumber(point.support.bounds.south, 2)}° to {formatNumber(point.support.bounds.north, 2)}° latitude, {formatNumber(point.support.bounds.west, 3)}° to {formatNumber(point.support.bounds.east, 3)}° longitude • mean cell elevation {point.support.elevationM !== null ? `${Math.round(point.support.elevationM).toLocaleString('en-US')} m` : 'not reported'}. Values describe the whole cell, not the city or a station.</p>
    </div>}

    <div className="evidence-section">
      <h3><FlaskConical size={16} /> METHOD BY VARIABLE</h3>
      <p className="evidence-muted">Common rules: POWER’s own annual record and −999 fill values are dropped, nothing is imputed, and a year counts only with 12 of 12 months (or every day). The primary p-value is Mann–Kendall corrected for autocorrelation (Hamed–Rao); q-values control false discoveries across the 13 variables, and seasonal series form their own family. A trend is <strong>robust</strong> when it meets all five criteria: q &lt; 0.05, primary interval excludes zero, holds after pre-whitening, survives removing any one year, and keeps its direction in the sensitivity window.</p>
      <details className="evidence-details">
        <summary>Processing profile of each variable</summary>
        <div className="evidence-table-wrap">
          <table className="evidence-table">
            <thead><tr><th scope="col">Variable</th><th scope="col">Change shown as</th><th scope="col">Primary method</th><th scope="col">Relevant from</th><th scope="col">Seasons</th></tr></thead>
            <tbody>
              {VARIABLES.map((item) => <tr key={item.id}>
                <th scope="row">{item.label.en}</th>
                <td>{unitEn(item.profile.displayUnit)}</td>
                <td>{METHOD_SHORT[item.profile.primaryMethod]}</td>
                <td>{item.profile.relevanceThreshold} {unitEn(item.profile.displayUnit)}</td>
                <td>{item.profile.seasons.length ? 'Dry and wet' : '—'}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </details>
    </div>

    <div className="evidence-section">
      <h3><ListX size={16} /> EVALUATED AND EXCLUDED</h3>
      <ul className="evidence-list compact">
        {EXCLUDED_VARIABLES.map((item) => <li key={item.id}><span className="evidence-value">{item.id}</span><span className="evidence-muted">{item.reason.en}</span></li>)}
      </ul>
    </div>
  </section>
}
