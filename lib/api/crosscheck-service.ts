/**
 * Orchestrates GET /api/crosscheck: the rain of one MERRA-2 cell from two NASA records, both through the public POWER
 * API (no login).
 *
 * - MERRA-2 PRECTOTCORR: the same monthly point request as GET /api/point (identical URL, so they share the cache).
 * - GPM IMERG (IMERG_PRECTOT): the 2° × 2° box around the cell, in UTC, averaged over the cell's own bounds.
 *
 * Both go through the same rules as every EarthScope series (physical bounds, 12/12 months, the cell's own wet season)
 * and the same trend statistics (Sen + Gilbert interval, Hamed–Rao p, minimum detectable trend). The comparison never
 * states that rain increases or decreases (precipitation keeps trendPolicy 'show-without-claim'); it says whether the
 * two records agree.
 */
import { annualFromMonthly, applyBounds, BASE_PERIOD, cellSeasons, seasonalValues, type AnnualPoint, type SeriesMap } from '../analysis/annual-rules'
import { compareLevels, compareTrends, CONCORDANCE_RULES } from '../analysis/concordance'
import { cellMean } from '../analysis/footprint'
import { cellBounds } from '../analysis/region'
import { assessSeries, MIN_TREND_YEARS, type AssessOptions } from '../analysis/robust-assessment'
import { CELL, cellCenter, fetchImergBox, fetchMonthlyPoint, IMERG, imergBox, PowerError } from '../nasa/power'
import { getVariable } from '../variables/catalog'
import { FETCH_START, MONTHLY_POINT_PARAMETERS } from './point-service'
import { RequestError } from './validation'
import { SCHEMA_VERSION, type CrosscheckComparison, type CrosscheckReason, type CrosscheckResponse, type CrosscheckSource, type SourceTrend } from './v2'

/** The year IMERG switched from the TRMM to the GPM satellite constellation; a window crossing it may hold a step. */
export const SATELLITE_TRANSITION_YEAR = 2014

const RAIN_BOUNDS = getVariable('PRECTOTCORR')!.profile.nativeBounds
const OPTIONS: AssessOptions = { policy: 'show-without-claim', method: 'sen-mann-kendall', scale: 'absolute', displayUnit: 'mm/década', referenceMean: null, relevanceThreshold: 0, minBlockLength: 2, unit: 'mm' }

const MERRA2 = {
  id: 'merra2', label: 'MERRA-2 (NASA POWER)', product: 'MERRA-2 bias-corrected precipitation, POWER parameter PRECTOTCORR',
  method: 'Reanalysis model whose rain is corrected toward gauge analyses (NOAA CPC over most land)', resolution: '0.5° × 0.625° cell', timeStandard: 'LST',
} as const
const IMERG_SOURCE = {
  id: 'imerg', label: 'GPM IMERG (NASA POWER)', product: 'GPM IMERG monthly precipitation, POWER parameter IMERG_PRECTOT',
  method: 'Satellite microwave and infrared estimates, calibrated with GPCC rain gauges (it also uses MERRA-2 fields, so the two records are only partly independent)', resolution: '0.1° pixels averaged over the same cell', timeStandard: 'UTC',
} as const

function sourceTrend(annual: AnnualPoint[], startYear: number, endYear: number): SourceTrend {
  const trend = assessSeries(annual, startYear, endYear, OPTIONS)
  return {
    nYears: trend.nYears, excludedIncompleteYears: trend.excludedIncompleteYears, senPerDecade: trend.senPerDecade, ci95SenPerDecade: trend.ci95SenPerDecade,
    pValueHamedRao: trend.pValueHamedRao, pValueMannKendall: trend.pValueMannKendall, minimumDetectablePerDecade: trend.minimumDetectablePerDecade, line: trend.lines.sen,
  }
}

const evidence = (trend: SourceTrend) => ({ slopePerDecade: trend.senPerDecade, ci95PerDecade: trend.ci95SenPerDecade, pValue: trend.pValueHamedRao, nYears: trend.nYears })

