/** Orchestrates GET /api/point: fetch POWER once, clean, aggregate, assess every catalog variable with its profile. */
import { annualFromDaily, annualFromMonthly, applyBounds, BASE_PERIOD, baselineMean, calendarThresholds, cellSeasons, monthlyClimatology, monthlySeries, seasonalValues, withAnomalies, type SeriesMap } from '../analysis/annual-rules'
import { assessSeries, finalizeFamily, optionsFromProfile, sensitivityWindow, warning, type RobustTrend } from '../analysis/robust-assessment'
import { cellBounds } from '../analysis/region'
import { CELL, fetchDailyPoint, fetchMonthlyPoint } from '../nasa/power'
import { POINT_VARIABLE_IDS, VARIABLES, type PowerDailyParameter, type PowerMonthlyParameter, type VariableId } from '../variables/catalog'
import { SCHEMA_VERSION, type PointResponse, type VariableResult } from './v2'

const FETCH_START = 1981

export async function analyzePoint(latitude: number, longitude: number, startYear: number, endYear: number, requested: VariableId[], signal?: AbortSignal): Promise<PointResponse> {
  const fetchEnd = Math.max(endYear, BASE_PERIOD.endYear)
  const pointVariables = VARIABLES.filter((variable) => variable.availability.point)
  const monthlyParams = [...new Set(pointVariables.filter((v) => v.source.endpoint === 'monthly').flatMap((v) => v.source.parameters))] as PowerMonthlyParameter[]
  const dailyParams = [...new Set(pointVariables.filter((v) => v.source.endpoint === 'daily').flatMap((v) => v.source.parameters))] as PowerDailyParameter[]
  const [monthly, daily] = await Promise.all([
    fetchMonthlyPoint(monthlyParams, latitude, longitude, FETCH_START, fetchEnd, signal),
    fetchDailyPoint(dailyParams, latitude, longitude, FETCH_START, fetchEnd, signal),
  ])
  const thresholds: Record<string, Map<string, number> | null> = {}
  const seasonal: Array<{ id: string; trend: RobustTrend }> = []
  const seasonDefinition = cellSeasons(applyBounds(monthly.series.PRECTOTCORR as SeriesMap, { min: 0, max: 500 }).series)
  const results: VariableResult[] = pointVariables.map((variable) => {
    const profile = variable.profile
    const parameter = variable.source.parameters[0]
    const isDaily = variable.source.endpoint === 'daily'
    const bounded = applyBounds((isDaily ? daily.series[parameter] : monthly.series[parameter]) as SeriesMap, profile.nativeBounds)
    const records = bounded.series
    let annualAll
    if (isDaily) {
      if (variable.aggregation === 'percent-days-above-p90') thresholds[parameter] ??= calendarThresholds(records, 0.9)
      annualAll = annualFromDaily(variable.aggregation, records, FETCH_START, fetchEnd, thresholds[parameter])
    } else {
      annualAll = annualFromMonthly(variable.aggregation, records, FETCH_START, fetchEnd)
    }
    const baseline = baselineMean(annualAll)
    const options = optionsFromProfile(profile, variable.trendPolicy, variable.unit, baseline)
    const trend = assessSeries(annualAll, startYear, endYear, options)
    if (bounded.removed) trend.warnings.push(warning('out-of-bounds-removed'))
    // Seasons come from this cell's own rain (null where rain has no clear season: no seasonal sub-series then).
    const seasons = (seasonDefinition ? profile.seasons : []).map((seasonId) => {
      const season = seasonDefinition![seasonId]
      const mode = isDaily ? 'daily-mean' as const : variable.aggregation === 'sum' ? 'sum' as const : 'day-weighted-mean' as const
      const seasonAnnual = seasonalValues(records, season.months, season.crossesYear, FETCH_START, fetchEnd, mode)
      const seasonBaseline = baselineMean(seasonAnnual)
      const seasonTrend = assessSeries(seasonAnnual, startYear, endYear, optionsFromProfile(profile, variable.trendPolicy, variable.unit, seasonBaseline))
      seasonal.push({ id: `${variable.id}:${seasonId}`, trend: seasonTrend })
      return { id: seasonId, label: season.label, months: season.months, annual: withAnomalies(seasonAnnual, profile.anomaly.kind, seasonBaseline).filter((p) => p.year >= startYear && p.year <= endYear), trend: seasonTrend }
    })
    const monthlyAll = variable.availability.monthlySeries ? monthlySeries(variable.aggregation, records, FETCH_START, fetchEnd, isDaily) : null
    return {
      id: variable.id, label: variable.label, unit: variable.unit, trendUnit: variable.trendUnit, group: variable.group, fitness: variable.fitness, trendPolicy: variable.trendPolicy,
      profile,
      baseline: { period: '1991-2020', mean: baseline, anomalyKind: profile.anomaly.kind, anomalyUnit: profile.anomaly.unit },
      annual: withAnomalies(annualAll, profile.anomaly.kind, baseline).filter((point) => point.year >= startYear && point.year <= endYear),
      monthly: monthlyAll ? monthlyAll.filter((point) => Number(point.date.slice(0, 4)) >= startYear && Number(point.date.slice(0, 4)) <= endYear) : null,
      climatology: variable.availability.climatology && monthlyAll ? monthlyClimatology(monthlyAll) : null,
      trend,
      seasons,
      qa: { outOfBoundsRecords: bounded.removed },
      warnings: trend.warnings,
    }
  })
  finalizeFamily(results.map((result) => ({ id: result.id, trend: result.trend })))
  finalizeFamily(seasonal)
  const centerLat = Math.round(latitude / CELL.dLat) * CELL.dLat
  const centerLon = Math.round(longitude / CELL.dLon) * CELL.dLon
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    request: { latitude, longitude, startYear, endYear, variables: requested },
    support: { type: 'grid-cell', centerLat, centerLon, dLat: CELL.dLat, dLon: CELL.dLon, bounds: cellBounds(centerLat, centerLon), elevationM: monthly.elevationM },
    window: { startYear, endYear, mode: 'fixed', sensitivity: sensitivityWindow(startYear, endYear) },
    family: { method: 'benjamini-hochberg', alpha: 0.05, pValue: 'hamed-rao', members: POINT_VARIABLE_IDS, note: 'q is always computed over all catalog point variables, so filtering ?variables= does not change it.' },
    seasonalFamily: { method: 'benjamini-hochberg', alpha: 0.05, members: seasonal.map((item) => item.id), note: 'Seasonal sub-series form their own family so they do not dilute the annual results.' },
    seasonDefinition,
    sources: [monthly.source, daily.source],
    variables: results.filter((result) => requested.includes(result.id)),
  }
}
