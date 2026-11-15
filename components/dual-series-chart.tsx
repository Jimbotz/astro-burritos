import { yearTicks, type SeriesLine, type SeriesPoint } from '@/components/series-chart'
import { formatNumber } from '@/lib/ui/format'

export type DualSeries = { name: string; points: SeriesPoint[]; line?: SeriesLine | null }

type Valid = { year: number; value: number }

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

// Two annual records on one axis (same viewBox and strokes as SeriesChart): series A in blue, series B in purple,
// each with its own dashed trend line. Placed by year, so gaps stay gaps.
export function DualSeriesChart({ a, b, unit, digits = 0, label, height = 160, zeroLine = false }: { a: DualSeries; b: DualSeries; unit: string; digits?: number; label: string; height?: number; zeroLine?: boolean }) {
  const valid = (points: SeriesPoint[]) => points.filter((point): point is Valid => point.value !== null && Number.isFinite(point.value))
  const all = [...valid(a.points), ...valid(b.points)]
  if (!all.length) return <p className="chart-disclaimer">No complete years to plot in this period.</p>

  const years = [...a.points, ...b.points].map((point) => point.year)
  const firstYear = Math.min(...years)
  const lastYear = Math.max(...years)
  const lines = [a.line, b.line].filter((line): line is SeriesLine => Boolean(line))
  const extents = [...all.map((point) => point.value), ...lines.flatMap((line) => [line.start.value, line.end.value]), ...(zeroLine ? [0] : [])]
  const rawLow = Math.min(...extents)
  const rawHigh = Math.max(...extents)
  const pad = (rawHigh - rawLow || Math.abs(rawHigh) || 1) * 0.08
  const low = rawLow - pad
  const high = rawHigh + pad
  const x = (year: number) => (lastYear === firstYear ? 50 : 6 + ((year - firstYear) / (lastYear - firstYear)) * 88)
  const y = (value: number) => 88 - ((value - low) / (high - low)) * 76

  const series = [{ key: 'a', data: a }, { key: 'b', data: b }] as const
  return <figure className="dual-chart">
    <div className="series-chart" style={{ height }}>
      <div className="series-axis-y" aria-hidden="true"><span>{formatNumber(high, digits)}</span><span>{formatNumber(low, digits)}</span></div>
      <svg className="series-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={label}>
        <line x1="0" y1="12" x2="100" y2="12" className="chart-grid-line" />
        <line x1="0" y1="88" x2="100" y2="88" className="chart-grid-line" />
        {zeroLine && low < 0 && high > 0 && <line x1="0" y1={y(0)} x2="100" y2={y(0)} className="chart-zero" />}
        {series.map(({ key, data }) => <g key={key} className={`dual-series is-${key}`}>
          {runs(data.points).map((segment) => segment.length > 1 && <polyline key={segment[0].year} points={segment.map((point) => `${x(point.year)},${y(point.value)}`).join(' ')} fill="none" className="dual-line" strokeLinecap="round" strokeLinejoin="round" />)}
          {data.line && <line x1={x(data.line.start.year)} y1={y(data.line.start.value)} x2={x(data.line.end.year)} y2={y(data.line.end.value)} className="dual-trend" />}
          {valid(data.points).map((point) => <g key={point.year}><title>{`${data.name} ${point.year}: ${formatNumber(point.value, digits)} ${unit}`}</title><line x1={x(point.year)} y1={y(point.value)} x2={x(point.year)} y2={y(point.value)} className="dual-dot" /></g>)}
        </g>)}
      </svg>
      <div className="series-axis-x" aria-hidden="true">{yearTicks(firstYear, lastYear).map((year) => <span key={year} style={{ left: `${x(year)}%` }}>{year}</span>)}</div>
    </div>
    <figcaption className="dual-legend">
      <span className="dual-key is-a"><span className="dual-swatch" aria-hidden="true" />{a.name}</span>
      <span className="dual-key is-b"><span className="dual-swatch" aria-hidden="true" />{b.name}</span>
      {lines.length > 0 && <span className="dual-key is-trend"><span className="dual-swatch" aria-hidden="true" />Trend line (Sen or OLS)</span>}
    </figcaption>
  </figure>
}
