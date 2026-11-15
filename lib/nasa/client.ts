import type { NasaObservation, NasaParameter, NasaPowerRequest, NasaPowerResult } from '@/lib/nasa/types'

type PowerMonthlyPayload = {
  properties?: { parameter?: Record<string, Record<string, unknown>> }
  header?: { api?: { version?: string }; fill_value?: number; sources?: string[]; time_standard?: string }
  parameters?: Record<string, { units?: string; longname?: string }>
}

const parameterMetadata: Record<NasaParameter, { unit: string; note: string }> = {
  T2M: { unit: '°C', note: 'NASA POWER monthly T2M values are monthly mean air temperature at 2 meters.' },
  PRECTOTCORR: { unit: 'mm/day', note: 'NASA POWER monthly PRECTOTCORR values are monthly mean daily precipitation rates.' },
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function expectedMonths(startYear: number, endYear: number) {
  return (endYear - startYear + 1) * 12
}

export function parsePowerMonthlyPayload(payload: PowerMonthlyPayload, request: NasaPowerRequest): NasaObservation[] {
  const values = payload.properties?.parameter?.[request.parameter]
  if (!values || typeof values !== 'object') throw new Error('The NASA POWER response did not include the requested parameter.')

  const fillValue = payload.header?.fill_value ?? -999
  const observations: NasaObservation[] = []
  for (const [key, rawValue] of Object.entries(values)) {
    const year = Number(key.slice(0, 4))
    const month = Number(key.slice(4, 6))
    // POWER also returns YYYY13 as an annual aggregate. We recompute annual values
    // from the twelve monthly records so the unit conversion and completeness rule
    // remain explicit and reproducible.
    if (!/^\d{6}$/.test(key) || month < 1 || month > 12 || year < request.startYear || year > request.endYear) continue
    const value = typeof rawValue === 'number' ? rawValue : Number(rawValue)
    if (!Number.isFinite(value) || value === fillValue || value === -999) continue
    observations.push({
      date: `${year}-${String(month).padStart(2, '0')}`,
      year,
      month,
      value,
      unit: parameterMetadata[request.parameter].unit,
      daysInMonth: daysInMonth(year, month),
    })
  }
  return observations.sort((first, second) => first.date.localeCompare(second.date))
}

async function requestPower(url: URL) {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await fetch(url, { next: { revalidate: 86400 }, signal: controller.signal })
      if (response.ok) return response
      if (response.status >= 500 || response.status === 429) {
        lastError = new Error(`NASA POWER returned HTTP ${response.status}.`)
        continue
      }
      throw new Error(`NASA POWER request rejected with HTTP ${response.status}. Check the selected period or location.`)
    } catch (error) {
      lastError = error
      if (error instanceof Error && error.message.startsWith('NASA POWER request rejected')) throw error
    } finally {
      clearTimeout(timeout)
    }
  }
  if (lastError instanceof Error && lastError.name === 'AbortError') throw new Error('NASA POWER timed out. Try a shorter period or another location.')
  throw new Error('NASA POWER could not be reached after two attempts. Check the connection and try again.')
}

export async function fetchNasaPowerMonthly(request: NasaPowerRequest): Promise<NasaPowerResult> {
  const metadata = parameterMetadata[request.parameter]
  const url = new URL('https://power.larc.nasa.gov/api/temporal/monthly/point')
  url.search = new URLSearchParams({
    parameters: request.parameter,
    community: 'AG',
    longitude: String(request.longitude),
    latitude: String(request.latitude),
    start: String(request.startYear),
    end: String(request.endYear),
    format: 'JSON',
    'time-standard': 'LST',
  }).toString()

  let response: Response
  try {
    response = await requestPower(url)
  } catch (error) {
    // Keep the timeout and the 4xx rejection messages (audit finding A6): a bad period is not a connection problem.
    if (error instanceof Error && (error.message.includes('timed out') || error.message.startsWith('NASA POWER request rejected'))) throw error
    throw new Error('NASA POWER could not be reached after two attempts. Check the connection and try again.')
  }

  let payload: PowerMonthlyPayload
  try {
    payload = await response.json() as PowerMonthlyPayload
  } catch {
    throw new Error('NASA POWER returned an unreadable response. Try again later.')
  }
  const observations = parsePowerMonthlyPayload(payload, request)
  const apiUnit = payload.parameters?.[request.parameter]?.units
  const fillValue = payload.header?.fill_value ?? -999
  const result: NasaPowerResult = {
    source: 'NASA POWER',
    parameter: request.parameter,
    unit: metadata.unit,
    observations,
    sourceUrl: url.toString(),
    retrievedAt: new Date().toISOString(),
    productVersion: payload.header?.api?.version ?? null,
    sourceModel: payload.header?.sources?.join(', ') || null,
    timeStandard: payload.header?.time_standard === 'UTC' ? 'UTC' : payload.header?.time_standard === 'LST' ? 'LST' : null,
    fillValue,
    temporalResolution: 'monthly',
    period: { startYear: request.startYear, endYear: request.endYear },
    coverage: { start: observations[0]?.date ?? null, end: observations.at(-1)?.date ?? null },
    missingCount: Math.max(0, expectedMonths(request.startYear, request.endYear) - observations.length),
    processingNotes: [
      metadata.note,
      `NASA POWER reported source units: ${apiUnit ?? metadata.unit}. Fill value ${fillValue} and non-numeric values were excluded.`,
      request.parameter === 'PRECTOTCORR' ? 'Annual precipitation is recomputed as the sum of monthly mm/day values multiplied by the actual days in each month.' : 'Annual temperature is recomputed as a day-weighted mean of complete monthly values.',
      'POWER meteorological parameters are derived from the MERRA-2 assimilation model; they are not presented as direct satellite measurements.',
      'The analysis is descriptive and does not establish causation or forecast future conditions.',
    ],
  }
  return result
}
