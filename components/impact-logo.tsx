import type { ImpactLens, ImpactSeverity } from '@/lib/api/impact-types'

// Representative marks of the two lenses (IMPLEMENTACION_LENTES_IMPACTO §10.3–10.4), drawn inline so they scale and
// follow the page colours. The small signal dot takes the backend's severity: blue/grey without a signal, amber for
// watch or planning, red only when the backend reports priority (alert). The text label always accompanies it.
export function ImpactLogo({ lens, severity = 'neutral', size = 48, title }: { lens: ImpactLens; severity?: ImpactSeverity; size?: number; title?: string }) {
  const label = title ?? (lens === 'water' ? 'Water Signal' : 'Heat Signal')
  return <svg className={`impact-logo is-${lens} is-${severity}`} width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={label}>
    <title>{label}</title>
    {lens === 'water' ? <>
      {/* Two concentric waves under a blue drop */}
      <ellipse cx="24" cy="38" rx="17" ry="4.2" className="logo-wave" />
      <ellipse cx="24" cy="38" rx="10" ry="2.4" className="logo-wave" />
      <path d="M24 6 C 24 6 13 19 13 26.5 A 11 11 0 0 0 35 26.5 C 35 19 24 6 24 6 Z" className="logo-main" />
      <path d="M19 27 a 5 5 0 0 0 5 5" className="logo-shine" />
    </> : <>
      {/* A partly visible sun behind an orange thermometer, with a population dot */}
      <path d="M30 4 A 13 13 0 0 1 43 17" className="logo-sun" />
      <g className="logo-rays"><line x1="41" y1="4" x2="44" y2="1.5" /><line x1="45" y1="10" x2="47" y2="9" /><line x1="34" y1="1" x2="35" y2="-1.5" /></g>
      <rect x="18" y="6" width="9" height="25" rx="4.5" className="logo-tube" />
      <circle cx="22.5" cy="35" r="7.5" className="logo-main" />
      <rect x="20.5" y="14" width="4" height="20" rx="2" className="logo-main" />
      <circle cx="37" cy="36" r="3" className="logo-person" />
      <path d="M32 46 a 5 5 0 0 1 10 0" className="logo-person" />
    </>}
    <circle cx="40" cy="8" r="5.5" className="logo-signal" />
  </svg>
}
