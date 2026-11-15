import { NextRequest, NextResponse } from 'next/server'
import { cellsToGeoJSON, isPolygonGeometry } from '@/lib/analysis/region'
import { findArea } from '@/lib/api/areas'
import { clientKey, createRateLimiter, RATE_LIMITS, rateLimitMessage } from '@/lib/api/rate-limit'
import { analyzeRegion, RegionError, type RegionSelection } from '@/lib/api/region-service'
import { parseFormat, parseVariable, parseWindow, RequestError } from '@/lib/api/validation'
import { PowerError } from '@/lib/nasa/power'
import type { RegionResponse } from '@/lib/api/v2'

// The largest region the API accepts (≈ 2,500 cells, 35 POWER blocks) took 87 s uncached; a state takes 3–15 s.
export const maxDuration = 120

const MAX_BODY_BYTES = 5_000_000
const limiter = createRateLimiter(RATE_LIMITS.region)

function respond(body: RegionResponse, format: 'json' | 'geojson', cache: boolean) {
  const headers = { 'Cache-Control': cache ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'private, max-age=3600' }
  if (format === 'geojson') {
    const { cells, ...rest } = body
    return NextResponse.json(cellsToGeoJSON(cells, rest), { headers: { ...headers, 'Content-Type': 'application/geo+json' } })
  }
  return NextResponse.json(body, { headers })
}

function failure(error: unknown) {
  if (error instanceof RequestError || error instanceof RegionError || error instanceof PowerError) return NextResponse.json({ error: error.message }, { status: error.status })
  return NextResponse.json({ error: 'The region analysis failed unexpectedly.' }, { status: 500 })
}

function limited(request: NextRequest) {
  const verdict = limiter(clientKey(request.headers))
  if (verdict.ok) return null
  return NextResponse.json({ error: rateLimitMessage(verdict.retryAfterSeconds) }, { status: 429, headers: { 'Retry-After': String(verdict.retryAfterSeconds) } })
}

/**
 * GET /api/region?variable=T2M&country=MEX&state=Puebla&startYear=2001&endYear=2024[&format=geojson]
 * GET /api/region?variable=T2M&minLat=17.8&maxLat=20.9&minLon=-98.8&maxLon=-96.7&startYear=2001&endYear=2024
 * By area id (the outline the map draws) or by bounding box. Both are cacheable by the CDN for a day.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  try {
    const variable = parseVariable(q.get('variable'), 'region')
    const { startYear, endYear } = parseWindow(q.get('startYear'), q.get('endYear'))
    const format = parseFormat(q.get('format'))
    let selection: RegionSelection
    if (q.has('country')) {
      selection = { area: await findArea(q.get('country'), q.get('state')) }
    } else {
      if (['minLat', 'maxLat', 'minLon', 'maxLon'].some((key) => q.get(key) === null)) throw new RequestError('Send country (and optionally state), or minLat, maxLat, minLon and maxLon, or POST a GeoJSON geometry.')
      selection = { bbox: { minLat: Number(q.get('minLat')), maxLat: Number(q.get('maxLat')), minLon: Number(q.get('minLon')), maxLon: Number(q.get('maxLon')) } }
    }
    const tooMany = limited(request)
    if (tooMany) return tooMany
    return respond(await analyzeRegion(variable, startYear, endYear, selection, request.signal), format, true)
  } catch (error) {
    return failure(error)
  }
}

/** POST /api/region  { "variable": "T2M", "startYear": 2001, "endYear": 2024, "geometry": <GeoJSON Polygon|MultiPolygon>, "format": "json" } */
export async function POST(request: NextRequest) {
  try {
    const length = Number(request.headers.get('content-length') ?? 0)
    if (length > MAX_BODY_BYTES) throw new RequestError('The geometry is too large (limit 5 MB). Send a simplified polygon.', 413)
    let body: Record<string, unknown>
    try { body = await request.json() as Record<string, unknown> } catch { throw new RequestError('The body must be JSON.') }
    const variable = parseVariable(body.variable, 'region')
    const { startYear, endYear } = parseWindow(body.startYear as number | undefined, body.endYear as number | undefined)
    const format = parseFormat(body.format)
    if (!isPolygonGeometry(body.geometry)) throw new RequestError('geometry must be a GeoJSON Polygon or MultiPolygon in lon/lat (EPSG:4326).')
    const tooMany = limited(request)
    if (tooMany) return tooMany
    return respond(await analyzeRegion(variable, startYear, endYear, { geometry: body.geometry }, request.signal), format, false)
  } catch (error) {
    return failure(error)
  }
}
