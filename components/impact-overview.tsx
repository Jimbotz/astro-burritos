'use client'

import { useState } from 'react'
import { CircleCheck, CircleMinus, CircleX, Info, Layers, TriangleAlert } from 'lucide-react'
import type { Region } from '@/components/location-selector'
import { PanelHeader } from '@/components/panel-header'
import { ImpactEmptyState } from '@/components/impact-empty-state'
import { ImpactIndicatorCard } from '@/components/impact-indicator-card'
import { ImpactLensSelector } from '@/components/impact-lens-selector'
import { ImpactLimitations } from '@/components/impact-limitations'
import { ImpactLogo } from '@/components/impact-logo'
import { ImpactMapLayer } from '@/components/impact-map-layer'
import { ImpactSourceList } from '@/components/impact-source-list'
import { ImpactStatusBadge } from '@/components/impact-status-badge'
import { useImpact } from '@/hooks/use-earthscope'
import type { HeatImpactResponse, ImpactLens, ImpactResponse, WaterImpactResponse } from '@/lib/api/impact-types'
import { COMPONENT_ICONS } from '@/lib/ui/impact-icons'
import { LENS_NAME, periodText, sourceLine } from '@/lib/ui/impact-presentation'
import { severityClass } from '@/lib/ui/impact-status'
import { formatNumber } from '@/lib/ui/format'

const MODE_LABEL = { 'source-native': 'each source’s own years', 'common-complete-window': 'common complete window', 'fixed-window': 'fixed window' } as const

// Impact lenses section (IMPLEMENTACION_LENTES_IMPACTO §10.1): after Analyze, two selectable lenses; choosing one
// requests GET /api/impact and shows its status, summary, indicators, map, sources, quality and limits.
export function ImpactLenses({ region, startYear, endYear, analysisRequested }: { region: Region; startYear: number; endYear: number; analysisRequested: boolean }) {
  const [lens, setLens] = useState<ImpactLens | null>(null)
  const impact = useImpact(analysisRequested && lens ? { lens, country: region.country, state: region.state, latitude: region.lat, longitude: region.lon, startYear, endYear } : null)
  return <section className="impact-panel panel" aria-labelledby="impact-title" id="impact-lenses">
    <PanelHeader badge="Impact" title="Impact lenses" hint="planning signals, not orders" icon={Layers} titleId="impact-title" />
    <p className="impact-intro">Is there enough evidence to prioritize monitoring, research or municipal preparedness in {region.name}? Each lens separates the climate signal, exposure, data quality, interpretation and limits.</p>
    <ImpactLensSelector value={lens} onChange={setLens} disabled={!analysisRequested} />
    {!analysisRequested ? <ImpactEmptyState kind="needs-analysis" />
      : !lens ? <ImpactEmptyState kind="idle" />
        : impact.error ? <ImpactEmptyState kind="error" message={impact.error.message} onRetry={() => impact.mutate()} />
          : impact.isLoading || !impact.data ? <ImpactEmptyState kind="loading" />
            : <ImpactOverview data={impact.data} />}
  </section>
}

function ComponentRow({ active, label, detail, id }: { id: string; active: boolean | null; label: string; detail: string }) {
  const Icon = COMPONENT_ICONS[id]
  const State = active === null ? CircleMinus : active ? CircleCheck : CircleX
  return <li className={`impact-component ${active === null ? 'is-na' : active ? 'is-on' : 'is-off'}`}>
    <State size={18} aria-hidden="true" />
    {Icon && <Icon size={16} aria-hidden="true" className="impact-component-icon" />}
    <div><strong>{label}</strong> <span className="impact-component-state">{active === null ? 'not conclusive' : active ? 'yes' : 'no'}</span><p>{detail}</p></div>
  </li>
}

