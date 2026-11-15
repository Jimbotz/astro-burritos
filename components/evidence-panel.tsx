import { AlertTriangle, BadgeCheck, ChartNoAxesColumn, CircleDot, Database, FileText, FlaskConical, Grid3x3, Info, ListX, Satellite } from 'lucide-react'
import type { Region } from '@/components/location-selector'
import { PanelHeader } from '@/components/panel-header'
import { Term } from '@/components/term'
import { VerdictBadge } from '@/components/verdict-badge'
import type { PointResponse, VariableId, VariableResult } from '@/lib/api/v2'
import { EXCLUDED_VARIABLES, VARIABLES, getVariable, type VariableDescriptor } from '@/lib/variables/catalog'
import { CHALLENGE_SOURCES, SOURCE_STATUS_LABEL } from '@/lib/sources'
import { AGGREGATION_LABEL, VERDICT_LABEL, digitsForUnit, formatNumber, formatPValue, formatPowerDate, formatSigned, unitEn } from '@/lib/ui/format'

// `variable` is the step 1 choice; every variable reads its result from API v2 (`point`).
type AnalysisProps = { region: Region; variable: VariableId; startYear: number; endYear: number; analysisRequested: boolean; point?: PointResponse; error?: Error; isLoading: boolean }

const METHOD_SHORT = { 'ols-hamed-rao': 'OLS', 'sen-mann-kendall': 'Sen' } as const
const METHOD_NOTE = { 'ols-hamed-rao': 'OLS slope with a block-bootstrap interval', 'sen-mann-kendall': 'Sen slope with a Gilbert interval' } as const
const ENDPOINT_LABEL = { 'monthly-point': 'Monthly point', 'daily-point': 'Daily point', 'monthly-regional': 'Monthly regional' } as const

const orNotEstimable = (text: string) => (text === '—' ? 'not estimable' : text)

function statusLabel({ isLoading, error, loaded, empty }: { isLoading: boolean; error?: Error; loaded: boolean; empty: boolean }) {
  return isLoading ? 'REQUESTING NASA POWER DATA' : error ? 'NASA POWER REQUEST FAILED' : loaded && empty ? 'NO OBSERVATIONS RETURNED' : loaded ? 'VERIFIED OBSERVATIONS LOADED' : 'READY FOR ANALYSIS'
}

const resultFor = (point: PointResponse | undefined, variable: VariableId) => point?.variables.find((item) => item.id === variable)
/** The point request (monthly or daily endpoint) that carries this variable. */
const sourceFor = (point: PointResponse | undefined, descriptor: VariableDescriptor | undefined) => point?.sources.find((source) => source.endpoint === (descriptor?.source.endpoint === 'daily' ? 'daily-point' : 'monthly-point'))

// "Results" card: where and when, and what the trend test found (scope + statistical summary).
export function ResultsPanel({ region, variable, startYear, endYear, point }: AnalysisProps) {
  const descriptor = getVariable(variable)
  const result = resultFor(point, variable)
  const source = sourceFor(point, descriptor)
  const label = `${descriptor?.label.en ?? variable} • ${unitEn(descriptor?.unit ?? '')} ${descriptor ? AGGREGATION_LABEL[descriptor.aggregation] : ''}`

  return <section className="results-panel panel" aria-label="Spatial and temporal scope and statistical summary">
    <div className="results-grid">
      <div className="evidence-section"><h3><CircleDot size={16} /> SPATIAL &amp; TEMPORAL SCOPE</h3><div className="scope-location">{region.country ? `Point in ${region.name}` : region.name}</div><div className="scope-coords">{region.lat.toFixed(2)}°, {region.lon.toFixed(2)}°</div><div className="scope-period"><span>{result?.trend.window.startYear ?? startYear}—{result?.trend.window.endYear ?? endYear}</span><span>{label}</span></div>
        {result && <p className="evidence-muted">Returned coverage: {formatPowerDate(source?.coverage.start)} to {formatPowerDate(source?.coverage.end)} • {result.trend.excludedIncompleteYears.length} incomplete years excluded</p>}
      </div>
      <PointSummary result={result} descriptor={descriptor} />
    </div>
  </section>
}

