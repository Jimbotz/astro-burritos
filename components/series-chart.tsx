import { formatNumber } from '@/lib/ui/format'

/**
 * A point that stays round in a stretched viewBox: two zero-length, round-capped, non-scaling strokes (ring and core).
 * An SVG circle would turn into an ellipse under preserveAspectRatio="none".
 */
export function ChartDot({ x, y, title }: { x: number; y: number; title: string }) {
  return <g><title>{title}</title><line x1={x} y1={y} x2={x} y2={y} className="chart-dot-ring" /><line x1={x} y1={y} x2={x} y2={y} className="chart-dot-core" /></g>
}

/** First and last year plus every fifth year between them, skipping any within 2 years of an end so labels never touch. */
export function yearTicks(first: number, last: number) {
  const middle: number[] = []
  for (let year = Math.ceil((first + 1) / 5) * 5; year < last; year += 5) if (year - first > 2 && last - year > 2) middle.push(year)
  return first === last ? [first] : [first, ...middle, last]
}

export type SeriesPoint = { year: number; value: number | null }
export type SeriesLine = { start: { year: number; value: number }; end: { year: number; value: number } }

// Annual series in the same visual language as TrendChart (100×100 viewBox, chart-line / trend-line / chart-dot),
// but placed by year: a missing or incomplete year is a gap in the line, never a zero.
export function SeriesChart({ points, line, reference, zeroLine = false, unit, digits = 2, label, height = 130 }: {
  points: SeriesPoint[]
  line?: SeriesLine | null
  reference?: number | null
  zeroLine?: boolean
  unit: string
  digits?: number
  label: string
  height?: number
}) {
  const valid = points.filter((point): point is { year: number; value: number } => point.value !== null && Number.isFinite(point.value))
  if (!valid.length) return <p className="chart-disclaimer">No complete years to plot in this period.</p>

  const years = points.map((point) => point.year)
  const firstYear = Math.min(...years)
  const lastYear = Math.max(...years)
  const extents = [...valid.map((point) => point.value), ...(line ? [line.start.value, line.end.value] : []), ...(reference !== null && reference !== undefined ? [reference] : []), ...(zeroLine ? [0] : [])]
  const rawLow = Math.min(...extents)
  const rawHigh = Math.max(...extents)
  const pad = (rawHigh - rawLow || Math.abs(rawHigh) || 1) * 0.08
  const low = rawLow - pad
  const high = rawHigh + pad
  const x = (year: number) => (lastYear === firstYear ? 50 : 6 + ((year - firstYear) / (lastYear - firstYear)) * 88)
  const y = (value: number) => 88 - ((value - low) / (high - low)) * 76

  const runs: Array<Array<{ year: number; value: number }>> = []
  let run: Array<{ year: number; value: number }> = []
  for (const point of [...points].sort((a, b) => a.year - b.year)) {
    if (point.value === null || !Number.isFinite(point.value)) {
      if (run.length) runs.push(run)
      run = []
    } else run.push({ year: point.year, value: point.value })
  }
  if (run.length) runs.push(run)

  return <div className="series-chart" style={{ height }}>
    <div className="series-axis-y" aria-hidden="true"><span>{formatNumber(high, digits)}</span><span>{formatNumber(low, digits)}</span></div>
    <svg className="series-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={label}>
      <line x1="0" y1="12" x2="100" y2="12" className="chart-grid-line" />
      <line x1="0" y1="88" x2="100" y2="88" className="chart-grid-line" />
      {zeroLine && low < 0 && high > 0 && <line x1="0" y1={y(0)} x2="100" y2={y(0)} className="chart-zero" />}
      {reference !== null && reference !== undefined && <line x1="0" y1={y(reference)} x2="100" y2={y(reference)} className="chart-reference" />}
      {runs.map((segment) => segment.length > 1 && <polyline key={segment[0].year} points={segment.map((point) => `${x(point.year)},${y(point.value)}`).join(' ')} fill="none" className="chart-line" strokeLinecap="round" strokeLinejoin="round" />)}
      {line && <line x1={x(line.start.year)} y1={y(line.start.value)} x2={x(line.end.year)} y2={y(line.end.value)} className="trend-line" />}
      {valid.map((point) => <ChartDot key={point.year} x={x(point.year)} y={y(point.value)} title={`${point.year}: ${formatNumber(point.value, digits)} ${unit}`} />)}
    </svg>
    <div className="series-axis-x" aria-hidden="true">{yearTicks(firstYear, lastYear).map((year) => <span key={year} style={{ left: `${x(year)}%` }}>{year}</span>)}</div>
  </div>
}
