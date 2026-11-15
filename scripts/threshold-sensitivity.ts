/**
 * Threshold sensitivity: how much the published results move when each fixed threshold moves.
 * Results and their reading: docs/science/threshold-sensitivity.md. Output: docs/science/data/threshold-sensitivity.json.
 *
 * Run (Node ≥ 22.18, real NASA POWER data; responses are cached in node_modules/.cache/earthscope-power):
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/ts-resolve.mjs scripts/threshold-sensitivity.ts
 *
 * It runs the production pipeline (analyzeRegion) for three states and the four projectable variables, then re-scores:
 * - projection: minSkill, the validation design (windows × years) and the diagnostic α, on the area-weighted series;
 * - field FDR: significant cells at q = 0.05, 0.10 and 0.20, from the cells' Hamed–Rao p-values;
 * - seasons: share of cells with a wet/dry season for each minWetShare × minAnnualRainMm, in contrasting climates;
 * - completeness: missing months in the POWER series, which decide whether 12/12 versus 11/12 matters at all.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cellSeasons, MIN_ANNUAL_RAIN_MM, MIN_WET_SHARE, monthKey, type AnnualPoint } from '../lib/analysis/annual-rules'
import { adjustBenjaminiHochberg } from '../lib/analysis/multiple-testing'
import { projectCells, type ProjectionSummary } from '../lib/analysis/projection'
import { expandForCells, geometryBBox } from '../lib/analysis/region'
import { findArea } from '../lib/api/areas'
import { analyzeRegion } from '../lib/api/region-service'
import { fetchMonthlyRegional, type BBox } from '../lib/nasa/power'
import { getVariable, type ProjectionRule, type VariableId } from '../lib/variables/catalog'

const ROOT = process.cwd()
const CACHE = path.join(ROOT, 'node_modules', '.cache', 'earthscope-power')
const OUTPUT = path.join(ROOT, 'docs', 'science', 'data', 'threshold-sensitivity.json')
const WINDOW = { startYear: 2001, endYear: 2024 }
const STATES = ['Puebla', 'Tlaxcala', 'Oaxaca']
const VARIABLE_IDS: VariableId[] = ['T2M', 'TXx', 'TNn', 'PRECTOTCORR']

// ---------- Projection re-scoring on the regional series ----------
/** Status and skill for the regional series under a modified rule (one "cell": the series itself). */
function rescore(regional: AnnualPoint[], rule: ProjectionRule) {
  const { summary } = projectCells(['regional'], new Map([['regional', regional]]), regional, WINDOW.startYear, WINDOW.endYear, rule)
  return {
    status: summary.status,
    skill: round(summary.holdout?.skill),
    windows: summary.holdout?.windows.map((window) => ({ years: window.years, skill: round(window.skill) })) ?? [],
    warnings: summary.warnings.map((warning) => warning.code),
  }
}

const round = (value: number | null | undefined, digits = 3) => (value === null || value === undefined || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits)

