import { NextRequest, NextResponse } from 'next/server'
import { analyzePoint } from '@/lib/api/point-service'
import { clientKey, createRateLimiter, RATE_LIMITS, rateLimitMessage } from '@/lib/api/rate-limit'
import { parseCoordinates, parseVariableList, parseWindow, RequestError } from '@/lib/api/validation'
import { PowerError } from '@/lib/nasa/power'

// One monthly (30 s timeout) and one daily (60 s) POWER call in parallel, each retried once on 5xx/429.
export const maxDuration = 120

const limiter = createRateLimiter(RATE_LIMITS.point)

/** GET /api/point?latitude=19.04&longitude=-98.20&startYear=2001&endYear=2024&variables=T2M,TN,TX */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams
  try {
    const { latitude, longitude } = parseCoordinates(query.get('latitude'), query.get('longitude'))
    const { startYear, endYear } = parseWindow(query.get('startYear'), query.get('endYear'))
    const variables = parseVariableList(query.get('variables'))
    const verdict = limiter(clientKey(request.headers))
    if (!verdict.ok) return NextResponse.json({ error: rateLimitMessage(verdict.retryAfterSeconds) }, { status: 429, headers: { 'Retry-After': String(verdict.retryAfterSeconds) } })
    const body = await analyzePoint(latitude, longitude, startYear, endYear, variables, request.signal)
    return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } })
  } catch (error) {
    if (error instanceof RequestError || error instanceof PowerError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'The point analysis failed unexpectedly.' }, { status: 500 })
  }
}
