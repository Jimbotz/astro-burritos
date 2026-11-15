/**
 * Contract of GET|POST /api/impact (the impact lenses: water management and heat exposure).
 * IMPLEMENTACION_LENTES_IMPACTO §7.10, §8.9 and §13. The interface reads every unit, status, colour class, source and
 * sentence from these fields; it never infers significance or meaning on its own.
 */
import type { AnnualPoint } from '../analysis/annual-rules'
import type { QualitySummary } from '../analysis/impact-quality'

export const IMPACT_SCHEMA_VERSION = '1.0' as const

export type ImpactLens = 'water' | 'heat'
/** The five states of IMPLEMENTACION_LENTES_IMPACTO §3. The water lens's "priority" (§7.9) is `corroborated`. */
export type ImpactStatus = 'insufficient-data' | 'no-detectable' | 'watch' | 'planning-signal' | 'corroborated'
export type WindowMode = 'source-native' | 'common-complete-window' | 'fixed-window'
/** How strongly the interface may colour a result: `alert` (red) only when the backend says so. */
export type ImpactSeverity = 'neutral' | 'info' | 'warning' | 'alert'
export type Bilingual = { es: string; en: string }

export type ImpactSourceRef = {
  sourceId: string
  provider: string
  product: string
  resolution: string
  endpoint: string
  accessMode: 'public-api' | 'bundled-snapshot' | 'method'
}

/** One indicator, exactly as §13 describes it, plus the annual series and recent statistics behind it. */
export type ImpactIndicator = {
  id: string
  label: Bilingual
  description: Bilingual
  value: number | null
  /** What `value` is (e.g. "mean of the last 5 complete years", "2020 census"). */
  valueLabel: Bilingual
  unit: string
  period: { startYear: number; endYear: number }
  source: ImpactSourceRef
  method: Bilingual
  trend: {
    direction: 'increasing' | 'decreasing' | 'flat' | 'unknown'
    slopePerYear: number | null
    slopePerDecade: number | null
    confidenceInterval95: [number, number] | null
    pValue: number | null
    adjustedPValue: number | null
    mannKendallSignificant: boolean
    status: 'robust' | 'probable' | 'weak' | 'not-detectable' | 'blocked'
    /** False for precipitation: the series is shown without an increase/decrease claim. */
    claimAllowed: boolean
    unit: string
  } | null
  quality: { validRecords: number; expectedRecords: number; completeness: number; missingCount: number; outOfBoundsCount: number; completeYears: number[] }
  /** Recent-years statistics against the 1991–2020 baseline, when they apply. */
  recent: { years: number[]; mean: number | null; baselineMean: number | null; percentile: number | null; anomaly: number | null; anomalyPercent: number | null; movingAverage5: number | null; yearsBelowP20: number | null; yearsAboveP80: number | null } | null
  series: AnnualPoint[]
  interpretation: Bilingual
  limitations: { es: string[]; en: string[] }
}

export type ImpactComponent = { id: string; label: Bilingual; active: boolean | null; detail: Bilingual }

export type DecisionSupport = {
  status: ImpactStatus
  label: Bilingual
  severity: ImpactSeverity
  summary: Bilingual
  recommendedAction: Bilingual
  notACommand: true
  notMedicalAdvice?: true
  components: Record<string, boolean | null>
  componentDetails: ImpactComponent[]
  /** `high` when the status changes with the percentile thresholds 0.10 / 0.20 / 0.30 (water) or the window (heat). */
  sensitivity: 'low' | 'high' | null
  /** What the system cannot conclude from this result. */
  cannotConclude: Bilingual[]
}

export type ImpactPeriod = {
  requested: { startYear: number; endYear: number }
  effective: { startYear: number; endYear: number } | null
  mode: WindowMode
  /** True when mode is fixed-window and a required source cannot cover it (blocked-by-quality). */
  blocked: boolean
  sources: Array<{ sourceId: string; startYear: number | null; endYear: number | null; completeYears: number; note: Bilingual | null }>
}

export type ImpactSource = {
  sourceId: string
  provider: string
  product: string
  url: string
  retrievedAt: string
  coverage: { start: string; end: string }
  resolution: string
  timeStandard: string | null
  authRequired: false
  accessMode: 'public-api' | 'bundled-snapshot' | 'method'
  license: string
  checksum: string | null
  lenses: Array<ImpactLens | 'core'>
  status: 'in-use' | 'method' | 'optional'
  use: Bilingual
  transformations: Bilingual[]
  limitations: Bilingual[]
}

