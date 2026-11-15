/**
 * Server-side lookup of the Natural Earth boundaries in public/geo/, so GET /api/region can take an area id
 * (country ADM0_A3 code, optional state name) instead of a posted polygon. A GET by id has a short, stable URL that
 * the CDN can cache, and the server uses exactly the outline the map draws.
 * next.config.mjs adds public/geo to the route's file trace so the files exist in the deployed function.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { PolygonGeometry } from '../analysis/region'
import { RequestError } from './validation'

type CountryCollection = { features: Array<{ properties: { ADM0_A3: string; NAME: string }; geometry: PolygonGeometry }> }
type StateCollection = { features: Array<{ properties: { name: string }; geometry: PolygonGeometry }> }

export type Area = { country: string; state: string | null; name: string; geometry: PolygonGeometry }

const COUNTRY_CODE = /^[A-Z]{3}$/
const MAX_STATE_NAME = 120
const files = new Map<string, Promise<unknown>>()

function load<T>(relative: string, root: string): Promise<T> {
  const file = path.join(root, 'public', 'geo', relative)
  let pending = files.get(file)
  if (!pending) {
    pending = readFile(file, 'utf8').then((text) => JSON.parse(text))
    pending.catch(() => files.delete(file))
    files.set(file, pending)
  }
  return pending as Promise<T>
}

/** Resolves `country` (e.g. "MEX") and an optional `state` (exact Natural Earth name, e.g. "Puebla") to its outline. */
export async function findArea(country: string | null, state: string | null, root = process.cwd()): Promise<Area> {
  if (!country || !COUNTRY_CODE.test(country)) throw new RequestError('country must be a three-letter ADM0_A3 code such as MEX.')
  if (state !== null && (!state.trim() || state.length > MAX_STATE_NAME)) throw new RequestError('state must be a state name from the map, such as Puebla.')
  if (state === null) {
    const countries = await load<CountryCollection>('countries.json', root)
    const feature = countries.features.find((item) => item.properties.ADM0_A3 === country)
    if (!feature) throw new RequestError(`Unknown country code ${country}.`, 404)
    return { country, state: null, name: feature.properties.NAME, geometry: feature.geometry }
  }
  let states: StateCollection
  try {
    states = await load<StateCollection>(path.join('admin1', `${country}.json`), root)
  } catch {
    throw new RequestError(`No states are available for ${country}.`, 404)
  }
  const feature = states.features.find((item) => item.properties.name === state)
  if (!feature) throw new RequestError(`Unknown state “${state}” in ${country}.`, 404)
  return { country, state, name: feature.properties.name, geometry: feature.geometry }
}
