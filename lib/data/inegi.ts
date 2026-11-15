/**
 * INEGI Censo 2020 (ITER) exposure data, processed by scripts/impact/ingest_public.py:
 * - municipalities of Mexico: total, urban (localities ≥ 2,500 people) and placed population, and the municipal seat;
 * - population per MERRA-2 cell from localities with coordinates (never spread uniformly over an area).
 */
import { readBundled } from './bundled'

export type InegiMunicipality = {
  code: string
  name: string
  stateCode: string
  stateName: string
  population: number | null
  urbanPopulation: number
  placedPopulation: number
  urbanFraction: number | null
  placedPopulationShare: number | null
  seat: { name: string; lat: number; lon: number; population: number } | null
}

type MunicipalFile = { sourceId: string; product: string; populationYear: number; url: string; sha256: string; retrievedAt: string; municipalities: InegiMunicipality[] }
type CellFile = { cells: Record<string, [number, number, number]> }

export async function inegiMunicipalities(root?: string) {
  const file = await readBundled<MunicipalFile>('derived/inegi-municipalities.json', root)
  return { meta: file, byCode: new Map(file.municipalities.map((item) => [item.code, item])) }
}

export async function findMunicipality(code: string, root?: string) {
  return (await inegiMunicipalities(root)).byCode.get(code) ?? null
}

export async function municipalitiesOfState(stateCode: string, root?: string) {
  return [...(await inegiMunicipalities(root)).byCode.values()].filter((item) => item.stateCode === stateCode)
}

/** People living in localities inside a MERRA-2 cell (2020); null when no locality falls in it. */
export async function cellPopulation(id: string, root?: string) {
  const file = await readBundled<CellFile>('derived/inegi-cell-population.json', root)
  const entry = file.cells[id]
  return entry ? { population: entry[0], urbanPopulation: entry[1], localities: entry[2], urbanFraction: entry[0] ? entry[1] / entry[0] : null } : null
}
