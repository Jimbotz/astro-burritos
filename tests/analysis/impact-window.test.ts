import { describe, expect, it } from 'vitest'
import { resolveImpactWindow } from '../../lib/analysis/common-window'

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, index) => a + index)

describe('impact window modes (never truncated silently)', () => {
  const precip = { sourceId: 'precip', completeYears: range(1991, 2024) }
  const et0 = { sourceId: 'et0', completeYears: range(1991, 2024).filter((year) => year !== 2009) }

  it('common-complete-window takes the longest continuous run complete in every source', () => {
    const window = resolveImpactWindow([precip, et0], 'common-complete-window', 2001, 2024)
    expect(window.effective).toEqual({ startYear: 2010, endYear: 2024 })
    expect(window.perSource[1].missingYears).toEqual([2009])
  })

  it('fixed-window is blocked by quality when a source misses a year, instead of being shortened', () => {
    const window = resolveImpactWindow([precip, et0], 'fixed-window', 2001, 2024)
    expect(window).toMatchObject({ blocked: true, effective: null })
    expect(resolveImpactWindow([precip], 'fixed-window', 2001, 2024)).toMatchObject({ blocked: false, effective: { startYear: 2001, endYear: 2024 } })
  })

  it('source-native keeps each source’s own years, for availability only', () => {
    const window = resolveImpactWindow([precip, { sourceId: 'drought', completeYears: range(2003, 2024) }], 'source-native', 2001, 2024)
    expect(window.effective).toEqual({ startYear: 2001, endYear: 2024 })
    expect(window.perSource.map((source) => [source.sourceId, source.startYear])).toEqual([['precip', 2001], ['drought', 2003]])
  })

  it('returns no window when the sources share no period', () => {
    const window = resolveImpactWindow([{ sourceId: 'a', completeYears: range(1991, 2000) }, { sourceId: 'b', completeYears: range(2005, 2024) }], 'common-complete-window', 1991, 2024)
    expect(window.effective).toBeNull()
  })
})
