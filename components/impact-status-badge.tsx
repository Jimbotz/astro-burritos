import type { Bilingual, ImpactSeverity, ImpactStatus } from '@/lib/api/impact-types'
import { STATUS_ICONS } from '@/lib/ui/impact-icons'
import { severityClass, STATUS_PRESENTATION } from '@/lib/ui/impact-status'

// A status is never shown by colour alone: text label (from the backend), icon, colour class and a description that
// screen readers announce with it.
export function ImpactStatusBadge({ status, severity, label, size = 'md' }: { status: ImpactStatus; severity: ImpactSeverity; label: Bilingual; size?: 'md' | 'lg' }) {
  const presentation = STATUS_PRESENTATION[status]
  const Icon = STATUS_ICONS[presentation.icon]
  return <span className={`impact-status ${severityClass(severity)} is-${size}`} title={presentation.description}>
    <Icon size={size === 'lg' ? 20 : 16} aria-hidden="true" />
    <span>{label.en}</span>
    <span className="sr-only">. {presentation.description}</span>
  </span>
}
