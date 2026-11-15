import { NextRequest, NextResponse } from 'next/server'
import { analyzeImpact } from '@/lib/api/impact-service'
import { parseImpactRequest } from '@/lib/api/impact-request'
import { clientKey, createRateLimiter, RATE_LIMITS, rateLimitMessage } from '@/lib/api/rate-limit'
import { RequestError } from '@/lib/api/validation'
import { PowerError } from '@/lib/nasa/power'

// Two POWER daily requests (12 parameters since 1991) in parallel, each retried once, plus bundled CONAGUA/INEGI data.
export const maxDuration = 120

const limiter = createRateLimiter(RATE_LIMITS.impact)
async function respond(request: NextRequest, input: Record<string, unknown>, cacheable: boolean) {
  try {
    const parsed = parseImpactRequest(input)
    const verdict = limiter(clientKey(request.headers))
    if (!verdict.ok) return NextResponse.json({ error: rateLimitMessage(verdict.retryAfterSeconds) }, { status: 429, headers: { 'Retry-After': String(verdict.retryAfterSeconds) } })
    const body = await analyzeImpact(parsed, request.signal)
    return NextResponse.json(body, { headers: { 'Cache-Control': cacheable ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'private, max-age=0' } })
  } catch (error) {
    if (error instanceof RequestError || error instanceof PowerError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'The impact analysis failed unexpectedly.' }, { status: 500 })
  }
}

/**
 * GET /api/impact?lens=water&country=MEX&state=Puebla&startYear=2001&endYear=2024
 * GET /api/impact?lens=heat&municipalityCode=21114&startYear=2001&endYear=2024
 * Optional: latitude & longitude (the analysis point), mode=source-native|common-complete-window|fixed-window.
 */
export async function GET(request: NextRequest) {
  return respond(request, Object.fromEntries(request.nextUrl.searchParams.entries()), true)
}

/** POST /api/impact with a JSON body of the same fields. */
export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'The body must be JSON.' }, { status: 400 }) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'The body must be a JSON object.' }, { status: 400 })
  return respond(request, body as Record<string, unknown>, false)
}
