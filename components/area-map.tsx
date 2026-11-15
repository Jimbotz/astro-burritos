'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { Crosshair, Map as MapIcon, MapPin } from 'lucide-react'
import { PanelHeader } from '@/components/panel-header'
import type { Region } from '@/components/location-selector'
import { MapCells, MapLayerPanel, effectiveKind, isMapVariable, type LayerKind } from '@/components/map-layer'
import { useRegionLayer } from '@/hooks/use-earthscope'
import type { VariableId } from '@/lib/api/v2'
import { fitProjection, niceKm, useCountries, useStates } from '@/lib/geo'

const WIDTH = 600
const HEIGHT = 320

const hemisphere = (value: number, positive: string, negative: string) => `${Math.abs(value).toFixed(2)}° ${value >= 0 ? positive : negative}`

// The selected state or country fitted to the box, with neighbors for context and the analysis point.
// Selection happens on the globe and in the selects. An optional data layer (API v2 /api/region) colors the
// native NASA POWER cells inside the boundary; it is off until the user asks for it.
export function AreaMap({ region, startYear, endYear, preferredVariable }: { region: Region; startYear: number; endYear: number; preferredVariable: VariableId }) {
  const countries = useCountries().data?.features
  const states = useStates(region.country).data?.features
  const country = countries?.find((feature) => feature.properties.ADM0_A3 === region.country)
  const state = region.state ? states?.find((feature) => feature.properties.name === region.state) : undefined
  const target = region.state ? state : country
  const title = state?.properties.name ?? country?.properties.NAME
  // useId may contain characters that break url(#…) references, so keep only safe ones.
  const clipId = `area-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  const [layerVariable, setLayerVariable] = useState<VariableId>(isMapVariable(preferredVariable) ? preferredVariable : 'T2M')
  const [layerKind, setLayerKind] = useState<LayerKind>('anomaly')
  const [layerActive, setLayerActive] = useState(false)
  const areaId = `${region.country ?? ''}|${region.state ?? ''}`
  // A new area or period never triggers a grid request by itself (a large country can take a minute).
  useEffect(() => { setLayerActive(false) }, [areaId, startYear, endYear])
  useEffect(() => { if (isMapVariable(preferredVariable)) setLayerVariable(preferredVariable) }, [preferredVariable])
  const layer = useRegionLayer(layerActive && target ? { areaId, variable: layerVariable, startYear, endYear, geometry: target.geometry } : null)
  const layerData = layerActive ? layer.data : undefined

  const map = useMemo(() => {
    if (!target) return null
    const projection = fitProjection(target.geometry, WIDTH, HEIGHT, 24)
    // A selected state shows its sibling states; a whole country shows its states as inner lines.
    const subdivisions = (states ?? []).filter((feature) => feature !== target).map((feature) => projection.path(feature.geometry)).join('')
    const neighbors = (countries ?? []).filter((feature) => feature.properties.ADM0_A3 !== region.country).map((feature) => projection.path(feature.geometry)).join('')
    return { projection, shape: projection.path(target.geometry), subdivisions, neighbors }
  }, [target, states, countries, region.country])

  const coords = `${hemisphere(region.lat, 'N', 'S')} • ${hemisphere(region.lon, 'E', 'W')}`
  const cells = map && layerData ? <g clipPath={`url(#${clipId})`}><MapCells data={layerData} kind={effectiveKind(layerKind, layerData)} project={map.projection.project} /></g> : null

  return <section className="area-panel panel" aria-labelledby="area-title">
    <PanelHeader badge="Step 3" title="Exact place (optional)" icon={Crosshair} />
    <div className="chart-header"><h2 id="area-title">{title ?? 'No area selected'} {state && country && <span className="range-label">{country.properties.NAME}</span>}</h2></div>
    {map ? <>
      <div className="area-map">
        <svg className="area-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Outline of ${region.name} with the analysis point at ${coords}${layerData ? `, colored by ${layerData.variable.label.en}` : ''}`}>
          <defs><clipPath id={clipId}><path d={map.shape} /></clipPath></defs>
          <path className="area-neighbor" d={map.neighbors} />
          {region.state
            ? <><path className="area-context" d={map.subdivisions} /><path className="area-shape" d={map.shape} />{cells}</>
            : <><path className="area-shape" d={map.shape} />{cells}<path className="area-inner" d={map.subdivisions} /></>}
          {cells && <path className="area-outline" d={map.shape} />}
          <circle className="area-point" cx={map.projection.project(region.lon, region.lat)[0]} cy={map.projection.project(region.lon, region.lat)[1]} r="6" />
        </svg>
        <AreaScale kmPerPixel={map.projection.kmPerPixel} />
      </div>
      <div className="globe-caption"><span className="legend-item"><span className="legend-point" /> ANALYSIS POINT</span><span className="globe-location"><MapPin size={16} /> {coords}</span></div>
      <p className="field-hint">NASA POWER analyzes the marked point, not an area average. Boundaries: Natural Earth (public domain).</p>
    </> : <div className="chart-empty" role="status">
      <div className="chart-empty-icon"><MapIcon size={16} /></div>
      <strong>{region.country ? 'Loading boundaries…' : 'No country at this point'}</strong>
      <p>{region.country ? 'Natural Earth outlines load from this site, not an external service.' : 'Select a country or state on the globe or in the list to see its outline.'}</p>
    </div>}
    <MapLayerPanel
      variable={layerVariable}
      onVariable={setLayerVariable}
      kind={layerKind}
      onKind={setLayerKind}
      active={layerActive}
      onToggle={() => setLayerActive((value) => !value)}
      data={layerData}
      isLoading={layerActive && layer.isLoading}
      error={layerActive ? layer.error : undefined}
      areaName={title}
      canRequest={Boolean(target)}
    />
  </section>
}

function AreaScale({ kmPerPixel }: { kmPerPixel: number }) {
  const km = niceKm((WIDTH / 4) * kmPerPixel)
  return <div className="area-scale" style={{ width: `${(km / kmPerPixel / WIDTH) * 100}%` }}><span>{km < 1 ? km.toFixed(1) : km.toLocaleString('en-US')} km</span></div>
}
