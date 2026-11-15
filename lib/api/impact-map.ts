/**
 * Thematic map layers of the impact lenses (IMPLEMENTACION_LENTES_IMPACTO §11), computed per native cell from the
 * bundled POWER snapshot of each study state (scripts/impact/preprocess-power.ts) and per municipality from the
 * Drought Monitor. Every cell and municipality carries a class id; colours exist only in the legends below, so the
 * interface never colours raw values on its own. Climate hazard, exposure and their combined priority are separate
 * layers, never one opaque layer.
 */
import { containsPoint } from '../analysis/region'
import { assessSeries, finalizeFamily, optionsFromProfile, type RobustTrend } from '../analysis/robust-assessment'
import { baselineMean, type AnnualPoint } from '../analysis/annual-rules'
import { unpackSeries } from '../analysis/impact-series'
import { classifyWater, demandStress, observedDrought, storageStress, supplyStress, type ComponentResult } from '../analysis/water-risk'
import { extremeConfirms, heatPriority, heatSignal, recentLoad } from '../analysis/heat-risk'
import { droughtMonitor, droughtSummaryFrom, droughtYearsFrom } from '../data/conagua'
import { readOptional } from '../data/bundled'
import { cellPopulation } from '../data/inegi'
import { loadMunicipalities, municipalGeometryUrl, STUDY_STATES } from '../data/impact-geometry'
import { getVariable } from '../variables/catalog'
import type { Bilingual, ImpactCell, ImpactLegend, ImpactMap, ImpactStatus } from './impact-types'
import { PRIORITY_LABEL, STATUS_LABEL } from './impact-text'
import { ET0_PROFILE } from './impact-profiles'

type SnapshotCell = {
  cellId: string; lat: number; lon: number; coverage: number; bounds: ImpactCell['bounds']; elevationM: number | null
  series: Record<'precip' | 'precipWet' | 'et0' | 'et0Wet' | 'balance' | 'balanceWet' | 'wetness' | 'tx90p' | 'tn90p' | 'txx' | 'tnn', Array<number | null>>
}
export type PowerSnapshot = { stateCode: string; years: number[]; generatedAt: string; cells: SnapshotCell[] }

export const loadSnapshot = (stateCode: string, root?: string) => readOptional<PowerSnapshot>(`derived/power-cells-${stateCode}.json`, root)

const STRESS_CLASSES = (active: Bilingual, partial: Bilingual): ImpactLegend['classes'] => [
  { id: 'active', label: active, color: '#B45309' },
  { id: 'partial', label: partial, color: '#F2C27B' },
  { id: 'none', label: { es: 'Ningún año reciente', en: 'No recent year' }, color: '#D6E4F0' },
  { id: 'na', label: { es: 'No evaluable', en: 'Not evaluable' }, color: '#EEEEEE' },
]

const STATUS_CLASSES: ImpactLegend['classes'] = [
  { id: 'insufficient-data', label: STATUS_LABEL['insufficient-data'], color: '#EEEEEE' },
  { id: 'no-detectable', label: STATUS_LABEL['no-detectable'], color: '#C9DCF0' },
  { id: 'watch', label: STATUS_LABEL.watch, color: '#F2C27B' },
  { id: 'planning-signal', label: STATUS_LABEL['planning-signal'], color: '#D97706' },
  { id: 'corroborated', label: STATUS_LABEL.corroborated, color: '#B42318' },
]

const SIGNAL_CLASSES: ImpactLegend['classes'] = [
  { id: 'signal', label: { es: 'Tendencia robusta al alza (criterios de planificación)', en: 'Robust upward trend (planning criteria)' }, color: '#C2410C' },
  { id: 'watch', label: { es: 'Carga reciente alta, tendencia no robusta', en: 'High recent load, trend not robust' }, color: '#FDBA74' },
  { id: 'none', label: { es: 'Sin señal detectable', en: 'No detectable signal' }, color: '#DCE3EA' },
  { id: 'na', label: { es: 'No evaluable', en: 'Not evaluable' }, color: '#EEEEEE' },
]

