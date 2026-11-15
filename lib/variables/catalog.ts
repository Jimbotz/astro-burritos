/**
 * EarthScope variable catalog (API v2).
 *
 * Single source of truth for every variable the backend processes beyond the
 * legacy /api/series. The interface should build selectors, legends, units and
 * filters from this catalog (or from GET /api/variables) instead of hardcoding.
 *
 * Selection criteria (docs/backend/frontend-data-handoff.md, sections 6–8):
 * useful signal, verified semantics, homogeneous source and manageable cost.
 */

export type VariableId =
  | 'T2M' | 'TX' | 'TN' | 'T2M_RANGE' | 'TXx' | 'TNn' | 'TX90p' | 'TN90p'
  | 'PRECTOTCORR' | 'PREC_MJJASO' | 'QV2M' | 'RH2M' | 'GWETROOT'

export type PowerMonthlyParameter = 'T2M' | 'T2M_MAX' | 'T2M_MIN' | 'T2M_RANGE' | 'PRECTOTCORR' | 'QV2M' | 'RH2M' | 'GWETROOT'
export type PowerDailyParameter = 'T2M_MAX' | 'T2M_MIN'

/** How the annual value is built from the native records. Years must be complete (12/12 months or every day). */
export type AggregationRule =
  | 'day-weighted-mean'      // monthly means weighted by calendar days
  | 'sum'                    // monthly mm/day × calendar days, summed over the year
  | 'wet-season-sum'         // same as sum, over the cell's own wet season (its 6 rainiest months of 1991–2020)
  | 'annual-max'             // maximum of the 12 monthly maxima (= hottest day of the year)
  | 'annual-min'             // minimum of the 12 monthly minima (= coldest night of the year)
  | 'daily-mean'             // mean of every daily value of the year
  | 'percent-days-above-p90' // % of days above the calendar-day 90th percentile of 1991–2020

/**
 * core: publishable headline variable · thermal-extreme: publishable with its definition ·
 * support: context, not a headline · All three are "fit" for trend statements.
 */
export type Fitness = 'core' | 'thermal-extreme' | 'support'

/** allowed: the interface may state the trend verdict · show-without-claim: plot the series but never state increase/decrease. */
export type TrendPolicy = 'allowed' | 'show-without-claim'

export type VariableGroup = 'temperature' | 'precipitation' | 'humidity' | 'soil'

export type SeasonId = 'dry' | 'wet'
/**
 * Seasons are not fixed: each cell gets its own (cellSeasons in lib/analysis/annual-rules.ts). The wet season is the 6
 * consecutive months with the most rain in the cell's 1991–2020 climatology and the dry season the other 6; where those
 * 6 months hold less than 60% of the annual rain, the cell has no seasonal sub-series. In central Mexico this gives
 * May–Oct and Nov–Apr. A season that crosses the year is labelled by the year in which it ends.
 */
export const SEASON_RULE = {
  method: 'wettest-6-months',
  basePeriod: '1991-2020',
  minWetShare: 0.6,
  minAnnualRainMm: 100,
  description: {
    es: 'Temporada de lluvias = los 6 meses consecutivos más lluviosos de 1991–2020 en cada celda; temporada seca = los otros 6. Sin temporadas donde esos 6 meses reúnen menos de 60 % de la lluvia anual o donde llueve menos de 100 mm al año.',
    en: 'Wet season = the 6 consecutive rainiest months of 1991–2020 at each cell; dry season = the other 6. No seasons where those 6 months hold less than 60% of the annual rain, or where less than 100 mm falls in a year.',
  },
} as const

/**
 * Per-variable processing profile. The backend applies it automatically; the interface reads it to label
 * and color results (e.g. trend.display is already in the profile's scale and method).
 */
