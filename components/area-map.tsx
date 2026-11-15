'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { Map as MapIcon, MapPin, MapPinned } from 'lucide-react'
import { PanelHeader } from '@/components/panel-header'
import type { Region } from '@/components/location-selector'
import { MapCells, MapLayerResult, MapLegend, canProject, effectiveKind, isMapVariable, type LayerKind } from '@/components/map-layer'
import { ProjectionPanel } from '@/components/map-projection'
import { useRegionLayer } from '@/hooks/use-earthscope'
import { useReducedMotion } from '@/hooks/use-browser'
import type { VariableId } from '@/lib/api/v2'
import { countCellsInside, expandForCells, geometryBBox, type PolygonGeometry } from '@/lib/analysis/region'
import { tilesFor } from '@/lib/nasa/power'
import { fitProjection, niceKm, useCountries, useStates } from '@/lib/geo'
import type { ProjectionMode } from '@/lib/ui/projection-view'

const WIDTH = 600
const HEIGHT = 320
// Projection animation: one year per tick, a longer hold on the last year before it loops back to the first.
const YEAR_MS = 500
const END_HOLD_MS = 1600
// Grid size guard for the map: above this many cells inside the state the user is asked for a smaller one.
// The API itself accepts up to 2,500. Measured 2026-11-14: about 2.5 s per uncached 5° POWER block (Mexico: 35 blocks, 87 s).
export const MAP_MAX_CELLS = 800
const SECONDS_PER_TILE = 2.5

/** Projection controls for one loaded response (`key`); a new response starts again from the defaults. */
type ProjectionUi = { key: string | null; on: boolean; playing: boolean; year: number; mode: ProjectionMode }

const hemisphere = (value: number, positive: string, negative: string) => `${Math.abs(value).toFixed(2)}° ${value >= 0 ? positive : negative}`

/**
 * Outline and map-grid size for a region, shared by the step 3 map and the step 1 wait card (SWR dedupes the geo
 * requests). The grid is for states only: a whole country mixes very different climates and multiplies the POWER
 * blocks, so a country alone draws its outline and asks for a state (`needsState`); its point analysis still runs.
 * Cells are counted inside the state; the time is worst case, from the aligned 5° POWER blocks of the box the server fetches.
 */
export function useGridArea(region: Region) {
  const countries = useCountries().data?.features
  const states = useStates(region.country).data?.features
  const country = countries?.find((feature) => feature.properties.ADM0_A3 === region.country)
  const state = region.state ? states?.find((feature) => feature.properties.name === region.state) : undefined
  const estimate = useMemo(() => {
    if (!state) return null
    const geometry = state.geometry as unknown as PolygonGeometry
    const box = expandForCells(geometryBBox(geometry))
    const tiles = tilesFor(box).length
    return { cells: countCellsInside(geometry, box), tiles, seconds: Math.max(3, Math.round(tiles * SECONDS_PER_TILE)) }
  }, [state])
  return {
    countries, states, country, state,
    target: region.state ? state : country,
    title: state?.properties.name ?? country?.properties.NAME,
    estimate,
    tooLarge: estimate !== null && estimate.cells > MAP_MAX_CELLS,
    needsState: Boolean(region.country) && !region.state,
  }
}