export const WATER_LEGENDS: ImpactLegend[] = [
  { id: 'precipitation-stress', group: 'supply', target: 'cells', label: { es: 'Estrés de precipitación', en: 'Precipitation stress' }, classes: STRESS_CLASSES({ es: 'Lluvia baja en ≥ 3 de los últimos 5 años', en: 'Low rain in ≥ 3 of the last 5 years' }, { es: 'Lluvia baja en 1–2 años', en: 'Low rain in 1–2 years' }), note: { es: 'Bajo el percentil 20 de 1991–2020 o más de 1 DE bajo la media. Sin afirmación de tendencia de lluvia.', en: 'Below the 1991–2020 20th percentile or more than 1 SD below the mean. No rain trend claim.' }, about: { shows: {"es": "Cada celda de NASA POWER según cuántos de los últimos 5 años tuvieron lluvia baja (bajo su percentil 20 de 1991–2020 o más de 1 DE bajo su media).", "en": "Each NASA POWER cell by how many of the last 5 years had low rain (below its 1991–2020 20th percentile, or more than 1 SD below its mean)."}, useFor: {"es": "Ubicar dónde el aporte de lluvia ha sido bajo de forma persistente, sin afirmar una tendencia de lluvia.", "en": "Spot where rain supply has been persistently low, without claiming a long-term rain trend."} } },
  { id: 'atmospheric-demand', group: 'demand', target: 'cells', label: { es: 'Demanda atmosférica (ET0)', en: 'Atmospheric demand (ET0)' }, classes: STRESS_CLASSES({ es: 'ET0 alta persistente o tendencia robusta', en: 'Persistently high ET0 or robust upward trend' }, { es: 'ET0 alta en 1–2 años', en: 'High ET0 in 1–2 years' }), note: { es: 'Sobre el percentil 80 de 1991–2020 (FAO-56).', en: 'Above the 1991–2020 80th percentile (FAO-56).' }, about: { shows: {"es": "Con qué frecuencia la evapotranspiración de referencia (ET0, FAO-56), el agua que el aire le exige a una superficie de pasto, superó su percentil 80 de 1991–2020 en los últimos 5 años.", "en": "How often the reference evapotranspiration (FAO-56 ET0), the water the air demands from a grass surface, was above its 1991–2020 80th percentile in the last 5 years."}, useFor: {"es": "Ver dónde la demanda de evaporación es alta de forma persistente, una presión sobre el uso del agua.", "en": "See where evaporative demand is persistently high, a pressure on water use."} } },
  { id: 'root-zone-wetness', group: 'storage', target: 'cells', label: { es: 'Humedad de zona radicular', en: 'Root-zone wetness' }, classes: STRESS_CLASSES({ es: 'Humedad baja persistente', en: 'Persistently low wetness' }, { es: 'Humedad baja en 1–2 años', en: 'Low wetness in 1–2 years' }), note: { es: 'Estimada por el modelo de superficie de MERRA-2 (GWETROOT), no medida.', en: 'Estimated by MERRA-2’s land-surface model (GWETROOT), not measured.' }, about: { shows: {"es": "Con qué frecuencia el agua del suelo disponible para las plantas (estimada por el modelo MERRA-2, GWETROOT) estuvo bajo su percentil 20 de 1991–2020 en los últimos 5 años.", "en": "How often the soil water available to plants (estimated by the MERRA-2 model, GWETROOT) was below its 1991–2020 20th percentile in the last 5 years."}, useFor: {"es": "Identificar zonas donde los suelos se han mantenido más secos de lo normal, señal de estrés en el agua almacenada.", "en": "Identify areas where soils have stayed drier than usual, a sign of stress in stored water."} } },
  { id: 'historical-drought', group: 'observed', target: 'municipalities', label: { es: 'Sequía histórica (CONAGUA)', en: 'Historical drought (CONAGUA)' }, classes: [
    { id: 'recent-2plus', label: { es: 'Sequía D1+ en ≥ 2 de los últimos 5 años', en: 'D1+ drought in ≥ 2 of the last 5 years' }, color: '#9A3412' },
    { id: 'recent-1', label: { es: 'Sequía D1+ en 1 de los últimos 5 años', en: 'D1+ drought in 1 of the last 5 years' }, color: '#F2C27B' },
    { id: 'none', label: { es: 'Sin sequía D1+ reciente registrada', en: 'No recent D1+ drought recorded' }, color: '#D6E4F0' },
    { id: 'na', label: { es: 'Sin cobertura suficiente', en: 'Not enough coverage' }, color: '#EEEEEE' },
  ], note: { es: 'Monitor de Sequía de México por municipio. Sin registro no significa sin sequía.', en: 'Mexican Drought Monitor by municipality. No record does not mean no drought.' }, about: { shows: {"es": "Cada municipio según los años, de los últimos 5, en que el Monitor de Sequía de CONAGUA registró sequía (D1 o peor).", "en": "Each municipality by the years, among the last 5, in which CONAGUA’s Drought Monitor recorded drought (D1 or worse)."}, useFor: {"es": "Contrastar las señales climáticas con la sequía observada oficialmente; es la evidencia que puede corroborar una señal.", "en": "Contrast the climate signals with officially observed drought; it is the evidence that can corroborate a signal."} } },
  { id: 'water-priority', group: 'priority', target: 'cells', label: { es: 'Prioridad de planeación hídrica', en: 'Water-planning priority' }, classes: STATUS_CLASSES, note: { es: 'Combinación de los cuatro componentes; corroborada exige evidencia observada.', en: 'Combination of the four components; corroborated requires observed evidence.' }, about: { shows: {"es": "El estado combinado de los cuatro componentes en cada celda: sin señal, vigilar, señal de planificación o corroborada.", "en": "The combined status of the four components in each cell: no signal, watch, planning signal or corroborated."}, useFor: {"es": "Ver de un vistazo dónde coinciden varias señales de estrés hídrico y merecen prioridad en la planeación municipal.", "en": "See at a glance where several water-stress signals coincide and deserve priority in municipal planning."} } },
]