/** A map layer and its legend. Cells and municipalities carry the class id; the colour comes only from here. */
export type ImpactLegend = {
  id: string
  label: Bilingual
  group: 'hazard' | 'exposure' | 'priority' | 'supply' | 'demand' | 'storage' | 'observed'
  target: 'cells' | 'municipalities'
  classes: Array<{ id: string; label: Bilingual; color: string }>
  note: Bilingual
  /** Plain-language explanation of the layer: what each colour shows and what the layer is for. */
  about: { shows: Bilingual; useFor: Bilingual }
}

export type ImpactCell = {
  cellId: string
  center: { lat: number; lon: number }
  bounds: { west: number; south: number; east: number; north: number }
  coverage: number
  sourceId: string
  resolution: string
  layers: Record<string, { value: number | null; class: string; status: ImpactStatus | null }>
}

export type DroughtSummary = {
  coverage: { firstDate: string | null; lastDate: string | null; records: number; years: number[] }
  monthsWithDrought: number
  yearsWithDrought: number[]
  maxDurationMonths: number
  maxCategory: string | null
  percentMonthsAffected: number | null
  recentYearsWithDrought: number
  recentYearsCovered: number
}

export type ImpactMunicipality = {
  code: string
  name: string
  stateCode: string
  population: number | null
  urbanPopulation: number | null
  urbanFraction: number | null
  /** Share of the municipal population that has locality coordinates (the rest cannot be placed in a cell). */
  placedPopulationShare: number | null
  drought: DroughtSummary | null
  layers: Record<string, { value: number | null; class: string }>
}

export type ImpactMap = {
  available: boolean
  reason: Bilingual | null
  stateCode: string | null
  /** Static municipal outlines (INEGI, simplified) for municipal layers. */
  municipalGeometryUrl: string | null
  defaultLayer: string
  layers: ImpactLegend[]
  cells: ImpactCell[]
  municipalities: Array<{ code: string; layers: Record<string, { value: number | null; class: string }> }>
  snapshot: { retrievedAt: string; window: { startYear: number; endYear: number } } | null
}

export type StationValidation = {
  stationId: string
  name: string
  municipality: string
  distanceKm: number
  sameCell: boolean
  commonYears: number
  correlation: number | null
  meanDifferencePercent: number | null
  recentYearsBelowP20: number | null
  evidence: boolean | null
  note: Bilingual
}

export type ImpactScope = {
  kind: 'point' | 'municipality' | 'state'
  name: string
  country: string | null
  state: string | null
  stateCode: string | null
  municipalityCode: string | null
  reference: { latitude: number; longitude: number; cellId: string; label: Bilingual }
}

export type ImpactBase = {
  schemaVersion: typeof IMPACT_SCHEMA_VERSION
  generatedAt: string
  lens: ImpactLens
  question: Bilingual
  request: { lens: ImpactLens; country: string | null; state: string | null; municipalityCode: string | null; latitude: number | null; longitude: number | null; startYear: number; endYear: number; mode: WindowMode }
  scope: ImpactScope
  period: ImpactPeriod
  decisionSupport: DecisionSupport
  indicators: ImpactIndicator[]
  map: ImpactMap
  sources: ImpactSource[]
  quality: { reference: QualitySummary | null; notes: Bilingual[] }
  warnings: Bilingual[]
  limitations: Bilingual[]
  /** The sentence of §17 adapted to this result. */
  finalStatement: Bilingual
}

export type WaterImpactResponse = ImpactBase & {
  lens: 'water'
  municipalities: ImpactMunicipality[]
  cells: ImpactCell[]
  validation: { station: StationValidation | null }
}

export type HeatPriorityStatus = 'high-exposure-signal' | 'signal-lower-exposure' | 'exposure-without-signal' | 'no-priority' | 'exposure-unknown'

export type HeatImpactResponse = ImpactBase & {
  lens: 'heat'
  hazard: { status: ImpactStatus; variables: string[]; components: Record<string, boolean | null> }
  exposure: { populationYear: 2020 | null; population: number | null; urbanPopulation: number | null; urbanFraction: number | null; placedPopulationShare: number | null; scale: 'cell' | 'municipality' | 'state' | null; source: string | null; note: Bilingual }
  priority: { status: HeatPriorityStatus; label: Bilingual; reason: Bilingual }
  municipalities: ImpactMunicipality[]
  cells: ImpactCell[]
}

export type ImpactResponse = WaterImpactResponse | HeatImpactResponse