export type ProcessingProfile = {
  /** absolute: native unit per decade · relative-percent: % of the 1991–2020 mean per decade · percentage-points: pp per decade. */
  trendScale: 'absolute' | 'relative-percent' | 'percentage-points'
  /** Unit of trend.display. */
  displayUnit: string
  /** ols-hamed-rao: OLS slope + block-bootstrap interval · sen-mann-kendall: Sen slope + Gilbert interval (skewed, bounded or extreme data). The p-value is Hamed–Rao in both. */
  primaryMethod: 'ols-hamed-rao' | 'sen-mann-kendall'
  /** Annual anomalies against the 1991–2020 mean of the same series. */
  anomaly: { kind: 'absolute' | 'percent'; unit: string }
  /** Physical limits of the native POWER records; values outside are removed before aggregation and counted in qa. */
  nativeBounds: { min: number | null; max: number | null }
  /** Seasonal sub-series computed for point requests (separate Benjamini–Hochberg family). */
  seasons: SeasonId[]
  /** How cells are combined into the regional series. */
  regionalAggregation: 'area-mean'
  regionalLabel: { es: string; en: string }
  /** Smallest change per decade (in displayUnit) considered practically relevant. */
  relevanceThreshold: number
  /** Expected value by construction (e.g. 10% of days for TX90p in 1991–2020); draw it as a reference line. */
  expectedValue: number | null
  /** Minimum block length for the bootstrap (longer for variables with multi-year memory). */
  minBlockLength: number
  rationale: { es: string; en: string }
  /** Exploratory linear extrapolation on the map (lib/analysis/projection.ts); null when the variable is never projected. */
  projection: ProjectionRule | null
}

/**
 * Rules of the exploratory projection for one variable (docs/roadmap/data-strategy.md, “Linear regression and future
 * values”). The line is validated on the last `holdoutYears` of the window against the training mean; a variable whose
 * line does not beat the mean is blocked for that request.
 */
export type ProjectionRule = {
  method: 'ols'
  /** Length of each held-out validation window. */
  holdoutYears: number
  /** Number of rolling-origin windows at the end of the period (2 → e.g. 2015–2019 and 2020–2024), errors pooled. */
  holdoutWindows: number
  /** How far past the last data year the slider may go. */
  horizonYears: number
  /** Complete years needed to fit the validation line (the published line needs minFitYears + holdoutYears). */
  minFitYears: number
  /** Expected minimum share of held-out years inside the 95% prediction interval; below it the projection carries an undercoverage warning. */
  minCoverage: number
  /** Minimum skill (1 − RMSE line / RMSE mean on the held-out regional years); below it the projection is blocked. */
  minSkill: number
  /** Physical lower bound of the annual value (rain cannot be negative); null when unbounded. */
  floor: number | null
  rationale: { es: string; en: string }
}

export type VariableDescriptor = {
  id: VariableId
  label: { es: string; en: string }
  shortLabel: { es: string; en: string }
  description: { es: string; en: string }
  group: VariableGroup
  unit: string
  /** Unit of trend slopes. */
  trendUnit: string
  decimals: number
  fitness: Fitness
  trendPolicy: TrendPolicy
  source: { provider: 'NASA POWER'; product: 'MERRA-2'; endpoint: 'monthly' | 'daily'; parameters: Array<PowerMonthlyParameter | PowerDailyParameter> }
  aggregation: AggregationRule
  availability: { point: boolean; region: boolean; monthlySeries: boolean; climatology: boolean }
  /** Suggested color role for maps and charts (the interface chooses the actual palette). */
  colorRole: 'temperature' | 'precipitation' | 'humidity' | 'soil'
  caveats: { es: string[]; en: string[] }
  profile: ProcessingProfile
}

const POWER = { provider: 'NASA POWER', product: 'MERRA-2' } as const

const AREA_MEAN = { es: 'Promedio regional ponderado por área', en: 'Area-weighted regional mean' }
const TEMPERATURE_BOUNDS = { min: -90, max: 70 }