export const HEAT_LEGENDS: ImpactLegend[] = [
  { id: 'warm-days', group: 'hazard', target: 'cells', label: { es: 'Días cálidos (TX90p)', en: 'Warm days (TX90p)' }, classes: SIGNAL_CLASSES, note: { es: 'Peligro climático: % de días sobre el percentil 90 de 1991–2020.', en: 'Climate hazard: % of days above the 1991–2020 90th percentile.' }, about: { shows: {"es": "La tendencia del porcentaje de días más calurosos que el percentil 90 de la misma fecha en 1991–2020, en cada celda.", "en": "The trend in the share of days hotter than the 1991–2020 90th percentile of the same date, in each cell."}, useFor: {"es": "Encontrar dónde los días inusualmente calurosos se están volviendo más frecuentes.", "en": "Find where unusually hot days are becoming more frequent."} } },
  { id: 'warm-nights', group: 'hazard', target: 'cells', label: { es: 'Noches cálidas (TN90p)', en: 'Warm nights (TN90p)' }, classes: SIGNAL_CLASSES, note: { es: 'Peligro climático: % de noches sobre el percentil 90 de 1991–2020.', en: 'Climate hazard: % of nights above the 1991–2020 90th percentile.' }, about: { shows: {"es": "La tendencia del porcentaje de noches más cálidas que el percentil 90 de la misma fecha en 1991–2020, en cada celda.", "en": "The trend in the share of nights warmer than the 1991–2020 90th percentile of the same date, in each cell."}, useFor: {"es": "Encontrar dónde las noches se enfrían menos que antes, una parte clave de la exposición al calor.", "en": "Find where nights cool down less than they used to, a key part of heat exposure."} } },
  { id: 'hot-extremes', group: 'hazard', target: 'cells', label: { es: 'Extremos cálidos (TXx)', en: 'Hot extremes (TXx)' }, classes: [
    { id: 'confirmed', label: { es: 'El día más cálido sube (p < 0.05)', en: 'Hottest day rising (p < 0.05)' }, color: '#C2410C' },
    { id: 'none', label: { es: 'Sin aumento significativo', en: 'No significant rise' }, color: '#DCE3EA' },
    { id: 'na', label: { es: 'No evaluable', en: 'Not evaluable' }, color: '#EEEEEE' },
  ], note: { es: 'TXx es el día más cálido de cada celda, no de toda la región.', en: 'TXx is each cell’s hottest day, not the whole region’s.' }, about: { shows: {"es": "Si el día más caluroso de cada año (TXx) sube de forma significativa en cada celda.", "en": "Whether the hottest day of each year (TXx) is rising significantly in each cell."}, useFor: {"es": "Comprobar si el calor más extremo confirma la señal de días cálidos.", "en": "Check whether the most extreme heat confirms the warm-days signal."} } },
  { id: 'population-exposure', group: 'exposure', target: 'cells', label: { es: 'Exposición poblacional', en: 'Population exposure' }, classes: [
    { id: 'p3', label: { es: '1 millón o más', en: '1 million or more' }, color: '#3B1F7A' },
    { id: 'p2', label: { es: '100 mil – 1 millón', en: '100k – 1 million' }, color: '#6D4BB8' },
    { id: 'p1', label: { es: '10 mil – 100 mil', en: '10k – 100k' }, color: '#A895DA' },
    { id: 'p0', label: { es: 'Menos de 10 mil', en: 'Under 10k' }, color: '#E3DCF3' },
    { id: 'na', label: { es: 'Sin localidades', en: 'No localities' }, color: '#F4F4F4' },
  ], note: { es: 'Población 2020 (INEGI) de las localidades dentro de cada celda; no se reparte sobre el área.', en: '2020 population (INEGI) of the localities inside each cell; not spread over the area.' }, about: { shows: {"es": "Las personas que vivían en cada celda en 2020 (censo de INEGI, a partir de las localidades con coordenadas).", "en": "The people living in each cell in 2020 (INEGI census, from the localities with coordinates)."}, useFor: {"es": "Ver a cuántas personas alcanzaría una señal de calor; es exposición, no vulnerabilidad ni salud.", "en": "See how many people a heat signal would reach; it is exposure, not vulnerability or health."} } },
  { id: 'urban-exposure', group: 'exposure', target: 'cells', label: { es: 'Exposición urbana', en: 'Urban exposure' }, classes: [
    { id: 'u3', label: { es: '75% urbano o más', en: '75% urban or more' }, color: '#3B1F7A' },
    { id: 'u2', label: { es: '50–75% urbano', en: '50–75% urban' }, color: '#6D4BB8' },
    { id: 'u1', label: { es: '25–50% urbano', en: '25–50% urban' }, color: '#A895DA' },
    { id: 'u0', label: { es: 'Menos de 25% urbano', en: 'Under 25% urban' }, color: '#E3DCF3' },
    { id: 'na', label: { es: 'Sin localidades', en: 'No localities' }, color: '#F4F4F4' },
  ], note: { es: 'Urbano = localidades de 2 500 habitantes o más (definición de INEGI).', en: 'Urban = localities of 2,500 people or more (INEGI definition).' }, about: { shows: {"es": "La parte de la población de cada celda que vive en localidades urbanas (2 500 habitantes o más).", "en": "The share of each cell’s population living in urban localities (2,500 people or more)."}, useFor: {"es": "Ubicar las zonas urbanas, donde se concentra la exposición; la celda climática no resuelve la isla de calor urbana.", "en": "Locate urban areas, where exposure concentrates; the climate cell does not resolve the urban heat island."} } },
  { id: 'priority-zones', group: 'priority', target: 'cells', label: { es: 'Zonas prioritarias', en: 'Priority zones' }, classes: [
    { id: 'high-exposure-signal', label: PRIORITY_LABEL['high-exposure-signal'], color: '#B42318' },
    { id: 'signal-lower-exposure', label: PRIORITY_LABEL['signal-lower-exposure'], color: '#F59E0B' },
    { id: 'exposure-without-signal', label: PRIORITY_LABEL['exposure-without-signal'], color: '#8B7CC8' },
    { id: 'no-priority', label: PRIORITY_LABEL['no-priority'], color: '#DCE3EA' },
    { id: 'exposure-unknown', label: PRIORITY_LABEL['exposure-unknown'], color: '#F4F4F4' },
  ], note: { es: 'Combinación explícita de peligro (días o noches cálidos) y exposición (población o fracción urbana).', en: 'Explicit combination of hazard (warm days or nights) and exposure (population or urban share).' }, about: { shows: {"es": "La combinación explícita de la señal de calor (días o noches cálidos) y la exposición (población o fracción urbana) en cada celda.", "en": "The explicit combination of the heat signal (warm days or nights) and exposure (population or urban share) in each cell."}, useFor: {"es": "Priorizar la vigilancia y la preparación donde una señal de calor robusta coincide con mucha gente expuesta.", "en": "Prioritize monitoring and preparedness where a robust heat signal overlaps many exposed people."} } },
]

