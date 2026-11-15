/**
 * Normalized record schema and quality control of the impact lenses (IMPLEMENTACION_LENTES_IMPACTO §5.2–5.3).
 *
 * Every source passes the same checks before aggregation: schema, coordinates, dates, duplicates, fill values, units
 * and physically impossible values, then coverage. Problems are flagged first and never removed silently: a flagged
 * record keeps its value and its flags, and only `valid` records enter aggregation. A missing value stays null, never 0.
 */
import { daysInYear, type SeriesMap } from './annual-rules'

export type QualityFlag = 'schema' | 'coordinates' | 'date' | 'duplicate' | 'fill-value' | 'unit' | 'out-of-bounds'

export type NormalizedRecord = {
  date: string
  year: number
  month: number
  day: number
  latitude: number
  longitude: number
  /** MERRA-2 cell for gridded sources; stationId for stations. */
  cellId?: string
  stationId?: string
  variable: string
  value: number | null
  unit: string
  sourceId: string
  quality: { valid: boolean; flags: QualityFlag[]; missing: boolean; originalFlag?: string | null }
}

/** Units each variable must arrive in, and the plausible range of each (outside it the record is flagged). */
export const EXPECTED_UNITS: Record<string, string> = {
  T2M_MAX: 'C', T2M_MIN: 'C', T2MDEW: 'C', T2M: 'C', WS10M: 'm/s', PS: 'kPa', PRECTOTCORR: 'mm/day', GWETROOT: '1',
  ALLSKY_SFC_SW_DWN: 'MJ/m^2/day', ALLSKY_SFC_SW_UP: 'MJ/m^2/day', ALLSKY_SFC_LW_DWN: 'MJ/m^2/day', ALLSKY_SFC_LW_UP: 'MJ/m^2/day',
  precipitation: 'mm', tmax: 'C', tmin: 'C',
}
export const PHYSICAL_BOUNDS: Record<string, { min: number; max: number }> = {
  T2M_MAX: { min: -60, max: 60 }, T2M_MIN: { min: -70, max: 50 }, T2MDEW: { min: -80, max: 40 }, T2M: { min: -70, max: 55 }, WS10M: { min: 0, max: 60 }, PS: { min: 40, max: 110 },
  PRECTOTCORR: { min: 0, max: 500 }, GWETROOT: { min: 0, max: 1 },
  ALLSKY_SFC_SW_DWN: { min: 0, max: 45 }, ALLSKY_SFC_SW_UP: { min: 0, max: 45 }, ALLSKY_SFC_LW_DWN: { min: 0, max: 60 }, ALLSKY_SFC_LW_UP: { min: 0, max: 70 },
  precipitation: { min: 0, max: 500 }, tmax: { min: -40, max: 60 }, tmin: { min: -50, max: 50 },
}
export const FILL_VALUES = [-999, -99, -9999]

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isValidDate(date: string) {
  const match = DATE.exec(date)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

export type QualitySummary = {
  total: number
  valid: number
  missing: number
  flagged: Partial<Record<QualityFlag, number>>
  /** Valid records ÷ expected records (calendar days × variables) over the declared period. */
  completeness: number | null
}

/**
 * Flags every record in place (schema, coordinates, dates, duplicates, fill values, units, bounds) and summarizes.
 * `expected` is the number of records a complete series would have, for the completeness ratio.
 */
export function validateRecords(records: NormalizedRecord[], expected?: number): QualitySummary {
  const seen = new Set<string>()
  const flagged: Partial<Record<QualityFlag, number>> = {}
  const mark = (record: NormalizedRecord, flag: QualityFlag) => {
    if (!record.quality.flags.includes(flag)) record.quality.flags.push(flag)
    flagged[flag] = (flagged[flag] ?? 0) + 1
  }
  let valid = 0
  let missing = 0
  for (const record of records) {
    record.quality.flags = [...(record.quality.flags ?? [])]
    if (typeof record.variable !== 'string' || typeof record.sourceId !== 'string' || typeof record.unit !== 'string' || (record.value !== null && typeof record.value !== 'number')) mark(record, 'schema')
    if (!Number.isFinite(record.latitude) || !Number.isFinite(record.longitude) || Math.abs(record.latitude) > 90 || Math.abs(record.longitude) > 180) mark(record, 'coordinates')
    if (!isValidDate(record.date) || Number(record.date.slice(0, 4)) !== record.year || Number(record.date.slice(5, 7)) !== record.month || Number(record.date.slice(8, 10)) !== record.day) mark(record, 'date')
    const key = `${record.sourceId}|${record.stationId ?? record.cellId ?? `${record.latitude},${record.longitude}`}|${record.variable}|${record.date}`
    if (seen.has(key)) mark(record, 'duplicate')
    seen.add(key)
    if (record.value !== null && FILL_VALUES.includes(record.value)) { mark(record, 'fill-value'); record.value = null }
    const unit = EXPECTED_UNITS[record.variable]
    if (unit !== undefined && unit !== record.unit) mark(record, 'unit')
    const bounds = PHYSICAL_BOUNDS[record.variable]
    if (record.value !== null && bounds && (record.value < bounds.min || record.value > bounds.max)) mark(record, 'out-of-bounds')
    record.quality.missing = record.value === null
    record.quality.valid = !record.quality.missing && record.quality.flags.length === 0
    if (record.quality.missing) missing += 1
    if (record.quality.valid) valid += 1
  }
  return { total: records.length, valid, missing, flagged, completeness: expected ? valid / expected : null }
}

/**
 * POWER daily series (already parsed, YYYY-MM-DD keys) as normalized records for one cell. Days absent from POWER's
 * answer become records with value null and missing true, so coverage is measured, not assumed.
 */
export function normalizePowerDaily(series: Record<string, SeriesMap>, units: Record<string, string>, latitude: number, longitude: number, cellId: string, startYear: number, endYear: number): NormalizedRecord[] {
  const records: NormalizedRecord[] = []
  for (const [variable, values] of Object.entries(series)) {
    for (let year = startYear; year <= endYear; year += 1) {
      const start = Date.UTC(year, 0, 1)
      for (let index = 0; index < daysInYear(year); index += 1) {
        const date = new Date(start + index * 86_400_000).toISOString().slice(0, 10)
        const value = values.get(date)
        records.push({ date, year, month: Number(date.slice(5, 7)), day: Number(date.slice(8, 10)), latitude, longitude, cellId, variable, value: value ?? null, unit: units[variable] ?? '', sourceId: 'nasa-power', quality: { valid: false, flags: [], missing: value === undefined } })
      }
    }
  }
  return records
}

/** Back to series: only valid records, keyed YYYY-MM-DD, per variable. */
export function validSeries(records: NormalizedRecord[]): Record<string, SeriesMap> {
  const out: Record<string, SeriesMap> = {}
  for (const record of records) {
    if (!record.quality.valid || record.value === null) continue
    ;(out[record.variable] ??= new Map()).set(record.date, record.value)
  }
  return out
}

/** Valid-day share per calendar year of one variable: a daily year is complete with at least 90% valid days. */
export function dailyYearCoverage(records: NormalizedRecord[], variable: string) {
  const byYear = new Map<number, { valid: number; expected: number }>()
  for (const record of records) {
    if (record.variable !== variable) continue
    const entry = byYear.get(record.year) ?? { valid: 0, expected: daysInYear(record.year) }
    if (record.quality.valid) entry.valid += 1
    byYear.set(record.year, entry)
  }
  return [...byYear.entries()].sort(([a], [b]) => a - b).map(([year, entry]) => ({ year, validDays: entry.valid, expectedDays: entry.expected, missingDays: entry.expected - entry.valid, complete: entry.valid / entry.expected >= 0.9 }))
}
