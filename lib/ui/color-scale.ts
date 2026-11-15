import type { VariableDescriptor } from '@/lib/variables/catalog'

// Map colors built only from brand tokens (globals.css allows tints through color-mix, never new hex values).
// Five tint steps per side keep neighbouring cells distinguishable and the legend readable.

export type ColorRole = VariableDescriptor['colorRole']

export const TINT_STEPS = [14, 30, 46, 62, 78] as const
const WARM = 'var(--color-rocket-red)'
const COOL = 'var(--color-neon-blue)'

export const tint = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, var(--color-white))`

/** Temperature: warmer is red, cooler is blue. Water variables: wetter is blue, drier is red. */
export function divergingColors(role: ColorRole) {
  return role === 'temperature' ? { positive: WARM, negative: COOL } : { positive: COOL, negative: WARM }
}

function step(fraction: number) {
  return Math.min(TINT_STEPS.length - 1, Math.max(0, Math.floor(fraction * TINT_STEPS.length)))
}

/** Diverging fill centred on 0; |value| ≥ maxAbs uses the strongest step (maxAbs is the 95th percentile). */
export function divergingFill(value: number, maxAbs: number, role: ColorRole) {
  const colors = divergingColors(role)
  const scale = maxAbs > 0 ? maxAbs : 1
  return tint(value >= 0 ? colors.positive : colors.negative, TINT_STEPS[step(Math.abs(value) / scale)])
}

/** Sequential fill from min to max in the variable's own hue. */
export function sequentialFill(value: number, min: number, max: number, role: ColorRole) {
  const span = max - min
  return tint(role === 'temperature' ? WARM : COOL, TINT_STEPS[step(span > 0 ? (value - min) / span : 0)])
}

export type LegendBin = { fill: string; from: number; to: number }

export function divergingLegend(maxAbs: number, role: ColorRole): LegendBin[] {
  const colors = divergingColors(role)
  const scale = maxAbs > 0 ? maxAbs : 1
  const width = scale / TINT_STEPS.length
  const negative = [...TINT_STEPS].reverse().map((percent, index) => ({ fill: tint(colors.negative, percent), from: -scale + index * width, to: -scale + (index + 1) * width }))
  const positive = TINT_STEPS.map((percent, index) => ({ fill: tint(colors.positive, percent), from: index * width, to: (index + 1) * width }))
  return [...negative, ...positive]
}

export function sequentialLegend(min: number, max: number, role: ColorRole): LegendBin[] {
  const width = (max - min) / TINT_STEPS.length
  return TINT_STEPS.map((percent, index) => ({ fill: tint(role === 'temperature' ? WARM : COOL, percent), from: min + index * width, to: min + (index + 1) * width }))
}
