/**
 * Generic NASA POWER client for API v2 (monthly point, daily point, monthly regional).
 * The legacy lib/nasa/client.ts keeps serving /api/series unchanged.
 *
 * Verified POWER behaviour (2026-11-14):
 * - The point endpoint returns the nearest native MERRA-2 cell (0.5° lat × 0.625° lon), not an interpolation.
 * - The regional endpoint accepts one parameter per request and a 2°–10° range per axis.
 * - Monthly T2M_MAX / T2M_MIN are the month's absolute extremes, not means.
 */
import { parsePowerSeries, type SeriesMap } from '../analysis/annual-rules'

const BASE = 'https://power.larc.nasa.gov/api/temporal'
export const CELL = { dLat: 0.5, dLon: 0.625 } as const
export const TILE_DEGREES = 5

/** `cancelled`: the client went away (request.signal aborted), so the remaining POWER calls were not made. */
export type PowerErrorKind = 'rejected' | 'unavailable' | 'timeout' | 'invalid-payload' | 'cancelled'

export class PowerError extends Error {
  readonly status: number
  readonly kind: PowerErrorKind
  constructor(message: string, status: number, kind: PowerErrorKind) {
    super(message)
    this.status = status
    this.kind = kind
  }
}

export type PowerSourceInfo = {
  endpoint: 'monthly-point' | 'daily-point' | 'monthly-regional'
  url: string
  retrievedAt: string
  apiVersion: string | null
  sources: string[]
  timeStandard: string | null
  coverage: { start: string | null; end: string | null }
}

type PowerHeader = { api?: { version?: string }; sources?: string[]; fill_value?: number; time_standard?: string; start?: string; end?: string }
type PowerPointPayload = { geometry?: { coordinates?: number[] }; header?: PowerHeader; properties?: { parameter?: Record<string, Record<string, unknown>> }; parameters?: Record<string, { units?: string }>; messages?: string[] }
type PowerRegionalPayload = { header?: PowerHeader; features?: Array<{ geometry?: { coordinates?: number[] }; properties?: { parameter?: Record<string, Record<string, unknown>> } }>; messages?: string[] }

const cancelled = () => new PowerError('The request was cancelled by the client.', 499, 'cancelled')

/** One POWER call with a timeout and one retry on 5xx/429. `signal` (the client's request) cancels it, without retry. */
async function powerFetch<T>(url: URL, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal?.aborted) throw cancelled()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { next: { revalidate: 86400 }, signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal })
      if (response.ok) {
        try { return await response.json() as T } catch { throw new PowerError('NASA POWER returned an unreadable response.', 502, 'invalid-payload') }
      }
      if (response.status >= 500 || response.status === 429) { lastError = new PowerError(`NASA POWER returned HTTP ${response.status}.`, 502, 'unavailable'); continue }
      let detail = ''
      try { const body = await response.json() as { messages?: string[] }; detail = body.messages?.join(' ') ?? '' } catch { /* keep generic */ }
      throw new PowerError(`NASA POWER rejected the request (HTTP ${response.status}). ${detail}`.trim(), 502, 'rejected')
    } catch (error) {
      if (signal?.aborted) throw cancelled()
      if (error instanceof PowerError && error.kind !== 'unavailable') throw error
      lastError = error
    } finally {
      clearTimeout(timer)
    }
  }
  if (lastError instanceof Error && lastError.name === 'AbortError') throw new PowerError('NASA POWER timed out. Try again or choose a smaller region.', 504, 'timeout')
  if (lastError instanceof PowerError) throw lastError
  throw new PowerError('NASA POWER could not be reached after two attempts.', 502, 'unavailable')
}

function sourceInfo(endpoint: PowerSourceInfo['endpoint'], url: URL, header?: PowerHeader): PowerSourceInfo {
  return {
    endpoint, url: url.toString(), retrievedAt: new Date().toISOString(), apiVersion: header?.api?.version ?? null,
    sources: header?.sources ?? [], timeStandard: header?.time_standard ?? null,
    coverage: { start: header?.start ?? null, end: header?.end ?? null },
  }
}

export type PointFetchResult = {
  series: Record<string, SeriesMap>
  units: Record<string, string>
  elevationM: number | null
  source: PowerSourceInfo
}

function parsePoint(payload: PowerPointPayload, parameters: string[]) {
  const fill = payload.header?.fill_value ?? -999
  const series: Record<string, SeriesMap> = {}
  const units: Record<string, string> = {}
  for (const parameter of parameters) {
    series[parameter] = parsePowerSeries(payload.properties?.parameter?.[parameter], fill)
    units[parameter] = payload.parameters?.[parameter]?.units ?? ''
  }
  return { series, units, elevationM: payload.geometry?.coordinates?.[2] ?? null }
}

