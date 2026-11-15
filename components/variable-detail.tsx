'use client'

import { useState } from 'react'
import { AlertTriangle, CalendarRange, Check, Download, Info, ListChecks, X } from 'lucide-react'
import type { RobustTrend, VariableResult } from '@/lib/api/v2'
import { getVariable } from '@/lib/variables/catalog'
import { ClimatologyChart } from '@/components/climatology-chart'
import { SeriesChart, type SeriesLine } from '@/components/series-chart'
import { VerdictBadge } from '@/components/verdict-badge'
import { digitsForUnit, formatNumber, formatPValue, formatSigned, unitEn } from '@/lib/ui/format'

const METHOD_LABEL = { 'ols-hamed-rao': 'OLS slope • block-bootstrap interval', 'sen-mann-kendall': 'Sen slope • Gilbert interval' } as const
const SCALE_LABEL = { absolute: 'absolute change', 'relative-percent': '% of the 1991–2020 mean', 'percentage-points': 'percentage points' } as const

const CRITERIA: Array<{ key: keyof NonNullable<RobustTrend['criteria']>; label: string }> = [
  { key: 'R1_qValue', label: 'Significant after multiple-testing control (q < 0.05)' },
  { key: 'R2_primaryInterval', label: '95% interval of the primary method excludes zero' },
  { key: 'R3_tfpw', label: 'Holds after trend-free pre-whitening (p < 0.05)' },
  { key: 'R4_jackknife', label: 'Same sign and significance when any one year is removed' },
  { key: 'R5_sensitivityWindow', label: 'Same direction in the sensitivity window' },
]

type Mode = 'values' | 'anomalies'

