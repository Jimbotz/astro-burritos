/** Validation of GET query / POST body of /api/impact. */
import type { ImpactRequest } from './impact-service'
import type { WindowMode } from './impact-types'
import { parseCoordinates, parseWindow, RequestError } from './validation'

export const IMPACT_MODES: WindowMode[] = ['source-native', 'common-complete-window', 'fixed-window']

/** Validates one impact request; every field is optional except the lens and a place (point, municipality or state). */
export function parseImpactRequest(input: Record<string, unknown>): ImpactRequest {
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' ? String(value) : null)
  const lens = text(input.lens)
  if (lens !== 'water' && lens !== 'heat') throw new RequestError('lens must be "water" or "heat".')
  const country = text(input.country)
  if (country !== null && !/^[A-Z]{3}$/.test(country)) throw new RequestError('country must be a three-letter ADM0_A3 code such as MEX.')
  const state = text(input.state)
  if (state !== null && state.length > 120) throw new RequestError('state must be a state name from the map, such as Puebla.')
  const municipalityCode = text(input.municipalityCode)
  if (municipalityCode !== null && !/^\d{5}$/.test(municipalityCode)) throw new RequestError('municipalityCode must be the 5-digit INEGI code, such as 21114.')
  const hasPoint = input.latitude !== undefined && input.latitude !== null && input.latitude !== ''
  const point = hasPoint ? parseCoordinates(text(input.latitude), text(input.longitude)) : null
  const { startYear, endYear } = parseWindow(text(input.startYear), text(input.endYear))
  const mode = (text(input.mode) ?? 'common-complete-window') as WindowMode
  if (!IMPACT_MODES.includes(mode)) throw new RequestError(`mode must be one of ${IMPACT_MODES.join(', ')}.`)
  if (!point && !municipalityCode && !(country === 'MEX' && state)) throw new RequestError('Send latitude and longitude, municipalityCode, or country=MEX with a state name.')
  return { lens, country, state, municipalityCode, latitude: point?.latitude ?? null, longitude: point?.longitude ?? null, startYear, endYear, mode }
}