export async function fetchMonthlyPoint(parameters: string[], latitude: number, longitude: number, startYear: number, endYear: number, signal?: AbortSignal): Promise<PointFetchResult> {
  const url = new URL(`${BASE}/monthly/point`)
  url.search = new URLSearchParams({ parameters: parameters.join(','), community: 'AG', longitude: String(longitude), latitude: String(latitude), start: String(startYear), end: String(endYear), format: 'JSON', 'time-standard': 'LST' }).toString()
  const payload = await powerFetch<PowerPointPayload>(url, 30_000, signal)
  if (!payload.properties?.parameter) throw new PowerError('NASA POWER did not return the requested parameters.', 502, 'invalid-payload')
  return { ...parsePoint(payload, parameters), source: sourceInfo('monthly-point', url, payload.header) }
}

export async function fetchDailyPoint(parameters: string[], latitude: number, longitude: number, startYear: number, endYear: number, signal?: AbortSignal): Promise<PointFetchResult> {
  const url = new URL(`${BASE}/daily/point`)
  url.search = new URLSearchParams({ parameters: parameters.join(','), community: 'AG', longitude: String(longitude), latitude: String(latitude), start: `${startYear}0101`, end: `${endYear}1231`, format: 'JSON', 'time-standard': 'LST' }).toString()
  const payload = await powerFetch<PowerPointPayload>(url, 60_000, signal)
  if (!payload.properties?.parameter) throw new PowerError('NASA POWER did not return the requested daily parameters.', 502, 'invalid-payload')
  return { ...parsePoint(payload, parameters), source: sourceInfo('daily-point', url, payload.header) }
}

export type BBox = { minLat: number; maxLat: number; minLon: number; maxLon: number }
export type RegionalCellRaw = { id: string; lat: number; lon: number; elevationM: number | null; series: SeriesMap }

export const cellId = (lat: number, lon: number) => `${lat.toFixed(3)}_${lon.toFixed(3)}`

/** Aligned 5° tiles covering the bbox (stable cache keys, always ≥ 2° and ≤ 10°). */
export function tilesFor(bbox: BBox) {
  const tiles: BBox[] = []
  const lat0 = Math.floor(bbox.minLat / TILE_DEGREES) * TILE_DEGREES
  const lon0 = Math.floor(bbox.minLon / TILE_DEGREES) * TILE_DEGREES
  for (let lat = lat0; lat < bbox.maxLat; lat += TILE_DEGREES) {
    for (let lon = lon0; lon < bbox.maxLon; lon += TILE_DEGREES) {
      tiles.push({ minLat: Math.max(-90, lat), maxLat: Math.min(90, lat + TILE_DEGREES), minLon: Math.max(-180, lon), maxLon: Math.min(180, lon + TILE_DEGREES) })
    }
  }
  return tiles
}

/**
 * Fetches one monthly parameter for every MERRA-2 cell in the tiles covering the bbox (deduplicated). When `signal`
 * aborts, no new tile is requested and the ones in flight are cancelled; tiles already downloaded stay in the data cache.
 */
export async function fetchMonthlyRegional(parameter: string, bbox: BBox, startYear: number, endYear: number, concurrency = 4, signal?: AbortSignal) {
  const tiles = tilesFor(bbox)
  const cells = new Map<string, RegionalCellRaw>()
  const sources: PowerSourceInfo[] = []
  let cursor = 0
  async function worker() {
    while (cursor < tiles.length) {
      if (signal?.aborted) throw cancelled()
      const tile = tiles[cursor++]
      const url = new URL(`${BASE}/monthly/regional`)
      url.search = new URLSearchParams({ parameters: parameter, community: 'AG', 'latitude-min': String(tile.minLat), 'latitude-max': String(tile.maxLat), 'longitude-min': String(tile.minLon), 'longitude-max': String(tile.maxLon), start: String(startYear), end: String(endYear), format: 'JSON' }).toString()
      const payload = await powerFetch<PowerRegionalPayload>(url, 60_000, signal)
      const fill = payload.header?.fill_value ?? -999
      sources.push(sourceInfo('monthly-regional', url, payload.header))
      for (const feature of payload.features ?? []) {
        const [lon, lat, elevation] = feature.geometry?.coordinates ?? []
        if (typeof lat !== 'number' || typeof lon !== 'number') continue
        const id = cellId(lat, lon)
        if (!cells.has(id)) cells.set(id, { id, lat, lon, elevationM: typeof elevation === 'number' ? elevation : null, series: parsePowerSeries(feature.properties?.parameter?.[parameter], fill) })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tiles.length) }, worker))
  return { cells: [...cells.values()], sources, tileCount: tiles.length }
}
