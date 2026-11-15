/**
 * Best-effort rate limit for the routes that call NASA POWER (fixed window per client IP).
 *
 * It lives in the memory of one server instance, so on a serverless platform each instance counts on its own: it stops
 * a single client from hammering POWER through one instance, not a distributed attack (that belongs to the platform's
 * firewall). Responses served from the CDN cache never reach the function and never count.
 */

export type RateLimitRule = { limit: number; windowMs: number }
export type RateLimitResult = { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number }

/**
 * Uncached region requests fetch up to ~10 POWER blocks each; point requests fetch two series; a cross-check fetches the
 * monthly point series and one IMERG box (about 75 kB per year).
 */
export const RATE_LIMITS = {
  region: { limit: 12, windowMs: 60_000 },
  point: { limit: 30, windowMs: 60_000 },
  crosscheck: { limit: 20, windowMs: 60_000 },
  /** Impact lenses: two POWER daily requests of 12 parameters since 1991 each. */
  impact: { limit: 10, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>

const MAX_TRACKED_CLIENTS = 10_000

export function createRateLimiter(rule: RateLimitRule, now: () => number = Date.now) {
  const windows = new Map<string, { count: number; resetAt: number }>()
  return function hit(key: string): RateLimitResult {
    const time = now()
    if (windows.size > MAX_TRACKED_CLIENTS) {
      for (const [client, window] of windows) if (window.resetAt <= time) windows.delete(client)
    }
    const current = windows.get(key)
    if (!current || current.resetAt <= time) {
      windows.set(key, { count: 1, resetAt: time + rule.windowMs })
      return { ok: true, remaining: rule.limit - 1 }
    }
    if (current.count >= rule.limit) return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - time) / 1000)) }
    current.count += 1
    return { ok: true, remaining: rule.limit - current.count }
  }
}

/** First address in x-forwarded-for (set by the platform's proxy), then x-real-ip; local requests share one key. */
export function clientKey(headers: Headers) {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('x-real-ip')?.trim() || 'local'
}

export const rateLimitMessage = (seconds: number) => `Too many analyses from this connection. Wait ${seconds} s and try again.`