const PROFILES: Record<VariableId, Omit<ProcessingProfile, 'projection'>> = {
  T2M: { trendScale: 'absolute', displayUnit: '°C/década', primaryMethod: 'ols-hamed-rao', anomaly: { kind: 'absolute', unit: '°C' }, nativeBounds: TEMPERATURE_BOUNDS, seasons: ['dry', 'wet'], regionalAggregation: 'area-mean', regionalLabel: AREA_MEAN, relevanceThreshold: 0.1, expectedValue: null, minBlockLength: 2,
    rationale: { es: 'Variable continua y casi normal: OLS con p corregido por autocorrelación. Por temporada porque el calentamiento no es igual todo el año.', en: 'Continuous, near-normal variable: OLS with autocorrelation-corrected p. Seasonal split because warming differs through the year.' } },
  TX: { trendScale: 'absolute', displayUnit: '°C/década', primaryMethod: 'ols-hamed-rao', anomaly: { kind: 'absolute', unit: '°C' }, nativeBounds: TEMPERATURE_BOUNDS, seasons: ['dry', 'wet'], regionalAggregation: 'area-mean', regionalLabel: AREA_MEAN, relevanceThreshold: 0.1, expectedValue: null, minBlockLength: 2,
    rationale: { es: 'Media de máximas diarias: continua; OLS con p corregido y sub-series por temporada.', en: 'Mean of daily maxima: continuous; OLS with corrected p and seasonal sub-series.' } },
  TN: { trendScale: 'absolute', displayUnit: '°C/década', primaryMethod: 'ols-hamed-rao', anomaly: { kind: 'absolute', unit: '°C' }, nativeBounds: TEMPERATURE_BOUNDS, seasons: ['dry', 'wet'], regionalAggregation: 'area-mean', regionalLabel: AREA_MEAN, relevanceThreshold: 0.1, expectedValue: null, minBlockLength: 2,
    rationale: { es: 'Media de mínimas diarias: continua; el calentamiento nocturno es mayor en la temporada seca, por eso se separa.', en: 'Mean of daily minima: continuous; night warming is stronger in the dry season, hence the split.' } },
  T2M_RANGE: { trendScale: 'absolute', displayUnit: '°C/década', primaryMethod: 'ols-hamed-rao', anomaly: { kind: 'absolute', unit: '°C' }, nativeBounds: { min: 0, max: 60 }, seasons: ['dry', 'wet'], regionalAggregation: 'area-mean', regionalLabel: AREA_MEAN, relevanceThreshold: 0.1, expectedValue: null, minBlockLength: 2,
    rationale: { es: 'Diferencia de dos temperaturas: continua y no negativa; la nubosidad de la temporada de lluvias la reduce, por eso se separa.', en: 'Difference of two temperatures: continuous, non-negative; wet-season clouds reduce it, hence the split.' } },
  TXx: { trendScale: 'absolute', displayUnit: '°C/década', primaryMethod: 'sen-mann-kendall', anomaly: { kind: 'absolute', unit: '°C' }, nativeBounds: TEMPERATURE_BOUNDS, seasons: [], regionalAggregation: 'area-mean', regionalLabel: { es: 'Promedio regional del día más caluroso de cada celda (no es el día más caluroso de la región)', en: 'Regional mean of each cell’s hottest day (not the hottest day in the region)' }, relevanceThreshold: 0.2, expectedValue: null, minBlockLength: 2,
    rationale: { es: 'Un extremo por año con distribución de valor extremo: pendiente de Sen, robusta a años atípicos.', en: 'One extreme per year with an extreme-value distribution: Sen slope, robust to outlying years.' } },
  TNn: { trendScale: 'absolute', displayUnit: '°C/década', primaryMethod: 'sen-mann-kendall', anomaly: { kind: 'absolute', unit: '°C' }, nativeBounds: TEMPERATURE_BOUNDS, seasons: [], regionalAggregation: 'area-mean', regionalLabel: { es: 'Promedio regional de la noche más fría de cada celda (no es la noche más fría de la región)', en: 'Regional mean of each cell’s coldest night (not the coldest night in the region)' }, relevanceThreshold: 0.2, expectedValue: null, minBlockLength: 2,
    rationale: { es: 'Un extremo por año: pendiente de Sen, robusta a años atípicos.', en: 'One extreme per year: Sen slope, robust to outlying years.' } },
  TX90p: { trendScale: 'percentage-points', displayUnit: 'pp/década', primaryMethod: 'sen-mann-kendall', anomaly: { kind: 'absolute', unit: 'pp' }, nativeBounds: TEMPERATURE_BOUNDS, seasons: [], regionalAggregation: 'area-mean', regionalLabel: AREA_MEAN, relevanceThreshold: 1, expectedValue: 10, minBlockLength: 2,
    rationale: { es: 'Porcentaje acotado entre 0 y 100 que proviene de conteos: pendiente de Sen en puntos porcentuales; la referencia es 10% en 1991–2020.', en: 'Bounded 0–100 percentage built from counts: Sen slope in percentage points; reference is 10% in 1991–2020.' } },
  TN90p: { trendScale: 'percentage-points', displayUnit: 'pp/década', primaryMethod: 'sen-mann-kendall', anomaly: { kind: 'absolute', unit: 'pp' }, nativeBounds: TEMPERATURE_BOUNDS, seasons: [], regionalAggregation: 'area-mean', regionalLabel: AREA_MEAN, relevanceThreshold: 1, expectedValue: 10, minBlockLength: 2,
    rationale: { es: 'Porcentaje acotado entre 0 y 100 que proviene de conteos: pendiente de Sen en puntos porcentuales; la referencia es 10% en 1991–2020.', en: 'Bounded 0–100 percentage built from counts: Sen slope in percentage points; reference is 10% in 1991–2020.' } },
  PRECTOTCORR: { trendScale: 'relative-percent', displayUnit: '%/década', primaryMethod: 'sen-mann-kendall', anomaly: { kind: 'percent', unit: '%' }, nativeBounds: { min: 0, max: 500 }, seasons: [], regionalAggregation: 'area-mean', regionalLabel: { es: 'Lámina media regional ponderada por área', en: 'Area-weighted regional mean depth' }, relevanceThreshold: 5, expectedValue: null, minBlockLength: 2,
    rationale: { es: 'Sesgada y no negativa: pendiente de Sen expresada en % de la media 1991–2020, comparable entre el valle seco y la sierra húmeda.', en: 'Skewed and non-negative: Sen slope as % of the 1991–2020 mean, comparable between dry valleys and wet mountains.' } },
  PREC_MJJASO: { trendScale: 'relative-percent', displayUnit: '%/década', primaryMethod: 'sen-mann-kendall', anomaly: { kind: 'percent', unit: '%' }, nativeBounds: { min: 0, max: 500 }, seasons: [], regionalAggregation: 'area-mean', regionalLabel: { es: 'Lámina media regional ponderada por área', en: 'Area-weighted regional mean depth' }, relevanceThreshold: 5, expectedValue: null, minBlockLength: 2,
    rationale: { es: 'Igual que la lluvia anual, restringida a la temporada de lluvias de cada celda.', en: 'Same as annual precipitation, restricted to each cell’s wet season.' } },
  QV2M: { trendScale: 'absolute', displayUnit: 'g/kg/década', primaryMethod: 'ols-hamed-rao', anomaly: { kind: 'absolute', unit: 'g/kg' }, nativeBounds: { min: 0, max: 50 }, seasons: ['dry', 'wet'], regionalAggregation: 'area-mean', regionalLabel: AREA_MEAN, relevanceThreshold: 0.1, expectedValue: null, minBlockLength: 2,
    rationale: { es: 'Continua y positiva: OLS con p corregido; por temporada porque la humedad cambia mucho entre la temporada seca y la de lluvias.', en: 'Continuous and positive: OLS with corrected p; seasonal because humidity differs strongly between dry and wet seasons.' } },
  RH2M: { trendScale: 'percentage-points', displayUnit: 'pp/década', primaryMethod: 'ols-hamed-rao', anomaly: { kind: 'absolute', unit: 'pp' }, nativeBounds: { min: 0, max: 100 }, seasons: [], regionalAggregation: 'area-mean', regionalLabel: AREA_MEAN, relevanceThreshold: 1, expectedValue: null, minBlockLength: 2,
    rationale: { es: 'Acotada entre 0 y 100 y dependiente de la temperatura: cambio en puntos porcentuales; leer junto a la humedad específica.', en: 'Bounded 0–100 and temperature-dependent: change in percentage points; read together with specific humidity.' } },
  GWETROOT: { trendScale: 'absolute', displayUnit: 'fracción/década', primaryMethod: 'ols-hamed-rao', anomaly: { kind: 'absolute', unit: 'fracción' }, nativeBounds: { min: 0, max: 1 }, seasons: [], regionalAggregation: 'area-mean', regionalLabel: AREA_MEAN, relevanceThreshold: 0.01, expectedValue: null, minBlockLength: 5,
    rationale: { es: 'Acotada entre 0 y 1 y con memoria de varios años: p de Hamed–Rao y bootstrap con bloques de al menos 5 años.', en: 'Bounded 0–1 with multi-year memory: Hamed–Rao p and bootstrap blocks of at least 5 years.' } },
}

