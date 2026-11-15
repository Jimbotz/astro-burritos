import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ImpactEmptyState } from '../../components/impact-empty-state'
import { ImpactLensSelector } from '../../components/impact-lens-selector'
import { ImpactLogo } from '../../components/impact-logo'
import { ImpactStatusBadge } from '../../components/impact-status-badge'
import { STATUS_LABEL } from '../../lib/api/impact-text'
import type { ImpactStatus } from '../../lib/api/impact-types'
import { lensViewState } from '../../lib/ui/impact-status'

const STATUSES: ImpactStatus[] = ['insufficient-data', 'no-detectable', 'watch', 'planning-signal', 'corroborated']

describe('lens selector and logos', () => {
  it('offers both lenses as keyboard toggle buttons with their logos', () => {
    const html = renderToStaticMarkup(<ImpactLensSelector value="heat" onChange={() => {}} />)
    expect(html).toContain('Water Signal')
    expect(html).toContain('Heat Signal')
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html).toMatch(/is-heat" aria-pressed="true"/)
    expect(html.match(/<svg class="impact-logo/g)).toHaveLength(2)
  })

  it('colours the logo signal from the backend severity, red only for alert', () => {
    expect(renderToStaticMarkup(<ImpactLogo lens="water" severity="alert" />)).toContain('impact-logo is-water is-alert')
    expect(renderToStaticMarkup(<ImpactLogo lens="heat" severity="info" />)).toContain('impact-logo is-heat is-info')
  })
})

describe('statuses are never shown by colour alone', () => {
  it('every status has a text label, an icon and a description for screen readers', () => {
    for (const status of STATUSES) {
      const html = renderToStaticMarkup(<ImpactStatusBadge status={status} severity="warning" label={STATUS_LABEL[status]} />)
      expect(html, status).toContain(STATUS_LABEL[status].en)
      expect(html, status).toContain('<svg')
      expect(html, status).toContain('class="sr-only"')
    }
  })

  it('maps the request state to the visual state: idle, loading, error, then the backend status', () => {
    expect(lensViewState({ requested: false, isLoading: false })).toBe('idle')
    expect(lensViewState({ requested: true, isLoading: true })).toBe('loading')
    expect(lensViewState({ requested: true, isLoading: false, error: new Error('x') })).toBe('error')
    for (const status of STATUSES) expect(lensViewState({ requested: true, isLoading: false, status })).toBe(status)
  })

  it('loads with skeletons and no fictitious numbers, and errors offer a retry', () => {
    const loading = renderToStaticMarkup(<ImpactEmptyState kind="loading" />)
    expect(loading.replace(/<[^>]+>/g, '')).not.toMatch(/\d/)
    expect(loading).toContain('skeleton-card')
    expect(renderToStaticMarkup(<ImpactEmptyState kind="error" message="NASA POWER timed out." onRetry={() => {}} />)).toContain('Try again')
  })
})