async function main() {
  // ---------- Cached POWER access (the same URLs production requests) ----------
  await mkdir(CACHE, { recursive: true })
  const realFetch = globalThis.fetch
  let downloaded = 0
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    const file = path.join(CACHE, `${createHash('sha1').update(url).digest('hex')}.json`)
    try { return new Response(await readFile(file, 'utf8'), { status: 200 }) } catch { /* not cached yet */ }
    const response = await realFetch(input, init)
    if (!response.ok) return response
    const text = await response.text()
    await writeFile(file, text)
    downloaded += 1
    return new Response(text, { status: 200 })
  }) as typeof fetch

  const results: Record<string, unknown>[] = []
  for (const stateName of STATES) {
    const area = await findArea('MEX', stateName)
    for (const id of VARIABLE_IDS) {
      const variable = getVariable(id)!
      const rule = variable.profile.projection!
      const response = await analyzeRegion(variable, WINDOW.startYear, WINDOW.endYear, { area })
      const regional = response.regional.annual
      const published = response.projection as ProjectionSummary
      const pValues = response.cells.map((cell) => ({ id: cell.id, pValue: cell.pValueHamedRao }))
      const significantAt = (q: number) => adjustBenjaminiHochberg(pValues, q).filter((item) => item.qValue !== null && item.qValue < q).length
      results.push({
        state: stateName,
        variable: id,
        cells: response.cells.length,
        regionalVerdict: response.regional.trend.verdict,
        published: {
          status: published.status, skill: round(published.holdout?.skill), coverage95: round(published.holdout?.coverage95),
          windows: published.holdout?.windows.map((window) => ({ years: window.years, skill: round(window.skill) })),
          warnings: published.warnings.map((warning) => warning.code),
          curvatureP: round(published.diagnostics?.curvature?.pValue, 4), varianceP: round(published.diagnostics?.variance?.pValue, 4),
          varianceGrowing: published.diagnostics?.variance ? published.diagnostics.variance.trend > 0 : null,
        },
        minSkill: Object.fromEntries([0, 0.05, 0.1, 0.15, 0.2].map((minSkill) => [minSkill, rescore(regional, { ...rule, minSkill }).status])),
        design: Object.fromEntries(([[1, 5], [2, 5], [3, 5], [2, 4], [2, 6]] as const).map(([holdoutWindows, holdoutYears]) => [`${holdoutWindows}x${holdoutYears}`, rescore(regional, { ...rule, holdoutWindows, holdoutYears })])),
        // Which shape warnings would fire at each α (independent of the status, which decides whether warnings are shown).
        diagnosticAlpha: Object.fromEntries([0.01, 0.05, 0.1].map((alpha) => [alpha, [
          ...(published.diagnostics?.curvature && published.diagnostics.curvature.pValue < alpha ? ['curvature'] : []),
          ...(published.diagnostics?.variance && published.diagnostics.variance.pValue < alpha && published.diagnostics.variance.trend > 0 ? ['growing-variance'] : []),
        ]])),
        fieldFdr: Object.fromEntries([0.05, 0.1, 0.2].map((q) => [q, significantAt(q)])),
      })
      console.error(`${stateName} ${id}: ${published.status}, skill ${round(published.holdout?.skill)}`)
    }
  }

  // ---------- Seasons: share of cells with a wet/dry season, in contrasting climates ----------
  const SEASON_BOXES: Array<{ name: string; bbox: BBox }> = [
    { name: 'South-central Mexico (Puebla, Tlaxcala, Oaxaca)', bbox: { minLat: 15, maxLat: 25, minLon: -100, maxLon: -90 } },
    { name: 'Ireland (rain all year, winter maximum)', bbox: { minLat: 50, maxLat: 55, minLon: -10, maxLon: -5 } },
    { name: 'Central Amazon (rain all year)', bbox: { minLat: -5, maxLat: 0, minLon: -65, maxLon: -60 } },
    { name: 'Central Sahara (hyper-arid)', bbox: { minLat: 25, maxLat: 30, minLon: 0, maxLon: 5 } },
  ]
  const SHARES = [0.5, 0.55, 0.6, 0.65, 0.7]
  const RAINS = [50, 100, 200]
  const seasons = []
  for (const box of SEASON_BOXES) {
    const fetched = await fetchMonthlyRegional('PRECTOTCORR', box.bbox, 1981, 2024)
    const grid = Object.fromEntries(SHARES.map((minWetShare) => [minWetShare, Object.fromEntries(RAINS.map((minAnnualRainMm) => [
      minAnnualRainMm, round(fetched.cells.filter((cell) => cellSeasons(cell.series, { minWetShare, minAnnualRainMm })).length / fetched.cells.length, 3),
    ]))]))
    const shares = fetched.cells.map((cell) => cellSeasons(cell.series, { minWetShare: 0, minAnnualRainMm: 0 })?.wetShare).filter((value): value is number => value !== undefined).sort((a, b) => a - b)
    seasons.push({ region: box.name, cells: fetched.cells.length, wetShareMedian: round(shares[Math.floor(shares.length / 2)]), wetShareRange: [round(shares[0]), round(shares[shares.length - 1])], withSeasons: grid })
    console.error(`seasons ${box.name}: ${fetched.cells.length} cells`)
  }

  // ---------- Completeness: missing months in the series behind the three states ----------
  const completeness = []
  const boxes = await Promise.all(STATES.map(async (name) => expandForCells(geometryBBox((await findArea('MEX', name)).geometry))))
  const allStates: BBox = {
    minLat: Math.min(...boxes.map((box) => box.minLat)), maxLat: Math.max(...boxes.map((box) => box.maxLat)),
    minLon: Math.min(...boxes.map((box) => box.minLon)), maxLon: Math.max(...boxes.map((box) => box.maxLon)),
  }
  for (const parameter of ['T2M', 'T2M_MAX', 'T2M_MIN', 'PRECTOTCORR']) {
    const fetched = await fetchMonthlyRegional(parameter, allStates, 1981, 2024)
    let missing = 0
    for (const cell of fetched.cells) for (let year = 1981; year <= 2024; year += 1) for (let month = 1; month <= 12; month += 1) if (!cell.series.has(monthKey(year, month))) missing += 1
    completeness.push({ parameter, cells: fetched.cells.length, months: fetched.cells.length * 44 * 12, missing })
  }

  const output = {
    generatedAt: new Date().toISOString(),
    window: WINDOW,
    defaults: { ...getVariable('T2M')!.profile.projection, rationale: undefined, fieldFdrQ: 0.1, minWetShare: MIN_WET_SHARE, minAnnualRainMm: MIN_ANNUAL_RAIN_MM },
    powerRequestsDownloaded: downloaded,
    projectionAndField: results,
    seasons,
    completeness,
  }
  await mkdir(path.dirname(OUTPUT), { recursive: true })
  await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`)
  console.error(`wrote ${path.relative(ROOT, OUTPUT)} (${downloaded} POWER requests downloaded, the rest from the cache)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
