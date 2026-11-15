import { describe, expect, it } from 'vitest'
import { divergingFill, divergingLegend, PROJECTION_STEPS, projectionFill, projectionLegend, projectionTint, sequentialFill, sequentialLegend, TINT_STEPS, tint } from '../../lib/ui/color-scale'

describe('map colors from brand tokens only', () => {
  it('warms temperature in red and wets water variables in blue', () => {
    expect(divergingFill(0.6, 0.6, 'temperature')).toBe(tint('var(--color-rocket-red)', TINT_STEPS[4]))
    expect(divergingFill(-0.6, 0.6, 'temperature')).toBe(tint('var(--color-neon-blue)', TINT_STEPS[4]))
    expect(divergingFill(10, 20, 'precipitation')).toBe(tint('var(--color-neon-blue)', TINT_STEPS[2]))
    expect(divergingFill(-10, 20, 'precipitation')).toBe(tint('var(--color-rocket-red)', TINT_STEPS[2]))
  })

  it('saturates beyond the 95th percentile and never emits raw hex colors', () => {
    expect(divergingFill(5, 1, 'soil')).toBe(tint('var(--color-neon-blue)', TINT_STEPS[4]))
    for (const bin of [...divergingLegend(1, 'temperature'), ...sequentialLegend(10, 20, 'humidity')]) expect(bin.fill).not.toMatch(/#[0-9a-f]{3,6}/i)
  })

  it('builds symmetric diverging legends and monotonic sequential ones', () => {
    const legend = divergingLegend(1, 'temperature')
    expect(legend).toHaveLength(10)
    expect(legend[0].from).toBeCloseTo(-1)
    expect(legend[9].to).toBeCloseTo(1)
    expect(legend[5].from).toBeCloseTo(0)
    expect(sequentialFill(10, 10, 20, 'temperature')).toBe(tint('var(--color-rocket-red)', TINT_STEPS[0]))
    expect(sequentialFill(20, 10, 20, 'temperature')).toBe(tint('var(--color-rocket-red)', TINT_STEPS[4]))
  })
})

describe('projection scale (step 3 slider)', () => {
  it('goes from light at the lowest value to dark at the highest, in the variable hue', () => {
    expect(projectionFill(15, 15, 25, 'temperature')).toBe(tint('var(--color-rocket-red)', 8))
    expect(projectionFill(25, 15, 25, 'temperature')).toBe(tint('var(--color-rocket-red)', 80))
    expect(projectionFill(900, 800, 1000, 'precipitation')).toBe(tint('var(--color-neon-blue)', 44))
    expect(projectionTint(40, 15, 25)).toBe(80) // clamped
  })

  it('darkens continuously as the value rises, so every slider year nudges the color', () => {
    const tints = [15, 15.1, 16, 18, 20, 22, 24, 25].map((value) => projectionTint(value, 15, 25))
    expect(tints).toEqual([...tints].sort((a, b) => a - b))
    expect(new Set(tints).size).toBe(tints.length)
    const legend = projectionLegend(15, 25, 'temperature')
    expect(legend).toHaveLength(PROJECTION_STEPS.length)
    expect(legend[0].from).toBeCloseTo(15)
    expect(legend[legend.length - 1].to).toBeCloseTo(25)
  })
})
