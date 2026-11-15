'use client'

import { useMemo, useState, type KeyboardEvent } from 'react'
import useSWRImmutable from 'swr/immutable'
import { Eye, MousePointerClick } from 'lucide-react'
import type { ImpactLegend, ImpactMap, ImpactScope } from '@/lib/api/impact-types'
import { fitProjection, useStates, type Polygonal } from '@/lib/geo'
import { formatNumber, formatSigned } from '@/lib/ui/format'

const WIDTH = 600
const HEIGHT = 400

type MunicipalCollection = { features: Array<{ properties: { code: string; name: string }; geometry: Polygonal }> }
const fetchJson = async (url: string) => { const response = await fetch(url); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.json() }

/** A layer value with the unit the backend declared for that layer (no unit is guessed here). */
function valueText(value: number | null, legend: ImpactLegend) {
  if (value === null) return null
  const unit = legend.unit?.en ?? ''
  if (unit === 'people') return `${Math.round(value).toLocaleString('en-US')} people`
  if (unit.endsWith('/decade')) return `${formatSigned(value, unit.startsWith('mm') ? 0 : 1)} ${unit}`
  if (unit.startsWith('%')) return `${Math.round(value)}${unit}`
  if (unit.startsWith('years')) return `${formatNumber(value, 0)} ${unit}`
  return unit ? `${formatNumber(value, 1)} ${unit}` : null
}

const activate = (select: () => void) => (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select() } }

