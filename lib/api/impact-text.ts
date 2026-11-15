/**
 * Every sentence of the impact lenses, in Spanish and English, in one place. They are planning, monitoring and
 * preparedness signals: no sentence gives an operational, agronomic or medical instruction, calls a model value a
 * measurement, calls a climate balance "real water availability" or calls climate plus population a "health risk".
 */
import type { Bilingual, HeatPriorityStatus, ImpactLens, ImpactSeverity, ImpactStatus } from './impact-types'

export const QUESTIONS: Record<ImpactLens, Bilingual> = {
  water: {
    es: '¿La región presenta señales persistentes de aumento de la demanda atmosférica y reducción de la disponibilidad climática de agua?',
    en: 'Does the region show persistent signals of rising atmospheric demand and falling climatic water availability?',
  },
  heat: {
    es: '¿Dónde y cuándo se están intensificando los días y noches extremadamente cálidos, y qué población se encuentra expuesta?',
    en: 'Where and when are extremely warm days and nights intensifying, and which population is exposed?',
  },
}

export const STATUS_LABEL: Record<ImpactStatus, Bilingual> = {
  'insufficient-data': { es: 'Sin datos suficientes', en: 'Insufficient data' },
  'no-detectable': { es: 'Sin señal detectable', en: 'No detectable signal' },
  watch: { es: 'Vigilar', en: 'Watch' },
  'planning-signal': { es: 'Señal de planificación', en: 'Planning signal' },
  corroborated: { es: 'Señal corroborada', en: 'Corroborated signal' },
}

export const LENS_STATUS_LABEL: Record<ImpactLens, Partial<Record<ImpactStatus, Bilingual>>> = {
  water: {
    'planning-signal': { es: 'Señal de planificación hídrica', en: 'Water-planning signal' },
    corroborated: { es: 'Señal hídrica corroborada (prioridad)', en: 'Corroborated water signal (priority)' },
  },
  heat: {
    'planning-signal': { es: 'Señal de planificación por calor', en: 'Heat-planning signal' },
    corroborated: { es: 'Señal corroborada de exposición al calor', en: 'Corroborated heat-exposure signal' },
  },
}

export const ACTIONS: Record<ImpactLens, Record<ImpactStatus, Bilingual>> = {
  water: {
    'insufficient-data': { es: 'Completar la cobertura de datos antes de interpretar: no hay base para una señal.', en: 'Complete the data coverage before interpreting: there is no basis for a signal.' },
    'no-detectable': { es: 'Mantener el monitoreo rutinario de lluvia, demanda atmosférica y humedad.', en: 'Keep routine monitoring of rain, atmospheric demand and wetness.' },
    watch: { es: 'Vigilar el componente que supera su umbral en los próximos años.', en: 'Watch the component above its threshold over the coming years.' },
    'planning-signal': { es: 'Priorizar revisión de disponibilidad hídrica y preparación municipal.', en: 'Prioritize a review of water availability and municipal preparedness.' },
    corroborated: { es: 'Priorizar revisión de disponibilidad hídrica municipal, contrastando con los datos locales de operación.', en: 'Prioritize a review of municipal water availability against local operating data.' },
  },
  heat: {
    'insufficient-data': { es: 'Completar la cobertura de datos antes de interpretar: no hay base para una señal.', en: 'Complete the data coverage before interpreting: there is no basis for a signal.' },
    'no-detectable': { es: 'Mantener la vigilancia climática rutinaria.', en: 'Keep routine climate monitoring.' },
    watch: { es: 'Vigilar la carga térmica de los próximos años.', en: 'Watch the heat load over the coming years.' },
    'planning-signal': { es: 'Incluir la exposición térmica en la planeación y preparación municipal.', en: 'Include heat exposure in municipal planning and preparedness.' },
    corroborated: { es: 'Priorizar vigilancia de exposición térmica y preparación municipal.', en: 'Prioritize heat-exposure monitoring and municipal preparedness.' },
  },
}

export function severityFor(lens: ImpactLens, status: ImpactStatus, priority?: HeatPriorityStatus): ImpactSeverity {
  if (status === 'insufficient-data') return 'neutral'
  if (status === 'no-detectable') return 'info'
  if (status === 'watch' || status === 'planning-signal') return 'warning'
  // Red only when the backend says priority: the water lens's corroborated status, or a corroborated heat hazard over high exposure.
  if (lens === 'water') return 'alert'
  return priority === 'high-exposure-signal' ? 'alert' : 'warning'
}

export const PRIORITY_LABEL: Record<HeatPriorityStatus, Bilingual> = {
  'high-exposure-signal': { es: 'Señal con alta exposición', en: 'High-exposure signal' },
  'signal-lower-exposure': { es: 'Señal con menor exposición', en: 'Signal with lower exposure' },
  'exposure-without-signal': { es: 'Exposición alta sin señal climática', en: 'High exposure without a climate signal' },
  'no-priority': { es: 'Sin prioridad combinada', en: 'No combined priority' },
  'exposure-unknown': { es: 'Exposición desconocida', en: 'Exposure unknown' },
}

