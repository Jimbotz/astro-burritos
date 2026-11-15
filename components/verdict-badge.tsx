import type { Verdict } from '@/lib/api/v2'
import { VERDICT_LABEL } from '@/lib/ui/format'

// Trend verdict from API v2 (pre-declared robustness criteria). The badge style encodes strength, not direction.
export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return <span className={`verdict-badge verdict-${verdict}`}>{VERDICT_LABEL[verdict]}</span>
}
