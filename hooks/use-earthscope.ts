'use client'

import { useEffect, useRef } from 'react'
import useSWR from 'swr'
import type { PointResponse, RegionResponse, VariableId } from '@/lib/api/v2'

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

/** A map area by its Natural Earth id: ADM0_A3 country code and, for a state, its exact name. */
export type RegionRequest = { country: string; state: string | null; variable: VariableId; startYear: number; endYear: number }

/** GET /api/region by area id: a short, stable URL the CDN caches, and the server clips to the outline the map draws. */
export const regionUrl = (request: RegionRequest) => `/api/region?${new URLSearchParams({
  variable: request.variable, country: request.country, ...(request.state ? { state: request.state } : {}),
  startYear: String(request.startYear), endYear: String(request.endYear),
})}`

/**
 * Map grid for one variable clipped to a state or country (GET /api/region by area id). Pass null to skip:
 * switching to null (Cancel, a new query) aborts the request in flight, and the server stops calling NASA POWER.
 */
export function useRegionLayer(request: RegionRequest | null) {
  const key = request ? regionUrl(request) : null
  // Each controller remembers its key. SWR starts the new key's fetch (a layout effect) before this effect runs, so
  // aborting "the current controller" on a key change killed the request just started for the new key (switching
  // examples left "The grid request was cancelled"). Abort only a request that belongs to another key. That also
  // keeps React's development double-mount (same key) from cancelling anything.
  const controller = useRef<{ key: string; abort: AbortController } | null>(null)
  useEffect(() => {
    if (controller.current && controller.current.key !== key) controller.current.abort.abort()
  }, [key])
  return useSWR<RegionResponse, Error>(key, async (url: string) => {
    controller.current?.abort.abort()
    const current = new AbortController()
    controller.current = { key: url, abort: current }
    try {
      return await readJson<RegionResponse>(await fetch(url, { signal: current.signal }))
    } catch (error) {
      if (current.signal.aborted) throw new Error('The grid request was cancelled.')
      throw error
    }
  }, { revalidateOnFocus: false, shouldRetryOnError: false })
}
