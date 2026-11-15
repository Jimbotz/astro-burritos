export type SourceCoverageManifest = {
  sourceId: string
  completeYears: number[]
  /** Optional exact monthly coverage, represented as YYYY-MM. */
  completeMonths?: string[]
}

export type CommonCompleteWindow = {
  sourceIds: string[]
  startYear: number
  endYear: number
  completeYears: number[]
}

export type CommonMonthlyWindow = {
  sourceIds: string[]
  startYear: number
  endYear: number
  startMonth: string
  endMonth: string
  completeYears: number[]
  completeMonths: string[]
}

function longestContiguousRun(years: number[]) {
  if (!years.length) return []
  let best = [years[0]]
  let current = [years[0]]
  for (const year of years.slice(1)) {
    if (year === current[current.length - 1] + 1) current.push(year)
    else {
      if (current.length > best.length || (current.length === best.length && current.at(-1)! > best.at(-1)!)) best = current
      current = [year]
    }
  }
  if (current.length > best.length || (current.length === best.length && current.at(-1)! > best.at(-1)!)) best = current
  return best
}

/** Finds the longest continuous year range present in every selected source. */
export function resolveCommonCompleteWindow(manifests: SourceCoverageManifest[], minimumStartYear = 2001): CommonCompleteWindow | null {
  if (!manifests.length) return null
  const intersection = manifests.reduce<number[] | null>((years, manifest) => {
    const available = new Set(manifest.completeYears.filter((year) => Number.isInteger(year) && year >= minimumStartYear))
    if (years === null) return [...available].sort((first, second) => first - second)
    return years.filter((year) => available.has(year))
  }, null) ?? []
  const completeYears = longestContiguousRun(intersection.sort((first, second) => first - second))
  if (!completeYears.length) return null
  return { sourceIds: manifests.map((manifest) => manifest.sourceId), startYear: completeYears[0], endYear: completeYears.at(-1)!, completeYears }
}

function monthsForYear(year: number) {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)
}

function derivedCompleteMonths(manifest: SourceCoverageManifest) {
  return manifest.completeMonths?.filter((period) => /^\d{4}-(0[1-9]|1[0-2])$/.test(period)) ?? manifest.completeYears.flatMap(monthsForYear)
}

/**
 * Resolves a monthly comparison window without allowing a partial first/last
 * calendar year into annual trend analysis. Exact monthly coverage wins over
 * a source-level year declaration when both are present.
 */
export function resolveCommonMonthlyWindow(manifests: SourceCoverageManifest[], minimumStartYear = 2001): CommonMonthlyWindow | null {
  if (!manifests.length) return null
  const intersection = manifests.reduce<Set<string> | null>((periods, manifest) => {
    const available = new Set(derivedCompleteMonths(manifest).filter((period) => Number(period.slice(0, 4)) >= minimumStartYear))
    if (periods === null) return available
    return new Set([...periods].filter((period) => available.has(period)))
  }, null) ?? new Set<string>()

  const yearsWithAllMonths = [...new Set([...intersection].map((period) => Number(period.slice(0, 4))))]
    .filter((year) => monthsForYear(year).every((period) => intersection.has(period)))
    .sort((first, second) => first - second)
  const completeYears = longestContiguousRun(yearsWithAllMonths)
  if (!completeYears.length) return null
  const completeMonths = completeYears.flatMap(monthsForYear)
  return {
    sourceIds: manifests.map((manifest) => manifest.sourceId),
    startYear: completeYears[0],
    endYear: completeYears.at(-1)!,
    startMonth: completeMonths[0],
    endMonth: completeMonths.at(-1)!,
    completeYears,
    completeMonths,
  }
}

/** Window modes of the impact lenses (IMPLEMENTACION_LENTES_IMPACTO §6). */
export type WindowMode = 'source-native' | 'common-complete-window' | 'fixed-window'

export type ImpactWindowResult = {
  mode: WindowMode
  requested: { startYear: number; endYear: number }
  /** null when no common window exists or a fixed window is blocked; never silently truncated. */
  effective: { startYear: number; endYear: number } | null
  /** fixed-window only: a source cannot cover every requested year (blocked-by-quality). */
  blocked: boolean
  perSource: Array<{ sourceId: string; startYear: number | null; endYear: number | null; completeYears: number[]; missingYears: number[] }>
}

/**
 * Resolves the analysis period across sources.
 * - source-native: each source keeps its own complete years inside the request (for availability, not cross-source trends).
 * - common-complete-window: the longest continuous run of years complete in every source, inside the request.
 * - fixed-window: the requested years exactly; if any source misses one, the result is blocked, not shortened.
 * Each source lists its complete years only (12/12 months, or ≥ 90% valid days, decided by the caller).
 */
export function resolveImpactWindow(sources: SourceCoverageManifest[], mode: WindowMode, startYear: number, endYear: number): ImpactWindowResult {
  const requested = { startYear, endYear }
  const range = Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index)
  const perSource = sources.map((source) => {
    const inRange = source.completeYears.filter((year) => year >= startYear && year <= endYear).sort((a, b) => a - b)
    return { sourceId: source.sourceId, startYear: inRange[0] ?? null, endYear: inRange.at(-1) ?? null, completeYears: inRange, missingYears: range.filter((year) => !inRange.includes(year)) }
  })
  if (mode === 'source-native') return { mode, requested, effective: perSource.some((source) => source.completeYears.length) ? requested : null, blocked: false, perSource }
  if (mode === 'fixed-window') {
    const blocked = perSource.some((source) => source.missingYears.length > 0)
    return { mode, requested, effective: blocked ? null : requested, blocked, perSource }
  }
  const common = resolveCommonCompleteWindow(sources.map((source) => ({ sourceId: source.sourceId, completeYears: source.completeYears.filter((year) => year <= endYear) })), startYear)
  return { mode, requested, effective: common ? { startYear: common.startYear, endYear: common.endYear } : null, blocked: false, perSource }
}
