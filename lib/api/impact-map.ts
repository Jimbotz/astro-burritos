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
import { cellPopulation, inegiMunicipalities } from '../data/inegi'
import { loadMunicipalities, municipalGeometryUrl, STUDY_STATES } from '../data/impact-geometry'
import { getVariable } from '../variables/catalog'
import type { Bilingual, ImpactCell, ImpactLegend, ImpactMap, ImpactStatus, LayerReading } from './impact-types'
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
  { id: 'precipitation-stress', group: 'supply', target: 'cells', label: { es: 'Estrés de precipitación', en: 'Precipitation stress' }, classes: STRESS_CLASSES({ es: 'Lluvia baja en ≥ 3 de los últimos 5 años', en: 'Low rain in ≥ 3 of the last 5 years' }, { es: 'Lluvia baja en 1–2 años', en: 'Low rain in 1–2 years' }), note: { es: 'Bajo el percentil 20 de 1991–2020 o más de 1 DE bajo la media. Sin afirmación de tendencia de lluvia.', en: 'Below the 1991–2020 20th percentile or more than 1 SD below the mean. No rain trend claim.' }, about: { shows: {"es": "Celdas donde llovió poco en los últimos años.", "en": "Cells where rain was low in recent years."}, useFor: {"es": "Ubicar lluvia baja persistente, sin afirmar una tendencia de lluvia.", "en": "Spot persistently low rain, without claiming a rain trend."} }, unit: {"es": "años de los últimos 5", "en": "years of the last 5"}, reading: null },
  { id: 'atmospheric-demand', group: 'demand', target: 'cells', label: { es: 'Demanda atmosférica (ET0)', en: 'Atmospheric demand (ET0)' }, classes: STRESS_CLASSES({ es: 'ET0 alta persistente o tendencia robusta', en: 'Persistently high ET0 or robust upward trend' }, { es: 'ET0 alta en 1–2 años', en: 'High ET0 in 1–2 years' }), note: { es: 'Sobre el percentil 80 de 1991–2020 (FAO-56).', en: 'Above the 1991–2020 80th percentile (FAO-56).' }, about: { shows: {"es": "Celdas donde el aire demandó más agua de lo normal (ET0).", "en": "Cells where the air demanded more water than usual (ET0)."}, useFor: {"es": "Encontrar presión persistente de evaporación sobre el uso del agua.", "en": "Find persistent evaporative pressure on water use."} }, unit: {"es": "mm/década", "en": "mm/decade"}, reading: null },
  { id: 'root-zone-wetness', group: 'storage', target: 'cells', label: { es: 'Humedad de zona radicular', en: 'Root-zone wetness' }, classes: STRESS_CLASSES({ es: 'Humedad baja persistente', en: 'Persistently low wetness' }, { es: 'Humedad baja en 1–2 años', en: 'Low wetness in 1–2 years' }), note: { es: 'Estimada por el modelo de superficie de MERRA-2 (GWETROOT), no medida.', en: 'Estimated by MERRA-2’s land-surface model (GWETROOT), not measured.' }, about: { shows: {"es": "Celdas donde el suelo estuvo más seco de lo normal.", "en": "Cells where soils stayed drier than usual."}, useFor: {"es": "Encontrar estrés en el agua guardada en el suelo.", "en": "Find stress in the water stored in soils."} }, unit: {"es": "años de los últimos 5", "en": "years of the last 5"}, reading: null },
  { id: 'historical-drought', group: 'observed', target: 'municipalities', label: { es: 'Sequía histórica (CONAGUA)', en: 'Historical drought (CONAGUA)' }, classes: [
    { id: 'recent-2plus', label: { es: 'Sequía D1+ en ≥ 2 de los últimos 5 años', en: 'D1+ drought in ≥ 2 of the last 5 years' }, color: '#9A3412' },
    { id: 'recent-1', label: { es: 'Sequía D1+ en 1 de los últimos 5 años', en: 'D1+ drought in 1 of the last 5 years' }, color: '#F2C27B' },
    { id: 'none', label: { es: 'Sin sequía D1+ reciente registrada', en: 'No recent D1+ drought recorded' }, color: '#D6E4F0' },
    { id: 'na', label: { es: 'Sin cobertura suficiente', en: 'Not enough coverage' }, color: '#EEEEEE' },
  ], note: { es: 'Monitor de Sequía de México por municipio. Sin registro no significa sin sequía.', en: 'Mexican Drought Monitor by municipality. No record does not mean no drought.' }, about: { shows: {"es": "Municipios donde CONAGUA registró sequía reciente.", "en": "Municipalities where CONAGUA recorded recent drought."}, useFor: {"es": "Contrastar las señales con la sequía observada.", "en": "Check the signals against observed drought."} }, unit: {"es": "años de los últimos 5", "en": "years of the last 5"}, reading: null },
  { id: 'water-priority', group: 'priority', target: 'cells', label: { es: 'Prioridad de planeación hídrica', en: 'Water-planning priority' }, classes: STATUS_CLASSES, note: { es: 'Combinación de los cuatro componentes; corroborada exige evidencia observada.', en: 'Combination of the four components; corroborated requires observed evidence.' }, about: { shows: {"es": "Dónde coinciden varias señales de estrés hídrico.", "en": "Where several water-stress signals coincide."}, useFor: {"es": "Decidir dónde mirar primero en la planeación municipal.", "en": "Decide where to look first in municipal planning."} }, unit: {"es": "", "en": ""}, reading: null },
]

