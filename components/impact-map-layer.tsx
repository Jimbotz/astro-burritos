'use client'

import { useMemo, useState } from 'react'
import useSWRImmutable from 'swr/immutable'
import type { ImpactMap, ImpactScope } from '@/lib/api/impact-types'
import { fitProjection, useStates, type Polygonal } from '@/lib/geo'

const WIDTH = 600
const HEIGHT = 400

type MunicipalCollection = { features: Array<{ properties: { code: string; name: string }; geometry: Polygonal }> }
const fetchJson = async (url: string) => { const response = await fetch(url); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.json() }

// Thematic map of one lens (IMPLEMENTACION_LENTES_IMPACTO §11), kept simple: one row of layer buttons with what the
// selected one shows and what it is for, the native
// NASA POWER cells (or, for the drought layer, INEGI municipalities) and a large legend that lists only the classes
// present on the map. Colours come only from the legend the backend sent; each class is also named in the legend and in
// every shape's tooltip, so colour is never the only channel.
export function ImpactMapLayer({ map, scope }: { map: ImpactMap; scope: ImpactScope }) {
  const [layerId, setLayerId] = useState(map.defaultLayer)
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
  const counts = new Map<string, number>()
  const shapes = legend.target === 'cells'
    ? map.cells.map((cell) => {
      const entry = cell.layers[legend.id]
      if (!entry) return null
      counts.set(entry.class, (counts.get(entry.class) ?? 0) + 1)
      const [x1, y1] = projection.project(cell.bounds.west, cell.bounds.north)
      const [x2, y2] = projection.project(cell.bounds.east, cell.bounds.south)
      const item = color.get(entry.class)
      return <rect key={cell.cellId} x={x1} y={y1} width={x2 - x1} height={y2 - y1} fill={item?.color ?? '#eee'} className="impact-cell"><title>{`Cell ${cell.center.lat.toFixed(2)}°, ${cell.center.lon.toFixed(3)}° · ${legend.label.en}: ${item?.label.en ?? entry.class}${entry.value !== null ? ` (${typeof entry.value === 'number' && Math.abs(entry.value) >= 1000 ? Math.round(entry.value).toLocaleString('en-US') : entry.value.toFixed?.(2)})` : ''}`}</title></rect>
    })
    : (municipal.data?.features ?? []).map((feature) => {
      const entry = map.municipalities.find((item) => item.code === feature.properties.code)?.layers[legend.id]
      const className = entry?.class ?? 'na'
      counts.set(className, (counts.get(className) ?? 0) + 1)
      const item = color.get(className)
      return <path key={feature.properties.code} d={projection.path(feature.geometry)} fill={item?.color ?? '#eee'} className="impact-municipality"><title>{`${feature.properties.name} · ${legend.label.en}: ${item?.label.en ?? className}`}</title></path>
    })
  const [refX, refY] = projection.project(scope.reference.longitude, scope.reference.latitude)
  const present = legend.classes.filter((item) => (counts.get(item.id) ?? 0) > 0)

  return <div className="impact-map">
    <div className="segmented impact-map-layers" role="group" aria-label="Map layers">
      {map.layers.map((item) => <button key={item.id} type="button" aria-pressed={item.id === legend.id} title={item.about?.shows.en} onClick={() => setLayerId(item.id)}>{item.label.en}</button>)}
    </div>
    {/* What the selected filter represents and what it is for, from the backend legend. A response cached by the browser
        before this field existed (stale-while-revalidate) simply shows no explanation until the fresh one arrives. */}
    {legend.about && <div className="impact-layer-about" aria-live="polite">
      <p><strong>What it shows:</strong> {legend.about.shows.en}</p>
      <p><strong>What it is for:</strong> {legend.about.useFor.en}</p>
    </div>}
    <div className="impact-map-body">
      <svg className="impact-map-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${legend.label.en} map of ${scope.state ?? 'the area'}`}>
        {shapes}
        {outline && <path d={projection.path(outline)} className="impact-outline" />}
        <g className="impact-ref"><circle cx={refX} cy={refY} r="6" /><title>{scope.reference.label.en}</title></g>
      </svg>
      <div className="impact-legend">
        <strong>{legend.label.en}</strong>
        <ul>
          {present.map((item) => <li key={item.id}><span className="impact-swatch" style={{ background: item.color }} aria-hidden="true" />{item.label.en}</li>)}
          <li><span className="impact-swatch is-point" aria-hidden="true" />{scope.reference.label.en}</li>
        </ul>
      </div>
    </div>
  </div>
}
