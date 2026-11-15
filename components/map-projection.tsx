'use client'

import type { CSSProperties } from 'react'
import { AlertTriangle, ChevronsLeftRight, Eye, EyeOff, Info, Lock, Pause, Play, TrendingUp } from 'lucide-react'
import type { RegionResponse, VariableId } from '@/lib/api/v2'
import { InfoTip, Term } from '@/components/term'
import { canProject } from '@/components/map-layer'
import { getVariable, PROJECTION_VARIABLE_IDS } from '@/lib/variables/catalog'
import { formatNumber, formatPValue, formatSigned, unitEn } from '@/lib/ui/format'
import { cellMean, directionCounts, skillLabel, type ProjectionMode } from '@/lib/ui/projection-view'

const pText = (p: number | null | undefined) => { const text = formatPValue(p); return text.startsWith('<') ? `p ${text}` : `p = ${text}` }

const PROJECTABLE = PROJECTION_VARIABLE_IDS.map((id) => getVariable(id)?.label.en).filter(Boolean).join(', ')

// Short, visible labels for the API's projection warnings (lib/analysis/projection.ts); the full text sits in
// "How it was tested". An unknown code falls back to its full text.
const SHORT_WARNING: Record<string, string> = {
  'unstable-skill': 'Works in some periods, not all',
  'interval-undercoverage': 'Real uncertainty is larger than shown',
  curvature: 'The series bends; a straight line drifts',
  'growing-variance': 'Scatter is growing; the band is too narrow',
}

const skillText = (skill: number) => skill >= 0 ? `${Math.round(skill * 100)}% better` : `${Math.round(-skill * 100)}% worse`

