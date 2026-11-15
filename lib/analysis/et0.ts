/**
 * FAO-56 Penman–Monteith reference evapotranspiration (Allen et al. 1998, https://www.fao.org/4/X0490E/x0490e0b.htm)
 * from NASA POWER daily parameters. ET0 is the evaporative demand of a hypothetical grass reference surface: it is not
 * the evapotranspiration of the real land cover, and POWER's EVPTRNS is not used as ET0.
 *
 * Inputs (verified on POWER's daily point API, community AG, 2026-11-15):
 * - T2M_MAX, T2M_MIN, T2MDEW in °C; WS10M in m/s; PS in kPa;
 * - ALLSKY_SFC_SW_DWN, ALLSKY_SFC_SW_UP, ALLSKY_SFC_LW_DWN, ALLSKY_SFC_LW_UP in MJ/m²/day.
 *
 * Steps (FAO-56 equation numbers):
 * - T = (Tmax + Tmin) / 2 (eq. 9); es = [e°(Tmax) + e°(Tmin)] / 2 (eq. 11–12); ea = e°(Tdew) (eq. 14);
 * - Δ at T (eq. 13); γ = 0.665·10⁻³ · P (eq. 8);
 * - u2 = u10 · 4.87 / ln(67.8 · 10 − 5.42) (eq. 47);
 * - Rn = (SW↓ − SW↑) + (LW↓ − LW↑) from POWER's all-sky components (net radiation of the actual surface, see the
 *   'actual-surface-albedo' note); G = 0 for daily steps (eq. 42);
 * - ET0 = [0.408 Δ (Rn − G) + γ · 900 / (T + 273) · u2 · (es − ea)] / [Δ + γ (1 + 0.34 u2)] (eq. 6).
 *
 * A day counts only when every input is present and plausible; implausible inputs and results outside 0–15 mm/day are
 * flagged and left out, never set to zero. A month counts with at least 90% valid days; its total is the mean of the
 * valid days times the days in the month (stated in `scaledMonths`). A year counts with 12 of 12 valid months.
 */
import { daysInMonth, monthKey, type SeriesMap } from './annual-rules'

export const ET0_PARAMETERS = ['T2M_MAX', 'T2M_MIN', 'T2MDEW', 'WS10M', 'ALLSKY_SFC_SW_DWN', 'ALLSKY_SFC_SW_UP', 'ALLSKY_SFC_LW_DWN', 'ALLSKY_SFC_LW_UP', 'PS'] as const
export type Et0Parameter = (typeof ET0_PARAMETERS)[number]

export const ET0_UNITS: Record<Et0Parameter, string> = {
  T2M_MAX: 'C', T2M_MIN: 'C', T2MDEW: 'C', WS10M: 'm/s', ALLSKY_SFC_SW_DWN: 'MJ/m^2/day', ALLSKY_SFC_SW_UP: 'MJ/m^2/day', ALLSKY_SFC_LW_DWN: 'MJ/m^2/day', ALLSKY_SFC_LW_UP: 'MJ/m^2/day', PS: 'kPa',
}

/** Physical bounds of each input; a value outside them is flagged, not clipped. */
export const ET0_INPUT_BOUNDS: Record<Et0Parameter, { min: number; max: number }> = {
  T2M_MAX: { min: -60, max: 60 }, T2M_MIN: { min: -70, max: 50 }, T2MDEW: { min: -80, max: 40 }, WS10M: { min: 0, max: 60 },
  ALLSKY_SFC_SW_DWN: { min: 0, max: 45 }, ALLSKY_SFC_SW_UP: { min: 0, max: 45 }, ALLSKY_SFC_LW_DWN: { min: 0, max: 60 }, ALLSKY_SFC_LW_UP: { min: 0, max: 70 }, PS: { min: 40, max: 110 },
}
export const ET0_BOUNDS = { min: 0, max: 15 } as const
export const MIN_VALID_DAY_SHARE = 0.9

/** Saturation vapour pressure at temperature t (°C), kPa (eq. 11). */
export const saturationVapourPressure = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3))
/** Slope of the saturation vapour pressure curve at t (°C), kPa/°C (eq. 13). */
export const vapourPressureSlope = (t: number) => (4098 * saturationVapourPressure(t)) / (t + 237.3) ** 2
/** Psychrometric constant from surface pressure (kPa), kPa/°C (eq. 8). */
export const psychrometricConstant = (pressureKPa: number) => 0.000665 * pressureKPa
/** Wind speed at 2 m from a measurement at height z (m), m/s (eq. 47). */
export const windAt2m = (speed: number, heightM = 10) => (speed * 4.87) / Math.log(67.8 * heightM - 5.42)

export type Et0DayInput = { tMax: number; tMin: number; tDew: number; wind10m: number; swDown: number; swUp: number; lwDown: number; lwUp: number; pressure: number }

/** Daily FAO-56 reference evapotranspiration, mm/day (G = 0). */
export function et0Daily(input: Et0DayInput) {
  const t = (input.tMax + input.tMin) / 2
  const es = (saturationVapourPressure(input.tMax) + saturationVapourPressure(input.tMin)) / 2
  const ea = saturationVapourPressure(input.tDew)
  const delta = vapourPressureSlope(t)
  const gamma = psychrometricConstant(input.pressure)
  const u2 = windAt2m(input.wind10m)
  const rn = input.swDown - input.swUp + (input.lwDown - input.lwUp)
  const g = 0
  return (0.408 * delta * (rn - g) + gamma * (900 / (t + 273)) * u2 * (es - ea)) / (delta + gamma * (1 + 0.34 * u2))
}