function compare(id: CrosscheckComparison['id'], label: CrosscheckComparison['label'], months: number[], merraAnnual: AnnualPoint[], imergAnnual: AnnualPoint[], startYear: number, endYear: number): CrosscheckComparison {
  const merra2: CrosscheckSource = { ...MERRA2, annual: merraAnnual, trend: sourceTrend(merraAnnual, startYear, endYear) }
  const imerg: CrosscheckSource = { ...IMERG_SOURCE, annual: imergAnnual, trend: sourceTrend(imergAnnual, startYear, endYear) }
  const level = compareLevels(merraAnnual, imergAnnual)
  const trend = compareTrends(evidence(merra2.trend), evidence(imerg.trend))
  // Reasons are facts about these records, listed so the interface can explain the result without guessing.
  const reasons: CrosscheckReason[] = ['different-methods']
  if (startYear <= SATELLITE_TRANSITION_YEAR && endYear > SATELLITE_TRANSITION_YEAR) reasons.push('satellite-transition')
  reasons.push('station-skill')
  if (trend.reason === 'neither-detects') reasons.push('below-detectable')
  if (level.sameLevel === false) reasons.push('level-gap')
  if (level.yearToYear === 'weak') reasons.push('weak-year-to-year')
  return { id, label, months, merra2, imerg, level, trend, reasons }
}

export async function crosscheckRain(latitude: number, longitude: number, startYear: number, endYear: number, signal?: AbortSignal): Promise<CrosscheckResponse> {
  const center = cellCenter(latitude, longitude)
  if (Math.abs(center.lat) > IMERG.maxAbsLatitude) throw new RequestError(`The rain cross-check covers latitudes up to ±${IMERG.maxAbsLatitude}°, where IMERG is complete.`, 422)
  const from = Math.max(startYear, IMERG.firstYear)
  if (endYear - from + 1 < MIN_TREND_YEARS) throw new RequestError(`IMERG starts in ${IMERG.firstYear}: choose a period with at least ${MIN_TREND_YEARS} years from ${IMERG.firstYear} on.`)
  const box = imergBox(center)
  // Same monthly request as GET /api/point (1981 to at least 2020, for the cell's 1991–2020 wet season).
  const [monthly, imerg] = await Promise.all([
    fetchMonthlyPoint(MONTHLY_POINT_PARAMETERS, latitude, longitude, FETCH_START, Math.max(endYear, BASE_PERIOD.endYear), signal),
    fetchImergBox(box, from, endYear, signal),
  ])
  const bounds = cellBounds(center.lat, center.lon)
  const footprint = cellMean(imerg.pixels, bounds, IMERG.pixelDegrees)
  if (footprint.coveredFraction < 0.999) throw new PowerError('NASA POWER did not return every IMERG pixel of this cell.', 502, 'invalid-payload')
  const merraRecords = applyBounds(monthly.series.PRECTOTCORR as SeriesMap, RAIN_BOUNDS).series
  const imergRecords = applyBounds(footprint.series, RAIN_BOUNDS).series

  const comparisons: CrosscheckComparison[] = [compare('annual', { es: 'Lluvia anual', en: 'Annual rain' }, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], annualFromMonthly('sum', merraRecords, from, endYear), annualFromMonthly('sum', imergRecords, from, endYear), from, endYear)]
  // The wet season is the MERRA-2 cell's own (as in GET /api/point), applied to both records so they cover the same months.
  const seasons = cellSeasons(merraRecords)
  if (seasons) {
    const wet = seasons.wet
    comparisons.push(compare('wet', { es: 'Lluvia de la temporada de lluvias', en: 'Wet-season rain' }, wet.months, seasonalValues(merraRecords, wet.months, wet.crossesYear, from, endYear, 'sum'), seasonalValues(imergRecords, wet.months, wet.crossesYear, from, endYear, 'sum'), from, endYear))
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    request: { latitude, longitude, startYear, endYear },
    window: { startYear: from, endYear, clippedToImerg: from !== startYear },
    support: { type: 'grid-cell', centerLat: center.lat, centerLon: center.lon, dLat: CELL.dLat, dLon: CELL.dLon, bounds, elevationM: monthly.elevationM },
    footprint: { pixelDegrees: IMERG.pixelDegrees, pixelCount: footprint.pixelCount, coveredFraction: footprint.coveredFraction, box },
    rules: CONCORDANCE_RULES,
    comparisons,
    sources: [monthly.source, imerg.source],
    notes: [
      'Both records come from the public NASA POWER API; no login or token is needed.',
      'IMERG is served by POWER in UTC and MERRA-2 in local solar time; monthly totals differ only by the hours at month boundaries.',
      `IMERG starts in ${IMERG.firstYear}, so the comparison window never starts earlier.`,
      'Rain trends are shown without an increase or decrease claim: this comparison says whether two NASA records agree, not whether it rains more.',
    ],
  }
}
