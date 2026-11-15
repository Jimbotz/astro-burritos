'use client'

import { useState, type ReactNode } from 'react'
import { CircleCheck, CircleHelp, CircleX, CloudRain, GitCompareArrows, Info, LoaderCircle, RotateCcw } from 'lucide-react'
import type { Region } from '@/components/location-selector'
import { DualSeriesChart } from '@/components/dual-series-chart'
import { PanelHeader } from '@/components/panel-header'
import { Term } from '@/components/term'
import { VerdictBadge } from '@/components/verdict-badge'
import { usePointAnalysis } from '@/hooks/use-earthscope'
import { compareTrends } from '@/lib/analysis/concordance'
import type { AnnualPoint, CrosscheckComparison, CrosscheckResponse, PointResponse, VariableId, VariableResult } from '@/lib/api/v2'
import { COMPARE_PLACES, comparePlace, levelSentence, PLACE_AGREEMENT_LABEL, placeEvidence, placeSentence, pText, reasonText, sameCell, SOURCE_AGREEMENT_LABEL, sourceChecks, sourceTrendSentence, yearToYearSentence, type CheckState, type ComparePlaceId } from '@/lib/ui/crosscheck-view'
import { digitsForUnit, formatNumber, formatPValue, formatSigned, unitEn } from '@/lib/ui/format'
import { VARIABLES } from '@/lib/variables/catalog'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthSpan = (months: number[]) => `${MONTHS[months[0] - 1]}–${MONTHS[months[months.length - 1] - 1]}`
const plotted = (annual: AnnualPoint[]) => annual.map((point) => ({ year: point.year, value: point.complete ? point.value : null }))

const CHECK_ICON = { yes: CircleCheck, no: CircleX, unknown: CircleHelp } as const
const CHECK_WORD: Record<CheckState, string> = { yes: 'Yes', no: 'No', unknown: 'Not settled' }

function Check({ state, question, children }: { state: CheckState; question: string; children: ReactNode }) {
  const Icon = CHECK_ICON[state]
  return <li className={`check is-${state}`}>
    <Icon size={20} aria-hidden="true" />
    <div><strong>{question} <span className="check-word">{CHECK_WORD[state]}</span></strong>{children}</div>
  </li>
}

// The second NASA rain record for the analysis cell (GET /api/crosscheck): the same three questions for any place,
// a verdict in words (agree, disagree, inconclusive) and the reasons to trust it or not. Never an increase/decrease claim.
export function RainCrosscheck({ place, data, isLoading, error, analysisRequested, onRetry }: { place: string; data?: CrosscheckResponse; isLoading: boolean; error?: Error; analysisRequested: boolean; onRetry: () => void }) {
  const [view, setView] = useState<CrosscheckComparison['id']>('annual')
  const comparison = data?.comparisons.find((item) => item.id === view) ?? data?.comparisons[0]

  return <section className="crosscheck-panel panel" aria-labelledby="rain-check-title">
    <PanelHeader badge="Cross-check" title="Two NASA rain records" hint="MERRA-2 vs IMERG" icon={CloudRain} titleId="rain-check-title" />
    <p className="crosscheck-intro">Does a second NASA record, built a different way, tell the same rain story for {place}?</p>
    {!analysisRequested ? <p className="crosscheck-empty">Press Analyze region to compare the two rain records.</p>
      : error ? <div className="crosscheck-empty" role="alert"><p>{error.message}</p><button className="export-button retry-button" type="button" onClick={onRetry}><RotateCcw size={16} /> Try again</button></div>
      : isLoading || !data || !comparison ? <p className="crosscheck-empty" role="status"><LoaderCircle size={16} className="results-spinner" /> Requesting MERRA-2 and GPM IMERG rain from NASA POWER…</p>
      : <RainBody data={data} comparison={comparison} view={view} onView={setView} />}
  </section>
}

