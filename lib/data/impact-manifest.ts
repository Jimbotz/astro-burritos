/**
 * Source manifests of the impact lenses (data/impact/manifests/*.json, written by scripts/impact/ingest_public.py)
 * plus what each source is used for, how it is transformed and its limits. Every source is public and needs no login.
 */
import type { Bilingual, ImpactLens, ImpactSource } from '../api/impact-types'
import { readOptional } from './bundled'

type Manifest = { sourceId: string; provider: string; product: string; url: string | null; retrievedAt: string | null; coverage: { start: string | null; end: string | null } | null; resolution: string; timeStandard: string | null; accessMode: ImpactSource['accessMode']; license: string; checksum: string | null }

type Description = { lenses: ImpactSource['lenses']; status: ImpactSource['status']; use: Bilingual; transformations: Bilingual[]; limitations: Bilingual[] }

export const SOURCE_DESCRIPTIONS: Record<string, Description> = {
  'nasa-power': {
    lenses: ['core', 'water', 'heat'], status: 'in-use',
    use: { es: 'Clima y tendencias: lluvia, ET0, humedad radicular, días y noches cálidos, extremos.', en: 'Climate and trends: rain, ET0, root-zone wetness, warm days and nights, extremes.' },
    transformations: [
      { es: 'Relleno −999 eliminado; 12/12 meses por año; meses con ≥ 90% de días válidos.', en: 'Fill value −999 removed; 12/12 months per year; months with ≥ 90% valid days.' },
      { es: 'ET0 FAO-56 diaria con viento a 2 m (ec. 47) y radiación neta de los componentes de POWER.', en: 'Daily FAO-56 ET0 with wind at 2 m (eq. 47) and net radiation from POWER’s components.' },
      { es: 'TX90p/TN90p sobre el percentil 90 del día del calendario de 1991–2020 (ventana de 5 días).', en: 'TX90p/TN90p over the calendar-day 90th percentile of 1991–2020 (5-day window).' },
    ],
    limitations: [
      { es: 'Reanálisis y modelos de asimilación, no estaciones ni mediciones directas; celda de 0.5° × 0.625°.', en: 'Reanalysis and assimilation models, not stations or direct measurements; 0.5° × 0.625° cell.' },
      { es: 'La radiación cambia de producto en 2001 (GEWEX SRB → CERES SYN1deg).', en: 'Radiation changes product in 2001 (GEWEX SRB → CERES SYN1deg).' },
    ],
  },
  'conagua-smn-stations': {
    lenses: ['water'], status: 'in-use',
    use: { es: 'Validación de la lluvia de POWER y evidencia observada de años secos en estaciones cercanas.', en: 'Validation of POWER rain and observed evidence of dry years at nearby stations.' },
    transformations: [
      { es: 'NULO = faltante (nunca cero); fechas duplicadas, valores fuera de rango y Tmín > Tmáx se cuentan y se excluyen.', en: 'NULO = missing (never zero); duplicate dates, out-of-range values and Tmin > Tmax are counted and excluded.' },
      { es: 'Año completo con ≥ 90% de días válidos; total anual = media de los días válidos × días del año.', en: 'A year is complete with ≥ 90% valid days; annual total = mean of the valid days × days in the year.' },
    ],
    limitations: [{ es: 'Una estación es un punto: puede diferir de la celda de 55 km de POWER, sobre todo en montaña.', en: 'A station is a point: it can differ from POWER’s 55 km cell, above all in mountains.' }],
  },
  'smn-drought-monitor': {
    lenses: ['water'], status: 'in-use',
    use: { es: 'Sequía histórica observada por municipio (D1 o peor) desde 2003.', en: 'Observed historical drought per municipality (D1 or worse) since 2003.' },
    transformations: [{ es: 'Una categoría por fecha; un mes cuenta con su peor categoría; D0 (anormalmente seco) no es sequía.', en: 'One category per date; a month takes its worst category; D0 (abnormally dry) is not drought.' }],
    limitations: [{ es: 'Es una evaluación experta; la ausencia de registros no significa ausencia de sequía.', en: 'It is an expert assessment; the absence of records does not mean the absence of drought.' }],
  },
  'inegi-iter-2020': {
    lenses: ['heat'], status: 'in-use',
    use: { es: 'Población expuesta por municipio y por celda, y fracción urbana (localidades de 2 500 habitantes o más).', en: 'Exposed population per municipality and per cell, and urban share (localities of 2,500 people or more).' },
    transformations: [{ es: 'Cada localidad con coordenadas suma su población a la celda que la contiene; no se reparte la población sobre el área.', en: 'Each locality with coordinates adds its population to the cell that contains it; population is not spread over the area.' }],
    limitations: [{ es: 'Censo 2020: no refleja cambios posteriores ni población flotante; no es vulnerabilidad ni salud.', en: '2020 census: it does not reflect later changes or commuters; it is not vulnerability or health.' }],
  },
  'inegi-mg-2020': {
    lenses: ['water', 'heat'], status: 'in-use',
    use: { es: 'Límites y claves municipales de Puebla, Tlaxcala y Oaxaca para los mapas.', en: 'Municipal outlines and codes of Puebla, Tlaxcala and Oaxaca for the maps.' },
    transformations: [{ es: 'Reproyectados a WGS84 y simplificados (6% de vértices) con mapshaper.', en: 'Reprojected to WGS84 and simplified (6% of vertices) with mapshaper.' }],
    limitations: [{ es: 'La simplificación mueve los bordes unos cientos de metros: no sirve para catastro.', en: 'Simplification moves the borders by a few hundred metres: not for cadastral use.' }],
  },
  'fao-56': {
    lenses: ['water'], status: 'method',
    use: { es: 'Método de la evapotranspiración de referencia ET0 (Penman–Monteith).', en: 'Method of the reference evapotranspiration ET0 (Penman–Monteith).' },
    transformations: [],
    limitations: [{ es: 'Es un método, no una fuente de observaciones; ET0 es la demanda de un pasto de referencia, no del cultivo real.', en: 'It is a method, not a source of observations; ET0 is the demand of a reference grass, not of the real crop.' }],
  },
  'open-meteo': {
    lenses: [], status: 'optional',
    use: { es: 'Opcional para comparar con ERA5-Land o pronóstico; no lo usa la aplicación.', en: 'Optional comparison with ERA5-Land or forecasts; the app does not use it.' },
    transformations: [],
    limitations: [{ es: 'No es dependencia: la aplicación funciona sin ella.', en: 'Not a dependency: the app works without it.' }],
  },
}

