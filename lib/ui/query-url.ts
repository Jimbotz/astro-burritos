import { getVariable, type VariableId } from '../variables/catalog'

/** A shareable analysis: what step 1 holds when Analyze is pressed. */
export type SharedQuery = {
  region: { name: string; lat: number; lon: number; country?: string; state?: string }
  variable: VariableId
  startYear: number
  endYear: number
  layer: 'anomaly' | 'trend' | 'mean'
}

// The period picker offers 2001–2024; anything outside is ignored rather than trusted.
const FIRST_YEAR = 2001
const LAST_YEAR = 2024
const LAYERS = ['anomaly', 'trend', 'mean'] as const

export function encodeQuery(query: SharedQuery): string {
  const params = new URLSearchParams({
    place: query.region.name,
    lat: query.region.lat.toFixed(2),
    lon: query.region.lon.toFixed(2),
    var: query.variable,
    from: String(query.startYear),
    to: String(query.endYear),
    layer: query.layer,
  })
  if (query.region.country) params.set('country', query.region.country)
  if (query.region.state) params.set('state', query.region.state)
  return `?${params}`
}

/** Parses and validates a shared link; null when anything is missing or out of range (the app then keeps its defaults). */
export function decodeQuery(search: string): SharedQuery | null {
  const params = new URLSearchParams(search)
  const lat = Number(params.get('lat'))
  const lon = Number(params.get('lon'))
  const name = params.get('place')?.trim()
  const variableId = params.get('var') ?? ''
  const variable = getVariable(variableId)
  const startYear = Number(params.get('from'))
  const endYear = Number(params.get('to'))
  const layer = params.get('layer') ?? 'anomaly'
  const country = params.get('country') ?? undefined
  const state = params.get('state') ?? undefined
  if (!name || name.length > 120 || params.get('lat') === null || params.get('lon') === null) return null
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  if (!variable || !variable.availability.region) return null
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear < FIRST_YEAR || endYear > LAST_YEAR || startYear >= endYear) return null
  if (!(LAYERS as readonly string[]).includes(layer)) return null
  if (country !== undefined && !/^[A-Z]{3}$/.test(country)) return null
  if (state !== undefined && (!country || state.length > 120)) return null
  return { region: { name, lat, lon, country, state }, variable: variable.id, startYear, endYear, layer: layer as SharedQuery['layer'] }
}
