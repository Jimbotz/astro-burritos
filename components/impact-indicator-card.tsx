'use client'

import { useId, useState } from 'react'
import { Activity } from 'lucide-react'
import { SeriesChart } from '@/components/series-chart'
import type { ImpactIndicator } from '@/lib/api/impact-types'
import { INDICATOR_ICONS } from '@/lib/ui/impact-icons'
import { cardPalette, formatImpactValue, impactDigits } from '@/lib/ui/impact-presentation'
import { formatNumber, unitEn } from '@/lib/ui/format'

// One indicator, reduced to what a reader needs: the main value, what it means, and a Why? panel with the definition,
// the method and the annual series. Everything comes from the backend fields; the card only formats them. The colour
// family follows the indicator (warm days and nights, hottest day, coldest night, exposed population).
export function ImpactIndicatorCard({ indicator }: { indicator: ImpactIndicator }) {
  const [open, setOpen] = useState(false)
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const Icon = INDICATOR_ICONS[indicator.id] ?? Activity
  const unit = unitEn(indicator.unit)

  return <article className={`impact-card is-${cardPalette(indicator)}`} aria-labelledby={`${id}-title`}>
    <header className="impact-card-head">
      <Icon size={18} aria-hidden="true" />
      <h4 id={`${id}-title`}>{indicator.label.en}</h4>
    </header>
    <p className="impact-card-value"><strong>{formatImpactValue(indicator)}</strong> <span>{unit}</span></p>
    <p className="impact-card-sub">{indicator.valueLabel.en}</p>
    <p className="impact-card-meaning">{indicator.interpretation.en}</p>
    <div className="impact-card-actions">
      <button type="button" className="impact-card-button" aria-expanded={open} aria-controls={`${id}-why`} onClick={() => setOpen(!open)}>Why?</button>
    </div>
    {open && <div className="impact-card-panel" id={`${id}-why`}>
      <p>{indicator.description.en}</p>
      <p className="impact-card-method">{indicator.method.en}</p>
      {indicator.recent && indicator.recent.baselineMean !== null && <p className="impact-card-method">Last 5 years: mean {formatNumber(indicator.recent.mean, impactDigits(indicator.unit))} {unit} vs 1991–2020 mean {formatNumber(indicator.recent.baselineMean, impactDigits(indicator.unit))} {unit}{indicator.recent.percentile !== null ? ` (percentile ${Math.round(indicator.recent.percentile * 100)})` : ''}.</p>}
      {indicator.series.length > 2 && <SeriesChart points={indicator.series.map((point) => ({ year: point.year, value: point.complete ? point.value : null }))} unit={unit} digits={impactDigits(indicator.unit)} label={`${indicator.label.en}, annual values`} height={110} />}
    </div>}
  </article>
}
