'use client'

import type { ClimatologyPoint } from '@/lib/api/v2'
import { formatNumber, formatSigned, MONTH_INITIALS } from '@/lib/ui/format'
import { ChartDot, ChartTip, usePointInspector } from '@/components/series-chart'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// 1991–2020 monthly climatology of the cell: bars for monthly totals (precipitation), a line for means. Each month can
// be inspected: its value and how far it sits from the average month.
export function ClimatologyChart({ points, unit, digits, bars, label }: { points: ClimatologyPoint[]; unit: string; digits: number; bars: boolean; label: string }) {
  const valid = points.filter((point): point is ClimatologyPoint & { value: number } => point.value !== null)
  const x = (month: number) => 4 + ((month - 0.5) / 12) * 92
  const inspector = usePointInspector(valid.map((point) => x(point.month)))
  if (!valid.length) return null
  const values = valid.map((point) => point.value)
  const low = bars ? 0 : Math.min(...values) - (Math.max(...values) - Math.min(...values) || 1) * 0.1
  const high = Math.max(...values) + (Math.max(...values) - low || 1) * 0.08
  const y = (value: number) => 90 - ((value - low) / (high - low || 1)) * 80
  const slot = 92 / 12
  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  const picked = inspector.active !== null ? valid[inspector.active] : null

  return <div className="climatology-chart" {...inspector.keyProps} role="group" aria-label={`${label}. Hover, tap or use the arrow keys to read each month.`}>
    <div className="series-axis-y" aria-hidden="true"><span>{formatNumber(high, digits)}</span><span>{formatNumber(low, digits)}</span></div>
    <svg className="series-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={label} {...inspector.svgProps}>
      <line x1="0" y1="90" x2="100" y2="90" className="chart-grid-line" />
      {picked && <line x1={x(picked.month)} y1="0" x2={x(picked.month)} y2="100" className="chart-guide" />}
      {bars
        ? valid.map((point) => <rect key={point.month} x={x(point.month) - slot * 0.32} y={y(point.value)} width={slot * 0.64} height={90 - y(point.value)} className={`climatology-bar${point === picked ? ' is-active' : ''}`} />)
        : <>
          <polyline points={valid.map((point) => `${x(point.month)},${y(point.value)}`).join(' ')} fill="none" className="chart-line" strokeLinecap="round" strokeLinejoin="round" />
          {valid.map((point) => <ChartDot key={point.month} x={x(point.month)} y={y(point.value)} active={point === picked} />)}
        </>}
    </svg>
    {picked && <ChartTip x={x(picked.month)} y={y(picked.value)}>
      <strong>{MONTH_NAMES[picked.month - 1]}</strong>
      <span className="chart-tip-value">{formatNumber(picked.value, digits)} {unit}</span>
      <span>{formatSigned(picked.value - average, digits)} vs the average month</span>
    </ChartTip>}
    <div className="climatology-months" aria-hidden="true">{MONTH_INITIALS.map((initial, index) => <span key={index}>{initial}</span>)}</div>
  </div>
}