// Thematic map of one lens (IMPLEMENTACION_LENTES_IMPACTO §11), kept simple and readable:
// - one row of layer buttons and one line saying what the selected layer shows;
// - "Reading the map": what is on the map right now, how many people it reaches and where the analysis point falls,
//   all computed by the server for this layer;
// - a legend with only the classes present, and a panel with every value of the cell (or municipality) the user picks.
// Colours come only from the backend legend; every class is also named in words, so colour is never the only channel.
export function ImpactMapLayer({ map, scope }: { map: ImpactMap; scope: ImpactScope }) {
  const [layerId, setLayerId] = useState(map.defaultLayer)
  const [picked, setPicked] = useState<string | null>(null)
  const legend = map.layers.find((item) => item.id === layerId) ?? map.layers[0]
  const states = useStates('MEX')
  const outline = states.data?.features.find((feature) => feature.properties.name === scope.state)?.geometry ?? null
  const municipal = useSWRImmutable<MunicipalCollection>(legend?.target === 'municipalities' && map.municipalGeometryUrl ? map.municipalGeometryUrl : null, fetchJson)

  const projection = useMemo(() => {
    if (outline) return fitProjection(outline, WIDTH, HEIGHT, 18)
    if (!map.cells.length) return null
    const west = Math.min(...map.cells.map((cell) => cell.bounds.west))
    const east = Math.max(...map.cells.map((cell) => cell.bounds.east))
    const south = Math.min(...map.cells.map((cell) => cell.bounds.south))
    const north = Math.max(...map.cells.map((cell) => cell.bounds.north))
    return fitProjection({ type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] }, WIDTH, HEIGHT, 18)
  }, [outline, map.cells])

  if (!map.available || !legend || !projection) return <p className="impact-map-note">{map.reason?.en ?? 'No thematic map for this area.'}</p>

  const color = new Map(legend.classes.map((item) => [item.id, item]))
  const label = (id: string) => color.get(id)?.label.en ?? id
  const counts = new Map<string, number>()
  const isCells = legend.target === 'cells'
  // Without a pick, the panel describes the analysis point's cell.
  const selectedCell = isCells ? map.cells.find((cell) => cell.cellId === (picked ?? scope.reference.cellId)) ?? null : null
  const shapes = isCells
    ? map.cells.map((cell) => {
      const entry = cell.layers[legend.id]
      if (!entry) return null
      counts.set(entry.class, (counts.get(entry.class) ?? 0) + 1)
      const [x1, y1] = projection.project(cell.bounds.west, cell.bounds.north)
      const [x2, y2] = projection.project(cell.bounds.east, cell.bounds.south)
      const name = `Cell ${cell.center.lat.toFixed(2)}°, ${cell.center.lon.toFixed(3)}°: ${label(entry.class)}`
      return <rect key={cell.cellId} x={x1} y={y1} width={x2 - x1} height={y2 - y1} fill={color.get(entry.class)?.color ?? '#eee'}
        className={`impact-cell${selectedCell?.cellId === cell.cellId ? ' is-selected' : ''}`} tabIndex={0} role="button" aria-label={name}
        onClick={() => setPicked(cell.cellId)} onKeyDown={activate(() => setPicked(cell.cellId))}><title>{name}</title></rect>
    })
    : (municipal.data?.features ?? []).map((feature) => {
      const entry = map.municipalities.find((item) => item.code === feature.properties.code)?.layers[legend.id]
      const className = entry?.class ?? 'na'
      counts.set(className, (counts.get(className) ?? 0) + 1)
      const name = `${feature.properties.name}: ${label(className)}`
      return <path key={feature.properties.code} d={projection.path(feature.geometry)} fill={color.get(className)?.color ?? '#eee'}
        className={`impact-municipality${picked === feature.properties.code ? ' is-selected' : ''}`} tabIndex={0} role="button" aria-label={name}
        onClick={() => setPicked(feature.properties.code)} onKeyDown={activate(() => setPicked(feature.properties.code))}><title>{name}</title></path>
    })
  const [refX, refY] = projection.project(scope.reference.longitude, scope.reference.latitude)
  const present = legend.classes.filter((item) => (counts.get(item.id) ?? 0) > 0)
  const pickedMunicipality = !isCells && picked ? municipal.data?.features.find((feature) => feature.properties.code === picked) : undefined

  return <div className="impact-map">
    <div className="segmented impact-map-layers" role="group" aria-label="Map layers">
      {map.layers.map((item) => <button key={item.id} type="button" aria-pressed={item.id === legend.id} title={item.about?.useFor.en} onClick={() => { setLayerId(item.id); if (item.target !== legend.target) setPicked(null) }}>{item.label.en}</button>)}
    </div>
    {/* A response cached by the browser before these fields existed (stale-while-revalidate) shows the map without them. */}
    {legend.about && <p className="impact-layer-about">{legend.about.shows.en}</p>}
    <div className="impact-map-body">
      <svg className="impact-map-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-label={`${legend.label.en} map of ${scope.state ?? 'the area'}. Select a cell to read its values.`}>
        {shapes}
        {outline && <path d={projection.path(outline)} className="impact-outline" />}
        <g className="impact-ref"><circle cx={refX} cy={refY} r="7" /><title>{scope.reference.label.en}</title></g>
      </svg>
      <div className="impact-map-side">
        {legend.reading && <div className="impact-reading" aria-live="polite">
          <h4><Eye size={18} aria-hidden="true" /> Reading the map</h4>
          <p className="impact-reading-headline">{legend.reading.headline.en}</p>
          {legend.reading.affects && <p>{legend.reading.affects.en}</p>}
          {legend.reading.point && <p>{legend.reading.point.en}</p>}
        </div>}
        <ul className="impact-legend" aria-label={`${legend.label.en} legend`}>
          {present.map((item) => <li key={item.id}><span className="impact-swatch" style={{ background: item.color }} aria-hidden="true" />{item.label.en}</li>)}
          <li><span className="impact-swatch is-point" aria-hidden="true" />{scope.reference.label.en}</li>
        </ul>
        <div className="impact-cell-panel" aria-live="polite">
          {selectedCell ? <>
            <h4>{picked && picked !== scope.reference.cellId ? `Cell ${selectedCell.center.lat.toFixed(2)}°, ${selectedCell.center.lon.toFixed(3)}°` : 'Analysis point cell'}</h4>
            <dl>{map.layers.filter((item) => item.target === 'cells').map((item) => {
              const entry = selectedCell.layers[item.id]
              if (!entry) return null
              const value = valueText(entry.value, item)
              return <div key={item.id}><dt>{item.label.en}</dt><dd>{item.classes.find((option) => option.id === entry.class)?.label.en ?? entry.class}{value ? <span> · {value}</span> : null}</dd></div>
            })}</dl>
          </> : pickedMunicipality ? <>
            <h4>{pickedMunicipality.properties.name}</h4>
            <p>{label(map.municipalities.find((item) => item.code === picked)?.layers[legend.id]?.class ?? 'na')}</p>
          </> : null}
          <p className="impact-cell-hint"><MousePointerClick size={16} aria-hidden="true" /> {isCells ? 'Click a cell to see all its values.' : 'Click a municipality to see its status.'}</p>
        </div>
      </div>
    </div>
  </div>
}