const BASE_VARIABLES: Array<Omit<VariableDescriptor, 'profile'>> = [
  {
    id: 'T2M', label: { es: 'Temperatura media del aire (2 m)', en: 'Mean air temperature (2 m)' }, shortLabel: { es: 'Temp. media', en: 'Mean temp.' },
    description: { es: 'Media anual de la temperatura a 2 m, ponderada por los días de cada mes.', en: 'Annual mean of 2 m air temperature, weighted by days per month.' },
    group: 'temperature', unit: '°C', trendUnit: '°C/década', decimals: 2, fitness: 'core', trendPolicy: 'allowed',
    source: { ...POWER, endpoint: 'monthly', parameters: ['T2M'] }, aggregation: 'day-weighted-mean',
    availability: { point: true, region: true, monthlySeries: true, climatology: true }, colorRole: 'temperature',
    caveats: { es: [], en: [] },
  },
  {
    id: 'TX', label: { es: 'Temperatura máxima media diaria', en: 'Mean daily maximum temperature' }, shortLabel: { es: 'Máx. media', en: 'Mean max.' },
    description: { es: 'Promedio anual de la temperatura máxima de cada día. Se calcula con el endpoint diario de POWER.', en: 'Annual average of each day’s maximum temperature, from the POWER daily endpoint.' },
    group: 'temperature', unit: '°C', trendUnit: '°C/década', decimals: 2, fitness: 'core', trendPolicy: 'allowed',
    source: { ...POWER, endpoint: 'daily', parameters: ['T2M_MAX'] }, aggregation: 'daily-mean',
    availability: { point: true, region: false, monthlySeries: true, climatology: true }, colorRole: 'temperature',
    caveats: { es: ['No es el T2M_MAX mensual de POWER, que es el día más caluroso del mes.'], en: ['Not POWER’s monthly T2M_MAX, which is the hottest day of the month.'] },
  },
  {
    id: 'TN', label: { es: 'Temperatura mínima media diaria', en: 'Mean daily minimum temperature' }, shortLabel: { es: 'Mín. media', en: 'Mean min.' },
    description: { es: 'Promedio anual de la temperatura mínima de cada día. Se calcula con el endpoint diario de POWER.', en: 'Annual average of each day’s minimum temperature, from the POWER daily endpoint.' },
    group: 'temperature', unit: '°C', trendUnit: '°C/década', decimals: 2, fitness: 'core', trendPolicy: 'allowed',
    source: { ...POWER, endpoint: 'daily', parameters: ['T2M_MIN'] }, aggregation: 'daily-mean',
    availability: { point: true, region: false, monthlySeries: true, climatology: true }, colorRole: 'temperature',
    caveats: {
      es: ['No es el T2M_MIN mensual de POWER, que es la noche más fría del mes.', 'En Tlaxcala (1981–2005) la estación muestra un calentamiento nocturno cuatro veces mayor: POWER es una estimación regional conservadora.'],
      en: ['Not POWER’s monthly T2M_MIN, which is the coldest night of the month.', 'At Tlaxcala (1981–2005) the station warms four times faster at night: POWER is a conservative regional estimate.'],
    },
  },
  {
    id: 'T2M_RANGE', label: { es: 'Rango térmico diurno', en: 'Diurnal temperature range' }, shortLabel: { es: 'Rango diurno', en: 'DTR' },
    description: { es: 'Media anual de la diferencia diaria entre máxima y mínima.', en: 'Annual mean of the daily maximum − minimum difference.' },
    group: 'temperature', unit: '°C', trendUnit: '°C/década', decimals: 2, fitness: 'core', trendPolicy: 'allowed',
    source: { ...POWER, endpoint: 'monthly', parameters: ['T2M_RANGE'] }, aggregation: 'day-weighted-mean',
    availability: { point: true, region: true, monthlySeries: true, climatology: true }, colorRole: 'temperature',
    caveats: { es: [], en: [] },
  },
  {
    id: 'TXx', label: { es: 'Día más caluroso del año', en: 'Hottest day of the year' }, shortLabel: { es: 'TXx', en: 'TXx' },
    description: { es: 'Máximo anual de la temperatura máxima diaria (índice ETCCDI TXx), tomado de los máximos mensuales de POWER.', en: 'Annual maximum of daily maximum temperature (ETCCDI TXx), from POWER monthly maxima.' },
    group: 'temperature', unit: '°C', trendUnit: '°C/década', decimals: 2, fitness: 'thermal-extreme', trendPolicy: 'allowed',
    source: { ...POWER, endpoint: 'monthly', parameters: ['T2M_MAX'] }, aggregation: 'annual-max',
    availability: { point: true, region: true, monthlySeries: true, climatology: true }, colorRole: 'temperature',
    caveats: { es: ['Es un solo día por año: más ruidoso que la máxima media.'], en: ['A single day per year: noisier than the mean maximum.'] },
  },
  {
    id: 'TNn', label: { es: 'Noche más fría del año', en: 'Coldest night of the year' }, shortLabel: { es: 'TNn', en: 'TNn' },
    description: { es: 'Mínimo anual de la temperatura mínima diaria (índice ETCCDI TNn), tomado de los mínimos mensuales de POWER.', en: 'Annual minimum of daily minimum temperature (ETCCDI TNn), from POWER monthly minima.' },
    group: 'temperature', unit: '°C', trendUnit: '°C/década', decimals: 2, fitness: 'thermal-extreme', trendPolicy: 'allowed',
    source: { ...POWER, endpoint: 'monthly', parameters: ['T2M_MIN'] }, aggregation: 'annual-min',
    availability: { point: true, region: true, monthlySeries: true, climatology: true }, colorRole: 'temperature',
    caveats: { es: ['Es un solo día por año: más ruidoso que la mínima media.'], en: ['A single day per year: noisier than the mean minimum.'] },
  },
  {
    id: 'TX90p', label: { es: 'Días cálidos', en: 'Warm days' }, shortLabel: { es: 'TX90p', en: 'TX90p' },
    description: { es: 'Porcentaje de días del año con máxima por encima del percentil 90 de 1991–2020 para esa fecha (ETCCDI TX90p).', en: 'Percentage of days whose maximum exceeds the 1991–2020 calendar-day 90th percentile (ETCCDI TX90p).' },
    group: 'temperature', unit: '% de días', trendUnit: 'puntos %/década', decimals: 1, fitness: 'thermal-extreme', trendPolicy: 'allowed',
    source: { ...POWER, endpoint: 'daily', parameters: ['T2M_MAX'] }, aggregation: 'percent-days-above-p90',
    availability: { point: true, region: false, monthlySeries: false, climatology: false }, colorRole: 'temperature',
    caveats: { es: ['Por construcción ronda 10% en 1991–2020. Sin el bootstrap dentro de la base, esos años pueden tener un sesgo leve.'], en: ['By construction ≈10% during 1991–2020. Without in-base bootstrapping those years may be slightly biased.'] },
  },
  {
    id: 'TN90p', label: { es: 'Noches cálidas', en: 'Warm nights' }, shortLabel: { es: 'TN90p', en: 'TN90p' },
    description: { es: 'Porcentaje de días del año con mínima por encima del percentil 90 de 1991–2020 para esa fecha (ETCCDI TN90p).', en: 'Percentage of days whose minimum exceeds the 1991–2020 calendar-day 90th percentile (ETCCDI TN90p).' },
    group: 'temperature', unit: '% de días', trendUnit: 'puntos %/década', decimals: 1, fitness: 'thermal-extreme', trendPolicy: 'allowed',
    source: { ...POWER, endpoint: 'daily', parameters: ['T2M_MIN'] }, aggregation: 'percent-days-above-p90',
    availability: { point: true, region: false, monthlySeries: false, climatology: false }, colorRole: 'temperature',
    caveats: { es: ['Por construcción ronda 10% en 1991–2020. Sin el bootstrap dentro de la base, esos años pueden tener un sesgo leve.'], en: ['By construction ≈10% during 1991–2020. Without in-base bootstrapping those years may be slightly biased.'] },
  },
  {
    id: 'PRECTOTCORR', label: { es: 'Precipitación anual', en: 'Annual precipitation' }, shortLabel: { es: 'Lluvia anual', en: 'Annual rain' },
    description: { es: 'Total anual: cada valor mensual en mm/día multiplicado por los días del mes.', en: 'Annual total: each monthly mm/day value times the days in the month.' },
    group: 'precipitation', unit: 'mm', trendUnit: 'mm/década', decimals: 0, fitness: 'core', trendPolicy: 'show-without-claim',
    source: { ...POWER, endpoint: 'monthly', parameters: ['PRECTOTCORR'] }, aggregation: 'sum',
    availability: { point: true, region: true, monthlySeries: true, climatology: true }, colorRole: 'precipitation',
    caveats: {
      es: ['No afirmar aumento ni disminución: el signo de la tendencia cambia según el año de inicio.', 'Frente a estaciones GHCN, POWER sigue el ciclo estacional pero casi no la variación interanual (r anual 0.12–0.33).'],
      en: ['Do not state an increase or decrease: the trend sign changes with the start year.', 'Against GHCN stations POWER follows the seasonal cycle but barely the year-to-year variation (annual r 0.12–0.33).'],
    },
  },
  {
    id: 'PREC_MJJASO', label: { es: 'Lluvia de la temporada de lluvias', en: 'Wet-season rain' }, shortLabel: { es: 'Lluvia de temporada', en: 'Wet-season rain' },
    description: { es: 'Total de los 6 meses consecutivos más lluviosos de 1991–2020 en cada celda (may–oct en el centro de México, donde reúnen cerca de 88% de la lluvia anual).', en: 'Total of the 6 consecutive rainiest months of 1991–2020 at each cell (May–Oct in central Mexico, where they hold about 88% of the annual rain).' },
    group: 'precipitation', unit: 'mm', trendUnit: 'mm/década', decimals: 0, fitness: 'core', trendPolicy: 'show-without-claim',
    source: { ...POWER, endpoint: 'monthly', parameters: ['PRECTOTCORR'] }, aggregation: 'wet-season-sum',
    availability: { point: true, region: true, monthlySeries: false, climatology: false }, colorRole: 'precipitation',
    caveats: { es: ['Mismas limitaciones que la lluvia anual.', 'Sin valor en celdas donde la lluvia no tiene una temporada clara. El id conserva MJJASO por compatibilidad de la API.'], en: ['Same limitations as annual precipitation.', 'No value in cells where rain has no clear season. The id keeps MJJASO for API compatibility.'] },
  },
  {
    id: 'QV2M', label: { es: 'Humedad específica (2 m)', en: 'Specific humidity (2 m)' }, shortLabel: { es: 'Humedad esp.', en: 'Spec. humidity' },
    description: { es: 'Media anual de la humedad absoluta del aire.', en: 'Annual mean of absolute air humidity.' },
    group: 'humidity', unit: 'g/kg', trendUnit: 'g/kg/década', decimals: 2, fitness: 'support', trendPolicy: 'allowed',
    source: { ...POWER, endpoint: 'monthly', parameters: ['QV2M'] }, aggregation: 'day-weighted-mean',
    availability: { point: true, region: true, monthlySeries: true, climatology: true }, colorRole: 'humidity',
    caveats: { es: [], en: [] },
  },
  {
    id: 'RH2M', label: { es: 'Humedad relativa (2 m)', en: 'Relative humidity (2 m)' }, shortLabel: { es: 'Humedad rel.', en: 'Rel. humidity' },
    description: { es: 'Media anual de la humedad relativa.', en: 'Annual mean of relative humidity.' },
    group: 'humidity', unit: '%', trendUnit: 'puntos %/década', decimals: 1, fitness: 'support', trendPolicy: 'allowed',
    source: { ...POWER, endpoint: 'monthly', parameters: ['RH2M'] }, aggregation: 'day-weighted-mean',
    availability: { point: true, region: true, monthlySeries: true, climatology: true }, colorRole: 'humidity',
    caveats: { es: ['Depende de la temperatura: no es independiente de T2M.'], en: ['Depends on temperature: not independent of T2M.'] },
  },
  {
    id: 'GWETROOT', label: { es: 'Humedad del suelo (zona radicular)', en: 'Root-zone soil wetness' }, shortLabel: { es: 'Humedad suelo', en: 'Soil wetness' },
    description: { es: 'Fracción de saturación del suelo en la zona de raíces (0 seco – 1 saturado), del modelo de superficie de MERRA-2.', en: 'Root-zone soil saturation fraction (0 dry – 1 saturated), from the MERRA-2 land model.' },
    group: 'soil', unit: 'fracción 0–1', trendUnit: 'fracción/década', decimals: 3, fitness: 'support', trendPolicy: 'allowed',
    source: { ...POWER, endpoint: 'monthly', parameters: ['GWETROOT'] }, aggregation: 'day-weighted-mean',
    availability: { point: true, region: true, monthlySeries: true, climatology: true }, colorRole: 'soil',
    caveats: { es: ['Es una variable de modelo, no una medición. Sin datos sobre océano.'], en: ['A model variable, not a measurement. No data over the ocean.'] },
  },
]