const stressClass = (result: ComponentResult) => (result.active === null ? 'na' : result.active ? 'active' : result.hits.length ? 'partial' : 'none')

function trendFor(points: AnnualPoint[], variableId: string | null, startYear: number, endYear: number): RobustTrend {
  const descriptor = variableId ? getVariable(variableId) : undefined
  const profile = descriptor?.profile ?? ET0_PROFILE
  const options = optionsFromProfile(profile, descriptor?.trendPolicy ?? 'allowed', descriptor?.unit ?? 'mm', baselineMean(points))
  const trend = assessSeries(points, startYear, endYear, options)
  finalizeFamily([{ id: variableId ?? 'ET0', trend }])
  return trend
}

const unavailable = (reason: Bilingual, defaultLayer: string, layers: ImpactLegend[]): ImpactMap => ({ available: false, reason, stateCode: null, municipalGeometryUrl: null, defaultLayer, layers, cells: [], municipalities: [], snapshot: null })

const NOT_BUNDLED: Bilingual = {
  es: 'Los mapas temáticos están preparados para Puebla, Tlaxcala y Oaxaca. Aquí se muestra solo el análisis de la celda de referencia.',
  en: 'Thematic maps are prepared for Puebla, Tlaxcala and Oaxaca. This area shows the reference-cell analysis only.',
}

