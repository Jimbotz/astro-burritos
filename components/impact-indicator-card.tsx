'use client'

import { useId, useState } from 'react'
import { Activity } from 'lucide-react'
import { SeriesChart } from '@/components/series-chart'
import type { ImpactIndicator } from '@/lib/api/impact-types'
import { INDICATOR_ICONS } from '@/lib/ui/impact-icons'
import { formatImpactValue, impactDigits, periodText, qualityText, trendText } from '@/lib/ui/impact-presentation'
import { formatNumber, unitEn } from '@/lib/ui/format'

type Panel = 'why' | 'source' | 'limits'

// One indicator (IMPLEMENTACION_LENTES_IMPACTO §10.5): name, value, unit, trend, interval, method, source, quality,
// period, resolution and a short description, with Why? / Data source / Limitations panels. Everything comes from the
// backend fields; the card only formats them.
export function ImpactIndicatorCard({ indicator }: { indicator: ImpactIndicator }) {
  const [open, setOpen] = useState<Panel | null>(null)
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const Icon = INDICATOR_ICONS[indicator.id] ?? Activity
  const trend = trendText(indicator)
  const unit = unitEn(indicator.unit)
  const toggle = (panel: Panel) => setOpen((current) => (current === panel ? null : panel))
  const button = (panel: Panel, label: string) => <button type="button" className="impact-card-button" aria-expanded={open === panel} aria-controls={`${id}-${panel}`} onClick={() => toggle(panel)}>{label}</button>

  return <article className="impact-card" aria-labelledby={`${id}-title`}>
    <header className="impact-card-head">
      <Icon size={18} aria-hidden="true" />
      <h4 id={`${id}-title`}>{indicator.label.en}</h4>
    </header>
    <p className="impact-card-value"><strong>{formatImpactValue(indicator)}</strong> <span>{unit}</span></p>
    <p className="impact-card-sub">{indicator.valueLabel.en}</p>
    {trend ? <dl className="impact-card-trend">
      <div><dt>Trend</dt><dd>{trend.claim ? <span className="impact-noclaim">{trend.claim}</span> : <><strong>{trend.rate}</strong> · {trend.verdict}</>}</dd></div>
      <div><dt>Interval</dt><dd>{trend.interval}</dd></div>
      <div><dt>Test</dt><dd>{trend.test}</dd></div>
    </dl> : null}
    <p className="impact-card-desc">{indicator.description.en}</p>
    <p className="impact-card-meta">{periodText(indicator.period)} · {indicator.source.provider} · {indicator.source.resolution} · {qualityText(indicator)}</p>
    <div className="impact-card-actions" role="group" aria-label={`${indicator.label.en} details`}>
      {button('why', 'Why?')}{button('source', 'Data source')}{button('limits', 'Limitations')}
    </div>
    {open === 'why' && <div className="impact-card-panel" id={`${id}-why`}>
      <p>{indicator.interpretation.en}</p>
      <p className="impact-card-method">{indicator.method.en}</p>
      {indicator.recent && indicator.recent.baselineMean !== null && <p className="impact-card-method">Last 5 years: mean {formatNumber(indicator.recent.mean, impactDigits(indicator.unit))} {unit} vs 1991–2020 mean {formatNumber(indicator.recent.baselineMean, impactDigits(indicator.unit))} {unit}{indicator.recent.percentile !== null ? ` (percentile ${Math.round(indicator.recent.percentile * 100)})` : ''}.</p>}
      {indicator.series.length > 2 && <SeriesChart points={indicator.series.map((point) => ({ year: point.year, value: point.complete ? point.value : null }))} unit={unit} digits={impactDigits(indicator.unit)} label={`${indicator.label.en}, annual values`} height={110} />}
    </div>}
    {open === 'source' && <div className="impact-card-panel" id={`${id}-source`}>
      <p><strong>{indicator.source.provider}</strong> · {indicator.source.product}</p>
      <p className="impact-card-method">Resolution: {indicator.source.resolution} · access: {indicator.source.accessMode === 'public-api' ? 'public API, no login' : 'bundled public snapshot'}</p>
      {indicator.source.endpoint.startsWith('http') && <a className="source-link" href={indicator.source.endpoint} target="_blank" rel="noreferrer">Exact request <span>↗</span></a>}
    </div>}
    {open === 'limits' && <div className="impact-card-panel" id={`${id}-limits`}>
      <ul>{indicator.limitations.en.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>}
  </article>
}