export function ImpactOverview({ data }: { data: ImpactResponse }) {
  const decision = data.decisionSupport
  const name = LENS_NAME[data.lens]
  return <div className={`impact-result is-${data.lens}`}>
    <article className={`impact-summary ${severityClass(decision.severity)}`} aria-label={`${name.title} summary`}>
      <div className="impact-summary-head">
        <ImpactLogo lens={data.lens} severity={decision.severity} size={56} />
        <div>
          <p className="impact-eyebrow">{name.title.toUpperCase()}</p>
          <ImpactStatusBadge status={decision.status} severity={decision.severity} label={decision.label} size="lg" />
          <p className="impact-summary-text">{decision.summary.en}</p>
        </div>
      </div>
      <h4 className="impact-subtitle">Components</h4>
      <ul className="impact-components">{decision.componentDetails.map((item) => <ComponentRow key={item.id} id={item.id} active={item.active} label={item.label.en} detail={item.detail.en} />)}</ul>
      <div className="impact-action">
        <strong>Suggested action</strong>
        <p>{decision.recommendedAction.en}</p>
        <span className="impact-action-note">{decision.notMedicalAdvice ? 'A planning signal, not a command or medical advice.' : 'A planning signal, not a command.'}{decision.sensitivity === 'high' ? ' Sensitivity to thresholds: high.' : ''}</span>
      </div>
      <p className="impact-summary-meta"><strong>Source:</strong> {sourceLine(data)} · <strong>Limitation:</strong> {data.limitations[0]?.en}</p>
    </article>

    <p className="impact-scope"><Info size={16} aria-hidden="true" /> {data.scope.reference.label.en}: cell {data.scope.reference.cellId.replace('_', '°, ')}° · {data.period.effective ? `period ${periodText(data.period.effective)} (${MODE_LABEL[data.period.mode]})` : `no usable period in ${periodText(data.period.requested)}${data.period.blocked ? ' (blocked by data quality)' : ''}`} · requested {periodText(data.period.requested)}</p>

    {decision.status === 'insufficient-data' && <div className="impact-insufficient" role="note">
      <strong>There is not enough evidence to issue a signal.</strong>
      <ul>{data.period.sources.map((source) => <li key={source.sourceId}>{source.sourceId}: {source.completeYears} complete years{source.startYear !== null ? ` (${source.startYear}–${source.endYear})` : ''}{source.note ? `. ${source.note.en}` : ''}</li>)}</ul>
      <p>Needed: complete years of every input in the window, plus the 1991–2020 baseline and the last 5 years.</p>
    </div>}

    {data.lens === 'heat' ? <HeatBlocks data={data} /> : <WaterBlocks data={data} />}

    <h4 className="impact-subtitle">Indicators</h4>
    <div className="impact-cards">{data.indicators.map((indicator) => <ImpactIndicatorCard key={indicator.id} indicator={indicator} />)}</div>

    <h4 className="impact-subtitle">Map</h4>
    <ImpactMapLayer key={`${data.lens}-${data.map.stateCode}`} map={data.map} scope={data.scope} />

    {data.warnings.length > 0 && <div className="impact-warnings" role="note"><TriangleAlert size={16} aria-hidden="true" /><ul>{data.warnings.map((item) => <li key={item.en}>{item.en}</li>)}</ul></div>}

    <p className="impact-quality">Data quality at the reference cell: {data.quality.reference ? `${data.quality.reference.valid.toLocaleString('en-US')} of ${data.quality.reference.total.toLocaleString('en-US')} daily NASA POWER records valid${Object.keys(data.quality.reference.flagged).length ? `; flagged: ${Object.entries(data.quality.reference.flagged).map(([flag, count]) => `${flag} ${count}`).join(', ')}` : '; none flagged'}` : 'not available'}.{data.quality.notes.length ? ` ${data.quality.notes.map((note) => note.en).join(' ')}` : ''}</p>

    <ImpactSourceList sources={data.sources} />
    <ImpactLimitations cannotConclude={data.decisionSupport.cannotConclude} limitations={data.limitations} finalStatement={data.finalStatement} />
  </div>
}

function HeatBlocks({ data }: { data: HeatImpactResponse }) {
  return <div className="impact-triple" aria-label="Hazard, exposure and priority">
    <div className="impact-box is-hazard"><h4>Climate hazard</h4><p className="impact-box-value">{data.decisionSupport.label.en}</p><p>{data.hazard.variables.join(', ')} · NASA POWER / MERRA-2</p></div>
    <div className="impact-box is-exposure"><h4>Exposure</h4><p className="impact-box-value">{data.exposure.population !== null ? `${data.exposure.population.toLocaleString('en-US')} people` : 'Not evaluated'}</p><p>{data.exposure.urbanFraction !== null ? `${Math.round(data.exposure.urbanFraction * 100)}% urban · ` : ''}{data.exposure.note.en}</p></div>
    <div className="impact-box is-priority"><h4>Combined priority</h4><p className="impact-box-value">{data.priority.label.en}</p><p>{data.priority.reason.en}</p></div>
  </div>
}

function WaterBlocks({ data }: { data: WaterImpactResponse }) {
  const station = data.validation.station
  return <div className="impact-station">
    <h4>Validation with CONAGUA/SMN</h4>
    {station ? <p>Station <strong>{station.name}</strong> ({station.municipality}, {station.distanceKm} km{station.sameCell ? ', same cell' : ''}): {station.note.en}{station.meanDifferencePercent !== null ? ` POWER’s mean is ${formatNumber(Math.abs(station.meanDifferencePercent), 0)}% ${station.meanDifferencePercent >= 0 ? 'above' : 'below'} the station’s.` : ''}{station.evidence === null ? ' The station has too few base years to judge recent dryness.' : station.evidence ? ` ${station.recentYearsBelowP20} of its last 5 years were below its own 20th percentile (observed evidence).` : ' Its last 5 years show no repeated dry years.'}</p>
      : <p>No bundled SMN station within 30 km of the reference point: rain is not validated here.</p>}
  </div>
}