export type Et0Note = 'actual-surface-albedo' | 'dew-point-above-maximum' | 'scaled-months' | 'radiation-product-change'

export type Et0Series = {
  /** Daily ET0 (mm/day) of the valid days, keyed YYYY-MM-DD. */
  daily: SeriesMap
  /** Monthly mean ET0 (mm/day) of months with ≥ 90% valid days, keyed YYYY-MM; total = mean × days in month. */
  monthly: SeriesMap
  quality: { days: number; validDays: number; missingDays: number; flaggedDays: number; flags: Record<string, number>; scaledMonths: number; droppedMonths: number }
  notes: Et0Note[]
}

/**
 * ET0 for every day where all inputs exist, then monthly means. `inputs` maps each POWER parameter to its daily
 * series (YYYY-MM-DD keys, fill values already removed by parsePowerSeries).
 */
export function et0Series(inputs: Record<Et0Parameter, SeriesMap>, startYear: number, endYear: number): Et0Series {
  const daily: SeriesMap = new Map()
  const flags: Record<string, number> = {}
  const flag = (code: string) => { flags[code] = (flags[code] ?? 0) + 1 }
  let days = 0
  let missingDays = 0
  let flaggedDays = 0
  let dewAboveMax = 0
  const monthly: SeriesMap = new Map()
  let scaledMonths = 0
  let droppedMonths = 0
  for (let year = startYear; year <= endYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const dim = daysInMonth(year, month)
      let sum = 0
      let valid = 0
      for (let day = 1; day <= dim; day += 1) {
        days += 1
        const key = `${monthKey(year, month)}-${String(day).padStart(2, '0')}`
        const values = ET0_PARAMETERS.map((parameter) => inputs[parameter]?.get(key))
        if (values.some((value) => value === undefined)) { missingDays += 1; continue }
        const [tMax, tMin, tDew, wind10m, swDown, swUp, lwDown, lwUp, pressure] = values as number[]
        const outOfBounds = ET0_PARAMETERS.filter((parameter, index) => (values[index] as number) < ET0_INPUT_BOUNDS[parameter].min || (values[index] as number) > ET0_INPUT_BOUNDS[parameter].max)
        if (outOfBounds.length) { outOfBounds.forEach((parameter) => flag(`out-of-bounds:${parameter}`)); flaggedDays += 1; continue }
        if (tMin > tMax) { flag('tmin-above-tmax'); flaggedDays += 1; continue }
        if (tDew > tMax) dewAboveMax += 1 // kept: ea is capped by physics only through e°(Tdew); reported as a note
        const value = et0Daily({ tMax, tMin, tDew, wind10m, swDown, swUp, lwDown, lwUp, pressure })
        if (!Number.isFinite(value) || value < ET0_BOUNDS.min || value > ET0_BOUNDS.max) { flag('et0-out-of-bounds'); flaggedDays += 1; continue }
        daily.set(key, value)
        sum += value
        valid += 1
      }
      if (valid / dim >= MIN_VALID_DAY_SHARE) {
        monthly.set(monthKey(year, month), sum / valid)
        if (valid < dim) scaledMonths += 1
      } else droppedMonths += 1
    }
  }
  const notes: Et0Note[] = ['actual-surface-albedo', 'radiation-product-change']
  if (dewAboveMax) notes.push('dew-point-above-maximum')
  if (scaledMonths) notes.push('scaled-months')
  return { daily, monthly, quality: { days, validDays: daily.size, missingDays, flaggedDays, flags, scaledMonths, droppedMonths }, notes }
}

export const ET0_NOTE_TEXT: Record<Et0Note, { es: string; en: string }> = {
  'actual-surface-albedo': {
    es: 'La radiación neta usa los componentes de onda corta y larga de POWER para la superficie real (su albedo), no el albedo 0.23 del pasto de referencia de FAO-56.',
    en: 'Net radiation uses POWER’s shortwave and longwave components for the actual surface (its albedo), not the 0.23 albedo of the FAO-56 grass reference.',
  },
  'radiation-product-change': {
    es: 'La radiación de POWER cambia de producto (GEWEX SRB antes de 2001, CERES SYN1deg después): una tendencia de ET0 que cruza ese cambio puede venir del producto.',
    en: 'POWER radiation changes product (GEWEX SRB before 2001, CERES SYN1deg after): an ET0 trend across that change can come from the product.',
  },
  'dew-point-above-maximum': {
    es: 'Algunos días tienen punto de rocío mayor que la temperatura máxima (inconsistencia del reanálisis); se conservaron y se reportan.',
    en: 'Some days have a dew point above the maximum temperature (a reanalysis inconsistency); they were kept and are reported.',
  },
  'scaled-months': {
    es: 'Algunos meses tienen entre 90% y 100% de días válidos: su total es la media de los días válidos por los días del mes.',
    en: 'Some months have 90–100% valid days: their total is the mean of the valid days times the days in the month.',
  },
}