/**
 * Projection rules for the four step 1 variables. Same validation for all (OLS line, last 5 years held out, horizon
 * 10 years past the data), with each variable's own physical floor and rationale. Every other variable is never projected.
 */
const PROJECTION_BASE = { method: 'ols', holdoutYears: 5, holdoutWindows: 2, horizonYears: 10, minFitYears: 10, minCoverage: 0.8, minSkill: 0.1 } as const
const PROJECTION: Partial<Record<VariableId, ProjectionRule>> = {
  T2M: { ...PROJECTION_BASE, floor: null,
    rationale: { es: 'Señal continua y casi lineal: la recta OLS se valida con los últimos 5 años antes de extenderla.', en: 'Continuous, near-linear signal: the OLS line is validated on the last 5 years before it is extended.' } },
  TXx: { ...PROJECTION_BASE, floor: null,
    rationale: { es: 'Un solo día extremo por año: más ruidoso, así que el intervalo de predicción es ancho y la recta igual debe superar al promedio.', en: 'A single extreme day per year: noisier, so the prediction interval is wide and the line must still beat the average.' } },
  TNn: { ...PROJECTION_BASE, floor: null,
    rationale: { es: 'Una sola noche extrema por año: más ruidosa, así que el intervalo de predicción es ancho y la recta igual debe superar al promedio.', en: 'A single extreme night per year: noisier, so the prediction interval is wide and the line must still beat the average.' } },
  PRECTOTCORR: { ...PROJECTION_BASE, floor: 0,
    rationale: { es: 'Sesgada y muy variable, y su signo depende del año de inicio: misma validación, se bloquea si no supera al promedio y nunca baja de 0 mm.', en: 'Skewed and highly variable, with a start-year-dependent sign: same validation, blocked if it does not beat the average, never below 0 mm.' } },
}

