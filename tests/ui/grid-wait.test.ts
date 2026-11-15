import { describe, expect, it } from 'vitest'
import { gridWaitText } from '../../components/map-layer'

const puebla = { cells: 28, tiles: 2, seconds: 5 }
const base = { hasCountry: true, needsState: false, estimate: puebla, tooLarge: false, areaName: 'Puebla' }

describe('step 1 wait card', () => {
  it('gives the worst-case time of a state grid', () => {
    expect(gridWaitText(base)).toBe('Up to ~5 s the first time: ≈ 28 cells in 2 NASA POWER blocks for the map of Puebla. Faster when cached.')
  })

  it('says only the point runs, and why', () => {
    expect(gridWaitText({ ...base, hasCountry: false, needsState: false })).toBe('A few seconds: only the point is analyzed.')
    expect(gridWaitText({ ...base, needsState: true, estimate: null })).toContain('choose a state to also color the map')
    expect(gridWaitText({ ...base, areaName: 'Inner Mongol', estimate: { cells: 1551, tiles: 28, seconds: 70 }, tooLarge: true })).toContain('Inner Mongol is too large for the map grid')
  })

  it('stays silent while the state outline loads', () => {
    expect(gridWaitText({ ...base, estimate: null })).toBeNull()
  })
})
