'use client'

import useSWR from 'swr'
import type { PointResponse, RegionResponse, VariableId } from '@/lib/api/v2'
import type { Polygonal } from '@/lib/geo'

// Client hooks for API v2. Same conventions as the legacy /api/series fetch in app-shell: SWR, no refetch on focus,
// and the server's `error` message surfaced as-is so the panels can show it.

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(body.error || `Request failed (HTTP ${response.status}).`)
  return body
}

export type PointRequest = { latitude: number; longitude: number; startYear: number; endYear: number }

/** Every processed variable at the analysis point (one request returns all 13). Pass null to skip. */
export function usePointAnalysis(request: PointRequest | null) {
  const key = request ? `/api/point?${new URLSearchParams({ latitude: String(request.latitude), longitude: String(request.longitude), startYear: String(request.startYear), endYear: String(request.endYear) })}` : null
  return useSWR<PointResponse, Error>(key, async (url: string) => readJson<PointResponse>(await fetch(url)), { revalidateOnFocus: false })
}

export type RegionRequest = { areaId: string; variable: VariableId; startYear: number; endYear: number; geometry: Polygonal }

/**
 * Map grid for one variable clipped to a state or country polygon (POST /api/region). The key uses the area id
 * instead of the geometry so SWR never hashes large polygons. Pass null to skip.
 */
export function useRegionLayer(request: RegionRequest | null) {
  const key = request ? ['/api/region', request.areaId, request.variable, request.startYear, request.endYear] as const : null
  return useSWR<RegionResponse, Error>(key, async () => {
    if (!request) throw new Error('No region selected.')
    const response = await fetch('/api/region', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variable: request.variable, startYear: request.startYear, endYear: request.endYear, geometry: request.geometry }),
    })
    return readJson<RegionResponse>(response)
  }, { revalidateOnFocus: false })
}