// Step 3: exploratory linear regression of the grid. After Analyze it plays in a loop from the first to the last year,
// recoloring every cell with its own OLS line (fitted inside the data window, extrapolated after it). Pause stops it;
// dragging the slider pauses on the chosen year. Drawn only when the API's holdout validation passed.
export function ProjectionPanel({ variable, data, active, isLoading, on, onToggle, playing, onPlayToggle, year, onScrub, mode, onMode, startYear, endYear, unavailable }: {
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
  /** Color the cells by the line's value, or by its change since the last data year. */
  mode: ProjectionMode
  onMode: (mode: ProjectionMode) => void
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
  const diagnostics = summary?.diagnostics
  const now = ready && on && data ? cellMean(data, year) : null
  const change = ready && on && data && year !== lastYear ? cellMean(data, year, 'change') : null
  const counts = ready && data ? directionCounts(data) : null

  return <div className="projection-panel">
    <div className="projection-head">
      <div className="field-label"><TrendingUp size={16} /> LINEAR REGRESSION</div>
      <div className="projection-actions">
        <button className="icon-button" type="button" disabled={!ready} onClick={onPlayToggle} aria-label={playing ? 'Pause projection animation' : 'Play projection animation'} title={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
        <button className="export-button" type="button" disabled={!ready} onClick={onToggle} aria-pressed={on && ready}>{on && ready ? <><EyeOff size={16} /> Hide projection</> : <><Eye size={16} /> Show projection</>}</button>
      </div>
    </div>

    <div className="segmented projection-mode" role="group" aria-label="Color the cells by">
      <button type="button" aria-pressed={mode === 'value'} disabled={!ready} onClick={() => onMode('value')} title="Each cell's line value in the chosen year">Value</button>
      <button type="button" aria-pressed={mode === 'change'} disabled={!ready} onClick={() => onMode('change')} title={`How much each cell's line has moved since ${lastYear}`}>Change since {lastYear}</button>
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
      {/* Two-way arrows ride on the thumb so it reads as draggable; pointer events pass through to the range. */}
      <span className="projection-thumb-icon" aria-hidden="true" style={{ '--p': max > min ? (Math.min(max, Math.max(min, year)) - min) / (max - min) : 0 } as CSSProperties}><ChevronsLeftRight size={16} /></span>
      <div className="projection-scale" aria-hidden="true"><span>{min}</span><span style={{ left: `${split}%` }}>{lastYear} · last data</span><span>{max}</span></div>
    </div>

    {ready && on && <p className="projection-readout">
      <strong>{year}</strong>
      {extrapolated ? <span className="projection-phase is-extrapolated">Extrapolated · {year - lastYear} yr past the data</span> : <span className="projection-phase">Fitted line · inside the data</span>}
      {now && <span className="projection-mean">Mean of the {now.count} cells: <b>{formatNumber(now.value, digits)} {unit}</b>{change && <> ({formatSigned(change.value, digits)} {unit} vs the line in {lastYear})</>}</span>}
    </p>}

    {unavailable ? <p className="field-hint">{unavailable}</p>
      : !active ? <p className="field-hint">Press <strong>Analyze region</strong> to fit one line per cell for {descriptor.label.en} ({startYear}–{endYear}) and validate it on {rule.holdoutWindows} windows of {rule.holdoutYears} years.</p>
      : isLoading ? <p className="field-hint">Fitting and validating one line per cell…</p>
      : !summary ? null
      : summary.status !== 'ok' ? <p className="projection-blocked" role="status"><Lock size={16} /> <span><strong>{summary.status === 'blocked-by-quality' ? 'Blocked by quality.' : 'Not enough data.'}</strong> {summary.reason?.en} The heat map still shows the measured data.</span></p>
      : <p className="field-hint">{!on ? 'Show the projection, press play or drag the slider to recolor the grid by year.'
        : playing ? `Playing ${min}–${max}. ${mode === 'change' ? (descriptor.colorRole === 'temperature' ? `Red = rising since ${lastYear}, blue = falling` : `Blue = rising since ${lastYear}, red = falling`) : 'Darker = higher'}. Drag the slider to stop at a year.`
        : 'Paused. Drag the slider or press play.'}</p>}

    {counts && <p className="projection-counts">
      <strong>{counts.rising}</strong> cells rise • <strong>{counts.falling}</strong> fall
      {counts.uncertain > 0 && <> • <span className="legend-swatch-hatch" aria-hidden="true" /> {counts.uncertain} hatched: too weak to tell from noise</>}
    </p>}

    {summary?.status === 'ok' && summary.warnings.length > 0 && <ul className="projection-warnings">
      {summary.warnings.map((warning) => <li key={warning.code}>
        <AlertTriangle size={16} aria-hidden="true" /> <span>{SHORT_WARNING[warning.code] ?? warning.en}</span>
        <InfoTip label={`More about: ${SHORT_WARNING[warning.code] ?? 'this warning'}`}>{warning.en}</InfoTip>
      </li>)}
    </ul>}

    {/* Visible validation: dates and percentages only; the numbers behind them are in "How it was tested". */}
    {holdout && <p className={`projection-summary${holdout.skill < rule.minSkill ? ' is-short' : ''}`}>
      <span>Back-test {holdout.years[0]}–{holdout.years[1]}: <strong>{skillText(holdout.skill)}</strong> than predicting the average (needs {Math.round(rule.minSkill * 100)}%)</span>
      <InfoTip label="What the back-test means">
        The line was fitted on the years before each window ({holdout.windows.map((window) => `${window.years[0]}–${window.years[1]}`).join(', then ')}) and asked to predict it. Its misses are compared with simply predicting the average. It must beat the average by {Math.round(rule.minSkill * 100)}% to be extended.
      </InfoTip>
    </p>}
    {holdout && holdout.windows.length > 1 && <ul className="projection-windows" aria-label="Improvement over the average in each validation window">
      {holdout.windows.map((window) => <li key={window.years[0]} className={window.skill > 0 ? '' : 'is-worse'}>
        <span>{window.years[0]}–{window.years[1]}</span> <strong>{skillLabel(window.skill)}</strong> <span>vs the average</span>
      </li>)}
    </ul>}

    <details className="info-details">
      <summary><Info size={16} /> How it was tested</summary>
    {holdout && <p>
      Validation on {holdout.years[0]}–{holdout.years[1]} (held out, area-weighted series of {holdout.cells} cells, {holdout.points} years): line error (<Term name="rmse">RMSE</Term>) <strong>{formatNumber(holdout.rmseModel, digits)} {unit}</strong> vs <strong>{formatNumber(holdout.rmseBaseline, digits)} {unit}</strong> for the average ({holdout.skill >= 0 ? `${Math.round(holdout.skill * 100)}% better` : `${Math.round(-holdout.skill * 100)}% worse`}; at least {Math.round(rule.minSkill * 100)}% needed) · <strong>{Math.round(holdout.coverage95 * 100)}%</strong> inside the <Term name="predictionInterval">95% prediction interval</Term> · held-out years ran {holdout.bias >= 0 ? 'above' : 'below'} the line by <strong>{formatNumber(Math.abs(holdout.bias), digits)} {unit}</strong> on average.
    </p>}
    {counts && <p>{counts.risingSignificant} of the rising and {counts.fallingSignificant} of the falling cells have a significant trend (<Term name="fieldFdr">field FDR</Term> q &lt; 0.10). Hatched cells (q ≥ 0.10) cannot be told apart from year-to-year noise.</p>}
    {diagnostics && (diagnostics.curvature || diagnostics.variance) && <p>
      Shape checks on the regional series ({diagnostics.years} years): curvature {pText(diagnostics.curvature?.pValue)} · scatter {diagnostics.variance && diagnostics.variance.trend > 0 ? 'growing' : 'shrinking'} over time {pText(diagnostics.variance?.pValue)}. Curvature, or growing scatter, below p {rule.diagnosticAlpha} adds a warning.
    </p>}
    <p>One OLS line per native cell over its complete years ({summary?.fitYears[0] ?? startYear}–{lastYear}); hover a cell for its value and 95% prediction interval. {rule.rationale.en}</p>
    </details>
  </div>
}
