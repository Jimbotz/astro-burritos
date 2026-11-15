'use client'

import { useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { formatNumber, formatSigned } from '@/lib/ui/format'

/**
 * A point that stays round in a stretched viewBox: two zero-length, round-capped, non-scaling strokes (ring and core).
 * An SVG circle would turn into an ellipse under preserveAspectRatio="none".
 */
export function ChartDot({ x, y, active = false }: { x: number; y: number; active?: boolean }) {
  return <g className={active ? 'is-active' : undefined}><line x1={x} y1={y} x2={x} y2={y} className="chart-dot-ring" /><line x1={x} y1={y} x2={x} y2={y} className="chart-dot-core" /></g>
}

/** First and last year plus every fifth year between them, skipping any within 2 years of an end so labels never touch. */
export function yearTicks(first: number, last: number) {
  const middle: number[] = []
  for (let year = Math.ceil((first + 1) / 5) * 5; year < last; year += 5) if (year - first > 2 && last - year > 2) middle.push(year)
  return first === last ? [first] : [first, ...middle, last]
}

/**
 * Point inspection for a chart whose points sit at `xs` (0–100 across the plot): the pointer (mouse, pen, a finger
 * dragging) picks the nearest point, the arrow keys step through them, Escape or leaving clears it.
 */
export function usePointInspector(xs: number[]) {
  const [active, setActive] = useState<number | null>(null)
  const nearest = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const at = ((event.clientX - box.left) / box.width) * 100
    let best = 0
    xs.forEach((x, index) => { if (Math.abs(x - at) < Math.abs(xs[best] - at)) best = index })
    setActive(xs.length ? best : null)
  }
  const svgProps = { onPointerMove: nearest, onPointerDown: nearest, onPointerLeave: () => setActive(null) }
  const keyProps = {
    tabIndex: 0,
    onBlur: () => setActive(null),
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') return setActive(null)
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      if (!step || !xs.length) return
      event.preventDefault()
      setActive((index) => Math.min(xs.length - 1, Math.max(0, index === null ? (step > 0 ? 0 : xs.length - 1) : index + step)))
    },
  }
  return { active, svgProps, keyProps }
}

/** Floating card at a point (x, y in the plot's 0–100 space); it flips sideways near the edges to stay inside. */
export function ChartTip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return <div className={`chart-tip${x > 70 ? ' is-left' : x < 30 ? ' is-right' : ''}`} role="status" style={{ '--tx': x, '--ty': y } as CSSProperties}>{children}</div>
}

export type SeriesPoint = { year: number; value: number | null }
export type SeriesLine = { start: { year: number; value: number }; end: { year: number; value: number } }

// Annual series in the same visual language as TrendChart (100×100 viewBox, chart-line / trend-line / chart-dot),
// but placed by year: a missing or incomplete year is a gap in the line, never a zero. Every point can be inspected:
// its value, the change from the previous plotted year and its distance from the trend line.
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
  const valid = points.filter((point): point is { year: number; value: number } => point.value !== null && Number.isFinite(point.value)).sort((a, b) => a.year - b.year)
  const years = points.map((point) => point.year)
  const firstYear = Math.min(...years)
  const lastYear = Math.max(...years)
  const x = (year: number) => (lastYear === firstYear ? 50 : 6 + ((year - firstYear) / (lastYear - firstYear)) * 88)
  const inspector = usePointInspector(valid.map((point) => x(point.year)))
  if (!valid.length) return <p className="chart-disclaimer">No complete years to plot in this period.</p>

  const extents = [...valid.map((point) => point.value), ...(line ? [line.start.value, line.end.value] : []), ...(reference !== null && reference !== undefined ? [reference] : []), ...(zeroLine ? [0] : [])]
  const rawLow = Math.min(...extents)
  const rawHigh = Math.max(...extents)
  const pad = (rawHigh - rawLow || Math.abs(rawHigh) || 1) * 0.08
  const low = rawLow - pad
  const high = rawHigh + pad
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

  const picked = inspector.active !== null ? valid[inspector.active] : null
  const previous = inspector.active ? valid[inspector.active - 1] : null
  const onLine = picked && line ? line.start.value + (line.end.value - line.start.value) * ((picked.year - line.start.year) / (line.end.year - line.start.year || 1)) : null

  return <div className="series-chart" style={{ height }} {...inspector.keyProps} role="group" aria-label={`${label}. Hover, tap or use the arrow keys to read each year.`}>
    <div className="series-axis-y" aria-hidden="true"><span>{formatNumber(high, digits)}</span><span>{formatNumber(low, digits)}</span></div>
    <svg className="series-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={label} {...inspector.svgProps}>
      <line x1="0" y1="12" x2="100" y2="12" className="chart-grid-line" />
      <line x1="0" y1="88" x2="100" y2="88" className="chart-grid-line" />
      {zeroLine && low < 0 && high > 0 && <line x1="0" y1={y(0)} x2="100" y2={y(0)} className="chart-zero" />}
      {reference !== null && reference !== undefined && <line x1="0" y1={y(reference)} x2="100" y2={y(reference)} className="chart-reference" />}
      {picked && <line x1={x(picked.year)} y1="0" x2={x(picked.year)} y2="100" className="chart-guide" />}
      {runs.map((segment) => segment.length > 1 && <polyline key={segment[0].year} points={segment.map((point) => `${x(point.year)},${y(point.value)}`).join(' ')} fill="none" className="chart-line" strokeLinecap="round" strokeLinejoin="round" />)}
      {line && <line x1={x(line.start.year)} y1={y(line.start.value)} x2={x(line.end.year)} y2={y(line.end.value)} className="trend-line" />}
      {valid.map((point) => <ChartDot key={point.year} x={x(point.year)} y={y(point.value)} active={point === picked} />)}
    </svg>
    {picked && <ChartTip x={x(picked.year)} y={y(picked.value)}>
      <strong>{picked.year}</strong>
      <span className="chart-tip-value">{formatNumber(picked.value, digits)} {unit}</span>
      {previous && <span>{formatSigned(picked.value - previous.value, digits)} vs {previous.year}</span>}
      {onLine !== null && <span>{formatSigned(picked.value - onLine, digits)} vs the trend line</span>}
    </ChartTip>}
    <div className="series-axis-x" aria-hidden="true">{yearTicks(firstYear, lastYear).map((year) => <span key={year} style={{ left: `${x(year)}%` }}>{year}</span>)}</div>
  </div>
}
