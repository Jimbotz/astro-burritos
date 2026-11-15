/**
 * Geometry of the impact lenses: the study states, the MERRA-2 cells of a polygon and the INEGI municipal outlines
 * (simplified from the Marco Geoestadístico 2020 into public/geo/municipios/<CVE_ENT>.json by
 * scripts/impact/ingest_public.py). Natural Earth state names (the app's selects) map to INEGI state codes here.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { cellBounds, containsPoint, coverageFraction, expandForCells, geometryBBox, type PolygonGeometry } from '../analysis/region'
import { CELL, cellId } from '../nasa/power'

/** States with bundled municipal outlines, per-cell snapshots and stations (IMPLEMENTACION_LENTES_IMPACTO §8.3). */
export const STUDY_STATES: Record<string, { name: string; naturalEarthName: string }> = {
  '21': { name: 'Puebla', naturalEarthName: 'Puebla' },
  '29': { name: 'Tlaxcala', naturalEarthName: 'Tlaxcala' },
  '20': { name: 'Oaxaca', naturalEarthName: 'Oaxaca' },
}

/** INEGI state code (CVE_ENT) of every Mexican state, by its Natural Earth name. */
export const MEXICO_STATE_CODES: Record<string, string> = {
  Aguascalientes: '01', 'Baja California': '02', 'Baja California Sur': '03', Campeche: '04', Coahuila: '05', Colima: '06', Chiapas: '07', Chihuahua: '08',
  'Distrito Federal': '09', 'Ciudad de México': '09', Durango: '10', Guanajuato: '11', Guerrero: '12', Hidalgo: '13', Jalisco: '14', México: '15', Michoacán: '16', Morelos: '17',
  Nayarit: '18', 'Nuevo León': '19', Oaxaca: '20', Puebla: '21', Querétaro: '22', 'Quintana Roo': '23', 'San Luis Potosí': '24', Sinaloa: '25',
  Sonora: '26', Tabasco: '27', Tamaulipas: '28', Tlaxcala: '29', Veracruz: '30', Yucatán: '31', Zacatecas: '32',
}

export type GridCell = { cellId: string; lat: number; lon: number; coverage: number; bounds: ReturnType<typeof cellBounds> }

/** Every MERRA-2 cell with part of its area inside the polygon (coverage sampled on 6 × 6 points, as GET /api/region). */
export function cellsForGeometry(geometry: PolygonGeometry): GridCell[] {
  const box = expandForCells(geometryBBox(geometry))
  const cells: GridCell[] = []
  for (let lat = Math.ceil(box.minLat / CELL.dLat) * CELL.dLat; lat <= box.maxLat + 1e-9; lat += CELL.dLat) {
    for (let lon = Math.ceil(box.minLon / CELL.dLon) * CELL.dLon; lon <= box.maxLon + 1e-9; lon += CELL.dLon) {
      const coverage = coverageFraction(geometry, lat, lon)
      if (coverage > 0) cells.push({ cellId: cellId(lat, lon), lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)), coverage, bounds: cellBounds(lat, lon) })
    }
  }
  return cells
}

export type MunicipalFeature = { type: 'Feature'; properties: { code: string; name: string; stateCode: string }; geometry: PolygonGeometry }
type MunicipalCollection = { type: 'FeatureCollection'; features: MunicipalFeature[] }

const cache = new Map<string, Promise<MunicipalCollection | null>>()

/** INEGI municipal outlines of a study state, or null when the state has none bundled. */
export function loadMunicipalities(stateCode: string, root = process.cwd()): Promise<MunicipalCollection | null> {
  if (!/^\d{2}$/.test(stateCode)) return Promise.resolve(null)
  const file = path.join(root, 'public', 'geo', 'municipios', `${stateCode}.json`)
  let pending = cache.get(file)
  if (!pending) {
    pending = readFile(file, 'utf8').then((text) => JSON.parse(text) as MunicipalCollection).catch(() => null)
    cache.set(file, pending)
  }
  return pending
}

export const municipalGeometryUrl = (stateCode: string) => (STUDY_STATES[stateCode] ? `/geo/municipios/${stateCode}.json` : null)

/** The municipality whose outline contains a point, within a study state. */
export async function municipalityAt(stateCode: string, lat: number, lon: number, root = process.cwd()) {
  const collection = await loadMunicipalities(stateCode, root)
  return collection?.features.find((feature) => containsPoint(feature.geometry, lon, lat)) ?? null
}
