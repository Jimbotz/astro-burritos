import { afterEach, describe, expect, it, vi } from 'vitest'
import { findArea } from '../../lib/api/areas'
import { clientKey, createRateLimiter, RATE_LIMITS } from '../../lib/api/rate-limit'
import { fetchMonthlyRegional, PowerError } from '../../lib/nasa/power'
import { regional } from '../helpers/power-fixtures'

afterEach(() => { vi.unstubAllGlobals() })

describe('rate limiter (fixed window per client)', () => {
  it('allows the limit, refuses the next with the seconds left, and opens again after the window', () => {
    let now = 1_000_000
    const hit = createRateLimiter({ limit: 3, windowMs: 60_000 }, () => now)
    expect([hit('a'), hit('a'), hit('a')].map((result) => result.ok)).toEqual([true, true, true])
    now += 15_000
    expect(hit('a')).toEqual({ ok: false, retryAfterSeconds: 45 })
    expect(hit('b')).toEqual({ ok: true, remaining: 2 })
    now += 45_000
    expect(hit('a')).toEqual({ ok: true, remaining: 2 })
  })

  it('keys clients by the first forwarded address, then x-real-ip', () => {
    expect(clientKey(new Headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }))).toBe('203.0.113.5')
    expect(clientKey(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2')
    expect(clientKey(new Headers())).toBe('local')
  })

  it('is stricter for regions (many POWER blocks) than for points', () => {
    expect(RATE_LIMITS.region.limit).toBeLessThan(RATE_LIMITS.point.limit)
  })
})

describe('area lookup from public/geo', () => {
  it('finds a state and a whole country by id', async () => {
    const puebla = await findArea('MEX', 'Puebla')
    expect(puebla).toMatchObject({ country: 'MEX', state: 'Puebla', name: 'Puebla' })
    expect(['Polygon', 'MultiPolygon']).toContain(puebla.geometry.type)
    expect((await findArea('MEX', null)).name).toBe('Mexico')
  })

  it('accepts only three capital letters as a country, so no path can be injected', async () => {
    for (const country of ['mex', 'ME', '../geo', 'MEX/../x', null]) await expect(findArea(country, null)).rejects.toMatchObject({ status: 400 })
    await expect(findArea('MEX', 'Atlantis')).rejects.toMatchObject({ status: 404 })
    await expect(findArea('MEX', '   ')).rejects.toMatchObject({ status: 400 })
  })
})

describe('client cancellation reaches NASA POWER', () => {
  // Four 5° tiles (10–20°N, 100–90°W); the fixture answers every one of them.
  const box = { minLat: 11, maxLat: 19, minLon: -99, maxLon: -91 }

  it('makes no request when the signal is already aborted', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const controller = new AbortController()
    controller.abort()
    await expect(fetchMonthlyRegional('T2M', box, 1981, 2024, 1, controller.signal)).rejects.toMatchObject({ kind: 'cancelled', status: 499 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('stops requesting tiles once the client goes away mid-way', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn(async () => {
      controller.abort()
      return new Response(JSON.stringify(regional), { status: 200 })
    }))
    const error = await fetchMonthlyRegional('T2M', box, 1981, 2024, 1, controller.signal).catch((reason) => reason)
    expect(error).toBeInstanceOf(PowerError)
    expect(error.kind).toBe('cancelled')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('cancels a request in flight without retrying it', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn((_url: URL, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      setTimeout(() => controller.abort(), 5)
    })))
    await expect(fetchMonthlyRegional('T2M', box, 1981, 2024, 1, controller.signal)).rejects.toMatchObject({ kind: 'cancelled' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
