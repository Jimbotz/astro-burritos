import { NextRequest, NextResponse } from 'next/server'
import { crosscheckRain } from '@/lib/api/crosscheck-service'
import { clientKey, createRateLimiter, RATE_LIMITS, rateLimitMessage } from '@/lib/api/rate-limit'
import { parseCoordinates, parseWindow, RequestError } from '@/lib/api/validation'
import { PowerError } from '@/lib/nasa/power'

// One monthly point call (30 s timeout) and one IMERG box (60 s) in parallel, each retried once on 5xx/429.
export const maxDuration = 120

const limiter = createRateLimiter(RATE_LIMITS.crosscheck)

/** GET /api/crosscheck?latitude=19.04&longitude=-98.20&startYear=2001&endYear=2024: MERRA-2 vs GPM IMERG rain for one cell. */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams
  try {
    const { latitude, longitude } = parseCoordinates(query.get('latitude'), query.get('longitude'))
    const { startYear, endYear } = parseWindow(query.get('startYear'), query.get('endYear'))
    const verdict = limiter(clientKey(request.headers))
    if (!verdict.ok) return NextResponse.json({ error: rateLimitMessage(verdict.retryAfterSeconds) }, { status: 429, headers: { 'Retry-After': String(verdict.retryAfterSeconds) } })
    const body = await crosscheckRain(latitude, longitude, startYear, endYear, request.signal)
    return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } })
  } catch (error) {
    if (error instanceof RequestError || error instanceof PowerError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'The rain cross-check failed unexpectedly.' }, { status: 500 })
  }
}
