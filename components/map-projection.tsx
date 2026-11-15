'use client'

import type { CSSProperties } from 'react'
import { AlertTriangle, Eye, EyeOff, Lock, Pause, Play, TrendingUp } from 'lucide-react'
import type { RegionResponse, VariableId } from '@/lib/api/v2'
import { Term } from '@/components/term'
import { canProject } from '@/components/map-layer'
import { predict } from '@/lib/analysis/projection'
import { getVariable, PROJECTION_VARIABLE_IDS } from '@/lib/variables/catalog'
import { formatNumber, formatSigned, unitEn } from '@/lib/ui/format'

/** Plain mean of the cells' line values in one year (a quick read of the slider, not the area-weighted regional series). */
function cellMean(data: RegionResponse, year: number) {
  const floor = data.projection?.rule.floor ?? null
  const values = data.cells.filter((cell) => cell.fit).map((cell) => predict(cell.fit!, year, floor).value)
  return values.length ? { value: values.reduce((sum, value) => sum + value, 0) / values.length, count: values.length } : null
}

const PROJECTABLE = PROJECTION_VARIABLE_IDS.map((id) => getVariable(id)?.label.en).filter(Boolean).join(', ')

// Step 3: exploratory linear regression of the grid. After Analyze it plays in a loop from the first to the last year,
// recoloring every cell with its own OLS line (fitted inside the data window, extrapolated after it). Pause stops it;
// dragging the slider pauses on the chosen year. Drawn only when the API's holdout validation passed.
export function ProjectionPanel({ variable, data, active, isLoading, on, onToggle, playing, onPlayToggle, year, onScrub, startYear, endYear, unavailable }: {
  variable: VariableId
  data?: RegionResponse
  active: boolean
  isLoading: boolean
  on: boolean
  onToggle: () => void
  playing: boolean
  onPlayToggle: () => void
  year: number
  /** The user picked a year: show it and pause. */
  onScrub: (year: number) => void
  startYear: number
  endYear: number
  /** Why no grid will be requested (area too large, request cancelled). */
  unavailable?: string
}) {
  const descriptor = getVariable(variable)
  const rule = descriptor?.profile.projection
  if (!descriptor || !rule) {
    return <div className="projection-panel is-muted">
      <div className="field-label"><TrendingUp size={16} /> LINEAR REGRESSION</div>
      <p className="field-hint">Available for {PROJECTABLE}. {descriptor ? `${descriptor.label.en} is not projected.` : ''}</p>
    </div>
  }

  const summary = data?.projection ?? null
  const ready = canProject(data)
  const [min, max] = summary?.horizon ?? [startYear, endYear + rule.horizonYears]
  const lastYear = summary?.fitYears[1] ?? endYear
  const split = max > min ? ((lastYear - min) / (max - min)) * 100 : 100
  const unit = unitEn(descriptor.unit)
  const digits = descriptor.decimals
  const extrapolated = year > lastYear
  const holdout = summary?.holdout
  const now = ready && on && data ? cellMean(data, year) : null
  const reference = ready && on && data && year !== lastYear ? cellMean(data, lastYear) : null

  return <div className="projection-panel">
    <div className="projection-head">
      <div className="field-label"><TrendingUp size={16} /> LINEAR REGRESSION <span className="signal-tag">Exploratory · not a forecast</span></div>
      <div className="projection-actions">
        <button className="icon-button" type="button" disabled={!ready} onClick={onPlayToggle} aria-label={playing ? 'Pause projection animation' : 'Play projection animation'} title={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
        <button className="export-button" type="button" disabled={!ready} onClick={onToggle} aria-pressed={on && ready}>{on && ready ? <><EyeOff size={16} /> Hide projection</> : <><Eye size={16} /> Show projection</>}</button>
      </div>
    </div>

    <div className="projection-slider">
      <input
        className="projection-range"
        type="range"
        min={min}
        max={max}
        step={1}
        value={Math.min(max, Math.max(min, year))}
        disabled={!ready}
        onChange={(event) => onScrub(Number(event.target.value))}
        aria-label="Projection year"
        aria-valuetext={`${year}, ${extrapolated ? `extrapolated ${year - lastYear} years past the data` : 'fitted line inside the data'}`}
        style={{ '--split': `${split}%` } as CSSProperties}
      />
      <div className="projection-scale" aria-hidden="true"><span>{min}</span><span style={{ left: `${split}%` }}>{lastYear} · last data</span><span>{max}</span></div>
    </div>

    {ready && on && <p className="projection-readout">
      <strong>{year}</strong>
      {extrapolated ? <span className="projection-phase is-extrapolated">Extrapolated · {year - lastYear} yr past the data</span> : <span className="projection-phase">Fitted line · inside the data</span>}
      {now && <span className="projection-mean">Mean of the {now.count} cells: <b>{formatNumber(now.value, digits)} {unit}</b>{reference && <> ({formatSigned(now.value - reference.value, digits)} {unit} vs {lastYear})</>}</span>}
    </p>}

    {unavailable ? <p className="field-hint">{unavailable}</p>
      : !active ? <p className="field-hint">Press <strong>Analyze region</strong> to fit one line per cell for {descriptor.label.en} ({startYear}–{endYear}) and validate it on the last {rule.holdoutYears} years.</p>
      : isLoading ? <p className="field-hint">Fitting and validating one line per cell…</p>
      : !summary ? null
      : summary.status !== 'ok' ? <p className="projection-blocked" role="status"><Lock size={16} /> <span><strong>{summary.status === 'blocked-by-quality' ? 'Blocked by quality.' : 'Not enough data.'}</strong> {summary.reason?.en} The map keeps the step 1 layer.</span></p>
      : <p className="field-hint">{!on ? 'Showing the step 1 layer. Show the projection, press play or drag the slider to recolor the grid by year.'
        : playing ? `Playing ${min}–${max} in a loop: each cell darkens as its line rises and lightens as it falls. Pause or drag the slider to stop at a year.`
        : 'Paused. Drag the slider to any year, or press play to resume the loop.'} Lines rise in {summary.rising} cells and fall in {summary.falling}.</p>}

    {summary?.status === 'ok' && summary.warnings.length > 0 && <ul className="projection-warnings">
      {summary.warnings.map((warning) => <li key={warning.code}><AlertTriangle size={16} aria-hidden="true" /> <span>{warning.en}</span></li>)}
    </ul>}

    {holdout && <p className="projection-validation">
      Validation on {holdout.years[0]}–{holdout.years[1]} (held out, area-weighted series of {holdout.cells} cells, {holdout.points} years): line error (<Term name="rmse">RMSE</Term>) <strong>{formatNumber(holdout.rmseModel, digits)} {unit}</strong> vs <strong>{formatNumber(holdout.rmseBaseline, digits)} {unit}</strong> for the average ({holdout.skill >= 0 ? `${Math.round(holdout.skill * 100)}% better` : `${Math.round(-holdout.skill * 100)}% worse`}; at least {Math.round(rule.minSkill * 100)}% needed) · <strong>{Math.round(holdout.coverage95 * 100)}%</strong> inside the <Term name="predictionInterval">95% prediction interval</Term> · held-out years ran {holdout.bias >= 0 ? 'above' : 'below'} the line by <strong>{formatNumber(Math.abs(holdout.bias), digits)} {unit}</strong> on average.
    </p>}
    <p className="projection-note">One OLS line per native cell over its complete years ({summary?.fitYears[0] ?? startYear}–{lastYear}); hover a cell for its value and 95% prediction interval. {rule.rationale.en}</p>
  </div>
}
