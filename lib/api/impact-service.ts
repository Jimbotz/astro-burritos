/**
 * Orchestrates GET|POST /api/impact (IMPLEMENTACION_LENTES_IMPACTO §7–9).
 *
 * The decision support runs at a reference MERRA-2 cell: the analysis point the interface sends, the seat of the
 * requested municipality, or the seat of the state's most populous municipality. Its POWER daily records are fetched
 * live (public API, no token), normalized and quality-checked, turned into annual series with the same functions as
 * the bundled per-cell snapshot, and assessed with EarthScope's robust trend statistics. Bundled CONAGUA/SMN and INEGI
 * subsets add observed drought, station validation and population exposure. Nothing here uses a language model.
 */
import { baselineMean, daysInYear, type AnnualPoint, type SeriesMap } from '../analysis/annual-rules'
import { resolveImpactWindow } from '../analysis/common-window'
import { ET0_NOTE_TEXT } from '../analysis/et0'
import { heatSeriesFromDaily, waterSeriesFromDaily } from '../analysis/impact-series'
import { normalizePowerDaily, validateRecords, validSeries, type QualitySummary } from '../analysis/impact-quality'
import { recentStats } from '../analysis/impact-stats'
import { assessSeries, finalizeFamily, optionsFromProfile, type RobustTrend } from '../analysis/robust-assessment'
import { classifyWater, demandStress, observedDrought, storageStress, supplyStress, waterSensitivity, type ComponentResult } from '../analysis/water-risk'
import { classifyHeat, heatPriority, HEAT_THRESHOLDS } from '../analysis/heat-risk'
import { annualFromDaily } from '../analysis/annual-rules'
import { cellCenter, cellId, fetchDailyPoint, type PowerSourceInfo } from '../nasa/power'
import { getVariable, type ProcessingProfile, type TrendPolicy } from '../variables/catalog'
import { municipalDrought, nearestStation, validateStation, droughtMonitor, droughtSummaryFrom } from '../data/conagua'
import { cellPopulation, findMunicipality, municipalitiesOfState, type InegiMunicipality } from '../data/inegi'
import { MEXICO_STATE_CODES, municipalityAt, STUDY_STATES } from '../data/impact-geometry'
import { impactSources } from '../data/impact-manifest'
import { buildImpactMap, peopleText } from './impact-map'
import { BALANCE_PROFILE, ET0_PROFILE } from './impact-profiles'
import { ACTIONS, CANNOT_CONCLUDE, FINAL_STATEMENT, LENS_STATUS_LABEL, LIMITATIONS, PRIORITY_LABEL, QUESTIONS, severityFor, STATUS_LABEL } from './impact-text'
import { IMPACT_SCHEMA_VERSION, type Bilingual, type DecisionSupport, type HeatImpactResponse, type ImpactIndicator, type ImpactLens, type ImpactMunicipality, type ImpactPeriod, type ImpactScope, type ImpactSourceRef, type ImpactStatus, type WaterImpactResponse, type WindowMode } from './impact-types'
import { RequestError } from './validation'

export type ImpactRequest = { lens: ImpactLens; country: string | null; state: string | null; municipalityCode: string | null; latitude: number | null; longitude: number | null; startYear: number; endYear: number; mode: WindowMode }

/** Two POWER requests of ~1.2 MB each, so each fits the 2 MB data-cache limit. */
const GROUP_A = ['T2M_MAX', 'T2M_MIN', 'T2MDEW', 'WS10M', 'PS', 'T2M']
const GROUP_B = ['ALLSKY_SFC_SW_DWN', 'ALLSKY_SFC_SW_UP', 'ALLSKY_SFC_LW_DWN', 'ALLSKY_SFC_LW_UP', 'PRECTOTCORR', 'GWETROOT']
/** The 1991–2020 baseline (percentiles, TX90p thresholds) needs the series from 1991. */
export const IMPACT_FETCH_START = 1991
export const STATION_MAX_KM = 30

// ---------------------------------------------------------------- scope

type ResolvedScope = { scope: ImpactScope; stateCode: string | null; referenceMunicipality: InegiMunicipality | null; municipalityNote: Bilingual | null }

async function resolveScope(request: ImpactRequest, root?: string): Promise<ResolvedScope> {
  if (request.municipalityCode) {
    const municipality = await findMunicipality(request.municipalityCode, root)
    if (!municipality) throw new RequestError(`Unknown INEGI municipality code ${request.municipalityCode}.`, 404)
    if (!municipality.seat) throw new RequestError(`Municipality ${request.municipalityCode} has no locality with coordinates.`, 422)
    const { lat, lon } = municipality.seat
    return {
      stateCode: municipality.stateCode, referenceMunicipality: municipality, municipalityNote: null,
      scope: { kind: 'municipality', name: `${municipality.name}, ${municipality.stateName}`, country: 'MEX', state: municipality.stateName, stateCode: municipality.stateCode, municipalityCode: municipality.code, reference: { latitude: lat, longitude: lon, cellId: refCell(lat, lon), label: { es: `Cabecera municipal: ${municipality.seat.name}`, en: `Municipal seat: ${municipality.seat.name}` } } },
    }
  }
  const stateCode = request.country === 'MEX' && request.state ? MEXICO_STATE_CODES[request.state] ?? null : null
  if (request.latitude !== null && request.longitude !== null) {
    const { latitude: lat, longitude: lon } = request
    const resolved = stateCode ? await referenceMunicipalityFor(stateCode, lat, lon, root) : { municipality: null, note: null }
    return {
      stateCode, referenceMunicipality: resolved.municipality, municipalityNote: resolved.note,
      scope: { kind: request.state ? 'state' : 'point', name: request.state ? `${request.state}${request.country ? `, ${request.country}` : ''}` : `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`, country: request.country, state: request.state, stateCode, municipalityCode: resolved.municipality?.code ?? null, reference: { latitude: lat, longitude: lon, cellId: refCell(lat, lon), label: { es: 'Punto de análisis', en: 'Analysis point' } } },
    }
  }
  if (stateCode) {
    const largest = (await municipalitiesOfState(stateCode, root)).filter((item) => item.seat).sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0]
    if (!largest?.seat) throw new RequestError(`No municipal seat with coordinates in ${request.state}.`, 422)
    const { lat, lon } = largest.seat
    return {
      stateCode, referenceMunicipality: largest, municipalityNote: null,
      scope: { kind: 'state', name: `${request.state}, MEX`, country: 'MEX', state: request.state, stateCode, municipalityCode: largest.code, reference: { latitude: lat, longitude: lon, cellId: refCell(lat, lon), label: { es: `Cabecera del municipio más poblado: ${largest.seat.name}`, en: `Seat of the most populous municipality: ${largest.seat.name}` } } },
    }
  }
  throw new RequestError('Send latitude and longitude, municipalityCode, or country=MEX with a state name.')
}

const refCell = (lat: number, lon: number) => { const center = cellCenter(lat, lon); return cellId(center.lat, center.lon) }

