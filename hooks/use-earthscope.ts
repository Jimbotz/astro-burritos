'use client'

import { useEffect, useRef } from 'react'
import useSWR from 'swr'
import type { PointResponse, RegionResponse, VariableId } from '@/lib/api/v2'
import type { Polygonal } from '@/lib/geo'

// Client hooks for API v2: SWR, no refetch on focus,
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
 * instead of the geometry so SWR never hashes large polygons. Pass null to skip: switching to null (Cancel, a new
 * query) aborts the request in flight, so the browser stops waiting for it.
 */
export function useRegionLayer(request: RegionRequest | null) {
  const key = request ? ['/api/region', request.areaId, request.variable, request.startYear, request.endYear] as const : null
  const controller = useRef<AbortController | null>(null)
  const lastKey = useRef<string | null>(null)
  const keyText = key?.join('|') ?? null
  // Abort only when the key really changes (not on React's development double-mount, which would cancel every request).
  useEffect(() => {
    if (lastKey.current !== null && lastKey.current !== keyText) controller.current?.abort()
    lastKey.current = keyText
  }, [keyText])
  return useSWR<RegionResponse, Error>(key, async () => {
    if (!request) throw new Error('No region selected.')
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    try {
      const response = await fetch('/api/region', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variable: request.variable, startYear: request.startYear, endYear: request.endYear, geometry: request.geometry }),
        signal: current.signal,
      })
      return await readJson<RegionResponse>(response)
    } catch (error) {
      if (current.signal.aborted) throw new Error('The grid request was cancelled.')
      throw error
    }
  }, { revalidateOnFocus: false, shouldRetryOnError: false })
}