function RainBody({ data, comparison, view, onView }: { data: CrosscheckResponse; comparison: CrosscheckComparison; view: CrosscheckComparison['id']; onView: (id: CrosscheckComparison['id']) => void }) {
  const checks = sourceChecks(comparison)
  const { merra2, imerg } = comparison
  return <>
    <div className="crosscheck-toolbar">
      {data.comparisons.length > 1 && <div className="segmented" role="group" aria-label="Rain series">
        {data.comparisons.map((item) => <button key={item.id} type="button" aria-pressed={item.id === view} onClick={() => onView(item.id)}>{item.id === 'annual' ? 'Annual rain' : `Wet season (${monthSpan(item.months)})`}</button>)}
      </div>}
      <span className={`agreement-chip is-${comparison.trend.agreement}`}>Trend: {SOURCE_AGREEMENT_LABEL[comparison.trend.agreement]}</span>
    </div>
    <DualSeriesChart a={{ name: 'MERRA-2', points: plotted(merra2.annual), line: merra2.trend.line }} b={{ name: 'GPM IMERG', points: plotted(imerg.annual), line: imerg.trend.line }} unit="mm" label={`${comparison.label.en} from MERRA-2 and GPM IMERG, ${data.window.startYear}–${data.window.endYear}`} />
    <ol className="check-list">
      <Check state={checks.level} question="Same amount of rain?"><p>{levelSentence(comparison.level)}</p></Check>
      <Check state={checks.yearToYear} question="Same wet and dry years?"><p>{yearToYearSentence(comparison.level)}</p></Check>
      <Check state={checks.trend} question="Same trend?"><p>{sourceTrendSentence(comparison)}</p></Check>
    </ol>
    <details className="crosscheck-why" open>
      <summary>Why trust this result, or not</summary>
      <ul>{comparison.reasons.map((reason) => <li key={reason}>{reasonText(reason, comparison)}</li>)}</ul>
    </details>
    {/* The numbers behind the three answers and the fixed rules, folded as in the rest of the page. */}
    <details className="info-details crosscheck-tested">
      <summary><Info size={16} /> How it was tested</summary>
      <div className="check-table-wrap">
        <table className="check-table">
          <thead><tr><th scope="col">Record</th><th scope="col">Sen trend</th><th scope="col"><Term name="ci95">95% interval</Term></th><th scope="col"><Term name="hamedRao">Hamed–Rao p</Term></th><th scope="col"><Term name="mannKendall">Mann–Kendall p</Term></th><th scope="col">Years</th></tr></thead>
          <tbody>{[merra2, imerg].map((source) => <tr key={source.id}>
            <th scope="row">{source.id === 'merra2' ? 'MERRA-2' : 'GPM IMERG'}</th>
            <td>{formatSigned(source.trend.senPerDecade, 0)} mm/decade</td>
            <td>{source.trend.ci95SenPerDecade ? `${formatSigned(source.trend.ci95SenPerDecade[0], 0)} to ${formatSigned(source.trend.ci95SenPerDecade[1], 0)}` : '—'}</td>
            <td>{pText(source.trend.pValueHamedRao)}</td>
            <td>{pText(source.trend.pValueMannKendall)}</td>
            <td>{source.trend.nYears}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p>Rules fixed in advance: a record detects a trend when its Hamed–Rao p &lt; {data.rules.alpha}. <strong>Agree</strong> = both detect one of the same sign with overlapping 95% intervals; <strong>disagree</strong> = opposite signs or intervals that do not overlap; otherwise <strong>inconclusive</strong>. Same amount = means within ±{data.rules.levelTolerancePercent}%; wet and dry years compare the records after removing each one’s trend.</p>
      <p>MERRA-2 (a weather model corrected with rain gauges) and GPM IMERG (satellites calibrated with rain gauges), both from the NASA POWER API. IMERG: {data.footprint.pixelCount} pixels of {data.footprint.pixelDegrees}° averaged over the same 0.5° × 0.625° cell. Window {data.window.startYear}–{data.window.endYear}{data.window.clippedToImerg ? ' (IMERG starts in 1998)' : ''}. Rain is never stated as rising or falling.</p>
    </details>
  </>
}

const POINT_VARIABLES = VARIABLES.filter((variable) => variable.availability.point)

function PlaceColumn({ name, result }: { name: string; result?: VariableResult }) {
  const display = result?.trend.display
  const unit = unitEn(display?.unit ?? '')
  const digits = digitsForUnit(unit)
  return <div className="place-column">
    <h3>{name}</h3>
    {result ? <dl className="place-metrics">
      <div><dt>Verdict</dt><dd><VerdictBadge verdict={result.trend.verdict} />{!result.trend.claimAllowed && <> <span className="signal-tag">No trend claim</span></>}</dd></div>
      <div><dt>Change per decade</dt><dd>{formatSigned(display?.slope, digits)} {unit}</dd></div>
      <div><dt><Term name="ci95">Likely range</Term></dt><dd>{display?.ci95 ? `${formatSigned(display.ci95[0], digits)} to ${formatSigned(display.ci95[1], digits)}` : '—'}</dd></div>
    </dl> : <p className="crosscheck-empty">—</p>}
  </div>
}

/** One place's numbers behind its column, for "How it was tested". */
function placeTested(name: string, point: PointResponse | undefined, result: VariableResult) {
  const cell = point ? `cell ${formatNumber(point.support.centerLat, 2)}°, ${formatNumber(point.support.centerLon, 3)}° at ${point.support.elevationM !== null ? `${Math.round(point.support.elevationM).toLocaleString('en-US')} m` : 'an unreported elevation'}` : 'cell not reported'
  return <p key={name}><strong>{name}</strong>: {cell}; Hamed–Rao p {formatPValue(result.trend.pValueHamedRao)}; {result.trend.nYears} complete years; {result.trend.criteriaMet} of 5 checks.</p>
}

// The same variable, period and tests at a second place (a second GET /api/point). Each place is its own MERRA-2 cell.
export function PlaceComparison({ region, variable, point, compareWith, onCompareWith, startYear, endYear, analysisRequested }: {
  region: Region
  variable: VariableId
  point?: PointResponse
  compareWith: ComparePlaceId | null
  onCompareWith: (id: ComparePlaceId | null) => void
  startYear: number
  endYear: number
  analysisRequested: boolean
}) {
  const [chosenVariable, setChosenVariable] = useState<VariableId | null>(null)
  const compareVariable = chosenVariable ?? variable
  const other = comparePlace(compareWith)
  const duplicate = other ? sameCell(other, region) : false
  const second = usePointAnalysis(analysisRequested && other && !duplicate ? { latitude: other.lat, longitude: other.lon, startYear, endYear } : null)
  const resultA = point?.variables.find((item) => item.id === compareVariable)
  const resultB = second.data?.variables.find((item) => item.id === compareVariable)
  const comparison = resultA && resultB ? compareTrends(placeEvidence(resultA.trend), placeEvidence(resultB.trend)) : null
  const claimAllowed = resultA?.trend.claimAllowed ?? true
  const unit = unitEn(resultA?.unit ?? '')
  const line = (result?: VariableResult) => (result ? (result.trend.display.method === 'sen-mann-kendall' ? result.trend.lines.sen : result.trend.lines.ols) : null)

  return <section className="crosscheck-panel panel" aria-labelledby="place-check-title">
    <PanelHeader badge="Cross-check" title="Two places, same rules" hint="local or shared?" icon={GitCompareArrows} titleId="place-check-title" />
    <p className="crosscheck-intro">The same NASA POWER variable, period and tests at a second place.</p>
    <div className="crosscheck-toolbar">
      <label className="crosscheck-select">Compare with
        <select value={compareWith ?? ''} onChange={(event) => onCompareWith((event.target.value || null) as ComparePlaceId | null)}>
          <option value="">Choose a place</option>
          {COMPARE_PLACES.map((place) => <option key={place.id} value={place.id} disabled={sameCell(place, region)}>{place.name}</option>)}
        </select>
      </label>
      <label className="crosscheck-select">Variable
        <select value={compareVariable} onChange={(event) => setChosenVariable(event.target.value as VariableId)}>
          {POINT_VARIABLES.map((item) => <option key={item.id} value={item.id}>{item.label.en}</option>)}
        </select>
      </label>
      {comparison && <span className={`agreement-chip is-${claimAllowed ? comparison.agreement : 'insufficient-data'}`}>{claimAllowed ? PLACE_AGREEMENT_LABEL[comparison.agreement] : 'No rain claim'}</span>}
    </div>
    {!analysisRequested ? <p className="crosscheck-empty">Press Analyze region, then choose a place to compare.</p>
      : !other ? <p className="crosscheck-empty">Choose a place to compare with {region.name}.</p>
      : duplicate ? <p className="crosscheck-empty">{other.name} falls in the same MERRA-2 cell as {region.name}. Choose another place.</p>
      : second.error ? <div className="crosscheck-empty" role="alert"><p>{second.error.message}</p><button className="export-button retry-button" type="button" onClick={() => second.mutate()}><RotateCcw size={16} /> Try again</button></div>
      : !resultA || !resultB ? <p className="crosscheck-empty" role="status"><LoaderCircle size={16} className="results-spinner" /> Requesting NASA POWER data for {other.name}…</p>
      : <>
        <div className="place-columns">
          <PlaceColumn name={region.name} result={resultA} />
          <PlaceColumn name={other.name} result={resultB} />
        </div>
        <DualSeriesChart a={{ name: region.name, points: plotted(resultA.annual), line: line(resultA) }} b={{ name: other.name, points: plotted(resultB.annual), line: line(resultB) }} unit={unit} digits={digitsForUnit(unit)} label={`${resultA.label.en} in ${region.name} and ${other.name}, ${startYear}–${endYear}`} />
        {comparison && <p className="place-sentence">{placeSentence(comparison, [region.name, other.name], claimAllowed)}</p>}
        <details className="info-details crosscheck-tested">
          <summary><Info size={16} /> How it was tested</summary>
          {placeTested(region.name, point, resultA)}
          {placeTested(other.name, second.data, resultB)}
          <p>Each value describes a whole 0.5° × 0.625° MERRA-2 cell, not a city or a station. Same rules as the two rain records: a place detects a trend when its Hamed–Rao p &lt; 0.05, and two places differ when their trends have opposite signs or their 95% intervals do not overlap.</p>
        </details>
      </>}
  </section>
}
