import { CloudRain, Droplets, Sprout, Thermometer, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import type { VariableResult } from '@/lib/api/v2'
import { VerdictBadge } from '@/components/verdict-badge'
import { digitsForUnit, formatSigned, trendDirection, unitEn } from '@/lib/ui/format'

export const GROUP_ICON: Record<VariableResult['group'], LucideIcon> = {
  temperature: Thermometer,
  precipitation: CloudRain,
  humidity: Droplets,
  soil: Sprout,
}

// One processed variable at the analysis point: headline change in the variable's own scale (trend.display),
// its 95% interval and the verdict. An arrow appears only when the backend allows a trend claim.
export function SignalCard({ result, selected, onSelect }: { result: VariableResult; selected: boolean; onSelect: () => void }) {
  const { trend } = result
  const display = trend.display
  const digits = digitsForUnit(display.unit)
  const direction = trendDirection(trend)
  const Icon = GROUP_ICON[result.group]
  const Arrow = direction === 'up' ? TrendingUp : TrendingDown
  const small = (trend.verdict === 'robust' || trend.verdict === 'probable') && display.exceedsRelevance === false

  return <button type="button" className={`signal-card ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={onSelect}>
    <span className="signal-card-head"><Icon size={16} aria-hidden="true" /><strong>{result.label.en}</strong></span>
    <span className={`signal-value ${direction === 'up' ? 'is-up' : direction === 'down' ? 'is-down' : ''}`}>
      {direction && <Arrow size={16} aria-hidden="true" />}
      {formatSigned(display.slope, digits)}<small>{unitEn(display.unit)}</small>
    </span>
    <span className="signal-ci">{display.ci95 ? `95% CI ${formatSigned(display.ci95[0], digits)} to ${formatSigned(display.ci95[1], digits)}` : 'Interval not estimable'}</span>
    <span className="signal-foot">
      <VerdictBadge verdict={trend.verdict} />
      {!trend.claimAllowed && <span className="signal-tag">No trend claim</span>}
      {small && <span className="signal-tag">Small change</span>}
    </span>
  </button>
}
