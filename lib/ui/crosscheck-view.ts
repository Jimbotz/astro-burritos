/**
 * Plain-language view of the concordance checks (lib/analysis/concordance.ts): the rain cross-check between two NASA
 * records (GET /api/crosscheck) and the comparison between two places (two GET /api/point responses).
 * Every sentence describes agreement between records. None of them says that rain increases or decreases.
 */
import type { Agreement, CrosscheckComparison, CrosscheckReason, LevelComparison, RobustTrend, TrendComparison, TrendEvidence } from '@/lib/api/v2'
import { cellCenter } from '../nasa/power'
import { formatNumber, formatPValue, formatSigned } from './format'

export const SOURCE_AGREEMENT_LABEL: Record<Agreement, string> = { agree: 'Agree', disagree: 'Disagree', inconclusive: 'Inconclusive', 'insufficient-data': 'Not enough years' }
export const PLACE_AGREEMENT_LABEL: Record<Agreement, string> = { agree: 'Same signal', disagree: 'Different signals', inconclusive: 'Inconclusive', 'insufficient-data': 'Not enough years' }

export type CheckState = 'yes' | 'no' | 'unknown'

const mm = (value: number | null | undefined) => `${formatSigned(value, 0)} mm/decade`

/** p-value text that never makes a value just above 0.05 look like 0.0500 (it would read as detected). */
export function pText(value: number | null | undefined) {
  return value !== null && value !== undefined && value >= 0.05 && value < 0.0501 ? value.toFixed(5) : formatPValue(value)
}
// Presentation only: a p this close to the limit gets a sentence saying it does not count as detected.
const nearLimit = (value: number | null) => value !== null && value >= 0.05 && value < 0.055
const interval = (ci: [number, number] | null) => (ci ? `${formatSigned(ci[0], 0)} to ${formatSigned(ci[1], 0)}` : 'not estimable')

/** The three questions of the rain card, each answered yes, no or unknown. */
export function sourceChecks(comparison: CrosscheckComparison): Record<'level' | 'yearToYear' | 'trend', CheckState> {
  const { level, trend } = comparison
  return {
    level: level.sameLevel === null ? 'unknown' : level.sameLevel ? 'yes' : 'no',
    yearToYear: level.yearToYear === null ? 'unknown' : level.yearToYear === 'weak' ? 'no' : 'yes',
    trend: trend.agreement === 'agree' ? 'yes' : trend.agreement === 'disagree' ? 'no' : 'unknown',
  }
}

export function levelSentence(level: LevelComparison) {
  if (level.meanA === null || level.meanB === null || level.differencePercent === null) return 'Fewer than 10 years with both records complete: the amounts are not compared.'
  const amounts = `MERRA-2 ${formatNumber(level.meanA, 0)} mm, IMERG ${formatNumber(level.meanB, 0)} mm a year on average`
  if (level.sameLevel) return `Same amount within ±10%: ${amounts}.`
  return `IMERG gives ${formatNumber(Math.abs(level.differencePercent), 0)}% ${level.differencePercent > 0 ? 'more' : 'less'} rain than MERRA-2 (${amounts}).`
}

export function yearToYearSentence(level: LevelComparison) {
  if (level.correlation === null) return 'Not enough common years to compare wet and dry years.'
  const r = `r = ${formatNumber(level.correlation, 2)} after removing each record’s own trend`
  if (level.yearToYear === 'strong') return `They agree on which years were wetter or drier (${r}).`
  if (level.yearToYear === 'moderate') return `They partly agree on which years were wetter or drier (${r}).`
  return `They barely agree on which years were wet or dry (${r}).`
}

/** What the trend check found, with the numbers that decided it. */
export function sourceTrendSentence(comparison: CrosscheckComparison) {
  const { merra2, imerg, trend } = comparison
  const a = merra2.trend
  const b = imerg.trend
  switch (trend.reason) {
    case 'same-direction': return `Both records detect a trend of the same sign and compatible size: MERRA-2 ${mm(a.senPerDecade)}, IMERG ${mm(b.senPerDecade)}.`
    case 'opposite-directions': return `The records detect trends of opposite sign: MERRA-2 ${mm(a.senPerDecade)}, IMERG ${mm(b.senPerDecade)}.`
    case 'incompatible-rates': return `The records give incompatible rates: their 95% intervals do not overlap (MERRA-2 ${interval(a.ci95SenPerDecade)}, IMERG ${interval(b.ci95SenPerDecade)} mm/decade).`
    case 'one-detects': {
      const [first] = trend.detected
      const [found, other] = first ? [merra2, imerg] : [imerg, merra2]
      return `Only ${found.id === 'merra2' ? 'MERRA-2' : 'IMERG'} detects a trend (${mm(found.trend.senPerDecade)}, p = ${pText(found.trend.pValueHamedRao)}); ${other.id === 'merra2' ? 'MERRA-2' : 'IMERG'} does not, so the trend stays unconfirmed.`
    }
    case 'neither-detects': {
      const limit = [a, b].map((trend, index) => (nearLimit(trend.pValueHamedRao) ? (index === 0 ? 'MERRA-2' : 'IMERG') : null)).filter(Boolean)
      const note = limit.length ? ` ${limit.join(' and ')} sits just above the 0.05 limit, so it does not count as detected.` : ''
      return `Neither record detects a trend in this period (Hamed–Rao p = ${pText(a.pValueHamedRao)} for MERRA-2 and ${pText(b.pValueHamedRao)} for IMERG).${note}`
    }
    default: return 'One of the records has fewer than 10 complete years in this period, so their trends are not compared.'
  }
}

