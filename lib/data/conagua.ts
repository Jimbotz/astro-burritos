/**
 * CONAGUA / SMN bundled data, processed by scripts/impact/ingest_public.py:
 * - the Mexican Drought Monitor (MSM) per municipality since 2003 (one category per date: none, D0 … D4);
 * - daily-record stations near the study cells, aggregated to annual values with ≥ 90% valid days.
 * The absence of drought records never means the absence of drought: a municipality without records is
 * `insufficient-data`, not "no drought".
 */
import type { AnnualPoint } from '../analysis/annual-rules'
import { pearson } from '../analysis/concordance'
import { quantile } from '../analysis/impact-stats'
import type { DroughtYears } from '../analysis/water-risk'
import type { Bilingual, DroughtSummary, StationValidation } from '../api/impact-types'
import { readBundled } from './bundled'

type DroughtFile = { sourceId: string; product: string; url: string; retrievedAt: string; sha256: string; dates: string[]; municipalities: Record<string, { name: string; stateCode: string; series: string }> }

export async function droughtMonitor(root?: string) {
  return readBundled<DroughtFile>('derived/smn-drought-municipal.json', root)
}

/** D1 (moderate drought) or worse counts as drought; D0 is "abnormally dry", a watch category, not drought. */
const IN_DROUGHT = new Set(['1', '2', '3', '4'])

/** Per calendar year: whether the monitor has records, and whether any of them is D1 or worse. */
export function droughtYearsFrom(dates: string[], series: string): DroughtYears {
  const years = new Map<number, { covered: boolean; drought: boolean }>()
  dates.forEach((date, index) => {
    const year = Number(date.slice(0, 4))
    const char = series[index]
    const entry = years.get(year) ?? { covered: false, drought: false }
    if (char !== undefined && char !== '?') entry.covered = true
    if (IN_DROUGHT.has(char)) entry.drought = true
    years.set(year, entry)
  })
  return [...years.entries()].sort(([a], [b]) => a - b).map(([year, entry]) => ({ year, ...entry }))
}

/** Months, years, longest run and worst category of drought (D1+) of one municipality up to endYear. */
export function droughtSummaryFrom(dates: string[], series: string, endYear: number, recentYears = 5): DroughtSummary {
  const months = new Map<string, number>() // YYYY-MM → worst category that month (-1 none)
  dates.forEach((date, index) => {
    if (Number(date.slice(0, 4)) > endYear) return
    const char = series[index]
    if (char === undefined || char === '?') return
    const month = date.slice(0, 7)
    const level = IN_DROUGHT.has(char) || char === '0' ? Number(char) : -1
    months.set(month, Math.max(months.get(month) ?? -1, level))
  })
  const ordered = [...months.entries()].sort(([a], [b]) => a.localeCompare(b))
  let longest = 0
  let run = 0
  let previous: string | null = null
  for (const [month, level] of ordered) {
    const consecutive = previous !== null && nextMonth(previous) === month
    run = level >= 1 ? (consecutive ? run + 1 : 1) : 0
    longest = Math.max(longest, run)
    previous = month
  }
  const droughtMonths = ordered.filter(([, level]) => level >= 1)
  const yearsWithDrought = [...new Set(droughtMonths.map(([month]) => Number(month.slice(0, 4))))]
  const coveredYears = [...new Set(ordered.map(([month]) => Number(month.slice(0, 4))))]
  const worst = Math.max(-1, ...ordered.map(([, level]) => level))
  const recent = Array.from({ length: recentYears }, (_, index) => endYear - recentYears + 1 + index)
  return {
    coverage: { firstDate: ordered[0]?.[0] ?? null, lastDate: ordered.at(-1)?.[0] ?? null, records: ordered.length, years: coveredYears },
    monthsWithDrought: droughtMonths.length,
    yearsWithDrought,
    maxDurationMonths: longest,
    maxCategory: worst >= 0 ? `D${worst}` : null,
    percentMonthsAffected: ordered.length ? (droughtMonths.length / ordered.length) * 100 : null,
    recentYearsWithDrought: recent.filter((year) => yearsWithDrought.includes(year)).length,
    recentYearsCovered: recent.filter((year) => coveredYears.includes(year)).length,
  }
}

