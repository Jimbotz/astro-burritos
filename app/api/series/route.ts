import { NextRequest, NextResponse } from 'next/server'
import { aggregateAnnual, calculateTrend } from '@/lib/analysis/trend'
import { fetchNasaPowerMonthly } from '@/lib/nasa/client'
import type { NasaParameter } from '@/lib/nasa/types'

const parameters = {
  temperature: 'T2M',
  precipitation: 'PRECTOTCORR',
} as const satisfies Record<string, NasaParameter>

const MIN_YEAR = 1981
const MAX_RANGE_YEARS = 60
// Deprecated since 2026-11-15 (RFC 9745): the interface uses GET /api/point, which covers T2M and PRECTOTCORR with the
// full assessment (Hamed–Rao, Sen interval, verdicts, minimum detectable trend). Kept working for external clients.
const DEPRECATION = { Deprecation: '@1794700800', Link: '</api/point>; rel="successor-version"' }

function integerQuery(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams
  const latitude = Number(query.get('latitude'))
  const longitude = Number(query.get('longitude'))
  const startYear = integerQuery(query.get('startYear'))
  const endYear = integerQuery(query.get('endYear'))
  const variable = query.get('variable') ?? ''
  const latestCompletedYear = new Date().getUTCFullYear() - 1

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: 'Latitude or longitude is outside the valid range.' }, { status: 400, headers: DEPRECATION })
  }
  if (startYear === null || endYear === null || startYear < MIN_YEAR || endYear > latestCompletedYear || startYear > endYear || endYear - startYear + 1 > MAX_RANGE_YEARS) {
    return NextResponse.json({ error: `Choose a complete period from ${MIN_YEAR} through ${latestCompletedYear}, no longer than ${MAX_RANGE_YEARS} years.` }, { status: 400, headers: DEPRECATION })
  }
  // Own keys only (audit finding A5): `variable in parameters` also accepted toString, constructor or __proto__.
  if (!Object.hasOwn(parameters, variable)) return NextResponse.json({ error: 'Unsupported climate variable. Use temperature or precipitation.' }, { status: 400, headers: DEPRECATION })

  try {
    const result = await fetchNasaPowerMonthly({ parameter: parameters[variable as keyof typeof parameters], latitude, longitude, startYear, endYear })
    const annual = aggregateAnnual(result.observations, result.parameter)
    const trend = calculateTrend(annual)
    return NextResponse.json({ ...result, annual, trend }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800', ...DEPRECATION } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'NASA POWER is temporarily unavailable. Please try again later.'
    return NextResponse.json({ error: message }, { status: 502, headers: DEPRECATION })
  }
}
