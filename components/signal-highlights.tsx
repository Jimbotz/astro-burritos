import { Activity, TrendingDown, TrendingUp } from 'lucide-react'
import type { PointResponse, VariableId } from '@/lib/api/v2'
import { PanelHeader } from '@/components/panel-header'
import { VerdictBadge } from '@/components/verdict-badge'
import { digitsForUnit, formatSigned, rankSignals, trendDirection, unitEn } from '@/lib/ui/format'

const MAX_ROWS = 6

// Right column, next to the historical chart: the statable signals at this cell (robust or probable, claims allowed),
// ranked so headline variables and larger relative changes come first. Selecting one opens it in the explorer.
export function SignalHighlights({ point, isLoading, error, onFocus }: { point?: PointResponse; isLoading: boolean; error?: Error; onFocus: (id: VariableId) => void }) {
  const ranked = point ? rankSignals(point.variables) : []
  const robust = point?.variables.filter((result) => result.trend.verdict === 'robust' && result.trend.claimAllowed).length ?? 0

  function open(id: VariableId) {
    onFocus(id)
    document.getElementById('signals')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return <aside className="highlights-panel panel" aria-labelledby="highlights-title">
    <PanelHeader badge="Summary" title="Key signals at this cell" icon={Activity} titleId="highlights-title" />
    {isLoading ? <p className="evidence-muted">Processing every variable…</p>
      : error ? <p className="evidence-muted">Signals unavailable: {error.message}</p>
      : !point ? <p className="evidence-muted">Analyze a place to rank the trends that pass the evidence rules.</p>
      : <>
        <p className="highlights-count"><strong>{robust}</strong> of {point.variables.length} variables show a robust trend.</p>
        {ranked.length ? <ol className="highlights-list">
          {ranked.slice(0, MAX_ROWS).map((result) => {
            const direction = trendDirection(result.trend)
            const Arrow = direction === 'up' ? TrendingUp : TrendingDown
            const display = result.trend.display
            return <li key={result.id}>
              <button type="button" onClick={() => open(result.id)}>
                <span className="highlight-name">{result.label.en}</span>
                <span className={`highlight-value ${direction === 'up' ? 'is-up' : 'is-down'}`}><Arrow size={16} aria-hidden="true" />{formatSigned(display.slope, digitsForUnit(display.unit))} {unitEn(display.unit)}</span>
                <VerdictBadge verdict={result.trend.verdict} />
              </button>
            </li>
          })}
        </ol> : <p className="evidence-muted">No variable passes the robustness rules at this cell for this period.</p>}
        <p className="field-hint">Precipitation is never ranked: its trend sign depends on the start year and stations disagree with the reanalysis.</p>
      </>}
  </aside>
}
