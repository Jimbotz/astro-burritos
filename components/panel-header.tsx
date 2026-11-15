import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

// Section header from the team mockup, as a solid red band: a step/role badge, a bold title with an optional hint and,
// on the right, the section icon or a short aside (e.g. the evidence record id).
export function PanelHeader({ badge, title, hint, icon: Icon, titleId, aside }: { badge: string; title: string; hint?: string; icon: LucideIcon; titleId?: string; aside?: ReactNode }) {
  return <header className="step-header">
    <span className="step-badge">{badge}</span>
    <h2 className="step-title" id={titleId}>{title}{hint && <span className="step-hint">({hint})</span>}</h2>
    {aside ?? <Icon size={24} className="step-icon" aria-hidden="true" />}
  </header>
}