// The selected state or country fitted to the box, with neighbors for context and the analysis point.
// Selection happens on the globe and in step 1, which also picks the variable and the layer kind. The data layer
// (API v2 /api/region) colors the native NASA POWER cells inside a state once Analyze is pressed (`active`).
export function AreaMap({ region, startYear, endYear, variable, kind, active }: { region: Region; startYear: number; endYear: number; variable: VariableId; kind: LayerKind; active: boolean }) {
  const { countries, states, country, state, target, title, estimate, tooLarge, needsState } = useGridArea(region)
  // useId may contain characters that break url(#…) references, so keep only safe ones.
  const safeId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const clipId = `area-clip-${safeId}`
  const hatchId = `area-hatch-${safeId}`

  const areaId = `${region.country ?? ''}|${region.state ?? ''}`
  // Only Analyze requests the grid (a large state can take a minute); any new area, period or variable resets `active`.
  // The layer kind only changes the coloring, so switching it never repeats the request.
  // A cancel belongs to one query: a new area, variable, period or Analyze clears it without an effect.
  const queryKey = `${areaId}|${variable}|${startYear}|${endYear}|${active}`
  const [cancelledKey, setCancelledKey] = useState<string | null>(null)
  const cancelled = cancelledKey === queryKey
  const layer = useRegionLayer(active && region.country && state && isMapVariable(variable) && !tooLarge && !cancelled ? { country: region.country, state: state.properties.name, variable, startYear, endYear } : null)
  const layerData = active && !cancelled ? layer.data : undefined
  const layerLoading = active && !cancelled && layer.isLoading
  // Elapsed seconds while the grid loads (a large state can take several seconds the first time).
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!layerLoading) return
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => { clearInterval(timer); setElapsed(0) }
  }, [layerLoading])

  // Exploratory projection (step 3 only). Each loaded response starts its own session: on, and playing in a loop from
  // the first to the last year (paused on the last data year under prefers-reduced-motion), until the user acts.
  const reducedMotion = useReducedMotion()
  const projectable = canProject(layerData)
  const summary = layerData?.projection ?? null
  const sessionKey = projectable && summary ? `${queryKey}|${summary.fitYears.join('-')}` : null
  const defaults = useMemo<ProjectionUi>(() => sessionKey && summary
    ? { key: sessionKey, on: true, playing: !reducedMotion, year: reducedMotion ? summary.fitYears[1] : summary.horizon[0], mode: 'value' }
    : { key: null, on: false, playing: false, year: endYear, mode: 'value' }, [sessionKey, summary, reducedMotion, endYear])
  const [ui, setUi] = useState<ProjectionUi | null>(null)
  const current = ui && ui.key === defaults.key ? ui : defaults
  // Picking a step 1 layer (anomaly, trend, average) shows that layer instead of the projection (adjusted during render).
  const [seenKind, setSeenKind] = useState(kind)
  if (seenKind !== kind) {
    setSeenKind(kind)
    setUi({ ...current, on: false, playing: false })
  }
  const shownYear = current.on && projectable ? current.year : null
  const [firstYear, lastYear] = summary?.horizon ?? [startYear, endYear]
  useEffect(() => {
    if (shownYear === null || !current.playing) return
    const atEnd = current.year >= lastYear
    const next = atEnd || current.year < firstYear ? firstYear : current.year + 1
    const timer = setTimeout(() => setUi({ ...current, year: next }), atEnd ? END_HOLD_MS : YEAR_MS)
    return () => clearTimeout(timer)
  }, [current, shownYear, firstYear, lastYear])

  const map = useMemo(() => {
    if (!target) return null
    const projection = fitProjection(target.geometry, WIDTH, HEIGHT, 24)
    // A selected state shows its sibling states; a whole country shows its states as inner lines.
    const subdivisions = (states ?? []).filter((feature) => feature !== target).map((feature) => projection.path(feature.geometry)).join('')
    const neighbors = (countries ?? []).filter((feature) => feature.properties.ADM0_A3 !== region.country).map((feature) => projection.path(feature.geometry)).join('')
    return { projection, shape: projection.path(target.geometry), subdivisions, neighbors }
  }, [target, states, countries, region.country])

  const coords = `${hemisphere(region.lat, 'N', 'S')} • ${hemisphere(region.lon, 'E', 'W')}`
  const cells = map && layerData ? <g clipPath={`url(#${clipId})`}><MapCells data={layerData} kind={effectiveKind(kind, layerData.variable.trendPolicy)} project={map.projection.project} projectionYear={shownYear} projectionMode={current.mode} hatchId={hatchId} /></g> : null
  const coloredBy = layerData ? `, colored by ${layerData.variable.label.en}${shownYear !== null ? `${current.mode === 'change' ? ' change since the last data year' : ''} projected to ${shownYear}` : ''}` : ''

  return <section className="area-panel panel" aria-labelledby="area-title">
    <PanelHeader badge="Step 3" title="See it on the map" icon={MapPinned} />
    <div className="chart-header"><h2 id="area-title">{title ?? 'No area selected'} {state && country && <span className="range-label">{country.properties.NAME}</span>}</h2></div>
    {map ? <>
      <div className="area-map-row">
      <div className="area-map">
        <svg className="area-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Outline of ${region.name} with the analysis point at ${coords}${coloredBy}`}>
          <defs>
            <clipPath id={clipId}><path d={map.shape} /></clipPath>
            <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line className="map-hatch-line" x1="0" y1="0" x2="0" y2="6" /></pattern>
          </defs>
          <path className="area-neighbor" d={map.neighbors} />
          {region.state
            ? <><path className="area-context" d={map.subdivisions} /><path className="area-shape" d={map.shape} />{cells}</>
            : <><path className="area-shape" d={map.shape} />{cells}<path className="area-inner" d={map.subdivisions} /></>}
          {cells && <path className="area-outline" d={map.shape} />}
          <circle className="area-point" cx={map.projection.project(region.lon, region.lat)[0]} cy={map.projection.project(region.lon, region.lat)[1]} r="6" />
        </svg>
        <AreaScale kmPerPixel={map.projection.kmPerPixel} />
      </div>
      <MapLegend data={layerData} kind={kind} projectionYear={shownYear} projectionMode={current.mode} emptyNote={needsState ? 'Choose a state' : tooLarge ? 'No grid: state too large' : undefined} />
      </div>
      <ProjectionPanel
        variable={variable}
        data={layerData}
        active={active && Boolean(state) && !tooLarge && !cancelled}
        isLoading={layerLoading}
        on={current.on}
        onToggle={() => setUi({ ...current, on: !current.on, playing: !current.on })}
        playing={current.playing && shownYear !== null}
        onPlayToggle={() => setUi({ ...current, on: true, playing: !(current.playing && shownYear !== null) })}
        year={current.year}
        onScrub={(year) => setUi({ ...current, on: true, playing: false, year })}
        mode={current.mode}
        onMode={(mode) => setUi({ ...current, on: true, mode })}
        startYear={startYear}
        endYear={endYear}
        unavailable={needsState ? 'Choose a state to fit and project its cells.' : tooLarge ? 'This state is too large for the map grid: choose a smaller one.' : cancelled ? 'Grid request cancelled: press Analyze region again to fit the lines.' : undefined}
      />
      <div className="globe-caption"><span className="legend-item"><span className="legend-point" /> ANALYSIS POINT</span><span className="globe-location"><MapPin size={16} /> {coords}</span></div>
      <p className="field-hint">Results describe the NASA POWER grid cell (0.5° × 0.625°) that contains the marked point, not a state average. Boundaries: Natural Earth (public domain).</p>
    </> : <div className="chart-empty" role="status">
      <div className="chart-empty-icon"><MapIcon size={16} /></div>
      <strong>{region.country ? 'Loading boundaries…' : 'No country at this point'}</strong>
      <p>{region.country ? 'Natural Earth outlines load from this site, not an external service.' : 'Select a country or state on the globe or in the list to see its outline.'}</p>
    </div>}
    <MapLayerResult
      variable={variable}
      kind={kind}
      active={active}
      data={layerData}
      isLoading={layerLoading}
      error={active && !cancelled ? layer.error : undefined}
      areaName={title}
      canRequest={Boolean(target)}
      needsState={needsState}
      estimate={estimate}
      tooLarge={tooLarge}
      maxCells={MAP_MAX_CELLS}
      elapsed={elapsed}
      cancelled={cancelled}
      onCancel={() => setCancelledKey(queryKey)}
    />
  </section>
}

function AreaScale({ kmPerPixel }: { kmPerPixel: number }) {
  const km = niceKm((WIDTH / 4) * kmPerPixel)
  return <div className="area-scale" style={{ width: `${(km / kmPerPixel / WIDTH) * 100}%` }}><span>{km < 1 ? km.toFixed(1) : km.toLocaleString('en-US')} km</span></div>
}
