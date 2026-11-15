/**
 * Response contract of API v2 (GET /api/variables, GET /api/point, GET|POST /api/region, GET /api/crosscheck).
 * The interface can import these types directly: `import type { PointResponse } from '@/lib/api/v2'`.
 * Full documentation and examples: docs/backend/api-v2.md and docs/backend/samples/.
 */
import type { ApiWarning, RobustTrend, TrendDisplay, TrendLine, Verdict } from '../analysis/robust-assessment'
import type { Agreement, AgreementReason, CONCORDANCE_RULES, LevelComparison, TrendComparison, TrendEvidence, YearToYear } from '../analysis/concordance'
import type { AnnualPoint, CellSeasons, ClimatologyPoint, MonthlyPoint, SeasonDefinition } from '../analysis/annual-rules'
import type { CellResult } from '../analysis/region'
import type { LineFit, ProjectedValue, ProjectionSummary } from '../analysis/projection'
import type { PowerSourceInfo } from '../nasa/power'
import type { ProcessingProfile, ProjectionRule, SEASON_RULE, SeasonId, VariableDescriptor, VariableId } from '../variables/catalog'

export const SCHEMA_VERSION = '2.0' as const
/** Default comparison window: common window with IMERG (2025 is incomplete in IMERG Final). */
export const DEFAULT_WINDOW = { startYear: 2001, endYear: 2024 } as const

export type { Agreement, AgreementReason, LevelComparison, TrendComparison, TrendEvidence, TrendLine, YearToYear }
export type { ApiWarning, RobustTrend, TrendDisplay, Verdict, AnnualPoint, ClimatologyPoint, MonthlyPoint, CellResult, PowerSourceInfo, ProcessingProfile, SeasonId, VariableDescriptor, VariableId, LineFit, ProjectedValue, ProjectionSummary, ProjectionRule, CellSeasons, SeasonDefinition }

export type CellSupport = {
  type: 'grid-cell'
  centerLat: number
  centerLon: number
  dLat: 0.5
  dLon: 0.625
  bounds: { west: number; south: number; east: number; north: number }
  /** Mean elevation of the MERRA-2 cell, not of the requested point. */
  elevationM: number | null
}

export type VariableResult = {
  id: VariableId
  label: { es: string; en: string }
  unit: string
  trendUnit: string
  group: VariableDescriptor['group']
  fitness: VariableDescriptor['fitness']
  trendPolicy: VariableDescriptor['trendPolicy']
  /** Processing profile applied (scale, primary method, anomalies, bounds, seasons, relevance). */
  profile: ProcessingProfile
  /** 1991–2020 mean of the annual series and the anomaly convention used in annual[].anomaly. */
  baseline: { period: '1991-2020'; mean: number | null; anomalyKind: 'absolute' | 'percent'; anomalyUnit: string }
  /** Annual values inside the requested window, with anomaly; incomplete years appear with value null and complete false. */
  annual: AnnualPoint[]
  /** Monthly values in the requested window (precipitation as monthly totals); null when the variable has no monthly meaning. */
  monthly: MonthlyPoint[] | null
  /** 1991–2020 monthly climatology; null when not applicable. */
  climatology: ClimatologyPoint[] | null
  trend: RobustTrend
  /** Seasonal sub-series (only for variables whose profile lists seasons); separate Benjamini–Hochberg family. */
  seasons: Array<{ id: SeasonId; label: { es: string; en: string }; months: number[]; annual: AnnualPoint[]; trend: RobustTrend }>
  qa: { outOfBoundsRecords: number }
  warnings: ApiWarning[]
}

export type PointResponse = {
  schemaVersion: typeof SCHEMA_VERSION
  generatedAt: string
  request: { latitude: number; longitude: number; startYear: number; endYear: number; variables: VariableId[] }
  support: CellSupport
  window: { startYear: number; endYear: number; mode: 'fixed'; sensitivity: { startYear: number; endYear: number } }
  family: { method: 'benjamini-hochberg'; alpha: 0.05; pValue: 'hamed-rao'; members: VariableId[]; note: string }
  seasonalFamily: { method: 'benjamini-hochberg'; alpha: 0.05; members: string[]; note: string }
  /** This cell's wet and dry seasons (its 6 rainiest months of 1991–2020 and the other 6); null where rain has no clear season. */
  seasonDefinition: CellSeasons | null
  sources: PowerSourceInfo[]
  variables: VariableResult[]
}