export const VARIABLES: VariableDescriptor[] = BASE_VARIABLES.map((variable) => ({ ...variable, profile: { ...PROFILES[variable.id], projection: PROJECTION[variable.id] ?? null } }))

/** Variables whose map layer offers the exploratory projection. */
export const PROJECTION_VARIABLE_IDS = VARIABLES.filter((variable) => variable.profile.projection).map((variable) => variable.id)

/** Variables evaluated in the audit and deliberately not exposed, with the reason. */
export const EXCLUDED_VARIABLES: Array<{ id: string; reason: { es: string; en: string } }> = [
  { id: 'CLOUD_AMT', reason: { es: 'Cambio de producto (GEWEX SRB/ISCCP → CERES) con caída espuria en los años noventa.', en: 'Product change (GEWEX SRB/ISCCP → CERES) with a spurious 1990s decline.' } },
  { id: 'ALLSKY_SFC_SW_DWN', reason: { es: 'Mismo cambio de producto que la nubosidad; celda de 1°.', en: 'Same product change as cloud amount; 1° cell.' } },
  { id: 'WS2M', reason: { es: 'Viento de reanálisis sin homogeneizar.', en: 'Non-homogenized reanalysis wind.' } },
  { id: 'PS', reason: { es: 'Una tendencia de presión en una celda fija suele ser un artefacto del reanálisis.', en: 'A pressure trend at a fixed cell is usually a reanalysis artefact.' } },
  { id: 'GWETTOP', reason: { es: 'Redundante con GWETROOT y más ruidosa.', en: 'Redundant with GWETROOT and noisier.' } },
  { id: 'CDD, CWD, SDII, R1mm', reason: { es: 'POWER registra el doble de días húmedos que las estaciones (llovizna del reanálisis).', en: 'POWER has twice the wet days of stations (reanalysis drizzle).' } },
  { id: 'Rx1day, Rx5day, R10mm, R20mm, R95p', reason: { es: 'Correlación diaria con estaciones de 0.22–0.35: baja confianza.', en: 'Daily correlation with stations 0.22–0.35: low confidence.' } },
  { id: 'PREC_NDJFMA', reason: { es: 'Lluvia de temporada seca muy afectada por la llovizna del reanálisis.', en: 'Dry-season rain strongly affected by reanalysis drizzle.' } },
  { id: 'FD, SU25', reason: { es: 'Umbrales fijos que dependen de la altitud de la celda; poco comparables entre regiones.', en: 'Fixed thresholds that depend on cell elevation; poorly comparable across regions.' } },
]

export const VARIABLE_IDS = VARIABLES.map((variable) => variable.id)
export const POINT_VARIABLE_IDS = VARIABLES.filter((variable) => variable.availability.point).map((variable) => variable.id)
export const REGION_VARIABLE_IDS = VARIABLES.filter((variable) => variable.availability.region).map((variable) => variable.id)

export function getVariable(id: string): VariableDescriptor | undefined {
  return VARIABLES.find((variable) => variable.id === id)
}

/** Fitness classes that may carry a trend statement. */
export const FIT_FOR_TREND: Fitness[] = ['core', 'thermal-extreme', 'support']
