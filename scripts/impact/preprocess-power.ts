/**
 * Per-cell NASA POWER snapshot for the impact-lens maps of the study states (Puebla, Tlaxcala, Oaxaca).
 *
 * Downloading decades of daily data for every cell on every click is not acceptable (IMPLEMENTACION_LENTES_IMPACTO
 * §8.3), so this script runs during development. For each MERRA-2 cell that touches a state outline (the same Natural
 * Earth outlines the app draws), it asks POWER's public daily point API for 11 parameters, 1991–2024, in local solar
 * time, and stores the processed annual series in data/impact/derived/power-cells-<CVE_ENT>.json:
 * precipitation (annual and wet season), FAO-56 ET0 (annual and wet season), climate water balance, root-zone wetness,
 * TX90p, TN90p, TXx and TNn. Raw responses are cached in data/impact/raw/power/ (git-ignored) with their URL.
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/ts-resolve.mjs scripts/impact/preprocess-power.ts
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fetchDailyPoint } from '../../lib/nasa/power'
import { ET0_PARAMETERS } from '../../lib/analysis/et0'
import { heatSeriesFromDaily, packSeries, waterSeriesFromDaily } from '../../lib/analysis/impact-series'
import { cellsForGeometry, STUDY_STATES } from '../../lib/data/impact-geometry'
import type { PolygonGeometry } from '../../lib/analysis/region'
import type { SeriesMap } from '../../lib/analysis/annual-rules'

const ROOT = process.cwd()
const START = 1991
const END = 2024
const PARAMETERS = [...ET0_PARAMETERS, 'PRECTOTCORR', 'GWETROOT']
const RAW = path.join(ROOT, 'data', 'impact', 'raw', 'power')
const years = Array.from({ length: END - START + 1 }, (_, index) => START + index)

type Cached = { url: string; retrievedAt: string; elevationM: number | null; series: Record<string, Array<[string, number]>>; units: Record<string, string>; sources: string[] }

async function cellSeries(lat: number, lon: number, id: string): Promise<Cached> {
  const file = path.join(RAW, `${id}.json`)
  try { return JSON.parse(await readFile(file, 'utf8')) as Cached } catch { /* not cached yet */ }
  for (let attempt = 1; ; attempt += 1) {
    try {
      const result = await fetchDailyPoint(PARAMETERS, lat, lon, START, END)
      const cached: Cached = {
        url: result.source.url, retrievedAt: result.source.retrievedAt, elevationM: result.elevationM, units: result.units, sources: result.source.sources,
        series: Object.fromEntries(Object.entries(result.series).map(([key, map]) => [key, [...map.entries()]])),
      }
      await writeFile(file, JSON.stringify(cached))
      return cached
    } catch (error) {
      if (attempt >= 3) throw error
      await new Promise((resolve) => setTimeout(resolve, 5000 * attempt))
    }
  }
}

async function main() {
  await mkdir(RAW, { recursive: true })
  const states = JSON.parse(await readFile(path.join(ROOT, 'public', 'geo', 'admin1', 'MEX.json'), 'utf8')) as { features: Array<{ properties: { name: string }; geometry: PolygonGeometry }> }
  for (const [stateCode, state] of Object.entries(STUDY_STATES)) {
    const feature = states.features.find((item) => item.properties.name === state.naturalEarthName)
    if (!feature) throw new Error(`No outline for ${state.name}`)
    const cells = cellsForGeometry(feature.geometry)
    console.log(`${state.name}: ${cells.length} cells`)
    const out = []
    let cursor = 0
    const results: Array<{ cell: (typeof cells)[number]; data: Cached }> = []
    const worker = async () => {
      while (cursor < cells.length) {
        const cell = cells[cursor++]
        results.push({ cell, data: await cellSeries(cell.lat, cell.lon, cell.cellId) })
        process.stdout.write('.')
      }
    }
    await Promise.all(Array.from({ length: 3 }, worker))
    process.stdout.write('\n')
    for (const { cell, data } of results.sort((a, b) => a.cell.cellId.localeCompare(b.cell.cellId))) {
      const series = Object.fromEntries(Object.entries(data.series).map(([key, entries]) => [key, new Map(entries) as SeriesMap])) as Record<string, SeriesMap>
      const water = waterSeriesFromDaily(series as never, START, END)
      const heat = heatSeriesFromDaily(series.T2M_MAX, series.T2M_MIN, START, END)
      out.push({
        cellId: cell.cellId, lat: cell.lat, lon: cell.lon, coverage: Number(cell.coverage.toFixed(3)), bounds: cell.bounds, elevationM: data.elevationM,
        wetSeasonMonths: water.seasons?.wet.months ?? null, wetSeasonCrossesYear: water.seasons?.wet.crossesYear ?? null,
        series: {
          precip: packSeries(water.precip, years), precipWet: packSeries(water.precipWet, years),
          et0: packSeries(water.et0, years), et0Wet: packSeries(water.et0Wet, years),
          balance: packSeries(water.balance, years), balanceWet: packSeries(water.balanceWet, years),
          wetness: packSeries(water.wetness, years),
          tx90p: packSeries(heat.tx90p, years), tn90p: packSeries(heat.tn90p, years), txx: packSeries(heat.txx, years), tnn: packSeries(heat.tnn, years),
        },
        quality: { et0: water.et0Detail.quality, precipOutOfBounds: water.outOfBounds.precip, wetnessOutOfBounds: water.outOfBounds.wetness, heatThresholds: heat.thresholdsAvailable },
        source: { url: data.url, retrievedAt: data.retrievedAt, sources: data.sources },
      })
    }
    const body = {
      sourceId: 'nasa-power', product: 'POWER daily point API v2.10 (MERRA-2 meteorology, CERES SYN1deg / GEWEX SRB radiation)', parameters: PARAMETERS, timeStandard: 'LST', community: 'AG',
      stateCode, state: state.name, years, generatedAt: new Date().toISOString(), cells: out,
      rules: 'Monthly means need ≥ 90% valid days; years need 12/12 months; wet season = the cell’s 6 rainiest consecutive months of 1991–2020; TX90p/TN90p over the calendar-day p90 of 1991–2020 (5-day window); ET0 FAO-56 with G = 0.',
    }
    const text = JSON.stringify(body)
    await writeFile(path.join(ROOT, 'data', 'impact', 'derived', `power-cells-${stateCode}.json`), text)
    console.log(`  -> power-cells-${stateCode}.json (${(text.length / 1024).toFixed(0)} kB, sha256 ${createHash('sha256').update(text).digest('hex').slice(0, 12)})`)
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