// Statistical summary of an API v2 variable: the primary method of its processing profile, per decade.
function PointSummary({ result, descriptor }: { result?: VariableResult; descriptor?: VariableDescriptor }) {
  const trend = result?.trend
  const display = trend?.display
  const method = display?.method ?? descriptor?.profile.primaryMethod ?? 'ols-hamed-rao'
  const displayUnit = unitEn(display?.unit ?? descriptor?.profile.displayUnit ?? '')
  const digits = digitsForUnit(displayUnit)
  return <div className="evidence-section metrics-section"><h3><ChartNoAxesColumn size={16} /> STATISTICAL SUMMARY</h3>
    <div className="metric-row"><span>{METHOD_SHORT[method]} trend (primary method)</span><strong>{orNotEstimable(formatSigned(display?.slope))} {displayUnit}</strong></div>
    <div className="metric-row"><span><Term name="ci95">95% confidence interval</Term></span><strong>{display?.ci95 ? `${formatSigned(display.ci95[0], digits)} to ${formatSigned(display.ci95[1], digits)}` : 'not estimable'}</strong></div>
    <div className="metric-row"><span><Term name="hamedRao">Hamed–Rao p-value</Term></span><strong>{orNotEstimable(formatPValue(trend?.pValueHamedRao))}</strong></div>
    <div className="metric-row"><span><Term name="qValue">q-value (13 variables)</Term></span><strong>{orNotEstimable(formatPValue(trend?.qValue))}</strong></div>
    <div className="metric-row"><span><Term name="mannKendall">Mann–Kendall p-value</Term></span><strong>{orNotEstimable(formatPValue(trend?.pValueMannKendall))}</strong></div>
    <div className="metric-row"><span>Complete years in trend</span><strong>{trend?.nYears ?? '—'}</strong></div>
    <div className="metric-row"><span><Term name="robustness">Robustness criteria</Term></span><strong>{trend ? <><VerdictBadge verdict={trend.verdict} /> {trend.criteriaMet}/5</> : '—'}</strong></div>
  </div>
}