function nextMonth(month: string) {
  const [year, value] = month.split('-').map(Number)
  return value === 12 ? `${year + 1}-01` : `${year}-${String(value + 1).padStart(2, '0')}`
}

export async function municipalDrought(code: string, endYear: number, root?: string) {
  const file = await droughtMonitor(root)
  const entry = file.municipalities[code]
  if (!entry) return null
  return { years: droughtYearsFrom(file.dates, entry.series), summary: droughtSummaryFrom(file.dates, entry.series, endYear), name: entry.name }
}

export type Station = {
  stationId: string
  id: string
  name: string
  municipality: string
  state: string
  stateCode: string
  status: string
  lat: number
  lon: number
  altitude: number | null
  cellId: string
  url: string
  sha256: string
  retrievedAt: string
  firstDate: string | null
  lastDate: string | null
  years: number[]
  precipitation: Array<number | null>
  tmax: Array<number | null>
  tmin: Array<number | null>
}

export async function stations(root?: string) {
  return (await readBundled<{ stations: Station[] }>('derived/smn-stations.json', root)).stations
}

const toRad = (value: number) => (value * Math.PI) / 180
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lon - a.lon) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/** Bundled station nearest to a point within maxKm, or null. */
export async function nearestStation(lat: number, lon: number, maxKm = 30, root?: string) {
  const list = await stations(root)
  let best: { station: Station; distance: number } | null = null
  for (const station of list) {
    const distance = distanceKm({ lat, lon }, station)
    if (distance <= maxKm && (!best || distance < best.distance)) best = { station, distance }
  }
  return best
}

/**
 * Compares a station's annual precipitation with POWER's for the same years, and checks the station's own recent
 * dryness: years of the last 5 below its 1991–2020 20th percentile (needs ≥ 15 complete base years).
 */
export function validateStation(station: Station, distance: number, cellId: string, power: AnnualPoint[], endYear: number): StationValidation {
  const byYear = new Map(station.years.map((year, index) => [year, station.precipitation[index]]))
  const pairs = power.filter((point) => point.complete && point.value !== null && byYear.get(point.year) !== null && byYear.get(point.year) !== undefined).map((point) => ({ year: point.year, power: point.value as number, station: byYear.get(point.year) as number }))
  const correlation = pairs.length >= 10 ? pearson(pairs.map((pair) => pair.power), pairs.map((pair) => pair.station)) : null
  const meanPower = pairs.reduce((sum, pair) => sum + pair.power, 0) / (pairs.length || 1)
  const meanStation = pairs.reduce((sum, pair) => sum + pair.station, 0) / (pairs.length || 1)
  const base = station.years.map((year, index) => ({ year, value: station.precipitation[index] })).filter((item) => item.year >= 1991 && item.year <= 2020 && item.value !== null).map((item) => item.value as number).sort((a, b) => a - b)
  const p20 = base.length >= 15 ? quantile(base, 0.2) : null
  const recent = Array.from({ length: 5 }, (_, index) => endYear - 4 + index).map((year) => byYear.get(year)).filter((value): value is number => value !== null && value !== undefined)
  const recentBelow = p20 === null || recent.length < 4 ? null : recent.filter((value) => value < p20).length
  const note: Bilingual = correlation === null
    ? { es: 'Menos de 10 años en común con POWER: no se calcula la correlación.', en: 'Fewer than 10 years in common with POWER: no correlation is computed.' }
    : { es: `Correlación anual POWER–estación r = ${correlation.toFixed(2)} en ${pairs.length} años.`, en: `Annual POWER–station correlation r = ${correlation.toFixed(2)} over ${pairs.length} years.` }
  return {
    stationId: station.stationId, name: station.name, municipality: station.municipality, distanceKm: Number(distance.toFixed(1)), sameCell: station.cellId === cellId,
    commonYears: pairs.length, correlation, meanDifferencePercent: pairs.length && meanStation ? ((meanPower - meanStation) / meanStation) * 100 : null,
    recentYearsBelowP20: recentBelow, evidence: recentBelow === null ? null : recentBelow >= 2, note,
  }
}