/** One plain-language line per reason code returned by the API. */
export function reasonText(reason: CrosscheckReason, comparison: CrosscheckComparison) {
  switch (reason) {
    case 'different-methods': return 'Two different methods: MERRA-2 is a weather model whose rain is corrected with rain-gauge analyses; IMERG estimates rain from satellites and calibrates it with another gauge analysis (GPCC). They are only partly independent (both lean on gauges, and IMERG uses MERRA-2 fields), so agreement is supporting evidence, not proof, and disagreement is a warning.'
    case 'satellite-transition': return 'This period crosses 2014, when IMERG moved from the TRMM to the GPM satellites. A trend across that change can come from the instruments rather than the climate.'
    case 'station-skill': return 'Against the weather stations of Puebla and Tlaxcala, POWER rain follows the seasons but barely the year-to-year changes (annual r 0.12–0.33). That is why EarthScope never states a rain trend from one record.'
    case 'below-detectable': return `A trend would need to be about ${formatNumber(comparison.merra2.trend.minimumDetectablePerDecade, 0)} (MERRA-2) or ${formatNumber(comparison.imerg.trend.minimumDetectablePerDecade, 0)} mm/decade (IMERG) to be detectable here: “no trend detected” is not “no change”.`
    case 'level-gap': return 'The two records differ by more than 10% in their average amount, so compare their changes rather than their totals.'
    case 'weak-year-to-year': return 'The records disagree on which years were wet, so any trend from either one deserves extra caution.'
  }
}

/** Place comparison inputs: the headline (display) slope, its primary interval and the Hamed–Rao p. */
export function placeEvidence(trend: RobustTrend): TrendEvidence {
  return { slopePerDecade: trend.display.slope, ci95PerDecade: trend.display.ci95, pValue: trend.pValueHamedRao, nYears: trend.nYears }
}

export function placeSentence(comparison: TrendComparison, names: [string, string], claimAllowed: boolean) {
  if (!claimAllowed) return 'EarthScope does not state rain trends from a single record. The rates are shown for reference; the rain cross-check compares two NASA records instead.'
  const [a, b] = names
  switch (comparison.reason) {
    case 'same-direction': return `${a} and ${b} show the same signal: both detect a trend of the same sign and compatible size.`
    case 'opposite-directions': return `The signal goes in opposite directions in ${a} and ${b}, and both trends are detectable.`
    case 'incompatible-rates': return `${a} and ${b} change at clearly different rates: their 95% intervals do not overlap.`
    case 'one-detects': return `Only ${comparison.detected[0] ? a : b} has a detectable trend. The record of ${comparison.detected[0] ? b : a} can neither confirm nor rule out the same change.`
    case 'neither-detects': return `Neither place has a detectable trend in this period.`
    default: return 'One of the places has fewer than 10 complete years in this period, so their trends are not compared.'
  }
}

/** Places offered for the comparison (city coordinates; each falls in its own MERRA-2 cell). */
export const COMPARE_PLACES = [
  { id: 'tehuacan', name: 'Tehuacán, Puebla', lat: 18.46, lon: -97.39 },
  { id: 'puebla', name: 'Puebla, Puebla', lat: 19.04, lon: -98.20 },
  { id: 'tlaxcala', name: 'Tlaxcala, Tlaxcala', lat: 19.32, lon: -98.24 },
  { id: 'oaxaca', name: 'Oaxaca de Juárez, Oaxaca', lat: 17.06, lon: -96.73 },
  { id: 'cdmx', name: 'Mexico City', lat: 19.43, lon: -99.13 },
] as const

export type ComparePlaceId = (typeof COMPARE_PLACES)[number]['id']

export const comparePlace = (id: string | null | undefined) => COMPARE_PLACES.find((place) => place.id === id)

/** True when two coordinates fall in the same MERRA-2 cell (their comparison would be a record with itself). */
export function sameCell(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const ca = cellCenter(a.lat, a.lon)
  const cb = cellCenter(b.lat, b.lon)
  return ca.lat === cb.lat && ca.lon === cb.lon
}