export const HEAT_LEGENDS: ImpactLegend[] = [
  { id: 'warm-days', group: 'hazard', target: 'cells', label: { es: 'Días cálidos (TX90p)', en: 'Warm days (TX90p)' }, classes: SIGNAL_CLASSES, note: { es: 'Peligro climático: % de días sobre el percentil 90 de 1991–2020.', en: 'Climate hazard: % of days above the 1991–2020 90th percentile.' }, about: { shows: {"es": "Dónde los días muy calurosos son cada vez más frecuentes.", "en": "Where unusually hot days are becoming more frequent."}, useFor: {"es": "Encontrar el calor diurno que va en aumento.", "en": "Find rising daytime heat."} }, unit: {"es": "pp/década", "en": "pp/decade"}, reading: null },
  { id: 'warm-nights', group: 'hazard', target: 'cells', label: { es: 'Noches cálidas (TN90p)', en: 'Warm nights (TN90p)' }, classes: SIGNAL_CLASSES, note: { es: 'Peligro climático: % de noches sobre el percentil 90 de 1991–2020.', en: 'Climate hazard: % of nights above the 1991–2020 90th percentile.' }, about: { shows: {"es": "Dónde las noches muy cálidas son cada vez más frecuentes.", "en": "Where unusually warm nights are becoming more frequent."}, useFor: {"es": "Encontrar noches que se enfrían menos que antes.", "en": "Find nights that cool down less than before."} }, unit: {"es": "pp/década", "en": "pp/decade"}, reading: null },
  { id: 'hot-extremes', group: 'hazard', target: 'cells', label: { es: 'Extremos cálidos (TXx)', en: 'Hot extremes (TXx)' }, classes: [
    { id: 'confirmed', label: { es: 'El día más cálido sube (p < 0.05)', en: 'Hottest day rising (p < 0.05)' }, color: '#C2410C' },
    { id: 'none', label: { es: 'Sin aumento significativo', en: 'No significant rise' }, color: '#DCE3EA' },
    { id: 'na', label: { es: 'No evaluable', en: 'Not evaluable' }, color: '#EEEEEE' },
  ], note: { es: 'TXx es el día más cálido de cada celda, no de toda la región.', en: 'TXx is each cell’s hottest day, not the whole region’s.' }, about: { shows: {"es": "Dónde el día más caluroso del año es cada vez más caluroso.", "en": "Where the hottest day of the year is getting hotter."}, useFor: {"es": "Comprobar si el calor extremo confirma la señal.", "en": "Check whether extreme heat confirms the signal."} }, unit: {"es": "°C/década", "en": "°C/decade"}, reading: null },
  { id: 'population-exposure', group: 'exposure', target: 'cells', label: { es: 'Exposición poblacional', en: 'Population exposure' }, classes: [
    { id: 'p3', label: { es: '1 millón o más', en: '1 million or more' }, color: '#3B1F7A' },
    { id: 'p2', label: { es: '100 mil – 1 millón', en: '100k – 1 million' }, color: '#6D4BB8' },
    { id: 'p1', label: { es: '10 mil – 100 mil', en: '10k – 100k' }, color: '#A895DA' },
    { id: 'p0', label: { es: 'Menos de 10 mil', en: 'Under 10k' }, color: '#E3DCF3' },
    { id: 'na', label: { es: 'Sin localidades', en: 'No localities' }, color: '#F4F4F4' },
  ], note: { es: 'Población 2020 (INEGI) de las localidades dentro de cada celda; no se reparte sobre el área.', en: '2020 population (INEGI) of the localities inside each cell; not spread over the area.' }, about: { shows: {"es": "Cuántas personas viven en cada celda (censo 2020).", "en": "How many people live in each cell (2020 census)."}, useFor: {"es": "Ver a cuánta gente alcanza una señal.", "en": "See how many people a signal reaches."} }, unit: {"es": "personas", "en": "people"}, reading: null },
  { id: 'urban-exposure', group: 'exposure', target: 'cells', label: { es: 'Exposición urbana', en: 'Urban exposure' }, classes: [
    { id: 'u3', label: { es: '75% urbano o más', en: '75% urban or more' }, color: '#3B1F7A' },
    { id: 'u2', label: { es: '50–75% urbano', en: '50–75% urban' }, color: '#6D4BB8' },
    { id: 'u1', label: { es: '25–50% urbano', en: '25–50% urban' }, color: '#A895DA' },
    { id: 'u0', label: { es: 'Menos de 25% urbano', en: 'Under 25% urban' }, color: '#E3DCF3' },
    { id: 'na', label: { es: 'Sin localidades', en: 'No localities' }, color: '#F4F4F4' },
  ], note: { es: 'Urbano = localidades de 2 500 habitantes o más (definición de INEGI).', en: 'Urban = localities of 2,500 people or more (INEGI definition).' }, about: { shows: {"es": "Qué tan urbana es cada celda.", "en": "How urban each cell is."}, useFor: {"es": "Ubicar las ciudades, donde se concentra la exposición.", "en": "Locate cities, where exposure concentrates."} }, unit: {"es": "% urbano", "en": "% urban"}, reading: null },
  { id: 'priority-zones', group: 'priority', target: 'cells', label: { es: 'Zonas prioritarias', en: 'Priority zones' }, classes: [
    { id: 'high-exposure-signal', label: PRIORITY_LABEL['high-exposure-signal'], color: '#B42318' },
    { id: 'signal-lower-exposure', label: PRIORITY_LABEL['signal-lower-exposure'], color: '#F59E0B' },
    { id: 'exposure-without-signal', label: PRIORITY_LABEL['exposure-without-signal'], color: '#8B7CC8' },
    { id: 'no-priority', label: PRIORITY_LABEL['no-priority'], color: '#DCE3EA' },
    { id: 'exposure-unknown', label: PRIORITY_LABEL['exposure-unknown'], color: '#F4F4F4' },
  ], note: { es: 'Combinación explícita de peligro (días o noches cálidos) y exposición (población o fracción urbana).', en: 'Explicit combination of hazard (warm days or nights) and exposure (population or urban share).' }, about: { shows: {"es": "Dónde una señal de calor coincide con mucha gente.", "en": "Where a heat signal overlaps many people."}, useFor: {"es": "Decidir dónde vigilar y prepararse primero.", "en": "Decide where to monitor and prepare first."} }, unit: {"es": "personas", "en": "people"}, reading: null },
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

/**
 * Classes that count as “signal” in each layer, from the most to the least relevant: the headline names the first one
 * present, and the population line adds up the people in all of them.
 */
const SIGNAL_ORDER: Record<string, string[]> = {
  'precipitation-stress': ['active'], 'atmospheric-demand': ['active'], 'root-zone-wetness': ['active'], 'historical-drought': ['recent-2plus'],
  'water-priority': ['corroborated', 'planning-signal', 'watch'],
  'warm-days': ['signal', 'watch'], 'warm-nights': ['signal', 'watch'], 'hot-extremes': ['confirmed'],
  'population-exposure': ['p3', 'p2'], 'urban-exposure': ['u3', 'u2'], 'priority-zones': ['high-exposure-signal', 'signal-lower-exposure'],
}

/** "4.4 million people" / "4.4 millones de personas", rounded for reading, never a fake precision. */
export function peopleText(value: number): Bilingual {
  if (value >= 1_000_000) return { es: `${(value / 1_000_000).toFixed(1)} millones de personas`, en: `${(value / 1_000_000).toFixed(1)} million people` }
  if (value >= 10_000) return { es: `${Math.round(value / 1000)} mil personas`, en: `${Math.round(value / 1000)} thousand people` }
  return { es: `${value.toLocaleString('es-MX')} personas`, en: `${value.toLocaleString('en-US')} people` }
}

/**
 * “Reading the map” for one layer: the most relevant signal class on the map and in how many units (cells or
 * municipalities), the 2020 population living in all signal units and its share of the mapped population, and the
 * class of the analysis point’s unit.
 */
export function layerReading(legend: ImpactLegend, units: Array<{ id: string; className: string; population: number | null }>, referenceId: string | null): LayerReading {
  const noun = legend.target === 'cells' ? { es: 'celdas', en: 'cells' } : { es: 'municipios', en: 'municipalities' }
  const order = SIGNAL_ORDER[legend.id] ?? []
  const label = (id: string) => legend.classes.find((item) => item.id === id)?.label ?? { es: id, en: id }
  const total = units.length
  const main = order.find((id) => units.some((unit) => unit.className === id))
  const headline: Bilingual = main
    ? { es: `${units.filter((unit) => unit.className === main).length} de ${total} ${noun.es}: ${label(main).es}.`, en: `${units.filter((unit) => unit.className === main).length} of ${total} ${noun.en}: ${label(main).en}.` }
    : { es: `Ninguna de las ${total} ${noun.es} está en “${label(order[0] ?? '').es}”.`, en: `None of the ${total} ${noun.en} is in “${label(order[0] ?? '').en}”.` }
  const signal = units.filter((unit) => order.includes(unit.className))
  const allPeople = units.reduce((sum, unit) => sum + (unit.population ?? 0), 0)
  const signalPeople = signal.reduce((sum, unit) => sum + (unit.population ?? 0), 0)
  const share = allPeople ? Math.round((signalPeople / allPeople) * 100) : null
  const affects: Bilingual | null = !signal.length || !allPeople ? null : {
    es: `≈ ${peopleText(signalPeople).es} viven ahí (${share}% de la población del mapa).`,
    en: `≈ ${peopleText(signalPeople).en} live there (${share}% of the people on the map).`,
  }
  const reference = referenceId ? units.find((unit) => unit.id === referenceId) : undefined
  const point: Bilingual | null = reference ? { es: `Punto de análisis: ${label(reference.className).es}.`, en: `Analysis point: ${label(reference.className).en}.` } : null
  return { headline, affects, point }
}

const unavailable = (reason: Bilingual, defaultLayer: string, layers: ImpactLegend[]): ImpactMap => ({ available: false, reason, stateCode: null, municipalGeometryUrl: null, defaultLayer, layers, cells: [], municipalities: [], snapshot: null })

const NOT_BUNDLED: Bilingual = {
  es: 'Los mapas temáticos están preparados para Puebla, Tlaxcala y Oaxaca. Aquí se muestra solo el análisis de la celda de referencia.',
  en: 'Thematic maps are prepared for Puebla, Tlaxcala and Oaxaca. This area shows the reference-cell analysis only.',
}

/** Per-cell and per-municipality layers of one lens for a study state, over the analysis window (capped to the snapshot). */
export async function buildImpactMap(lens: 'water' | 'heat', stateCode: string | null, startYear: number, endYear: number, root?: string, reference: { cellId: string | null; municipalityCode: string | null } = { cellId: null, municipalityCode: null }): Promise<ImpactMap> {
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
  const cellPeople = new Map<string, number | null>()
  for (const cell of snapshot.cells) {
    const people = await cellPopulation(cell.cellId, root)
    cellPeople.set(cell.cellId, people?.population ?? null)
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
      const population = people?.population ?? null
      layers['population-exposure'] = { value: population, class: population === null ? 'na' : population >= 1_000_000 ? 'p3' : population >= 100_000 ? 'p2' : population >= 10_000 ? 'p1' : 'p0', status: null }
      const urban = people?.urbanFraction ?? null
      layers['urban-exposure'] = { value: urban === null ? null : Math.round(urban * 100), class: urban === null ? 'na' : urban >= 0.75 ? 'u3' : urban >= 0.5 ? 'u2' : urban >= 0.25 ? 'u1' : 'u0', status: null }
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
  const municipalPeople = (await inegiMunicipalities(root)).byCode
  const layers = legends.map((legend) => ({
    ...legend,
    reading: legend.target === 'cells'
      ? layerReading(legend, cells.map((cell) => ({ id: cell.cellId, className: cell.layers[legend.id]?.class ?? 'na', population: cellPeople.get(cell.cellId) ?? null })), reference.cellId)
      : layerReading(legend, municipalLayers.map((item) => ({ id: item.code, className: item.layers[legend.id]?.class ?? 'na', population: municipalPeople.get(item.code)?.population ?? null })), reference.municipalityCode),
  }))
  return {
    available: true, reason: null, stateCode, municipalGeometryUrl: municipalGeometryUrl(stateCode), defaultLayer, layers, cells, municipalities: municipalLayers,
    snapshot: { retrievedAt: snapshot.generatedAt, window: { startYear: start, endYear: end } },
  }
}
