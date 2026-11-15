import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

// Real NASA POWER responses saved in tests/fixtures/power (see its manifest.json for the exact requests).
const fixture = (name: string) => readFileSync(new URL(`../fixtures/power/${name}`, import.meta.url))
export const monthly = JSON.parse(fixture('monthly-point-puebla.json').toString('utf8'))
export const daily = JSON.parse(gunzipSync(fixture('daily-point-puebla.json.gz')).toString('utf8'))
export const regional = JSON.parse(fixture('monthly-regional-T2M-tlaxcala.json').toString('utf8'))
/** IMERG through POWER (UTC), 2001–2024: the pixels of the Puebla MERRA-2 cell and a 0.1° ring around it. */
export const imerg = JSON.parse(gunzipSync(fixture('monthly-regional-IMERG-puebla.json.gz')).toString('utf8'))

type Geometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: never }
export const stateGeometry = (country: string, name: string): Geometry =>
  JSON.parse(readFileSync(new URL(`../../public/geo/admin1/${country}.json`, import.meta.url), 'utf8')).features.find((feature: { properties: { name: string } }) => feature.properties.name === name).geometry

/**
 * Answers POWER requests from the fixtures; anything else gets the 422 POWER returns for a bad request. The monthly
 * point fixture also serves the legacy /api/series (it carries T2M and PRECTOTCORR). IMERG is answered only when asked
 * in UTC, as POWER does (in LST it returns −999 for every month).
 */
export function fakePower(input: string | URL | Request) {
  const url = new URL(String(input instanceof Request ? input.url : input))
  const body = url.pathname.endsWith('/monthly/point') ? monthly
    : url.pathname.endsWith('/daily/point') ? daily
    : url.pathname.endsWith('/monthly/regional') && url.searchParams.get('parameters') === 'T2M' ? regional
    : url.pathname.endsWith('/monthly/regional') && url.searchParams.get('parameters') === 'IMERG_PRECTOT' && url.searchParams.get('time-standard') === 'UTC' ? imerg
    : null
  return Promise.resolve(body ? new Response(JSON.stringify(body), { status: 200 }) : new Response(JSON.stringify({ messages: ['not in the fixtures'] }), { status: 422 }))
}