async function referenceMunicipalityFor(stateCode: string, lat: number, lon: number, root?: string): Promise<{ municipality: InegiMunicipality | null; note: Bilingual | null }> {
  if (STUDY_STATES[stateCode]) {
    const feature = await municipalityAt(stateCode, lat, lon, root)
    if (feature) return { municipality: await findMunicipality(feature.properties.code, root), note: null }
  }
  // Outside the bundled outlines: the municipality whose seat is nearest to the point (stated as an approximation).
  const list = (await municipalitiesOfState(stateCode, root)).filter((item) => item.seat)
  const nearest = list.sort((a, b) => ((a.seat!.lat - lat) ** 2 + (a.seat!.lon - lon) ** 2) - ((b.seat!.lat - lat) ** 2 + (b.seat!.lon - lon) ** 2))[0] ?? null
  return { municipality: nearest, note: nearest ? { es: `Municipio de referencia aproximado por la cabecera más cercana (${nearest.name}).`, en: `Reference municipality approximated by the nearest municipal seat (${nearest.name}).` } : null }
}

// ---------------------------------------------------------------- reference cell (live POWER)

type Reference = { series: Record<string, SeriesMap>; quality: QualitySummary; sources: PowerSourceInfo[]; elevationM: number | null }

async function referenceCell(lat: number, lon: number, endYear: number, signal?: AbortSignal): Promise<Reference> {
  const [a, b] = await Promise.all([fetchDailyPoint(GROUP_A, lat, lon, IMPACT_FETCH_START, endYear, signal), fetchDailyPoint(GROUP_B, lat, lon, IMPACT_FETCH_START, endYear, signal)])
  const raw = { ...a.series, ...b.series }
  const units = { ...a.units, ...b.units }
  const records = normalizePowerDaily(raw, units, lat, lon, refCell(lat, lon), IMPACT_FETCH_START, endYear)
  let expected = 0
  for (let year = IMPACT_FETCH_START; year <= endYear; year += 1) expected += daysInYear(year)
  const quality = validateRecords(records, expected * Object.keys(raw).length)
  return { series: validSeries(records), quality, sources: [a.source, b.source], elevationM: a.elevationM }
}

// ---------------------------------------------------------------- indicators

type TrendInput = { points: AnnualPoint[]; profile: ProcessingProfile; policy: TrendPolicy; unit: string }

function trend(input: TrendInput, window: { startYear: number; endYear: number } | null): RobustTrend | null {
  if (!window) return null
  return assessSeries(input.points, window.startYear, window.endYear, optionsFromProfile(input.profile, input.policy, input.unit, baselineMean(input.points)))
}

const completeYears = (points: AnnualPoint[]) => points.filter((point) => point.complete && point.value !== null).map((point) => point.year)

function powerRef(product: string, url: string | undefined): ImpactSourceRef {
  return { sourceId: 'nasa-power', provider: 'NASA', product, resolution: 'MERRA-2 cell 0.5° × 0.625°', endpoint: url ?? 'https://power.larc.nasa.gov/api/temporal/daily/point', accessMode: 'public-api' }
}

const NAME = (text: Bilingual) => text

function indicator(args: {
  id: string; label: Bilingual; description: Bilingual; method: Bilingual; unit: string; points: AnnualPoint[]; trend: RobustTrend | null; window: { startYear: number; endYear: number } | null
  requested: { startYear: number; endYear: number }; source: ImpactSourceRef; interpretation: Bilingual; limitations: { es: string[]; en: string[] }; recent?: boolean; outOfBounds?: number; blocked?: boolean
}): ImpactIndicator {
  const period = args.window ?? args.requested
  const inWindow = args.points.filter((point) => point.year >= period.startYear && point.year <= period.endYear)
  const complete = inWindow.filter((point) => point.complete && point.value !== null)
  const t = args.trend
  const display = t?.display
  const significant = t?.pValueHamedRao !== null && t?.pValueHamedRao !== undefined && t.pValueHamedRao < 0.05
  const claimable = Boolean(t?.claimAllowed && (t.verdict === 'robust' || t.verdict === 'probable') && display?.slope)
  const recent = args.recent === false ? null : recentStats(args.points, period.endYear)
  return {
    id: args.id, label: args.label, description: args.description, unit: args.unit, period, source: args.source, method: args.method,
    value: recent?.mean ?? complete.at(-1)?.value ?? null,
    valueLabel: recent?.mean !== null && recent ? { es: `Media de ${recent.years[0]}–${recent.years.at(-1)}`, en: `Mean of ${recent.years[0]}–${recent.years.at(-1)}` } : { es: 'Último año completo', en: 'Latest complete year' },
    trend: t && display ? {
      direction: claimable ? (display.slope! > 0 ? 'increasing' : 'decreasing') : 'unknown',
      slopePerYear: display.slope !== null ? display.slope / 10 : null,
      slopePerDecade: display.slope,
      confidenceInterval95: display.ci95,
      pValue: t.pValueHamedRao,
      adjustedPValue: t.qValue,
      mannKendallSignificant: significant,
      status: args.blocked ? 'blocked' : t.verdict === 'insufficient-data' ? 'blocked' : t.verdict,
      claimAllowed: t.claimAllowed,
      unit: display.unit,
    } : null,
    quality: { validRecords: complete.length, expectedRecords: inWindow.length, completeness: inWindow.length ? complete.length / inWindow.length : 0, missingCount: inWindow.length - complete.length, outOfBoundsCount: args.outOfBounds ?? 0, completeYears: complete.map((point) => point.year) },
    recent,
    series: inWindow,
    interpretation: args.interpretation,
    limitations: args.limitations,
  }
}

