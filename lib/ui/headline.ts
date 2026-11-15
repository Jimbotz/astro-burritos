import type { PointResponse, VariableResult } from '../api/v2'
import { digitsForUnit, formatNumber, formatSigned, unitEn } from './format'

/**
 * The answer to "what changed here?" in one sentence, following the presentation rules (docs/backend/api-v2.md §2.1):
 * increase/decrease only when the claim is allowed and the verdict is robust or probable; "not detectable" is never
 * "no change"; rain is shown without a trend claim.
 */
export type Headline = { tone: 'up' | 'down' | 'neutral'; text: string; detail: string }

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

export function headlineFor(place: string, result: VariableResult, point: PointResponse): Headline {
  const trend = result.trend
  const display = trend.display
  const unit = unitEn(display.unit)
  const digits = digitsForUnit(unit)
  const name = lower(result.label.en)
  const window = `${trend.window.startYear}–${trend.window.endYear}`
  const elevation = point.support.elevationM !== null ? `, mean elevation ${Math.round(point.support.elevationM).toLocaleString('en-US')} m` : ''
  const robustCount = point.variables.filter((item) => item.trend.claimAllowed && item.trend.verdict === 'robust').length
  const detail = `NASA POWER cell of 0.5° × 0.625° around ${place}${elevation}. ${robustCount} of ${point.variables.length} variables show a robust trend here.`

  if (trend.verdict === 'insufficient-data' || display.slope === null) {
    return { tone: 'neutral', text: `There are not enough complete years to assess ${name} in ${place} for ${window}.`, detail }
  }
  if (!trend.claimAllowed) {
    return { tone: 'neutral', text: `${result.label.en} in ${place} is shown without a trend claim for ${window}: its trend sign changes with the start year, so read the series and anomalies, not a rise or fall.`, detail }
  }
  if (trend.verdict === 'robust' || trend.verdict === 'probable') {
    const rising = display.slope > 0
    const strength = trend.verdict === 'robust' ? 'a robust trend that passes all five checks' : `a probable trend (${trend.criteriaMet} of 5 checks)`
    const small = display.exceedsRelevance === false ? ' The change is significant but small.' : ''
    return { tone: rising ? 'up' : 'down', text: `In ${place}, ${name} ${rising ? 'rose' : 'fell'} by ${formatSigned(display.slope, digits)} ${unit} from ${window}: ${strength}.${small}`, detail }
  }
  if (trend.verdict === 'weak') {
    return { tone: 'neutral', text: `In ${place}, ${name} shows only a weak signal (${formatSigned(display.slope, digits)} ${unit}, ${window}): not enough evidence to call it a trend.`, detail }
  }
  const mdt = trend.minimumDetectablePerDecade
  const detectable = mdt !== null ? ` These years could only reveal a change of about ${formatNumber(mdt, digitsForUnit(unitEn(result.trendUnit)))} ${unitEn(result.trendUnit)} or more.` : ''
  return { tone: 'neutral', text: `No trend in ${name} is detectable in ${place} for ${window}. That is not the same as no change.${detectable}`, detail }
}