/** Per-cell and per-municipality layers of one lens for a study state, over the analysis window (capped to the snapshot). */
export async function buildImpactMap(lens: 'water' | 'heat', stateCode: string | null, startYear: number, endYear: number, root?: string): Promise<ImpactMap> {
  const legends = lens === 'water' ? WATER_LEGENDS : HEAT_LEGENDS
  const defaultLayer = lens === 'water' ? 'water-priority' : 'priority-zones'
  if (!stateCode || !STUDY_STATES[stateCode]) return unavailable(NOT_BUNDLED, defaultLayer, legends)
  const snapshot = await loadSnapshot(stateCode, root)
  if (!snapshot) return unavailable(NOT_BUNDLED, defaultLayer, legends)
  const end = Math.min(endYear, snapshot.years.at(-1)!)
  const start = Math.max(startYear, snapshot.years[0])
  const municipalities = await loadMunicipalities(stateCode, root)
  const drought = lens === 'water' ? await droughtMonitor(root) : null
  const municipalityAt = (lat: number, lon: number) => municipalities?.features.find((feature) => containsPoint(feature.geometry, lon, lat)) ?? null
  const cells: ImpactCell[] = []
  for (const cell of snapshot.cells) {
    const series = Object.fromEntries(Object.entries(cell.series).map(([key, values]) => [key, unpackSeries(values, snapshot.years)])) as Record<keyof SnapshotCell['series'], AnnualPoint[]>
    const layers: ImpactCell['layers'] = {}
    if (lens === 'water') {
      const et0Trend = trendFor(series.et0, null, start, end)
      const supply = supplyStress(series.precip, end)
      const demand = demandStress(series.et0, et0Trend, end)
      const storage = storageStress(series.wetness, end)
      const municipality = municipalityAt(cell.lat, cell.lon)
      const entry = municipality && drought ? drought.municipalities[municipality.properties.code] : undefined
      const observed = observedDrought(entry ? droughtYearsFrom(drought!.dates, entry.series) : null, end)
      const status = classifyWater({ supplyStress: supply, demandStress: demand, storageStress: storage, observedDrought: observed }).status
      layers['precipitation-stress'] = { value: supply.active === null ? null : supply.hits.length, class: stressClass(supply), status: null }
      layers['atmospheric-demand'] = { value: et0Trend.display.slope, class: stressClass(demand), status: null }
      layers['root-zone-wetness'] = { value: storage.active === null ? null : storage.hits.length, class: stressClass(storage), status: null }
      layers['water-priority'] = { value: null, class: status, status }
    } else {
      const tx = trendFor(series.tx90p, 'TX90p', start, end)
      const tn = trendFor(series.tn90p, 'TN90p', start, end)
      const txx = trendFor(series.txx, 'TXx', start, end)
      const tnn = trendFor(series.tnn, 'TNn', start, end)
      const signalClass = (trend: RobustTrend, points: AnnualPoint[]) => (trend.nYears < 10 ? 'na' : heatSignal(trend).meets ? 'signal' : recentLoad(points, end).high ? 'watch' : 'none')
      layers['warm-days'] = { value: tx.display.slope, class: signalClass(tx, series.tx90p), status: null }
      layers['warm-nights'] = { value: tn.display.slope, class: signalClass(tn, series.tn90p), status: null }
      layers['hot-extremes'] = { value: txx.display.slope, class: txx.nYears < 10 ? 'na' : extremeConfirms(txx) ? 'confirmed' : 'none', status: null }
      const people = await cellPopulation(cell.cellId, root)
      const population = people?.population ?? null
      layers['population-exposure'] = { value: population, class: population === null ? 'na' : population >= 1_000_000 ? 'p3' : population >= 100_000 ? 'p2' : population >= 10_000 ? 'p1' : 'p0', status: null }
      const urban = people?.urbanFraction ?? null
      layers['urban-exposure'] = { value: urban, class: urban === null ? 'na' : urban >= 0.75 ? 'u3' : urban >= 0.5 ? 'u2' : urban >= 0.25 ? 'u1' : 'u0', status: null }
      const daysMeet = heatSignal(tx).meets
      const nightsMeet = heatSignal(tn).meets
      const status: ImpactStatus = (daysMeet && extremeConfirms(txx)) || (nightsMeet && extremeConfirms(tnn)) ? 'corroborated' : daysMeet || nightsMeet ? 'planning-signal' : 'no-detectable'
      layers['priority-zones'] = { value: population, class: heatPriority(status, { population: population ?? 0, urbanFraction: urban }), status }
    }
    cells.push({ cellId: cell.cellId, center: { lat: cell.lat, lon: cell.lon }, bounds: cell.bounds, coverage: cell.coverage, sourceId: 'nasa-power', resolution: 'MERRA-2 cell 0.5° × 0.625°', layers })
  }
  const municipalLayers: ImpactMap['municipalities'] = []
  if (lens === 'water' && drought && municipalities) {
    for (const feature of municipalities.features) {
      const entry = drought.municipalities[feature.properties.code]
      const summary = entry ? droughtSummaryFrom(drought.dates, entry.series, end) : null
      const className = !summary || summary.recentYearsCovered < 4 ? 'na' : summary.recentYearsWithDrought >= 2 ? 'recent-2plus' : summary.recentYearsWithDrought === 1 ? 'recent-1' : 'none'
      municipalLayers.push({ code: feature.properties.code, layers: { 'historical-drought': { value: summary?.recentYearsWithDrought ?? null, class: className } } })
    }
  }
  return {
    available: true, reason: null, stateCode, municipalGeometryUrl: municipalGeometryUrl(stateCode), defaultLayer, layers: legends, cells, municipalities: municipalLayers,
    snapshot: { retrievedAt: snapshot.generatedAt, window: { startYear: start, endYear: end } },
  }
}