export const CANNOT_CONCLUDE: Record<ImpactLens, Bilingual[]> = {
  water: [
    { es: 'Cuánta agua hay en presas, acuíferos, ríos o redes de distribución.', en: 'How much water there is in dams, aquifers, rivers or supply networks.' },
    { es: 'Si un municipio enfrentará desabasto o restricciones de suministro.', en: 'Whether a municipality will face supply shortages or restrictions.' },
    { es: 'Cuándo regar o qué sembrar: no es una recomendación agronómica.', en: 'When to irrigate or what to plant: it is not agronomic advice.' },
    { es: 'Las causas de la señal: una tendencia no es atribución.', en: 'The causes of the signal: a trend is not attribution.' },
  ],
  heat: [
    { es: 'Efectos en la salud, enfermedades o muertes: no hay datos de salud ni de vulnerabilidad.', en: 'Health effects, illness or deaths: there are no health or vulnerability data.' },
    { es: 'El calor de una colonia o calle: la celda climática mide unos 55 km.', en: 'The heat of a neighbourhood or street: the climate cell is about 55 km across.' },
    { es: 'Alertas ni pronósticos: son tendencias históricas.', en: 'Alerts or forecasts: these are historical trends.' },
    { es: 'Las causas de la señal: una tendencia no es atribución.', en: 'The causes of the signal: a trend is not attribution.' },
  ],
}

export const LIMITATIONS: Record<ImpactLens, Bilingual[]> = {
  water: [
    { es: 'Balance climático estimado. No representa agua disponible físicamente en presas o acuíferos.', en: 'Estimated climate balance. It does not represent water physically available in dams or aquifers.' },
    { es: 'Humedad de zona radicular estimada por un modelo de superficie (MERRA-2), no medida en el suelo.', en: 'Root-zone wetness estimated by a land-surface model (MERRA-2), not measured in the soil.' },
    { es: 'ET0 es la demanda atmosférica de un pasto de referencia (FAO-56), no la evapotranspiración del cultivo o la vegetación real.', en: 'ET0 is the atmospheric demand of a reference grass (FAO-56), not the evapotranspiration of the actual crop or vegetation.' },
    { es: 'Frente a estaciones, la lluvia de POWER sigue el ciclo estacional pero casi no las variaciones de un año a otro.', en: 'Against stations, POWER rain follows the seasonal cycle but barely the year-to-year changes.' },
    { es: 'Cada valor describe una celda de 0.5° × 0.625° de NASA POWER, no una localidad.', en: 'Each value describes a 0.5° × 0.625° NASA POWER cell, not a locality.' },
  ],
  heat: [
    { es: 'No es un diagnóstico médico y la celda climática no representa una colonia específica.', en: 'It is not a medical diagnosis, and the climate cell does not represent a specific neighbourhood.' },
    { es: 'Exposición = población del censo 2020 (INEGI); no incluye vulnerabilidad, edad, vivienda ni acceso a sombra.', en: 'Exposure = 2020 census population (INEGI); it includes no vulnerability, age, housing or access to shade.' },
    { es: 'Los valores son de reanálisis MERRA-2, no mediciones de estación; la isla de calor urbana no se resuelve a esta escala.', en: 'Values come from the MERRA-2 reanalysis, not station measurements; the urban heat island is not resolved at this scale.' },
    { es: 'TXx es el día más cálido de cada celda y TNn su noche más fría: el promedio regional no significa que todas las celdas tuvieran el mismo día extremo.', en: 'TXx is each cell’s hottest day and TNn its coldest night: a regional average does not mean every cell had the same extreme day.' },
  ],
}

export const FINAL_STATEMENT: Record<ImpactLens, (signal: boolean) => Bilingual> = {
  water: (signal) => signal
    ? { es: 'La región presenta una señal climática persistente de estrés hídrico. Esta señal es útil para priorizar vigilancia, investigación y preparación municipal. No constituye una medición directa de disponibilidad de agua ni una orden operativa.', en: 'The region shows a persistent climate signal of water stress. It is useful to prioritize monitoring, research and municipal preparedness. It is not a direct measurement of water availability or an operational order.' }
    : { es: 'No hay una señal climática persistente de estrés hídrico en la ventana analizada. Esto no prueba que no haya cambio; tampoco es una medición directa de disponibilidad de agua ni una orden operativa.', en: 'There is no persistent climate signal of water stress in the analysed window. This does not prove there is no change; nor is it a direct measurement of water availability or an operational order.' },
  heat: (signal) => signal
    ? { es: 'La región presenta una señal climática persistente de exposición al calor. Esta señal es útil para priorizar vigilancia, investigación y preparación municipal. No constituye un pronóstico médico ni una orden operativa.', en: 'The region shows a persistent climate signal of heat exposure. It is useful to prioritize monitoring, research and municipal preparedness. It is not a medical forecast or an operational order.' }
    : { es: 'No hay una señal climática robusta de exposición al calor en la ventana analizada. Esto no prueba que no haya cambio; tampoco es un pronóstico médico ni una orden operativa.', en: 'There is no robust climate signal of heat exposure in the analysed window. This does not prove there is no change; nor is it a medical forecast or an operational order.' },
}
