/**
 * How each impact status is shown (IMPLEMENTACION_LENTES_IMPACTO §10.6–10.7): never by colour alone. Every status has
 * a text label (from the backend), an icon, a short description and a severity class that the backend chose.
 */
import type { ImpactSeverity, ImpactStatus } from '@/lib/api/impact-types'

export type StatusIconName = 'circle-help' | 'circle-minus' | 'eye' | 'flag' | 'shield-alert'

export const STATUS_PRESENTATION: Record<ImpactStatus, { icon: StatusIconName; description: string }> = {
  'insufficient-data': { icon: 'circle-help', description: 'There is not enough evidence to issue a signal.' },
  'no-detectable': { icon: 'circle-minus', description: 'No robust signal was detected in the analysed window.' },
  watch: { icon: 'eye', description: 'Watch: one component is past its threshold, or the recent load is high without a robust trend.' },
  'planning-signal': { icon: 'flag', description: 'Planning signal: persistent evidence worth including in municipal planning.' },
  corroborated: { icon: 'shield-alert', description: 'Corroborated signal: the climate signal is confirmed by a second, independent line of evidence.' },
}

/** CSS modifier of a severity; `alert` (red) appears only when the backend set it. */
export const severityClass = (severity: ImpactSeverity) => `is-${severity}`

/** The visual states of a lens panel, from the request state and the backend status. */
export type LensViewState = 'idle' | 'loading' | 'error' | ImpactStatus

export function lensViewState(args: { requested: boolean; isLoading: boolean; error?: Error; status?: ImpactStatus }): LensViewState {
  if (!args.requested) return 'idle'
  if (args.error) return 'error'
  if (args.isLoading || !args.status) return 'loading'
  return args.status
}