// Detail of the variable selected in the explorer: series with the primary-method trend, anomalies against
// 1991–2020, monthly climatology, seasonal sub-series and the five robustness criteria.
export function VariableDetail({ result, startYear, endYear }: { result: VariableResult; startYear: number; endYear: number }) {
  const [mode, setMode] = useState<Mode>('values')
  const descriptor = getVariable(result.id)
  const { trend, profile, baseline } = result
  const display = trend.display
  const unit = unitEn(result.unit)
  const valueDigits = descriptor?.decimals ?? 2
  const slopeDigits = digitsForUnit(display.unit)
  const nativeDigits = digitsForUnit(result.trendUnit) // detectable trend and sensitivity stay in native units (e.g. mm/decade)
  const anomalyUnit = unitEn(baseline.anomalyUnit)
  const toAnomaly = (value: number) => baseline.mean === null ? null : baseline.anomalyKind === 'percent' ? (baseline.mean > 0 ? ((value - baseline.mean) / baseline.mean) * 100 : null) : value - baseline.mean
  const rawLine = display.method === 'sen-mann-kendall' ? trend.lines.sen : trend.lines.ols
  const anomalyLine: SeriesLine | null = rawLine && baseline.mean !== null ? (() => {
    const start = toAnomaly(rawLine.start.value)
    const end = toAnomaly(rawLine.end.value)
    return start === null || end === null ? null : { start: { year: rawLine.start.year, value: start }, end: { year: rawLine.end.year, value: end } }
  })() : null
  const anomalies = mode === 'anomalies' && baseline.mean !== null
  const points = result.annual.map((point) => ({ year: point.year, value: anomalies ? point.anomaly ?? null : point.complete ? point.value : null }))

  function exportCsv() {
    const rows = ['year,value,unit,anomaly,anomaly_unit,complete', ...result.annual.map((point) => [point.year, point.value ?? '', result.unit, point.anomaly ?? '', baseline.anomalyUnit, point.complete].join(','))]
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }))
    link.download = `earthscope-${result.id}-${startYear}-${endYear}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return <article className="variable-detail" aria-labelledby={`detail-${result.id}`}>
    <div className="detail-head">
      <div>
        <h3 id={`detail-${result.id}`}>{result.label.en}</h3>
        {descriptor && <p className="detail-description">{descriptor.description.en}</p>}
      </div>
      <div className="chart-actions">
        <div className="segmented" role="group" aria-label="Series mode">
          <button type="button" aria-pressed={mode === 'values'} onClick={() => setMode('values')}>Values</button>
          <button type="button" aria-pressed={mode === 'anomalies'} disabled={baseline.mean === null} onClick={() => setMode('anomalies')}>Anomalies</button>
        </div>
        <button className="export-button" type="button" onClick={exportCsv} aria-label={`Export ${result.label.en} annual series as CSV`}><Download size={16} /> CSV</button>
      </div>
    </div>

    <div className="detail-grid">
      <div className="detail-main">
        <div className="chart-result-meta"><span>{anomalies ? `Anomaly vs 1991–2020 • ${anomalyUnit}` : `Annual value • ${unit}`}</span><span>{METHOD_LABEL[display.method]}</span></div>
        <SeriesChart
          points={points}
          line={anomalies ? anomalyLine : rawLine}
          reference={anomalies ? null : profile.expectedValue}
          zeroLine={anomalies}
          unit={anomalies ? anomalyUnit : unit}
          digits={anomalies ? slopeDigits : valueDigits}
          label={`${result.label.en}, ${anomalies ? 'anomalies' : 'annual values'} ${startYear}–${endYear}`}
        />
        <p className="chart-disclaimer">
          Dashed line: {display.method === 'sen-mann-kendall' ? 'Sen' : 'OLS'} trend over the complete years.
          {profile.expectedValue !== null && !anomalies && ` Thin line: ${profile.expectedValue}% expected by construction in 1991–2020.`}
          {' '}Gaps are incomplete years; nothing is filled in.
        </p>

        {result.climatology && <div className="detail-block">
          <h4><CalendarRange size={16} /> 1991–2020 monthly climatology</h4>
          <ClimatologyChart points={result.climatology} unit={result.unit === 'mm' ? 'mm/month' : unit} digits={valueDigits} bars={result.group === 'precipitation'} label={`${result.label.en}: average by month, 1991–2020`} />
        </div>}

        {result.seasons.length > 0 && <div className="detail-block">
          <h4><CalendarRange size={16} /> By season</h4>
          <ul className="season-list">
            {result.seasons.map((season) => <li key={season.id}>
              <span>{season.label.en}</span>
              <strong>{formatSigned(season.trend.display.slope, slopeDigits)} {unitEn(season.trend.display.unit)}</strong>
              <VerdictBadge verdict={season.trend.verdict} />
            </li>)}
          </ul>
          <p className="chart-disclaimer">Seasons form their own multiple-testing family, so they do not change the annual result.</p>
        </div>}
      </div>

      <aside className="detail-side">
        <div className="detail-headline">
          <span className="detail-headline-label">Change per decade • {SCALE_LABEL[display.scale]}</span>
          <strong>{formatSigned(display.slope, slopeDigits)} <small>{unitEn(display.unit)}</small></strong>
          <span className="signal-ci">{display.ci95 ? `95% CI ${formatSigned(display.ci95[0], slopeDigits)} to ${formatSigned(display.ci95[1], slopeDigits)}` : 'Interval not estimable'}</span>
          <VerdictBadge verdict={trend.verdict} />
        </div>
        <div className="metric-row"><span>Hamed–Rao p-value</span><strong>{formatPValue(trend.pValueHamedRao)}</strong></div>
        <div className="metric-row"><span>q-value (13 variables)</span><strong>{formatPValue(trend.qValue)}</strong></div>
        <div className="metric-row"><span>Smallest detectable trend</span><strong>{formatNumber(trend.minimumDetectablePerDecade, nativeDigits)} {unitEn(result.trendUnit)}</strong></div>
        <div className="metric-row"><span>Relevance threshold</span><strong>{profile.relevanceThreshold} {unitEn(profile.displayUnit)}</strong></div>
        <div className="metric-row"><span>Complete years</span><strong>{trend.nYears}</strong></div>
        {trend.sensitivity && <div className="metric-row"><span>Sensitivity {trend.sensitivity.startYear}–{trend.sensitivity.endYear}</span><strong>{formatSigned(trend.sensitivity.slopePerDecade, nativeDigits)} {unitEn(result.trendUnit)}</strong></div>}

        <h4 className="criteria-title"><ListChecks size={16} /> Robustness criteria • {trend.criteriaMet}/5</h4>
        {trend.criteria ? <ul className="criteria-list">
          {CRITERIA.map((criterion) => {
            const met = trend.criteria?.[criterion.key]
            return <li key={criterion.key} className={met ? 'met' : 'unmet'}>{met ? <Check size={16} aria-label="Met" /> : <X size={16} aria-label="Not met" />}<span>{criterion.label}</span></li>
          })}
        </ul> : <p className="evidence-muted">Criteria need at least 10 complete years.</p>}
      </aside>
    </div>

    {(trend.warnings.length > 0 || (descriptor?.caveats.en.length ?? 0) > 0) && <div className="caveat-card detail-caveats">
      <AlertTriangle size={16} />
      <div>
        <strong>Read with care</strong>
        <ul>
          {trend.warnings.map((warning) => <li key={warning.code}>{warning.en}</li>)}
          {descriptor?.caveats.en.map((caveat) => <li key={caveat}>{caveat}</li>)}
        </ul>
      </div>
    </div>}
    <p className="detail-rationale"><Info size={16} /><span>{profile.rationale.en}</span></p>
  </article>
}