/** Plain interpretation of a trend in the lens's words; never a claim the statistics do not support. */
function interpret(name: Bilingual, t: RobustTrend | null, extra?: { up: Bilingual; down: Bilingual }): Bilingual {
  if (!t || t.verdict === 'insufficient-data') return { es: `No hay suficientes años completos para evaluar ${name.es}.`, en: `There are not enough complete years to assess ${name.en}.` }
  if (!t.claimAllowed) return { es: `${cap(name.es)} se muestra sin afirmar aumento ni disminución: frente a estaciones, la lluvia de POWER casi no sigue los cambios de un año a otro.`, en: `${cap(name.en)} is shown without stating an increase or decrease: against stations, POWER rain barely follows year-to-year changes.` }
  if ((t.verdict === 'robust' || t.verdict === 'probable') && t.display.slope !== null) {
    const up = t.display.slope > 0
    const strength = t.verdict === 'robust' ? { es: 'tendencia robusta (5 de 5 pruebas)', en: 'robust trend (5 of 5 checks)' } : { es: `tendencia probable (${t.criteriaMet} de 5 pruebas)`, en: `probable trend (${t.criteriaMet} of 5 checks)` }
    if (extra) return { es: `${(up ? extra.up : extra.down).es} (${strength.es}).`, en: `${(up ? extra.up : extra.down).en} (${strength.en}).` }
    return { es: `${cap(name.es)} ${up ? 'aumenta' : 'disminuye'}: ${strength.es}.`, en: `${cap(name.en)} is ${up ? 'increasing' : 'decreasing'}: ${strength.en}.` }
  }
  if (t.verdict === 'weak') return { es: `${cap(name.es)} muestra solo una señal débil: no basta para hablar de tendencia.`, en: `${cap(name.en)} shows only a weak signal: not enough to call it a trend.` }
  return { es: `No se detecta tendencia en ${name.es}. Eso no es lo mismo que “sin cambio”.`, en: `No trend is detectable in ${name.en}. That is not the same as “no change”.` }
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function periodFrom(window: ReturnType<typeof resolveImpactWindow>, notes: Record<string, Bilingual | null> = {}): ImpactPeriod {
  return {
    requested: window.requested, effective: window.effective, mode: window.mode, blocked: window.blocked,
    sources: window.perSource.map((source) => ({ sourceId: source.sourceId, startYear: source.startYear, endYear: source.endYear, completeYears: source.completeYears.length, note: notes[source.sourceId] ?? (source.missingYears.length ? { es: `Años incompletos o fuera de cobertura: ${source.missingYears.join(', ')}.`, en: `Incomplete or uncovered years: ${source.missingYears.join(', ')}.` } : null) })),
  }
}

function componentDetail(result: ComponentResult, label: Bilingual): Bilingual {
  if (result.active === null) return { es: `${label.es}: no evaluable (falta cobertura de los últimos 5 años o de la base 1991–2020).`, en: `${label.en}: not evaluable (missing coverage of the last 5 years or the 1991–2020 base).` }
  const years = result.hits.length ? ` (${result.hits.join(', ')})` : ''
  const reason: Record<string, Bilingual> = {
    'below-percentile': { es: 'bajo el percentil de 1991–2020', en: 'below the 1991–2020 percentile' },
    'below-sd': { es: 'más de 1 DE bajo la media', en: 'more than 1 SD below the mean' },
    'above-percentile': { es: 'sobre el percentil 80 de 1991–2020', en: 'above the 1991–2020 80th percentile' },
    'robust-upward-trend': { es: 'tendencia robusta al alza y sobre la media', en: 'robust upward trend and above the mean' },
    'persistent-negative-anomaly': { es: 'bajo la media los 5 años', en: 'below the mean in all 5 years' },
    observed: { es: 'con sequía D1+ registrada', en: 'with D1+ drought recorded' },
    'not-persistent': { es: 'sin persistencia (menos de 3 de 5 años)', en: 'not persistent (fewer than 3 of 5 years)' },
    'not-observed': { es: 'sin sequía D1+ en 2 o más años', en: 'no D1+ drought in 2 or more years' },
  }
  const text = reason[result.reason] ?? { es: '', en: '' }
  if (!result.active) {
    const needs = result.reason === 'not-observed' ? 2 : 3
    return { es: `${label.es}: inactivo — umbral superado en ${result.hits.length} de ${result.evaluated.length} años recientes (se necesitan ${needs})${years}.`, en: `${label.en}: inactive — threshold met in ${result.hits.length} of ${result.evaluated.length} recent years (needs ${needs})${years}.` }
  }
  return { es: `${label.es}: activo — ${result.hits.length} de ${result.evaluated.length} años ${text.es}${years}.`, en: `${label.en}: active — ${result.hits.length} of ${result.evaluated.length} years ${text.en}${years}.` }
}

const listJoin = (items: string[], and: string) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${and} ${items.at(-1)}`)

async function municipalRows(stateCode: string | null, codes: string[] | null, endYear: number, layerClasses: Map<string, ImpactMunicipality['layers']>, root?: string): Promise<ImpactMunicipality[]> {
  if (!stateCode && !codes) return []
  const all = codes ? (await Promise.all(codes.map((code) => findMunicipality(code, root)))).filter((item): item is InegiMunicipality => item !== null) : await municipalitiesOfState(stateCode!, root)
  const drought = await droughtMonitor(root)
  return all.map((item) => {
    const entry = drought.municipalities[item.code]
    return {
      code: item.code, name: item.name, stateCode: item.stateCode, population: item.population, urbanPopulation: item.urbanPopulation, urbanFraction: item.urbanFraction, placedPopulationShare: item.placedPopulationShare,
      drought: entry ? droughtSummaryFrom(drought.dates, entry.series, endYear) : null,
      layers: layerClasses.get(item.code) ?? {},
    }
  })
}

// ---------------------------------------------------------------- water lens

export async function analyzeWaterImpact(request: ImpactRequest, signal?: AbortSignal, root?: string): Promise<WaterImpactResponse> {
  const resolved = await resolveScope(request, root)
  const { scope } = resolved
  const ref = await referenceCell(scope.reference.latitude, scope.reference.longitude, request.endYear, signal)
  const water = waterSeriesFromDaily(ref.series as never, IMPACT_FETCH_START, request.endYear)
  const window = resolveImpactWindow([
    { sourceId: 'nasa-power:precipitation', completeYears: completeYears(water.precip) },
    { sourceId: 'nasa-power:et0', completeYears: completeYears(water.et0) },
    { sourceId: 'nasa-power:root-zone-wetness', completeYears: completeYears(water.wetness) },
  ], request.mode, request.startYear, request.endYear)
  const eff = window.effective
  const precipV = getVariable('PRECTOTCORR')!
  const wetV = getVariable('PREC_MJJASO')!
  const soilV = getVariable('GWETROOT')!
  const inputs: Record<string, TrendInput> = {
    precipitation: { points: water.precip, profile: precipV.profile, policy: precipV.trendPolicy, unit: 'mm' },
    'precipitation-wet': { points: water.precipWet ?? [], profile: wetV.profile, policy: wetV.trendPolicy, unit: 'mm' },
    et0: { points: water.et0, profile: ET0_PROFILE, policy: 'allowed', unit: 'mm' },
    'et0-wet': { points: water.et0Wet ?? [], profile: ET0_PROFILE, policy: 'allowed', unit: 'mm' },
    balance: { points: water.balance, profile: BALANCE_PROFILE, policy: 'show-without-claim', unit: 'mm' },
    'balance-wet': { points: water.balanceWet ?? [], profile: BALANCE_PROFILE, policy: 'show-without-claim', unit: 'mm' },
    'root-zone-wetness': { points: water.wetness, profile: soilV.profile, policy: soilV.trendPolicy, unit: 'fracción' },
  }
  const trends = Object.fromEntries(Object.entries(inputs).map(([id, input]) => [id, trend(input, eff)])) as Record<string, RobustTrend | null>
  finalizeFamily(Object.entries(trends).filter((entry): entry is [string, RobustTrend] => entry[1] !== null).map(([id, value]) => ({ id, trend: value })))

  const endYear = eff?.endYear ?? request.endYear
  const municipalityCode = resolved.referenceMunicipality?.code ?? null
  const drought = municipalityCode ? await municipalDrought(municipalityCode, endYear, root) : null
  const near = await nearestStation(scope.reference.latitude, scope.reference.longitude, STATION_MAX_KM, root)
  const station = near ? validateStation(near.station, near.distance, scope.reference.cellId, water.precip, endYear) : null
  const blocked = eff === null
  const components = blocked ? null : {
    supplyStress: supplyStress(water.precip, endYear),
    demandStress: demandStress(water.et0, trends.et0, endYear),
    storageStress: storageStress(water.wetness, endYear),
    observedDrought: observedDrought(drought?.years ?? null, endYear),
  }
  const classification = components ? classifyWater(components, station?.evidence ?? null) : { status: 'insufficient-data' as ImpactStatus, active: [], evaluable: [] }
  const sensitivity = components ? waterSensitivity({ precip: water.precip, et0: water.et0, wetness: water.wetness, et0Trend: trends.et0, drought: drought?.years ?? null }, endYear, station?.evidence ?? null) : null
  const status = classification.status

  const COMPONENT_LABEL: Record<string, Bilingual> = {
    supplyStress: { es: 'Estrés de precipitación', en: 'Precipitation stress' },
    demandStress: { es: 'Demanda atmosférica elevada', en: 'High atmospheric demand' },
    storageStress: { es: 'Humedad radicular baja', en: 'Low root-zone wetness' },
    observedDrought: { es: 'Sequía observada (CONAGUA)', en: 'Observed drought (CONAGUA)' },
  }
  const SUBJECT: Record<string, Bilingual> = { supplyStress: { es: 'la precipitación', en: 'precipitation' }, demandStress: { es: 'la demanda atmosférica', en: 'atmospheric demand' }, storageStress: { es: 'la humedad radicular', en: 'root-zone wetness' }, observedDrought: { es: 'la sequía observada', en: 'observed drought' } }
  const active = classification.active
  const summary: Bilingual = status === 'insufficient-data'
    ? { es: `No hay evidencia suficiente para emitir una señal${blocked ? ': no hay una ventana común completa entre lluvia, ET0 y humedad' : ': menos de dos componentes climáticos tienen cobertura de los últimos 5 años y de la base 1991–2020'}.`, en: `There is not enough evidence to issue a signal${blocked ? ': there is no complete common window of rain, ET0 and wetness' : ': fewer than two climate components cover the last 5 years and the 1991–2020 base'}.` }
    : status === 'no-detectable' ? { es: 'No se detectó una señal robusta en la ventana analizada.', en: 'No robust signal was detected in the analysed window.' }
      : status === 'watch' ? { es: `${cap(SUBJECT[active[0]].es)} supera su umbral; los demás componentes no.`, en: `${cap(SUBJECT[active[0]].en)} is past its threshold; the other components are not.` }
        : { es: `${cap(listJoin(active.map((id) => SUBJECT[id].es), 'y'))} muestran estrés persistente en la ventana común${status === 'corroborated' ? ', con evidencia observada' : ''}.`, en: `${cap(listJoin(active.map((id) => SUBJECT[id].en), 'and'))} show persistent stress in the common window${status === 'corroborated' ? ', with observed evidence' : ''}.` }
  const decisionSupport: DecisionSupport = {
    status, label: LENS_STATUS_LABEL.water[status] ?? STATUS_LABEL[status], severity: severityFor('water', status), summary, recommendedAction: ACTIONS.water[status], notACommand: true,
    components: components ? { supplyStress: components.supplyStress.active, demandStress: components.demandStress.active, storageStress: components.storageStress.active, observedDrought: components.observedDrought.active } : { supplyStress: null, demandStress: null, storageStress: null, observedDrought: null },
    componentDetails: components ? (Object.keys(COMPONENT_LABEL) as Array<keyof typeof components>).map((id) => ({ id, label: COMPONENT_LABEL[id], active: components[id].active, short: waterShort(id, components[id]), detail: componentDetail(components[id], COMPONENT_LABEL[id]) })) : [],
    sensitivity: sensitivity?.sensitivity ?? null,
    cannotConclude: CANNOT_CONCLUDE.water,
  }

  const powerSrc = powerRef('POWER daily point API v2.10 / MERRA-2', ref.sources[1]?.url)
  const et0Src = powerRef('FAO-56 ET0 from POWER (MERRA-2 meteorology, CERES SYN1deg radiation)', ref.sources[0]?.url)
  const lim = (items: Bilingual[]) => ({ es: items.map((item) => item.es), en: items.map((item) => item.en) })
  const requested = { startYear: request.startYear, endYear: request.endYear }
  const indicators: ImpactIndicator[] = [
    indicator({ id: 'precipitation', label: { es: 'Precipitación anual', en: 'Annual precipitation' }, description: { es: 'Suma anual: PRECTOTCORR mensual × días del mes.', en: 'Annual total: monthly PRECTOTCORR × days in the month.' }, method: { es: 'Sen con intervalo de Gilbert; p de Hamed–Rao; sin afirmación de tendencia.', en: 'Sen with a Gilbert interval; Hamed–Rao p; no trend claim.' }, unit: 'mm', points: water.precip, trend: trends.precipitation, window: eff, requested, source: powerSrc, interpretation: interpret(NAME({ es: 'la precipitación anual', en: 'annual precipitation' }), trends.precipitation), limitations: lim([LIMITATIONS.water[3], LIMITATIONS.water[4]]), outOfBounds: water.outOfBounds.precip, blocked }),
    indicator({ id: 'precipitation-wet', label: { es: 'Lluvia de la temporada de lluvias', en: 'Wet-season rain' }, description: { es: `Total de los 6 meses más lluviosos de 1991–2020 en la celda${water.seasons ? ` (${water.seasons.wet.months.join(', ')})` : ''}.`, en: `Total of the cell’s 6 rainiest months of 1991–2020${water.seasons ? ` (${water.seasons.wet.months.join(', ')})` : ''}.` }, method: { es: 'Sen con intervalo de Gilbert; sin afirmación de tendencia.', en: 'Sen with a Gilbert interval; no trend claim.' }, unit: 'mm', points: water.precipWet ?? [], trend: trends['precipitation-wet'], window: eff, requested, source: powerSrc, interpretation: interpret(NAME({ es: 'la lluvia de temporada', en: 'wet-season rain' }), trends['precipitation-wet']), limitations: lim([LIMITATIONS.water[3]]), blocked }),
    indicator({ id: 'et0', label: { es: 'Evapotranspiración de referencia (ET0)', en: 'Reference evapotranspiration (ET0)' }, description: { es: 'Demanda atmosférica anual de un pasto de referencia, FAO-56 Penman–Monteith diaria.', en: 'Annual atmospheric demand of a reference grass, daily FAO-56 Penman–Monteith.' }, method: { es: 'OLS con intervalo bootstrap por bloques; p de Hamed–Rao; q de Benjamini–Hochberg en la familia del lente.', en: 'OLS with a block-bootstrap interval; Hamed–Rao p; Benjamini–Hochberg q within the lens family.' }, unit: 'mm', points: water.et0, trend: trends.et0, window: eff, requested, source: et0Src, interpretation: interpret(NAME({ es: 'la ET0 anual', en: 'annual ET0' }), trends.et0, { up: { es: 'La demanda atmosférica de agua aumenta', en: 'Atmospheric water demand is increasing' }, down: { es: 'La demanda atmosférica de agua disminuye', en: 'Atmospheric water demand is decreasing' } }), limitations: lim([LIMITATIONS.water[2], ET0_NOTE_TEXT['actual-surface-albedo'], ET0_NOTE_TEXT['radiation-product-change']]), outOfBounds: water.et0Detail.quality.flaggedDays, blocked }),
    indicator({ id: 'balance', label: { es: 'Balance climático de agua', en: 'Climate water balance' }, description: { es: 'Precipitación anual − ET0 anual. Balance climático estimado; no es agua disponible en presas o acuíferos.', en: 'Annual precipitation − annual ET0. Estimated climate balance; not water available in dams or aquifers.' }, method: { es: 'Sen con intervalo de Gilbert; sin afirmación de tendencia (hereda la incertidumbre de la lluvia).', en: 'Sen with a Gilbert interval; no trend claim (it inherits rain’s uncertainty).' }, unit: 'mm', points: water.balance, trend: trends.balance, window: eff, requested, source: et0Src, interpretation: interpret(NAME({ es: 'el balance climático', en: 'the climate balance' }), trends.balance), limitations: lim([LIMITATIONS.water[0]]), blocked }),
    indicator({ id: 'balance-wet', label: { es: 'Balance de la temporada de lluvias', en: 'Wet-season balance' }, description: { es: 'Lluvia de temporada − ET0 de los mismos meses.', en: 'Wet-season rain − ET0 of the same months.' }, method: { es: 'Sen con intervalo de Gilbert; sin afirmación de tendencia.', en: 'Sen with a Gilbert interval; no trend claim.' }, unit: 'mm', points: water.balanceWet ?? [], trend: trends['balance-wet'], window: eff, requested, source: et0Src, interpretation: interpret(NAME({ es: 'el balance de temporada', en: 'the wet-season balance' }), trends['balance-wet']), limitations: lim([LIMITATIONS.water[0]]), blocked }),
    indicator({ id: 'root-zone-wetness', label: { es: 'Humedad de zona radicular', en: 'Root-zone wetness' }, description: { es: 'GWETROOT: fracción 0–1 de agua disponible para las plantas en la zona radicular, estimada por un modelo de superficie.', en: 'GWETROOT: 0–1 fraction of plant-available water in the root zone, estimated by a land-surface model.' }, method: { es: 'OLS con intervalo bootstrap por bloques; anomalía contra 1991–2020; persistencia en 5 años.', en: 'OLS with a block-bootstrap interval; anomaly against 1991–2020; persistence over 5 years.' }, unit: 'fraction', points: water.wetness, trend: trends['root-zone-wetness'], window: eff, requested, source: powerSrc, interpretation: interpret(NAME({ es: 'la humedad radicular', en: 'root-zone wetness' }), trends['root-zone-wetness']), limitations: lim([LIMITATIONS.water[1]]), outOfBounds: water.outOfBounds.wetness, blocked }),
  ]
  if (drought) {
    const summaryText = drought.summary
    indicators.push({
      id: 'observed-drought', label: { es: 'Sequía observada (Monitor de Sequía)', en: 'Observed drought (Drought Monitor)' }, description: { es: `Municipio de ${drought.name}: años con sequía D1 o peor en los últimos 5 años con cobertura.`, en: `Municipality of ${drought.name}: years with D1-or-worse drought in the last 5 covered years.` },
      value: summaryText.recentYearsWithDrought, valueLabel: { es: `Años con sequía de ${summaryText.recentYearsCovered} cubiertos`, en: `Years in drought of ${summaryText.recentYearsCovered} covered` }, unit: 'years',
      period: { startYear: endYear - 4, endYear }, source: { sourceId: 'smn-drought-monitor', provider: 'CONAGUA / SMN', product: 'Monitor de Sequía de México', resolution: 'municipality', endpoint: 'bundled-snapshot', accessMode: 'bundled-snapshot' },
      method: { es: 'Conteo de años con al menos un registro D1+; duración máxima en meses consecutivos.', en: 'Count of years with at least one D1+ record; longest run of consecutive months.' },
      trend: null,
      quality: { validRecords: summaryText.coverage.records, expectedRecords: summaryText.coverage.records, completeness: summaryText.coverage.records ? 1 : 0, missingCount: 0, outOfBoundsCount: 0, completeYears: summaryText.coverage.years },
      recent: null, series: [],
      interpretation: summaryText.recentYearsCovered < 4 ? { es: 'Cobertura insuficiente del monitor en los últimos 5 años.', en: 'Not enough monitor coverage in the last 5 years.' } : { es: `${summaryText.recentYearsWithDrought} de los últimos 5 años con sequía D1+; duración máxima ${summaryText.maxDurationMonths} meses; categoría máxima ${summaryText.maxCategory ?? '—'} desde ${summaryText.coverage.firstDate?.slice(0, 4) ?? '—'}.`, en: `${summaryText.recentYearsWithDrought} of the last 5 years with D1+ drought; longest run ${summaryText.maxDurationMonths} months; worst category ${summaryText.maxCategory ?? '—'} since ${summaryText.coverage.firstDate?.slice(0, 4) ?? '—'}.` },
      limitations: { es: ['Evaluación experta municipal; la ausencia de registros no significa ausencia de sequía.'], en: ['Expert municipal assessment; the absence of records does not mean the absence of drought.'] },
    })
  }

  const map = await buildImpactMap('water', resolved.stateCode, eff?.startYear ?? request.startYear, endYear, root, { cellId: scope.reference.cellId, municipalityCode: resolved.referenceMunicipality?.code ?? null })
  const municipalLayers = new Map(map.municipalities.map((item) => [item.code, item.layers]))
  const municipalities = await municipalRows(scope.kind === 'state' ? resolved.stateCode : null, scope.kind === 'state' ? null : municipalityCode ? [municipalityCode] : null, endYear, municipalLayers, root)
  const warnings: Bilingual[] = []
  if (eff && eff.startYear <= 2000) warnings.push(ET0_NOTE_TEXT['radiation-product-change'])
  if (water.et0Detail.notes.includes('scaled-months')) warnings.push(ET0_NOTE_TEXT['scaled-months'])
  if (resolved.municipalityNote) warnings.push(resolved.municipalityNote)
  if (sensitivity?.sensitivity === 'high') warnings.push({ es: `El estado cambia con los umbrales de percentil (0.10: ${STATUS_LABEL[sensitivity.statuses['0.10']].es}; 0.20: ${STATUS_LABEL[sensitivity.statuses['0.20']].es}; 0.30: ${STATUS_LABEL[sensitivity.statuses['0.30']].es}): sensibilidad alta.`, en: `The status changes with the percentile thresholds (0.10: ${STATUS_LABEL[sensitivity.statuses['0.10']].en}; 0.20: ${STATUS_LABEL[sensitivity.statuses['0.20']].en}; 0.30: ${STATUS_LABEL[sensitivity.statuses['0.30']].en}): high sensitivity.` })
  if (!station) warnings.push({ es: `No hay estación del SMN empaquetada a menos de ${STATION_MAX_KM} km: la lluvia no se valida en este punto.`, en: `No bundled SMN station within ${STATION_MAX_KM} km: rain is not validated at this point.` })
  if (!drought) warnings.push({ es: 'Sin registros del Monitor de Sequía para este lugar: el componente de sequía observada no se evalúa (no significa ausencia de sequía).', en: 'No Drought Monitor records for this place: the observed-drought component is not evaluated (this does not mean no drought).' })
  if (map.snapshot && map.snapshot.window.endYear < endYear) warnings.push({ es: `Los mapas usan el snapshot de POWER hasta ${map.snapshot.window.endYear}.`, en: `The maps use the POWER snapshot up to ${map.snapshot.window.endYear}.` })

  return {
    schemaVersion: IMPACT_SCHEMA_VERSION, generatedAt: new Date().toISOString(), lens: 'water', question: QUESTIONS.water,
    request: { ...request }, scope, period: periodFrom(window), decisionSupport, indicators, map,
    municipalities, cells: map.cells, validation: { station },
    sources: await impactSources('water', root),
    quality: { reference: ref.quality, notes: water.et0Detail.notes.map((note) => ET0_NOTE_TEXT[note]) },
    warnings, limitations: LIMITATIONS.water,
    finalStatement: FINAL_STATEMENT.water(status === 'planning-signal' || status === 'corroborated'),
  }
}

// ---------------------------------------------------------------- heat lens

export async function analyzeHeatImpact(request: ImpactRequest, signal?: AbortSignal, root?: string): Promise<HeatImpactResponse> {
  const resolved = await resolveScope(request, root)
  const { scope } = resolved
  const ref = await referenceCell(scope.reference.latitude, scope.reference.longitude, request.endYear, signal)
  const heat = heatSeriesFromDaily(ref.series.T2M_MAX ?? new Map(), ref.series.T2M_MIN ?? new Map(), IMPACT_FETCH_START, request.endYear)
  const tx = annualFromDaily('daily-mean', ref.series.T2M_MAX ?? new Map(), IMPACT_FETCH_START, request.endYear)
  const tn = annualFromDaily('daily-mean', ref.series.T2M_MIN ?? new Map(), IMPACT_FETCH_START, request.endYear)
  const t2m = annualFromDaily('daily-mean', ref.series.T2M ?? new Map(), IMPACT_FETCH_START, request.endYear)
  const window = resolveImpactWindow([
    { sourceId: 'nasa-power:TX90p', completeYears: completeYears(heat.tx90p) },
    { sourceId: 'nasa-power:TN90p', completeYears: completeYears(heat.tn90p) },
    { sourceId: 'nasa-power:TXx', completeYears: completeYears(heat.txx) },
    { sourceId: 'nasa-power:TNn', completeYears: completeYears(heat.tnn) },
  ], request.mode, request.startYear, request.endYear)
  const eff = window.effective
  const v = (id: string) => getVariable(id)!
  const inputs: Record<string, TrendInput> = {
    TN90p: { points: heat.tn90p, profile: v('TN90p').profile, policy: 'allowed', unit: '% de días' },
    TX90p: { points: heat.tx90p, profile: v('TX90p').profile, policy: 'allowed', unit: '% de días' },
    TXx: { points: heat.txx, profile: v('TXx').profile, policy: 'allowed', unit: '°C' },
    TNn: { points: heat.tnn, profile: v('TNn').profile, policy: 'allowed', unit: '°C' },
    TX: { points: tx, profile: v('TX').profile, policy: 'allowed', unit: '°C' },
    TN: { points: tn, profile: v('TN').profile, policy: 'allowed', unit: '°C' },
    T2M: { points: t2m, profile: v('T2M').profile, policy: 'allowed', unit: '°C' },
  }
  const trends = Object.fromEntries(Object.entries(inputs).map(([id, input]) => [id, trend(input, eff)])) as Record<string, RobustTrend | null>
  finalizeFamily(Object.entries(trends).filter((entry): entry is [string, RobustTrend] => entry[1] !== null).map(([id, value]) => ({ id, trend: value })))
  const endYear = eff?.endYear ?? request.endYear
  const classification = eff ? classifyHeat({ tx90p: { trend: trends.TX90p, annual: heat.tx90p }, tn90p: { trend: trends.TN90p, annual: heat.tn90p }, txx: trends.TXx, tnn: trends.TNn }, endYear) : null
  const status: ImpactStatus = classification?.status ?? 'insufficient-data'

  // Exposure at the scale of the hazard: the municipality for a municipal request, the reference cell otherwise.
  const municipality = scope.kind === 'municipality' ? resolved.referenceMunicipality : null
  const people = municipality ? null : await cellPopulation(scope.reference.cellId, root)
  const inMexico = Boolean(resolved.stateCode) || scope.country === 'MEX' || Boolean(people)
  const exposure: HeatImpactResponse['exposure'] = municipality
    ? { populationYear: 2020, population: municipality.population, urbanPopulation: municipality.urbanPopulation, urbanFraction: municipality.urbanFraction, placedPopulationShare: municipality.placedPopulationShare, scale: 'municipality', source: 'INEGI_CPV_2020_ITER', note: { es: `Población del municipio de ${municipality.name} (censo 2020).`, en: `Population of the municipality of ${municipality.name} (2020 census).` } }
    : people ? { populationYear: 2020, population: people.population, urbanPopulation: people.urbanPopulation, urbanFraction: people.urbanFraction, placedPopulationShare: null, scale: 'cell', source: 'INEGI_CPV_2020_ITER', note: { es: `Población de las ${people.localities} localidades dentro de la celda de referencia (censo 2020); no se reparte sobre el área.`, en: `Population of the ${people.localities} localities inside the reference cell (2020 census); not spread over the area.` } }
      : { populationYear: inMexico ? 2020 : null, population: inMexico ? 0 : null, urbanPopulation: inMexico ? 0 : null, urbanFraction: null, placedPopulationShare: null, scale: inMexico ? 'cell' : null, source: inMexico ? 'INEGI_CPV_2020_ITER' : null, note: inMexico ? { es: 'Ninguna localidad del censo 2020 cae en la celda de referencia.', en: 'No 2020-census locality falls in the reference cell.' } : { es: 'La población solo está empaquetada para México (INEGI): la exposición no se evalúa aquí.', en: 'Population is bundled for Mexico only (INEGI): exposure is not evaluated here.' } }
  const priorityStatus = heatPriority(status, { population: exposure.population, urbanFraction: exposure.urbanFraction })
  const reasons: Record<string, Bilingual> = {
    'high-exposure-signal': { es: `Una señal de calor robusta coincide con ${fmtPeople(exposure.population, 'es')} expuestas${(exposure.urbanFraction ?? 0) >= HEAT_THRESHOLDS.highUrbanFraction ? ' en un área mayormente urbana' : ''}.`, en: `A robust heat signal overlaps ${fmtPeople(exposure.population, 'en')} exposed${(exposure.urbanFraction ?? 0) >= HEAT_THRESHOLDS.highUrbanFraction ? ' in a mostly urban area' : ''}.` },
    'signal-lower-exposure': { es: 'Hay señal de calor, pero la exposición está bajo los umbrales (100 mil personas o mayoría urbana).', en: 'There is a heat signal, but exposure is below the thresholds (100,000 people or an urban majority).' },
    'exposure-without-signal': { es: 'La exposición es alta, pero no hay una señal climática robusta.', en: 'Exposure is high, but there is no robust climate signal.' },
    'no-priority': { es: 'Ni señal climática robusta ni exposición alta.', en: 'Neither a robust climate signal nor high exposure.' },
    'exposure-unknown': { es: 'Sin datos de población para combinar con el peligro.', en: 'No population data to combine with the hazard.' },
  }

  const comps = classification?.components ?? { warmDays: null, warmNights: null, hotExtreme: null, coldExtreme: null }
  const nightsLead = Boolean(comps.warmNights)
  const summary: Bilingual = status === 'corroborated'
    ? (comps.warmNights && comps.coldExtreme ? { es: 'Las noches cálidas aumentan y el cambio coincide con el comportamiento del extremo mínimo anual.', en: 'Warm nights are increasing, and the change matches the behaviour of the annual minimum extreme.' } : { es: 'Los días cálidos aumentan y el cambio coincide con el comportamiento del extremo máximo anual.', en: 'Warm days are increasing, and the change matches the behaviour of the annual maximum extreme.' })
    : status === 'planning-signal' ? { es: `${nightsLead ? 'Las noches cálidas' : 'Los días cálidos'} aumentan con una tendencia robusta; el extremo anual aún no lo confirma.`, en: `${nightsLead ? 'Warm nights' : 'Warm days'} are increasing with a robust trend; the annual extreme does not confirm it yet.` }
      : status === 'watch' ? { es: 'La carga térmica reciente es alta, pero la tendencia no es robusta.', en: 'The recent heat load is high, but the trend is not robust.' }
        : status === 'no-detectable' ? { es: 'No se detectó una señal robusta en la ventana analizada.', en: 'No robust signal was detected in the analysed window.' }
          : { es: 'No hay evidencia suficiente para emitir una señal: faltan años completos de días o noches cálidos.', en: 'There is not enough evidence to issue a signal: complete years of warm days or nights are missing.' }
  const COMPONENT_LABEL: Record<string, Bilingual> = {
    warmNights: { es: 'Noches cálidas', en: 'Warm nights' }, warmDays: { es: 'Días cálidos', en: 'Warm days' },
    hotExtreme: { es: 'Día más cálido al alza (TXx)', en: 'Hottest day rising (TXx)' }, coldExtreme: { es: 'Noche más fría al alza (TNn)', en: 'Coldest night warming (TNn)' },
  }
  const criteriaText = (key: 'warmDays' | 'warmNights'): Bilingual => {
    const c = classification?.criteria[key]
    if (!c) return { es: 'No evaluable.', en: 'Not evaluable.' }
    const parts: Array<[boolean, Bilingual]> = [[c.mannKendall, { es: 'Mann–Kendall (Hamed–Rao) p < 0.05', en: 'Mann–Kendall (Hamed–Rao) p < 0.05' }], [c.intervalExcludesZero, { es: 'intervalo 95% sin cero', en: '95% interval excludes zero' }], [c.exceedsRelevance, { es: 'sobre el umbral de relevancia', en: 'above the relevance threshold' }], [c.enoughYears, { es: '≥ 20 años completos', en: '≥ 20 complete years' }], [c.upward, { es: 'al alza', en: 'upward' }]]
    return { es: parts.map(([ok, text]) => `${ok ? '✓' : '✗'} ${text.es}`).join(' · '), en: parts.map(([ok, text]) => `${ok ? '✓' : '✗'} ${text.en}`).join(' · ') }
  }
  const decisionSupport: DecisionSupport = {
    status, label: LENS_STATUS_LABEL.heat[status] ?? STATUS_LABEL[status], severity: severityFor('heat', status, priorityStatus), summary, recommendedAction: ACTIONS.heat[status], notACommand: true, notMedicalAdvice: true,
    components: comps,
    componentDetails: [
      { id: 'warmNights', label: COMPONENT_LABEL.warmNights, active: comps.warmNights, short: trendShort(comps.warmNights), detail: criteriaText('warmNights') },
      { id: 'warmDays', label: COMPONENT_LABEL.warmDays, active: comps.warmDays, short: trendShort(comps.warmDays), detail: criteriaText('warmDays') },
      { id: 'hotExtreme', label: COMPONENT_LABEL.hotExtreme, active: comps.hotExtreme, short: confirmShort(comps.hotExtreme), detail: extremeText('TXx', trends.TXx, comps.hotExtreme) },
      { id: 'coldExtreme', label: COMPONENT_LABEL.coldExtreme, active: comps.coldExtreme, short: confirmShort(comps.coldExtreme), detail: extremeText('TNn', trends.TNn, comps.coldExtreme) },
      { id: 'urbanExposure', label: { es: 'Exposición urbana', en: 'Urban exposure' }, active: exposure.urbanFraction === null ? null : exposure.urbanFraction >= HEAT_THRESHOLDS.highUrbanFraction, short: exposureShort(exposure.population, exposure.urbanFraction), detail: exposure.note },
    ],
    sensitivity: null,
    cannotConclude: CANNOT_CONCLUDE.heat,
  }

  const src = powerRef('POWER daily point API v2.10 / MERRA-2', ref.sources[0]?.url)
  const requested = { startYear: request.startYear, endYear: request.endYear }
  const lim = (items: Bilingual[]) => ({ es: items.map((item) => item.es), en: items.map((item) => item.en) })
  const make = (id: string, label: Bilingual, description: Bilingual, unit: string, points: AnnualPoint[], text: Bilingual, method: Bilingual, extra?: { up: Bilingual; down: Bilingual }) =>
    indicator({ id, label, description, method, unit, points, trend: trends[id], window: eff, requested, source: src, interpretation: interpret(text, trends[id], extra), limitations: lim([LIMITATIONS.heat[2]]), blocked: eff === null })
  const ols = { es: 'OLS con intervalo bootstrap por bloques; p de Hamed–Rao; q de Benjamini–Hochberg en la familia del lente.', en: 'OLS with a block-bootstrap interval; Hamed–Rao p; Benjamini–Hochberg q within the lens family.' }
  const sen = { es: 'Pendiente de Sen con intervalo de Gilbert; p de Hamed–Rao; q de Benjamini–Hochberg.', en: 'Sen slope with a Gilbert interval; Hamed–Rao p; Benjamini–Hochberg q.' }
  const methodOf = (id: string) => (v(id).profile.primaryMethod === 'sen-mann-kendall' ? sen : ols)
  const indicators: ImpactIndicator[] = [
    make('TN90p', { es: 'Noches cálidas (TN90p)', en: 'Warm nights (TN90p)' }, { es: '% de días con mínima sobre el percentil 90 del mismo día del calendario en 1991–2020 (ventana de 5 días).', en: '% of days whose minimum exceeds the calendar-day 90th percentile of 1991–2020 (5-day window).' }, '% of days', heat.tn90p, { es: 'las noches cálidas', en: 'warm nights' }, methodOf('TN90p'), { up: { es: 'El porcentaje de noches por encima del umbral térmico histórico está aumentando', en: 'The share of nights above the historical heat threshold is increasing' }, down: { es: 'El porcentaje de noches por encima del umbral térmico histórico está disminuyendo', en: 'The share of nights above the historical heat threshold is decreasing' } }),
    make('TX90p', { es: 'Días cálidos (TX90p)', en: 'Warm days (TX90p)' }, { es: '% de días con máxima sobre el percentil 90 del mismo día del calendario en 1991–2020 (ventana de 5 días).', en: '% of days whose maximum exceeds the calendar-day 90th percentile of 1991–2020 (5-day window).' }, '% of days', heat.tx90p, { es: 'los días cálidos', en: 'warm days' }, methodOf('TX90p'), { up: { es: 'El porcentaje de días por encima del umbral térmico histórico está aumentando', en: 'The share of days above the historical heat threshold is increasing' }, down: { es: 'El porcentaje de días por encima del umbral térmico histórico está disminuyendo', en: 'The share of days above the historical heat threshold is decreasing' } }),
    make('TXx', { es: 'Día más cálido del año (TXx)', en: 'Hottest day of the year (TXx)' }, { es: 'Máxima de las temperaturas máximas diarias del año, en la celda.', en: 'Highest daily maximum of the year, in the cell.' }, '°C', heat.txx, { es: 'el día más cálido', en: 'the hottest day' }, methodOf('TXx')),
    make('TNn', { es: 'Noche más fría del año (TNn)', en: 'Coldest night of the year (TNn)' }, { es: 'Mínima de las temperaturas mínimas diarias del año, en la celda.', en: 'Lowest daily minimum of the year, in the cell.' }, '°C', heat.tnn, { es: 'la noche más fría', en: 'the coldest night' }, methodOf('TNn')),
    make('TX', { es: 'Máxima media diaria', en: 'Mean daily maximum' }, { es: 'Media anual de las temperaturas máximas diarias.', en: 'Annual mean of the daily maxima.' }, '°C', tx, { es: 'la máxima media', en: 'the mean daily maximum' }, ols),
    make('TN', { es: 'Mínima media diaria', en: 'Mean daily minimum' }, { es: 'Media anual de las temperaturas mínimas diarias.', en: 'Annual mean of the daily minima.' }, '°C', tn, { es: 'la mínima media', en: 'the mean daily minimum' }, ols),
    make('T2M', { es: 'Temperatura media', en: 'Mean temperature' }, { es: 'Media anual de la temperatura del aire a 2 m.', en: 'Annual mean air temperature at 2 m.' }, '°C', t2m, { es: 'la temperatura media', en: 'the mean temperature' }, ols),
  ]
  indicators.push({
    id: 'population-exposure', label: { es: 'Población expuesta', en: 'Exposed population' }, description: exposure.note,
    value: exposure.population, valueLabel: { es: 'Censo 2020', en: '2020 census' }, unit: 'people', period: { startYear: 2020, endYear: 2020 },
    source: { sourceId: 'inegi-iter-2020', provider: 'INEGI', product: 'Censo de Población y Vivienda 2020 (ITER)', resolution: exposure.scale === 'municipality' ? 'municipality' : 'localities in the MERRA-2 cell', endpoint: 'bundled-snapshot', accessMode: 'bundled-snapshot' },
    method: { es: 'Suma de la población de las localidades con coordenadas; urbano = localidades de 2 500 habitantes o más.', en: 'Sum of the population of localities with coordinates; urban = localities of 2,500 people or more.' },
    trend: null, quality: { validRecords: exposure.population === null ? 0 : 1, expectedRecords: 1, completeness: exposure.population === null ? 0 : 1, missingCount: exposure.population === null ? 1 : 0, outOfBoundsCount: 0, completeYears: exposure.population === null ? [] : [2020] },
    recent: null, series: [],
    interpretation: exposure.population === null ? { es: 'Exposición no evaluada.', en: 'Exposure not evaluated.' } : { es: `${fmtPeople(exposure.population, 'es')}${exposure.urbanFraction !== null ? `, ${Math.round(exposure.urbanFraction * 100)}% en localidades urbanas` : ''}. Es exposición, no vulnerabilidad ni salud.`, en: `${fmtPeople(exposure.population, 'en')}${exposure.urbanFraction !== null ? `, ${Math.round(exposure.urbanFraction * 100)}% in urban localities` : ''}. This is exposure, not vulnerability or health.` },
    limitations: lim([LIMITATIONS.heat[1]]),
  })

  const map = await buildImpactMap('heat', resolved.stateCode, eff?.startYear ?? request.startYear, endYear, root, { cellId: scope.reference.cellId, municipalityCode: resolved.referenceMunicipality?.code ?? null })
  const municipalities = await municipalRows(scope.kind === 'state' ? resolved.stateCode : null, scope.kind === 'municipality' && municipality ? [municipality.code] : null, endYear, new Map(), root)
  const warnings: Bilingual[] = []
  if (!heat.thresholdsAvailable) warnings.push({ es: 'La base diaria 1991–2020 está incompleta: TX90p/TN90p no se pueden calcular.', en: 'The 1991–2020 daily base is incomplete: TX90p/TN90p cannot be computed.' })
  if (resolved.municipalityNote) warnings.push(resolved.municipalityNote)
  if (map.snapshot && map.snapshot.window.endYear < endYear) warnings.push({ es: `Los mapas usan el snapshot de POWER hasta ${map.snapshot.window.endYear}.`, en: `The maps use the POWER snapshot up to ${map.snapshot.window.endYear}.` })
  warnings.push({ es: 'La celda climática no resuelve la isla de calor urbana ni el calor de una colonia.', en: 'The climate cell does not resolve the urban heat island or the heat of a neighbourhood.' })

  return {
    schemaVersion: IMPACT_SCHEMA_VERSION, generatedAt: new Date().toISOString(), lens: 'heat', question: QUESTIONS.heat,
    request: { ...request }, scope, period: periodFrom(window), decisionSupport, indicators, map,
    hazard: { status, variables: (['TX90p', 'TN90p', 'TXx', 'TNn'] as const).filter((id) => trends[id] !== null), components: comps },
    exposure, priority: { status: priorityStatus, label: PRIORITY_LABEL[priorityStatus], reason: reasons[priorityStatus] },
    municipalities, cells: map.cells,
    sources: await impactSources('heat', root),
    quality: { reference: ref.quality, notes: [] },
    warnings, limitations: LIMITATIONS.heat,
    finalStatement: FINAL_STATEMENT.heat(status === 'planning-signal' || status === 'corroborated'),
  }
}

const NOT_EVALUABLE: Bilingual = { es: 'No evaluable', en: 'Not evaluable' }

/** A few plain words per water component for the summary chips (the counts behind its status). */
function waterShort(id: string, result: ComponentResult): Bilingual {
  if (result.active === null) return NOT_EVALUABLE
  const n = result.hits.length
  const of = result.evaluated.length
  if (id === 'demandStress' && result.reason === 'robust-upward-trend') return { es: 'Tendencia robusta al alza', en: 'Robust upward trend' }
  if (id === 'storageStress' && result.reason === 'persistent-negative-anomaly') return { es: 'Bajo lo normal los 5 años', en: 'Below normal all 5 years' }
  const words: Record<string, Bilingual> = { supplyStress: { es: 'Lluvia baja', en: 'Low rain' }, demandStress: { es: 'Demanda alta', en: 'High demand' }, storageStress: { es: 'Suelo seco', en: 'Dry soil' }, observedDrought: { es: 'Sequía', en: 'Drought' } }
  return { es: `${words[id].es} en ${n} de ${of} años`, en: `${words[id].en} in ${n} of ${of} years` }
}

const trendShort = (meets: boolean | null): Bilingual => (meets === null ? NOT_EVALUABLE : meets ? { es: 'Aumenta (robusta)', en: 'Rising (robust)' } : { es: 'Sin tendencia clara', en: 'No clear trend' })
const confirmShort = (confirms: boolean | null): Bilingual => (confirms === null ? NOT_EVALUABLE : confirms ? { es: 'Confirma la señal', en: 'Confirms the signal' } : { es: 'No la confirma', en: 'Not confirmed' })
function exposureShort(population: number | null, urban: number | null): Bilingual {
  if (population === null) return NOT_EVALUABLE
  const people = peopleText(population)
  return urban === null ? people : { es: `${Math.round(urban * 100)}% urbano · ${people.es}`, en: `${Math.round(urban * 100)}% urban · ${people.en}` }
}

function extremeText(id: 'TXx' | 'TNn', t: RobustTrend | null, active: boolean | null): Bilingual {
  if (active === null || !t) return { es: `${id}: no evaluable.`, en: `${id}: not evaluable.` }
  const p = t.pValueHamedRao === null ? '—' : t.pValueHamedRao < 0.0001 ? '< 0.0001' : t.pValueHamedRao.toFixed(4)
  const rate = t.display.slope === null ? '—' : `${t.display.slope > 0 ? '+' : ''}${t.display.slope.toFixed(2)} °C/decade`
  return active
    ? { es: `${id} sube ${rate.replace('decade', 'década')} con p = ${p} e intervalo 95% sin cero: confirma la señal.`, en: `${id} rises ${rate} with p = ${p} and a 95% interval that excludes zero: it confirms the signal.` }
    : { es: `${id} no sube de forma significativa (${rate.replace('decade', 'década')}, p = ${p}).`, en: `${id} does not rise significantly (${rate}, p = ${p}).` }
}

function fmtPeople(value: number | null, lang: 'es' | 'en') {
  if (value === null) return lang === 'es' ? 'población desconocida' : 'unknown population'
  return lang === 'es' ? `${value.toLocaleString('es-MX')} personas` : `${value.toLocaleString('en-US')} people`
}

export async function analyzeImpact(request: ImpactRequest, signal?: AbortSignal, root?: string) {
  if (request.lens === 'water') return analyzeWaterImpact(request, signal, root)
  if (request.lens === 'heat') return analyzeHeatImpact(request, signal, root)
  throw new RequestError('lens must be "water" or "heat".')
}
