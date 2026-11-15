import { CircleHelp, MousePointerClick, RotateCcw, TriangleAlert } from 'lucide-react'

// Lens states without results: idle, loading (skeletons, never placeholder numbers), error with a retry path.
export function ImpactEmptyState({ kind, message, onRetry }: { kind: 'idle' | 'loading' | 'error' | 'needs-analysis'; message?: string; onRetry?: () => void }) {
  if (kind === 'loading') return <div className="impact-skeleton" role="status" aria-live="polite">
    <span className="sr-only">Requesting NASA POWER daily data and the bundled CONAGUA and INEGI records…</span>
    <div className="skeleton-line is-wide" /><div className="skeleton-line" />
    <div className="skeleton-grid">{Array.from({ length: 4 }, (_, index) => <div key={index} className="skeleton-card" />)}</div>
  </div>
  if (kind === 'error') return <div className="impact-empty is-error" role="alert">
    <TriangleAlert size={20} aria-hidden="true" />
    <div><strong>The lens could not be computed.</strong><p>{message}</p>{onRetry && <button className="export-button retry-button" type="button" onClick={onRetry}><RotateCcw size={16} /> Try again</button>}</div>
  </div>
  if (kind === 'needs-analysis') return <div className="impact-empty"><MousePointerClick size={20} aria-hidden="true" /><p>Press Analyze region first; then choose a lens.</p></div>
  return <div className="impact-empty"><CircleHelp size={20} aria-hidden="true" /><p>{message ?? 'Choose a lens to request its signal for this place.'}</p></div>
}