export type LegendDomain = { min: number; max: number; symmetricMaxAbs: number }

export type RegionResponse = {
  schemaVersion: typeof SCHEMA_VERSION
  generatedAt: string
  request: {
    variable: VariableId
    startYear: number
    endYear: number
    /** `area`: GET by Natural Earth id (country, state); `polygon`: POSTed geometry; `bbox`: GET by bounding box. */
    selection: 'area' | 'polygon' | 'bbox'
    bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number }
    area?: { country: string; state: string | null; name: string }
  }
  variable: { id: VariableId; label: { es: string; en: string }; unit: string; trendUnit: string; trendPolicy: VariableDescriptor['trendPolicy']; fitness: VariableDescriptor['fitness']; profile: ProcessingProfile }
  grid: { dLat: 0.5; dLon: 0.625; cellCount: number; tileCount: number }
  cells: CellResult[]
  summary: { cellsWithTrend: number; positive: number; negative: number; significantField: number; fieldAlpha: 0.1 }
  legend: { mean: LegendDomain | null; slopePerDecade: LegendDomain | null; slopeDisplay: LegendDomain | null; anomalyRecent: LegendDomain | null }
  /** Area-weighted series of the whole region (weights = coverage × cos(lat)) with the full assessment. */
  regional: { baseline: number | null; annual: AnnualPoint[]; trend: RobustTrend; warnings: ApiWarning[] }
  qa: { outOfBoundsRecords: number }
  /**
   * Exploratory linear extrapolation (null for variables without a projection rule). Each cell carries its line in
   * cells[].fit; evaluate it with predict() from lib/analysis/projection.ts and draw it only when status is 'ok'.
   */
  projection: ProjectionSummary | null
  sources: PowerSourceInfo[]
  notes: string[]
}

/** One record's trend in GET /api/crosscheck: Sen slope with its Gilbert interval and the Hamed–Rao p, in mm/decade. */
export type SourceTrend = {
  nYears: number
  excludedIncompleteYears: number[]
  senPerDecade: number | null
  ci95SenPerDecade: [number, number] | null
  pValueHamedRao: number | null
  pValueMannKendall: number | null
  minimumDetectablePerDecade: number | null
  line: TrendLine | null
}

export type CrosscheckSource = {
  id: 'merra2' | 'imerg'
  label: string
  product: string
  method: string
  resolution: string
  timeStandard: 'LST' | 'UTC'
  /** Totals in mm inside the comparison window; incomplete years have value null and complete false. */
  annual: AnnualPoint[]
  trend: SourceTrend
}

/** Why the two records may agree or not: codes the interface turns into plain language (lib/ui/crosscheck-view.ts). */
export type CrosscheckReason = 'different-methods' | 'satellite-transition' | 'station-skill' | 'below-detectable' | 'level-gap' | 'weak-year-to-year'

export type CrosscheckComparison = {
  id: 'annual' | 'wet'
  label: { es: string; en: string }
  months: number[]
  merra2: CrosscheckSource
  imerg: CrosscheckSource
  level: LevelComparison
  trend: TrendComparison
  reasons: CrosscheckReason[]
}

export type CrosscheckResponse = {
  schemaVersion: typeof SCHEMA_VERSION
  generatedAt: string
  request: { latitude: number; longitude: number; startYear: number; endYear: number }
  /** The requested window starts no earlier than 1998, IMERG's first year in POWER. */
  window: { startYear: number; endYear: number; clippedToImerg: boolean }
  support: CellSupport
  /** IMERG pixels averaged over the cell: how many overlap it and which share of the cell they cover (1 = all). */
  footprint: { pixelDegrees: number; pixelCount: number; coveredFraction: number; box: { minLat: number; maxLat: number; minLon: number; maxLon: number } }
  rules: typeof CONCORDANCE_RULES
  comparisons: CrosscheckComparison[]
  sources: PowerSourceInfo[]
  notes: string[]
}

export type VariablesResponse = {
  schemaVersion: typeof SCHEMA_VERSION
  variables: VariableDescriptor[]
  excluded: Array<{ id: string; reason: { es: string; en: string } }>
  defaults: { window: typeof DEFAULT_WINDOW }
  /** How each cell's seasons are derived (they are no longer fixed months). */
  seasons: typeof SEASON_RULE
  rules: Record<string, string>
  verdicts: Record<Verdict, { es: string; en: string }>
}
