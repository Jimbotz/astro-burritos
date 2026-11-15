import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

// Real POWER daily responses for the Puebla analysis point (data/impact/fixtures/manifest.json), one per request group.
const fixture = (name: string) => JSON.parse(gunzipSync(readFileSync(new URL(`../../data/impact/fixtures/${name}`, import.meta.url))).toString('utf8'))
export const dailyA = fixture('power-daily-puebla-a.json.gz')
export const dailyB = fixture('power-daily-puebla-b.json.gz')

/** Answers the two daily point requests of /api/impact from the fixtures (any coordinates); anything else gets a 422. */
export function fakeImpactPower(input: string | URL | Request) {
  const url = new URL(String(input instanceof Request ? input.url : input))
  const parameters = url.searchParams.get('parameters') ?? ''
  const body = url.pathname.endsWith('/daily/point') ? (parameters.startsWith('T2M_MAX') ? dailyA : parameters.startsWith('ALLSKY') ? dailyB : null) : null
  return Promise.resolve(body ? new Response(JSON.stringify(body), { status: 200 }) : new Response(JSON.stringify({ messages: ['not in the fixtures'] }), { status: 422 }))
}
