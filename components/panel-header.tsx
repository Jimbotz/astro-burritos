import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

// Section header from the team mockup: a purple step/role badge, a bold title and, on the right, the section icon
// or a short aside (e.g. the evidence record id).
export function PanelHeader({ badge, title, icon: Icon, titleId, aside }: { badge: string; title: string; icon: LucideIcon; titleId?: string; aside?: ReactNode }) {
  return <header className="step-header">
    <span className="step-badge">{badge}</span>
    <h2 className="step-title" id={titleId}>{title}</h2>
    {aside ?? <Icon size={24} className="step-icon" aria-hidden="true" />}
  </header>
}