const ORDER = ['nasa-power', 'conagua-smn-stations', 'smn-drought-monitor', 'inegi-iter-2020', 'inegi-mg-2020', 'fao-56', 'open-meteo']

/** Every source with its manifest and description; `lens` keeps the ones that lens uses (plus methods and optional). */
export async function impactSources(lens?: ImpactLens, root?: string): Promise<ImpactSource[]> {
  const out: ImpactSource[] = []
  for (const id of ORDER) {
    const manifest = await readOptional<Manifest>(`manifests/${id}.json`, root)
    const description = SOURCE_DESCRIPTIONS[id]
    if (!manifest || !description) continue
    if (lens && description.status === 'in-use' && !description.lenses.includes(lens)) continue
    if (lens && description.status === 'method' && !description.lenses.includes(lens)) continue
    out.push({
      sourceId: id, provider: manifest.provider, product: manifest.product, url: manifest.url ?? '', retrievedAt: manifest.retrievedAt ?? 'method reference',
      coverage: { start: manifest.coverage?.start ?? '—', end: manifest.coverage?.end ?? '—' }, resolution: manifest.resolution, timeStandard: manifest.timeStandard,
      authRequired: false, accessMode: manifest.accessMode, license: manifest.license, checksum: manifest.checksum, ...description,
    })
  }
  return out
}
