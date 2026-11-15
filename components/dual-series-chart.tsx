'use client'

import { ChartTip, usePointInspector, yearTicks, type SeriesLine, type SeriesPoint } from '@/components/series-chart'
import { formatNumber, formatSigned } from '@/lib/ui/format'

export type DualSeries = { name: string; points: SeriesPoint[]; line?: SeriesLine | null }

type Valid = { year: number; value: number }

const validPoints = (points: SeriesPoint[]) => points.filter((point): point is Valid => point.value !== null && Number.isFinite(point.value)).sort((a, b) => a.year - b.year)

/** Consecutive valid years as runs: a missing or incomplete year breaks the line, never drops to zero. */
function runs(points: SeriesPoint[]) {
  const out: Valid[][] = []
  let run: Valid[] = []
  for (const point of [...points].sort((a, b) => a.year - b.year)) {
    if (point.value === null || !Number.isFinite(point.value)) {
      if (run.length) out.push(run)
      run = []
    } else run.push({ year: point.year, value: point.value })
  }
  if (run.length) out.push(run)
  return out
}

// Two annual records on one axis, in the visual language of SeriesChart: series A in blue, series B in purple, each
// with its own dashed trend line, placed by year so gaps stay gaps. Every year can be inspected (pointer, tap or arrow
// keys, as in SeriesChart): both values and the gap between them.
export function DualSeriesChart({ a, b, unit, digits = 0, label, height = 160, zeroLine = false }: { a: DualSeries; b: DualSeries; unit: string; digits?: number; label: string; height?: number; zeroLine?: boolean }) {
  const validA = validPoints(a.points)
  const validB = validPoints(b.points)
  const years = [...a.points, ...b.points].map((point) => point.year)
  const firstYear = Math.min(...years)
  const lastYear = Math.max(...years)
  const x = (year: number) => (lastYear === firstYear ? 50 : 6 + ((year - firstYear) / (lastYear - firstYear)) * 88)
  // Inspectable years: every year with a value in either record.
  const plottedYears = [...new Set([...validA, ...validB].map((point) => point.year))].sort((p, q) => p - q)
  const inspector = usePointInspector(plottedYears.map(x))
  const all = [...validA, ...validB]
  if (!all.length) return <p className="chart-disclaimer">No complete years to plot in this period.</p>

  const lines = [a.line, b.line].filter((line): line is SeriesLine => Boolean(line))
  const extents = [...all.map((point) => point.value), ...lines.flatMap((line) => [line.start.value, line.end.value]), ...(zeroLine ? [0] : [])]
  const rawLow = Math.min(...extents)
  const rawHigh = Math.max(...extents)
  const pad = (rawHigh - rawLow || Math.abs(rawHigh) || 1) * 0.08
  const low = rawLow - pad
  const high = rawHigh + pad
  const y = (value: number) => 88 - ((value - low) / (high - low)) * 76

  const pickedYear = inspector.active !== null ? plottedYears[inspector.active] : null
  const valueA = pickedYear !== null ? validA.find((point) => point.year === pickedYear)?.value ?? null : null
  const valueB = pickedYear !== null ? validB.find((point) => point.year === pickedYear)?.value ?? null : null
  // The card sits at the higher of the two points so it never covers the other one.
  const tipY = valueA !== null && valueB !== null ? y(Math.max(valueA, valueB)) : y((valueA ?? valueB) as number)

  const series = [{ key: 'a', data: a, valid: validA }, { key: 'b', data: b, valid: validB }] as const
  return <figure className="dual-chart">
    <div className="series-chart" style={{ height }} {...inspector.keyProps} role="group" aria-label={`${label}. Hover, tap or use the arrow keys to read each year.`}>
      <div className="series-axis-y" aria-hidden="true"><span>{formatNumber(high, digits)}</span><span>{formatNumber(low, digits)}</span></div>
      <svg className="series-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={label} {...inspector.svgProps}>
        <line x1="0" y1="12" x2="100" y2="12" className="chart-grid-line" />
        <line x1="0" y1="88" x2="100" y2="88" className="chart-grid-line" />
        {zeroLine && low < 0 && high > 0 && <line x1="0" y1={y(0)} x2="100" y2={y(0)} className="chart-zero" />}
        {pickedYear !== null && <line x1={x(pickedYear)} y1="0" x2={x(pickedYear)} y2="100" className="chart-guide" />}
        {series.map(({ key, data, valid }) => <g key={key} className={`dual-series is-${key}`}>
          {runs(data.points).map((segment) => segment.length > 1 && <polyline key={segment[0].year} points={segment.map((point) => `${x(point.year)},${y(point.value)}`).join(' ')} fill="none" className="dual-line" strokeLinecap="round" strokeLinejoin="round" />)}
          {data.line && <line x1={x(data.line.start.year)} y1={y(data.line.start.value)} x2={x(data.line.end.year)} y2={y(data.line.end.value)} className="dual-trend" />}
          {valid.map((point) => <g key={point.year} className={point.year === pickedYear ? 'is-active' : undefined}><line x1={x(point.year)} y1={y(point.value)} x2={x(point.year)} y2={y(point.value)} className="dual-dot" /><line x1={x(point.year)} y1={y(point.value)} x2={x(point.year)} y2={y(point.value)} className="dual-dot-core" /></g>)}
        </g>)}
      </svg>
      {pickedYear !== null && <ChartTip x={x(pickedYear)} y={tipY}>
        <strong>{pickedYear}</strong>
        <span className="dual-tip-row is-a"><span className="dual-swatch" aria-hidden="true" />{a.name}: <b>{valueA !== null ? `${formatNumber(valueA, digits)} ${unit}` : 'incomplete year'}</b></span>
        <span className="dual-tip-row is-b"><span className="dual-swatch" aria-hidden="true" />{b.name}: <b>{valueB !== null ? `${formatNumber(valueB, digits)} ${unit}` : 'incomplete year'}</b></span>
        {valueA !== null && valueB !== null && <span>{b.name} {formatSigned(valueB - valueA, digits)} {unit} vs {a.name}</span>}
      </ChartTip>}
      <div className="series-axis-x" aria-hidden="true">{yearTicks(firstYear, lastYear).map((year) => <span key={year} style={{ left: `${x(year)}%` }}>{year}</span>)}</div>
    </div>
    <figcaption className="dual-legend">
      <span className="dual-key is-a"><span className="dual-swatch" aria-hidden="true" />{a.name}</span>
      <span className="dual-key is-b"><span className="dual-swatch" aria-hidden="true" />{b.name}</span>
      {lines.length > 0 && <span className="dual-key is-trend"><span className="dual-swatch" aria-hidden="true" />Trend line</span>}
    </figcaption>
  </figure>
}