// End of the page: the signal summary status and the research record of where the numbers come from,
// closing with the method note and the caveats.
export function EvidencePanel({ variable, point, analysisRequested, error, isLoading }: Pick<AnalysisProps, 'variable' | 'point' | 'analysisRequested' | 'error' | 'isLoading'>) {
  const descriptor = getVariable(variable)
  const result = resultFor(point, variable)
  const source = sourceFor(point, descriptor)
  const parameter = descriptor?.source.parameters.join(', ') ?? variable
  const loaded = Boolean(result)
  const empty = Boolean(result && !result.annual.some((item) => item.complete))
  const warnings = result ? [...result.trend.warnings.map((warning) => warning.en), ...(descriptor?.caveats.en ?? [])] : []

  return <section className="evidence-panel panel" aria-labelledby="evidence-title">
    <PanelHeader badge="Summary" title="Signal summary" icon={FileText} aside={<span className="record-id">ES—0001</span>} />
    <h2 className="evidence-title" id="evidence-title">Evidence file</h2>
    <div className="evidence-status"><span className="status-indicator" /> {statusLabel({ isLoading, error, loaded, empty })}</div>
    <p className="evidence-intro">A transparent record of the source, methods, and limits behind every climate signal.</p>
    <div className="evidence-section evidence-source">
      <h3><Database size={16} /> DATA SOURCE</h3>
      <>
        <div><div className="evidence-value">NASA POWER • {parameter}</div><p className="evidence-muted">{descriptor?.source.endpoint === 'daily' ? 'Daily' : 'Monthly'} {parameter} records • {descriptor ? AGGREGATION_LABEL[descriptor.aggregation] : 'annual aggregation'}</p><a className="source-link" href={source?.url ?? 'https://power.larc.nasa.gov/'} target="_blank" rel="noreferrer">NASA POWER source request <span>↗</span></a></div>
        <div>{source && result ? <><p className="evidence-muted">Retrieved {new Date(source.retrievedAt).toLocaleString()}</p><p className="evidence-muted">{source.sources.join(', ') || 'Source model not reported'}{source.apiVersion ? ` • API ${source.apiVersion}` : ''} • {source.timeStandard ?? 'time standard not reported'}</p></> : <p className="evidence-muted">Retrieval time, source model and API version appear after an analysis.</p>}</div>
      </>
    </div>

    <details className="evidence-more">
      <summary>Every request, spatial support, method by variable, exclusions and challenge sources</summary>
    <div className="evidence-section evidence-v2">
      <h3><Database size={16} /> ALL PROCESSED VARIABLES • API V2</h3>
      {point ? <ul className="evidence-list">
        {point.sources.map((item) => <li key={item.url}>
          <span className="evidence-value">NASA POWER • {ENDPOINT_LABEL[item.endpoint]}</span>
          <span className="evidence-muted">Retrieved {new Date(item.retrievedAt).toLocaleString()} • {item.sources.join(', ') || 'source not reported'}{item.apiVersion ? ` • API ${item.apiVersion}` : ''} • {item.timeStandard ?? 'time standard not reported'} • coverage {item.coverage.start ?? '—'} to {item.coverage.end ?? '—'}</span>
          <a className="source-link" href={item.url} target="_blank" rel="noreferrer">Exact request <span>↗</span></a>
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
                <td>{item.profile.seasons.length ? 'Wet and dry, per cell' : '—'}</td>
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

    <div className="evidence-section">
      <h3><Satellite size={16} /> CHALLENGE DATA SOURCES</h3>
      <p className="evidence-muted">The challenge lists several NASA and partner sources. EarthScope verified each one; only the public NASA POWER API feeds this page: MERRA-2 for every variable and GPM IMERG for the rain cross-check. Nothing on this page needs a login.</p>
      <ul className="source-list">
        {CHALLENGE_SOURCES.map((source) => <li key={source.name}>
          <div className="source-head"><span className="evidence-value">{source.name}</span><span className={`source-status is-${source.status}`}>{SOURCE_STATUS_LABEL[source.status]}</span></div>
          <span className="evidence-muted">{source.product} • {source.coverage} • {source.resolution}</span>
          <span className="source-role">{source.role}{source.blocker ? <> <em>{source.blocker}</em></> : null}</span>
        </li>)}
      </ul>
    </div>

    </details>

    <div className="metrics-note"><Info size={16} /><span>{result ? `${descriptor?.label.en ?? variable}: ${METHOD_NOTE[result.trend.display.method]}, Hamed–Rao p-value. ${VERDICT_LABEL[result.trend.verdict]} (${result.trend.criteriaMet} of 5 robustness criteria).${result.trend.claimAllowed ? '' : ' Shown without a trend claim.'}` : 'No values reported before source data and method validation.'}</span></div>
    <div className="evidence-notes">
      {warnings.length ? <div className="caveat-card"><AlertTriangle size={16} /><div><strong>Analysis warnings</strong><p>{warnings.join(' ')}</p></div></div> : <div className="caveat-card"><AlertTriangle size={16} /><div><strong>Interpret with care</strong><p>Local climate patterns are complex. A trend is not attribution, and incomplete data must not be treated as evidence.</p></div></div>}
      <div className="nature-note"><BadgeCheck size={16} /><span>Observation &amp; trend status: <strong>{analysisRequested && !loaded && !error ? 'loading' : loaded ? 'descriptive, source-linked' : 'not yet requested'}</strong></span></div>
    </div>
  </section>
}
